import "dotenv/config";
import express from "express";
import { createWalletClient, createPublicClient, http, fallback, publicActions, keccak256, toHex, pad } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { x402Facilitator } from "@x402/core/facilitator";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader } from "@x402/core/http";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { registerExactEvmScheme } from "@x402/evm/exact/facilitator";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

// ---- Config -----------------------------------------------------------

const XLAYER = {
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.xlayer.tech", "https://xlayerrpc.okx.com"] } },
};

const NETWORK = "eip155:196";
const TOKEN_ADDRESS = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736"; // USD₮0 on XLayer, verified on-chain
const TOKEN_EIP712 = { name: "USD₮0", version: "1" }; // brute-force-matched against on-chain DOMAIN_SEPARATOR
const TOKEN_DECIMALS = 6;
const AVENOR_ADDRESS = process.env.AVENOR_ADDRESS || "0x7fd56a157a70f1011c9a2fbd01e98595f08682f8";
const FEE_AMOUNT_ATOMIC = "500000"; // 0.50 USD₮0 per execution — must match the registered marketplace listing fee
const PORT = process.env.PORT || 8787;

const USED_DEPOSITS_FILE = path.join(process.cwd(), "data", "used-deposits.json");
const TRANSFER_TOPIC = keccak256(toHex("Transfer(address,address,uint256)"));

const RPC_TIMEOUT_MS = 8_000;
const FACILITATOR_TIMEOUT_MS = 10_000;
const PAYOUT_TIMEOUT_MS = 20_000;
const DEPOSIT_VERIFY_ATTEMPTS = 3;
const DEPOSIT_VERIFY_RETRY_DELAY_MS = 1_200;

if (!process.env.FACILITATOR_PRIVATE_KEY) {
  console.error("Missing FACILITATOR_PRIVATE_KEY in environment");
  process.exit(1);
}

// ---- Chain clients ------------------------------------------------------
// fallback() tries each RPC in order and moves to the next on error/timeout,
// instead of hanging on a single endpoint (rpc.xlayer.tech / xlayerrpc.okx.com).

const rpcTransport = fallback(
  XLAYER.rpcUrls.default.http.map((url) => http(url, { timeout: RPC_TIMEOUT_MS })),
);

const publicClient = createPublicClient({ chain: XLAYER, transport: rpcTransport });

const facilitatorAccount = privateKeyToAccount(process.env.FACILITATOR_PRIVATE_KEY);
const facilitatorWalletClient = createWalletClient({
  account: facilitatorAccount,
  chain: XLAYER,
  transport: rpcTransport,
}).extend(publicActions);

const evmSigner = toFacilitatorEvmSigner({
  address: facilitatorAccount.address,
  getCode: facilitatorWalletClient.getCode,
  readContract: facilitatorWalletClient.readContract,
  verifyTypedData: facilitatorWalletClient.verifyTypedData,
  writeContract: facilitatorWalletClient.writeContract,
  sendTransaction: facilitatorWalletClient.sendTransaction,
  waitForTransactionReceipt: facilitatorWalletClient.waitForTransactionReceipt,
});

const facilitator = new x402Facilitator();
registerExactEvmScheme(facilitator, { signer: evmSigner, networks: NETWORK });

