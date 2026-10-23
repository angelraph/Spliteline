#!/usr/bin/env node
/**
 * agent-pays.ts — software pays software.
 *
 * Plays the part of an autonomous API service: it has just collected revenue from a
 * customer for a metered call (e.g. an x402-style paid request) and, with no human in
 * the loop, forwards that revenue straight into a Splitline split so its owners are paid
 * out automatically and proportionally. This is the "software-to-software payments"
 * starting point the Arc Microgrants brief calls out, demonstrated end to end.
 *
 * Usage:
 *   cp .env.example .env   # fill in PRIVATE_KEY, SPLITLINE_ADDRESS, SPLIT_ID
 *   npm install
 *   npm run agent-pays -- --amount 0.05 --ref "invoice-1234"
 *
 * The private key here is the *service's own* wallet, funded with a small amount of
 * USDC it has already collected from a customer — never a human user's key. Run this
 * against arc_testnet first; only point RPC_URL at mainnet once you're ready to spend
 * real gas.
 */
import "dotenv/config";
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, getContract } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";

const arcMainnet = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
});

const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Testnet Explorer", url: "https://explorer.testnet.arc.io" } },
  testnet: true,
});

const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

const SPLITLINE_ABI = [
  { type: "function", name: "pay", inputs: [{ name: "id", type: "uint256" }, { name: "amount", type: "uint256" }, { name: "ref", type: "bytes32" }], outputs: [], stateMutability: "nonpayable" },
] as const;

const USDC_ABI = [
  { type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "allowance", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "approve", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable" },
] as const;

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback?: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : fallback;
  };
  return {
    amount: get("--amount", "0.05")!,
    ref: get("--ref", "agent-pays")!,
  };
}

function refToBytes32(ref: string): `0x${string}` {
  const bytes = new TextEncoder().encode(ref.slice(0, 31));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex.padEnd(64, "0")}` as `0x${string}`;
}

async function main() {
  const { amount, ref } = parseArgs();

  const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  const splitlineAddress = process.env.SPLITLINE_ADDRESS as `0x${string}` | undefined;
  const splitId = process.env.SPLIT_ID;
  const useMainnet = (process.env.ARC_NETWORK ?? "testnet") === "mainnet";

  if (!privateKey) throw new Error("Set PRIVATE_KEY in .env (the service agent's own wallet, never a user's key).");
  if (!splitlineAddress) throw new Error("Set SPLITLINE_ADDRESS in .env — deploy Splitline first.");
  if (!splitId) throw new Error("Set SPLIT_ID in .env — the id returned by createSplit.");

  const chain = useMainnet ? arcMainnet : arcTestnet;
  const account = privateKeyToAccount(privateKey);
  // Optional override for local dry runs against `anvil` before ever touching
  // testnet/mainnet — e.g. RPC_URL=http://127.0.0.1:8545.
  const rpcUrl = process.env.RPC_URL;

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const usdc = getContract({ address: ARC_USDC_ADDRESS, abi: USDC_ABI, client: { public: publicClient, wallet: walletClient } });
  const splitline = getContract({ address: splitlineAddress, abi: SPLITLINE_ABI, client: { public: publicClient, wallet: walletClient } });

  const amountBase = parseUnits(amount, 6);

  console.log(`\nSplitline agent-pays — ${chain.name}`);
  console.log(`Service wallet: ${account.address}`);

  const balance = await usdc.read.balanceOf([account.address]);
  console.log(`USDC balance:   $${formatUnits(balance, 6)}`);
  if (balance < amountBase) {
    throw new Error(`Insufficient USDC: have $${formatUnits(balance, 6)}, need $${amount}`);
  }

  const allowance = await usdc.read.allowance([account.address, splitlineAddress]);
  if (allowance < amountBase) {
    console.log(`Approving Splitline for $${amount}…`);
    const approveHash = await usdc.write.approve([splitlineAddress, amountBase]);
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log(`  approve tx: ${chain.blockExplorers.default.url}/tx/${approveHash}`);
  }

  console.log(`Forwarding $${amount} of collected revenue into split #${splitId} (ref: "${ref}")…`);
  const payHash = await splitline.write.pay([BigInt(splitId), amountBase, refToBytes32(ref)]);
  await publicClient.waitForTransactionReceipt({ hash: payHash });

  console.log(`\nDone. Revenue forwarded — recipients can now claim their share.`);
  console.log(`pay tx: ${chain.blockExplorers.default.url}/tx/${payHash}`);
}

main().catch((err) => {
  console.error(`\nagent-pays failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
