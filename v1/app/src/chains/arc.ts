import { defineChain } from "viem";

// Arc is not in viem's built-in chain list yet, so it's defined explicitly here.
// Network parameters confirmed against https://docs.arc.io/arc/references/rpc-endpoints
// and https://docs.arc.io/arc/references/contract-addresses (2026-10-23).
//
// USDC is Arc's native gas token and has two interfaces sharing one balance:
//   - native, 18 decimals (gas, msg.value, wallet-displayed balance)
//   - ERC-20 at 0x3600000000000000000000000000000000000000, 6 decimals (what this app
//     and the Splitline contract actually read/write via transferFrom/approve/balanceOf)
// Splitline never touches the native interface; see src/abi/splitline.ts.
export const arcMainnet = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
});

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Testnet Explorer", url: "https://explorer.testnet.arc.io" },
  },
  testnet: true,
});

// A full-history RPC for chunked getLogs scans (src/lib/events.ts) — Arc's primary
// load-balanced RPC can prune/lag on older blocks. dRPC publishes Arc mainnet and
// testnet endpoints; swap these for your own provider/API key if you need higher
// reliability than the public tier offers.
export const ARC_MAINNET_EVENTS_RPC = "https://rpc.drpc.mainnet.arc.io";
export const ARC_TESTNET_EVENTS_RPC = "https://rpc.drpc.testnet.arc.io";
