import "dotenv/config";
import express from "express";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader } from "@x402/core/http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

// ---- Config -----------------------------------------------------------

const NETWORK = "eip155:196";
const TOKEN_ADDRESS = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736"; // USD₮0 on XLayer, verified on-chain
const TOKEN_EIP712 = { name: "USD₮0", version: "1" }; // matches on-chain DOMAIN_SEPARATOR, verified against eth_call
const TOKEN_DECIMALS = 6;
const AVENOR_ADDRESS = process.env.AVENOR_ADDRESS || "0x7fd56a157a70f1011c9a2fbd01e98595f08682f8";
const BASE_FEE_ATOMIC = "500000"; // 0.50 USD₮0 — AVENOR's flat fee, added on top of the relay amount in the single x402 payment
const BASE_FEE_READABLE = "0.50";
const PORT = process.env.PORT || 8787;

const USED_SETTLEMENTS_FILE = path.join(process.cwd(), "data", "used-settlements.json");

const FACILITATOR_TIMEOUT_MS = 10_000;
const PAYOUT_TIMEOUT_MS = 20_000;
const SETTLE_POLL_INTERVAL_MS = 1_000;
const SETTLE_POLL_DEADLINE_MS = 8_000;

for (const key of ["OKX_API_KEY", "OKX_SECRET_KEY", "OKX_PASSPHRASE"]) {
  if (!process.env[key]) {
    console.error(`Missing ${key} in environment`);
    process.exit(1);
  }
}

// ---- Facilitator ----------------------------------------------------------
// AVENOR is a seller integrated via the official OKX Payment SDK: verify()/
// settle() are proxied to OKX's hosted facilitator over HTTP (HMAC-authenticated
// with the API key/secret/passphrase below), not self-signed on our own key —
// this is what lets OKX's marketplace observe and confirm the payment.

const facilitator = new OKXFacilitatorClient({
  apiKey: process.env.OKX_API_KEY,
  secretKey: process.env.OKX_SECRET_KEY,
  passphrase: process.env.OKX_PASSPHRASE,
  // Wait for on-chain confirmation before settle() resolves, so a 200 response
  // from /execute always means the payment is genuinely final — no polling.
  syncSettle: true,
});

// ---- Timeout helper (the x402 facilitator has no built-in timeout, so a
// stalled verify/settle call would otherwise hang the request forever) -----

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Polls the facilitator's real on-chain settlement status when settle()
// itself reports status="timeout", instead of assuming success or failure.
async function pollSettleStatus(txHash, fallbackResult) {
  const deadline = Date.now() + SETTLE_POLL_DEADLINE_MS;
  while (Date.now() < deadline) {
    await sleep(SETTLE_POLL_INTERVAL_MS);
    let status;
    try {
      status = await withTimeout(facilitator.getSettleStatus(txHash), FACILITATOR_TIMEOUT_MS, "facilitator_settle_status");
    } catch {
      continue;
    }
    if (status.status === "success") {
      return { ...fallbackResult, success: true, status: "success" };
    }
    if (status.status === "failed") {
      return { ...fallbackResult, success: false, errorReason: status.errorReason || "settlement_failed_on_chain" };
    }
  }
  return { ...fallbackResult, success: false, errorReason: "settlement_status_unresolved" };
}

// ---- Replay guard (settlement tx hashes already paid out) ----------------
// Every read-modify-write goes through this single in-process lock, and
// "already used" is checked-and-marked atomically via reserveSettlement —
// otherwise two concurrent requests for the same settlement could both pass
// the old check-then-write and both trigger a real payout.

let settlementLock = Promise.resolve();
function withSettlementLock(fn) {
  const run = settlementLock.then(fn, fn);
  settlementLock = run.then(
    () => {},
    () => {},
  );
  return run;
}