// ---- Timeout helper (the x402 facilitator has no built-in timeout, so a
// stalled verify/settle call would otherwise hang the request forever) -----

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function withRetry(fn, { attempts = 3, delayMs = 1_000 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

// ---- Replay guard (deposit tx hashes already spent) ----------------------
// Every read-modify-write goes through this single in-process lock, and
// "already used" is checked-and-marked atomically via reserveDeposit —
// otherwise two concurrent requests for the same deposit hash could both
// pass the old check-then-write and both trigger a real payout.

let depositLock = Promise.resolve();
function withDepositLock(fn) {
  const run = depositLock.then(fn, fn);
  depositLock = run.then(
    () => {},
    () => {},
  );
  return run;
}

async function loadUsedDeposits() {
  try {
    const raw = await fs.readFile(USED_DEPOSITS_FILE, "utf8");
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

async function saveUsedDeposits(used) {
  await fs.mkdir(path.dirname(USED_DEPOSITS_FILE), { recursive: true });
  await fs.writeFile(USED_DEPOSITS_FILE, JSON.stringify([...used], null, 2));
}

// Returns false if the deposit was already reserved (by this or an earlier request).
async function reserveDeposit(txHash) {
  return withDepositLock(async () => {
    const used = await loadUsedDeposits();
    const key = txHash.toLowerCase();
    if (used.has(key)) return false;
    used.add(key);
    await saveUsedDeposits(used);
    return true;
  });
}

// Undoes a reservation when the payout it was guarding failed, so one failed
// attempt doesn't permanently block a legitimate retry of the same deposit.
async function releaseDeposit(txHash) {
  return withDepositLock(async () => {
    const used = await loadUsedDeposits();
    used.delete(txHash.toLowerCase());
    await saveUsedDeposits(used);
  });
}

// ---- Deposit verification (real on-chain check, no mocking) --------------

async function verifyDeposit({ depositTxHash, expectedAmountAtomic }) {
  let receipt;
  try {
    receipt = await withRetry(() => publicClient.getTransactionReceipt({ hash: depositTxHash }), {
      attempts: DEPOSIT_VERIFY_ATTEMPTS,
      delayMs: DEPOSIT_VERIFY_RETRY_DELAY_MS,
    });
  } catch {
    return { ok: false, reason: "deposit_tx_not_found" };
  }

  if (receipt.status !== "success") {
    return { ok: false, reason: "deposit_tx_failed" };
  }

  const toTopic = pad(AVENOR_ADDRESS.toLowerCase(), { size: 32 }).toLowerCase();

  const transferLog = receipt.logs.find(
    (log) =>
      log.address.toLowerCase() === TOKEN_ADDRESS.toLowerCase() &&
      log.topics[0]?.toLowerCase() === TRANSFER_TOPIC.toLowerCase() &&
      log.topics[2]?.toLowerCase() === toTopic,
  );

  if (!transferLog) {
    return { ok: false, reason: "no_matching_transfer_to_avenor" };
  }

  const transferredAmount = BigInt(transferLog.data);
  if (transferredAmount < BigInt(expectedAmountAtomic)) {
    return { ok: false, reason: "deposit_amount_insufficient", transferredAmount: transferredAmount.toString() };
  }

  return { ok: true };
}

// ---- Payout execution (real on-chain send via the AVENOR Agentic Wallet) --

function toAtomicAmount(readableAmount) {
  const [whole, frac = ""] = String(readableAmount).split(".");
  const fracPadded = (frac + "0".repeat(TOKEN_DECIMALS)).slice(0, TOKEN_DECIMALS);
  return BigInt(whole || "0") * 10n ** BigInt(TOKEN_DECIMALS) + BigInt(fracPadded || "0");
}

const RISK_KEYWORDS = ["scam", "phishing", "malicious", "drainer", "risk", "blocked", "flagged"];

async function executePayout({ recipient, amount }) {
  const args = [
    "wallet",
    "send",
    "--chain",
    "xlayer",
    "--contract-token",
    TOKEN_ADDRESS,
    "--recipient",
    recipient,
    "--readable-amount",
    String(amount),
  ];

  const runSend = async (extraArgs = []) => {
    try {
      const { stdout } = await execFileAsync("onchainos", [...args, ...extraArgs], {
        timeout: PAYOUT_TIMEOUT_MS,
        killSignal: "SIGTERM",
      });
      return { exitCode: 0, json: JSON.parse(stdout) };
    } catch (err) {
      const stdout = err.stdout || "";
      let json = null;
      try {
        json = JSON.parse(stdout);
      } catch {
        // ignore
      }
      return { exitCode: err.code, killed: Boolean(err.killed), json, raw: stdout, stderr: err.stderr };
    }
  };

  const first = await runSend();
  if (first.exitCode === 0 && first.json?.ok) {
    return { ok: true, txHash: first.json.data?.txHash, orderId: first.json.data?.orderId };
  }

  if (first.killed) {
    return { ok: false, reason: "payout_timeout", detail: `onchainos wallet send did not respond within ${PAYOUT_TIMEOUT_MS}ms` };
  }

  if (first.exitCode === 2 && first.json?.message) {
    const lower = String(first.json.message).toLowerCase();
    const risky = RISK_KEYWORDS.some((kw) => lower.includes(kw));
    if (risky) {
      return { ok: false, reason: "recipient_flagged_risky", message: first.json.message };
    }
    const second = await runSend(["--force"]);
    if (second.exitCode === 0 && second.json?.ok) {
      return { ok: true, txHash: second.json.data?.txHash, orderId: second.json.data?.orderId };
    }
    if (second.killed) {
      return { ok: false, reason: "payout_timeout", detail: `onchainos wallet send did not respond within ${PAYOUT_TIMEOUT_MS}ms` };
    }
    return { ok: false, reason: "payout_failed_after_confirm", detail: second.json || second.raw };
  }

  return { ok: false, reason: "payout_failed", detail: first.json || first.raw };
}

// ---- x402 payment requirements (single source of truth for our one paid route) --

const RESOURCE_URL_PATH = "/execute";
const PAYMENT_REQUIREMENTS = {
  scheme: "exact",
  network: NETWORK,
  asset: TOKEN_ADDRESS,
  amount: FEE_AMOUNT_ATOMIC,
  payTo: AVENOR_ADDRESS,
  maxTimeoutSeconds: 300,
  extra: TOKEN_EIP712,
};

function send402(res, extra = {}) {
  const body = {
    x402Version: 2,
    error: "Payment required",
    resource: {
      url: RESOURCE_URL_PATH,
      description: "Execute a real on-chain stablecoin payment on your behalf, given proof of your deposit to AVENOR.",
      mimeType: "application/json",
    },
    accepts: [PAYMENT_REQUIREMENTS],
  };
  res.status(402);
  res.setHeader("PAYMENT-REQUIRED", encodePaymentRequiredHeader(body));
  res.json({ ...extra });
}

// ---- Express app ------------------------------------------------------

const app = express();
app.use(express.static(path.join(process.cwd(), "public")));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "AVENOR Pay", network: NETWORK, avenorAddress: AVENOR_ADDRESS });
});

