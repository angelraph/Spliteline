import "dotenv/config";
import express from "express";
import { createWalletClient, createPublicClient, http, publicActions, keccak256, toHex, pad } from "viem";
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
const FEE_AMOUNT_ATOMIC = "200000"; // 0.20 USD₮0 per execution
const PORT = process.env.PORT || 8787;

const USED_DEPOSITS_FILE = path.join(process.cwd(), "data", "used-deposits.json");
const TRANSFER_TOPIC = keccak256(toHex("Transfer(address,address,uint256)"));

if (!process.env.FACILITATOR_PRIVATE_KEY) {
  console.error("Missing FACILITATOR_PRIVATE_KEY in environment");
  process.exit(1);
}

// ---- Chain clients ------------------------------------------------------

const publicClient = createPublicClient({ chain: XLAYER, transport: http() });

const facilitatorAccount = privateKeyToAccount(process.env.FACILITATOR_PRIVATE_KEY);
const facilitatorWalletClient = createWalletClient({
  account: facilitatorAccount,
  chain: XLAYER,
  transport: http(),
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

// ---- Replay guard (deposit tx hashes already spent) ----------------------

async function loadUsedDeposits() {
  try {
    const raw = await fs.readFile(USED_DEPOSITS_FILE, "utf8");
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

async function markDepositUsed(txHash) {
  await fs.mkdir(path.dirname(USED_DEPOSITS_FILE), { recursive: true });
  const used = await loadUsedDeposits();
  used.add(txHash.toLowerCase());
  await fs.writeFile(USED_DEPOSITS_FILE, JSON.stringify([...used], null, 2));
}

// ---- Deposit verification (real on-chain check, no mocking) --------------

async function verifyDeposit({ depositTxHash, expectedAmountAtomic }) {
  const used = await loadUsedDeposits();
  if (used.has(depositTxHash.toLowerCase())) {
    return { ok: false, reason: "deposit_already_used" };
  }

  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: depositTxHash });
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
      const { stdout } = await execFileAsync("onchainos", [...args, ...extraArgs]);
      return { exitCode: 0, json: JSON.parse(stdout) };
    } catch (err) {
      const stdout = err.stdout || "";
      let json = null;
      try {
        json = JSON.parse(stdout);
      } catch {
        // ignore
      }
      return { exitCode: err.code, json, raw: stdout, stderr: err.stderr };
    }
  };

  const first = await runSend();
  if (first.exitCode === 0 && first.json?.ok) {
    return { ok: true, txHash: first.json.data?.txHash, orderId: first.json.data?.orderId };
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
  const { depositTxHash, recipient, amount } = req.body || {};

  if (!depositTxHash || !/^0x[a-fA-F0-9]{64}$/.test(depositTxHash)) {
    return res.status(400).json({ ok: false, error: "invalid_deposit_tx_hash" });
  }
  if (!recipient || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
    return res.status(400).json({ ok: false, error: "invalid_recipient_address" });
  }
  const amountNum = Number(amount);
  if (!amount || Number.isNaN(amountNum) || amountNum <= 0) {
    return res.status(400).json({ ok: false, error: "invalid_amount" });
  }

  // ---- Step 1: payment must VERIFY and SETTLE for real before anything else runs ----

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

  const verifyResult = await facilitator.verify(decodedPayment, PAYMENT_REQUIREMENTS);
  if (!verifyResult.isValid) {
    return send402(res, { error: "payment_verification_failed", detail: verifyResult.invalidReason });
  }

  const settleResult = await facilitator.settle(decodedPayment, PAYMENT_REQUIREMENTS);
  if (!settleResult.success) {
    return send402(res, { error: "payment_settlement_failed", detail: settleResult.errorReason });
  }

  // ---- Step 2: fee payment is now genuinely confirmed on-chain — safe to act ----

  const expectedAmountAtomic = toAtomicAmount(amount).toString();

  const verification = await verifyDeposit({ depositTxHash, expectedAmountAtomic });
  if (!verification.ok) {
    return res.status(402).json({ ok: false, error: verification.reason, detail: verification, feeTxHash: settleResult.transaction });
  }

  const payout = await executePayout({ recipient, amount });
  if (!payout.ok) {
    return res.status(500).json({ ok: false, error: payout.reason, detail: payout, feeTxHash: settleResult.transaction });
  }

  await markDepositUsed(depositTxHash);

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