async function loadUsedSettlements() {
  try {
    const raw = await fs.readFile(USED_SETTLEMENTS_FILE, "utf8");
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

async function saveUsedSettlements(used) {
  await fs.mkdir(path.dirname(USED_SETTLEMENTS_FILE), { recursive: true });
  await fs.writeFile(USED_SETTLEMENTS_FILE, JSON.stringify([...used], null, 2));
}

// Returns false if the settlement was already reserved (by this or an earlier request).
async function reserveSettlement(txHash) {
  return withSettlementLock(async () => {
    const used = await loadUsedSettlements();
    const key = txHash.toLowerCase();
    if (used.has(key)) return false;
    used.add(key);
    await saveUsedSettlements(used);
    return true;
  });
}

// Undoes a reservation when the payout it was guarding failed, so one failed
// attempt doesn't permanently block a legitimate retry of the same settlement.
async function releaseSettlement(txHash) {
  return withSettlementLock(async () => {
    const used = await loadUsedSettlements();
    used.delete(txHash.toLowerCase());
    await saveUsedSettlements(used);
  });
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

// ---- x402 payment requirements ------------------------------------------
// One payment covers both the relay amount and AVENOR's fee, so the
// facilitator's settle() transfer to AVENOR_ADDRESS IS the proof of funds —
// there is no separate out-of-band "deposit" step for the caller to do.

const RESOURCE_URL_PATH = "/execute";
const RESOURCE_DESCRIPTION =
  "Execute a real on-chain stablecoin payment on your behalf. POST { recipient, amount } describing the payout you want. " +
  `The exact price is your requested amount plus AVENOR's flat ${BASE_FEE_READABLE} USD₮0 fee, paid in a single x402 payment. ` +
  "Once that payment settles, AVENOR relays `amount` to `recipient` and returns the payout transaction hash synchronously in the response.";

function buildPaymentRequirements(totalAtomic) {
  return {
    scheme: "exact",
    network: NETWORK,
    asset: TOKEN_ADDRESS,
    amount: totalAtomic.toString(),
    payTo: AVENOR_ADDRESS,
    maxTimeoutSeconds: 300,
    extra: TOKEN_EIP712,
  };
}

function quoteTotalAtomic(amount) {
  return toAtomicAmount(amount) + BigInt(BASE_FEE_ATOMIC);
}

// Validates the caller's intended relay request. Returns null (never throws)
// so callers can still get a priced 402 challenge even when the body is
// missing or malformed — an x402 discovery probe must never see 400/404.
function parseRelayRequest(body) {
  const { recipient, amount } = body || {};
  if (!recipient || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) return null;
  const amountNum = Number(amount);
  if (!amount || Number.isNaN(amountNum) || amountNum <= 0) return null;
  return { recipient, amount: String(amount) };
}

function send402(res, { extra = {}, requirements, description } = {}) {
  const body = {
    x402Version: 2,
    error: "Payment required",
    resource: {
      url: RESOURCE_URL_PATH,
      description: description || RESOURCE_DESCRIPTION,
      mimeType: "application/json",
    },
    accepts: [requirements || buildPaymentRequirements(BigInt(BASE_FEE_ATOMIC))],
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

// x402 discovery probes /execute with GET and no payment — must return the
// same 402 challenge, not a 404, or the resource looks unroutable to clients
// that check availability before switching to POST for the real call.
app.get("/execute", (req, res) => {
  if (!req.get("PAYMENT-SIGNATURE")) {
    return send402(res);
  }
  return res.status(405).json({ ok: false, error: "method_not_allowed", detail: "use POST /execute" });
});

app.post("/execute", async (req, res) => {
  // ---- Step 1: price the request from the body (if present) and always
  // return 402 + accepts for an unpaid or malformed request — never 400/404 —
  // payment must VERIFY and SETTLE for real before anything else runs ----

  const relay = parseRelayRequest(req.body);
  const requirements = relay
    ? buildPaymentRequirements(quoteTotalAtomic(relay.amount))
    : buildPaymentRequirements(BigInt(BASE_FEE_ATOMIC));

  const signatureHeader = req.get("PAYMENT-SIGNATURE");
  if (!signatureHeader) {
    return send402(res, { requirements });
  }
  if (!relay) {
    return send402(res, {
      requirements,
      extra: {
        error: "missing_or_invalid_relay_request",
        detail: "POST body must include a valid { recipient, amount } to compute the exact payment amount.",
      },
    });
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
      facilitator.verify(decodedPayment, requirements),
      FACILITATOR_TIMEOUT_MS,
      "facilitator_verify",
    );
  } catch (err) {
    return res.status(504).json({ ok: false, error: "facilitator_verify_timeout", detail: err.message });
  }
  if (!verifyResult.isValid) {
    return send402(res, { requirements, extra: { error: "payment_verification_failed", detail: verifyResult.invalidReason } });
  }

  let settleResult;
  try {
    settleResult = await withTimeout(
      facilitator.settle(decodedPayment, requirements),
      FACILITATOR_TIMEOUT_MS,
      "facilitator_settle",
    );
  } catch (err) {
    return res.status(504).json({ ok: false, error: "facilitator_settle_timeout", detail: err.message });
  }

  // With syncSettle the facilitator normally resolves success/failure directly;
  // "timeout" means the on-chain confirmation didn't land in time, so poll the
  // real status instead of guessing whether the payment actually landed.
  if (settleResult.success && settleResult.status === "timeout") {
    settleResult = await pollSettleStatus(settleResult.transaction, settleResult);
  }
  if (!settleResult.success) {
    return send402(res, { requirements, extra: { error: "payment_settlement_failed", detail: settleResult.errorReason } });
  }

  // ---- Step 2: the full relay+fee amount is now genuinely confirmed
  // on-chain — settle() itself is the proof of funds, safe to relay ----

  const reserved = await reserveSettlement(settleResult.transaction);
  if (!reserved) {
    return res.status(409).json({ ok: false, error: "settlement_already_processed", feeTxHash: settleResult.transaction });
  }

  const payout = await executePayout({ recipient: relay.recipient, amount: relay.amount });
  if (!payout.ok) {
    await releaseSettlement(settleResult.transaction);
    return res.status(500).json({ ok: false, error: payout.reason, detail: payout, feeTxHash: settleResult.transaction });
  }

  return res.json({
    ok: true,
    feeTxHash: settleResult.transaction,
    payoutTxHash: payout.txHash,
    recipient: relay.recipient,
    amount: relay.amount,
    token: "USD₮0",
    network: "XLayer",
  });
});

app.listen(PORT, () => {
  console.log(`AVENOR Pay listening on port ${PORT}`);
  console.log(`Facilitator: OKX-hosted (network ${NETWORK}), payTo ${AVENOR_ADDRESS}`);
});