app.post("/execute", async (req, res) => {
  // ---- Step 1: the x402 challenge must be returned before any business input
  // validation, so an unpaid or malformed request always gets 402 + accepts,
  // never a 400/404 — payment must VERIFY and SETTLE for real before anything else runs ----

  const signatureHeader = req.get("PAYMENT-SIGNATURE");
  if (!signatureHeader) {
    return send402(res);
  }

  let decodedPayment;
  try {
    decodedPayment = decodePaymentSignatureHeader(signatureHeader);
  } catch {
    return res.status(400).json({ ok: false, error: "invalid_payment_signature_header" });
  }

  let verifyResult;
  try {
    verifyResult = await withTimeout(
      facilitator.verify(decodedPayment, PAYMENT_REQUIREMENTS),
      FACILITATOR_TIMEOUT_MS,
      "facilitator_verify",
    );
  } catch (err) {
    return res.status(504).json({ ok: false, error: "facilitator_verify_timeout", detail: err.message });
  }
  if (!verifyResult.isValid) {
    return send402(res, { error: "payment_verification_failed", detail: verifyResult.invalidReason });
  }

  let settleResult;
  try {
    settleResult = await withTimeout(
      facilitator.settle(decodedPayment, PAYMENT_REQUIREMENTS),
      FACILITATOR_TIMEOUT_MS,
      "facilitator_settle",
    );
  } catch (err) {
    return res.status(504).json({ ok: false, error: "facilitator_settle_timeout", detail: err.message });
  }
  if (!settleResult.success) {
    return send402(res, { error: "payment_settlement_failed", detail: settleResult.errorReason });
  }

  // ---- Step 2: fee payment is now genuinely confirmed on-chain — safe to validate and act ----

  const { depositTxHash, recipient, amount } = req.body || {};

  if (!depositTxHash || !/^0x[a-fA-F0-9]{64}$/.test(depositTxHash)) {
    return res.status(400).json({ ok: false, error: "invalid_deposit_tx_hash", feeTxHash: settleResult.transaction });
  }
  if (!recipient || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
    return res.status(400).json({ ok: false, error: "invalid_recipient_address", feeTxHash: settleResult.transaction });
  }
  const amountNum = Number(amount);
  if (!amount || Number.isNaN(amountNum) || amountNum <= 0) {
    return res.status(400).json({ ok: false, error: "invalid_amount", feeTxHash: settleResult.transaction });
  }

  const expectedAmountAtomic = toAtomicAmount(amount).toString();

  const verification = await verifyDeposit({ depositTxHash, expectedAmountAtomic });
  if (!verification.ok) {
    return res.status(402).json({ ok: false, error: verification.reason, detail: verification, feeTxHash: settleResult.transaction });
  }

  const reserved = await reserveDeposit(depositTxHash);
  if (!reserved) {
    return res.status(402).json({ ok: false, error: "deposit_already_used", feeTxHash: settleResult.transaction });
  }

  const payout = await executePayout({ recipient, amount });
  if (!payout.ok) {
    await releaseDeposit(depositTxHash);
    return res.status(500).json({ ok: false, error: payout.reason, detail: payout, feeTxHash: settleResult.transaction });
  }

  return res.json({
    ok: true,
    feeTxHash: settleResult.transaction,
    depositTxHash,
    payoutTxHash: payout.txHash,
    recipient,
    amount,
    token: "USD₮0",
    network: "XLayer",
  });
});

app.listen(PORT, () => {
  console.log(`AVENOR Pay listening on port ${PORT}`);
  console.log(`Facilitator signer address: ${facilitatorAccount.address}`);
});
