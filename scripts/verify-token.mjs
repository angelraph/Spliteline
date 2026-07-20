import { createPublicClient, http } from "viem";

const XLAYER = {
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.xlayer.tech", "https://xlayerrpc.okx.com"] } },
};

const TOKEN = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";

const client = createPublicClient({ chain: XLAYER, transport: http() });

const erc20Abi = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { name: "version", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "DOMAIN_SEPARATOR", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
];

const eip3009Abi = [
  { name: "authorizationState", type: "function", stateMutability: "view", inputs: [{ type: "address" }, { type: "bytes32" }], outputs: [{ type: "bool" }] },
];

const code = await client.getBytecode({ address: TOKEN });
console.log("has code on XLayer:", !!code && code !== "0x", code ? code.length : 0);

for (const fn of ["name", "symbol", "decimals", "version"]) {
  try {
    const val = await client.readContract({ address: TOKEN, abi: erc20Abi, functionName: fn });
    console.log(fn, "=", val);
  } catch (e) {
    console.log(fn, "= ERROR:", e.shortMessage || e.message);
  }
}

try {
  const val = await client.readContract({
    address: TOKEN,
    abi: eip3009Abi,
    functionName: "authorizationState",
    args: ["0x0000000000000000000000000000000000000001", "0x0000000000000000000000000000000000000000000000000000000000000001"],
  });
  console.log("supports EIP-3009 authorizationState:", val);
} catch (e) {
  console.log("EIP-3009 authorizationState check failed:", e.shortMessage || e.message);
}

// EIP-5267 eip712Domain()
const eip5267Abi = [{
  name: "eip712Domain", type: "function", stateMutability: "view", inputs: [],
  outputs: [
    { type: "bytes1", name: "fields" }, { type: "string", name: "name" }, { type: "string", name: "version" },
    { type: "uint256", name: "chainId" }, { type: "address", name: "verifyingContract" },
    { type: "bytes32", name: "salt" }, { type: "uint256[]", name: "extensions" },
  ],
}];
try {
  const val = await client.readContract({ address: TOKEN, abi: eip5267Abi, functionName: "eip712Domain" });
  console.log("eip712Domain():", val);
} catch (e) {
  console.log("eip712Domain() failed:", e.shortMessage || e.message);
}

const dom = await client.readContract({ address: TOKEN, abi: erc20Abi, functionName: "DOMAIN_SEPARATOR" });
console.log("DOMAIN_SEPARATOR:", dom);
