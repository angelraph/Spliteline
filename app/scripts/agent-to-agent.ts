#!/usr/bin/env bun
/**
 * agent-to-agent.ts — two AI agents, zero humans, one revenue split.
 *
 * Plays out the "software-to-software payments" case end to end, with Spliteline
 * as the payout layer on the receiving side:
 *
 *   1. A customer agent pays a service agent directly, with a plain native-USDC
 *      transfer — no API key, no invoice, no human approving a payment. This is
 *      what an AI agent paying another AI agent for a completed job looks like
 *      on Arc: one transaction, nothing else required.
 *   2. The moment that payment lands, the service agent — with no human in the
 *      loop — forwards the exact same revenue into its own Spliteline split with
 *      payNative, one transaction, so its own recipients (a team, a DAO, whoever
 *      it owes) can claim their share immediately.
 *
 * Two independent wallets, two independent scripts of logic, one real mainnet
 * transaction each. Nobody clicked a button.
 *
 * Usage:
 *   cp .env.example .env
 *   # fill in CUSTOMER_PRIVATE_KEY, SERVICE_PRIVATE_KEY, SPLITLINE_ADDRESS, SPLIT_ID
 *   bun run agent-to-agent -- --price 0.02 --ref "job-4821"
 *
 * Both private keys here are the agents' own wallets, funded with small amounts
 * of USDC only — never a human user's key. Run with ARC_NETWORK=testnet first;
 * only point at mainnet once the whole flow has proven out there.
 */

import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, getContract, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { splitlineAbi } from '../src/lib/splitlineAbi';

const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
});

const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Testnet Explorer', url: 'https://explorer.testnet.arc.io' } },
  testnet: true,
});

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback?: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : fallback;
  };
  return {
    price: get('--price', '0.02')!,
    ref: get('--ref', 'agent-job')!,
  };
}

function refToBytes32(ref: string): `0x${string}` {
  const bytes = new TextEncoder().encode(ref.slice(0, 31));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `0x${hex.padEnd(64, '0')}` as `0x${string}`;
}

async function main() {
  const { price, ref } = parseArgs();

  const customerKey = process.env.CUSTOMER_PRIVATE_KEY as `0x${string}` | undefined;
  const serviceKey = process.env.SERVICE_PRIVATE_KEY as `0x${string}` | undefined;
  const splitlineAddress = process.env.SPLITLINE_ADDRESS as `0x${string}` | undefined;
  const splitId = process.env.SPLIT_ID;
  const useMainnet = (process.env.ARC_NETWORK ?? 'testnet') === 'mainnet';
  const rpcUrl = process.env.RPC_URL; // optional override for a local anvil dry run

  if (!customerKey) throw new Error('Set CUSTOMER_PRIVATE_KEY in .env — the paying agent\'s own wallet.');
  if (!serviceKey) throw new Error('Set SERVICE_PRIVATE_KEY in .env — the service agent\'s own wallet.');
  if (!splitlineAddress) throw new Error('Set SPLITLINE_ADDRESS in .env — the deployed Splitline contract.');
  if (!splitId) throw new Error('Set SPLIT_ID in .env — the split the service agent pays out through.');

  const chain = useMainnet ? arcMainnet : arcTestnet;
  const customer = privateKeyToAccount(customerKey);
  const service = privateKeyToAccount(serviceKey);
  const priceWei = parseUnits(price, 18); // native USDC, 18 decimals

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const customerWallet = createWalletClient({ account: customer, chain, transport: http(rpcUrl) });
  const serviceWallet = createWalletClient({ account: service, chain, transport: http(rpcUrl) });
  const splitline = getContract({
    address: splitlineAddress,
    abi: splitlineAbi,
    client: { public: publicClient, wallet: serviceWallet },
  });

  console.log(`\nSpliteline agent-to-agent — ${chain.name}`);
  console.log(`Customer agent: ${customer.address}`);
  console.log(`Service agent:  ${service.address}`);

  const customerBalance = await publicClient.getBalance({ address: customer.address });
  console.log(`Customer native balance: $${formatUnits(customerBalance, 18)}`);
  if (customerBalance < priceWei) {
    throw new Error(`Customer agent is short: has $${formatUnits(customerBalance, 18)}, needs $${price}`);
  }

  console.log(`\nStep 1 — customer agent pays the service agent $${price} for job "${ref}" (plain native transfer, no human)…`);
  const payHash = await customerWallet.sendTransaction({ to: service.address, value: priceWei });
  await publicClient.waitForTransactionReceipt({ hash: payHash });
  console.log(`  tx: ${chain.blockExplorers.default.url}/tx/${payHash}`);

  console.log(`\nStep 2 — service agent forwards that exact revenue into split #${splitId} with payNative (one tx, no human)…`);
  const splitHash = await splitline.write.payNative([BigInt(splitId), refToBytes32(ref)], { value: priceWei });
  await publicClient.waitForTransactionReceipt({ hash: splitHash });
  console.log(`  tx: ${chain.blockExplorers.default.url}/tx/${splitHash}`);

  console.log(`\nDone. Two agents, two transactions, zero clicks — split #${splitId}'s recipients can claim their share now.`);
}

main().catch((err) => {
  console.error(`\nagent-to-agent failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
