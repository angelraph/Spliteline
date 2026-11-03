// Generated from `contracts/out/Splitline.sol/Splitline.json` after `forge build`.
// Regenerate with:
//   node -e "console.log(JSON.stringify(require('../contracts/out/Splitline.sol/Splitline.json').abi))"
// and paste the result back into SPLITLINE_ABI below if the contract ever changes.
export const SPLITLINE_ABI = [
  { type: "function", name: "MAX_RECIPIENTS", inputs: [], outputs: [{ name: "", type: "uint256", internalType: "uint256" }], stateMutability: "view" },
  { type: "function", name: "TOTAL_BPS", inputs: [], outputs: [{ name: "", type: "uint256", internalType: "uint256" }], stateMutability: "view" },
  { type: "function", name: "claim", inputs: [{ name: "id", type: "uint256", internalType: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "claimTo", inputs: [{ name: "id", type: "uint256", internalType: "uint256" }, { name: "to", type: "address", internalType: "address" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "createSplit", inputs: [{ name: "name", type: "string", internalType: "string" }, { name: "recipients", type: "address[]", internalType: "address[]" }, { name: "bps", type: "uint16[]", internalType: "uint16[]" }], outputs: [{ name: "id", type: "uint256", internalType: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "getSplit", inputs: [{ name: "id", type: "uint256", internalType: "uint256" }], outputs: [{ name: "name", type: "string", internalType: "string" }, { name: "recipients", type: "address[]", internalType: "address[]" }, { name: "bps", type: "uint16[]", internalType: "uint16[]" }, { name: "totalReceived", type: "uint256", internalType: "uint256" }, { name: "totalReleased", type: "uint256", internalType: "uint256" }], stateMutability: "view" },
  { type: "function", name: "nextId", inputs: [], outputs: [{ name: "", type: "uint256", internalType: "uint256" }], stateMutability: "view" },
  { type: "function", name: "owed", inputs: [{ name: "id", type: "uint256", internalType: "uint256" }, { name: "recipient", type: "address", internalType: "address" }], outputs: [{ name: "", type: "uint256", internalType: "uint256" }], stateMutability: "view" },
  { type: "function", name: "pay", inputs: [{ name: "id", type: "uint256", internalType: "uint256" }, { name: "amount", type: "uint256", internalType: "uint256" }, { name: "ref", type: "bytes32", internalType: "bytes32" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "release", inputs: [{ name: "id", type: "uint256", internalType: "uint256" }, { name: "recipient", type: "address", internalType: "address" }], outputs: [], stateMutability: "nonpayable" },
  { type: "event", name: "Claimed", inputs: [{ name: "id", type: "uint256", indexed: true, internalType: "uint256" }, { name: "recipient", type: "address", indexed: true, internalType: "address" }, { name: "to", type: "address", indexed: false, internalType: "address" }, { name: "amount", type: "uint256", indexed: false, internalType: "uint256" }], anonymous: false },
  { type: "event", name: "Paid", inputs: [{ name: "id", type: "uint256", indexed: true, internalType: "uint256" }, { name: "payer", type: "address", indexed: true, internalType: "address" }, { name: "amount", type: "uint256", indexed: false, internalType: "uint256" }, { name: "ref", type: "bytes32", indexed: false, internalType: "bytes32" }], anonymous: false },
  { type: "event", name: "SplitCreated", inputs: [{ name: "id", type: "uint256", indexed: true, internalType: "uint256" }, { name: "creator", type: "address", indexed: true, internalType: "address" }, { name: "name", type: "string", indexed: false, internalType: "string" }, { name: "recipients", type: "address[]", indexed: false, internalType: "address[]" }, { name: "bps", type: "uint16[]", indexed: false, internalType: "uint16[]" }], anonymous: false },
  { type: "error", name: "ArrayLengthMismatch", inputs: [] },
  { type: "error", name: "BpsSumMismatch", inputs: [{ name: "sum", type: "uint256", internalType: "uint256" }] },
  { type: "error", name: "DuplicateRecipient", inputs: [] },
  { type: "error", name: "InvalidRecipientCount", inputs: [] },
  { type: "error", name: "NothingOwed", inputs: [] },
  { type: "error", name: "ReentrancyGuardReentrantCall", inputs: [] },
  { type: "error", name: "SafeERC20FailedOperation", inputs: [{ name: "token", type: "address", internalType: "address" }] },
  { type: "error", name: "SelfReferentialRecipient", inputs: [] },
  { type: "error", name: "SplitNotFound", inputs: [] },
  { type: "error", name: "ZeroAddressRecipient", inputs: [] },
  { type: "error", name: "ZeroAmount", inputs: [] },
] as const;

// Arc's fixed ERC-20 USDC interface address — the same on every Arc deployment.
// https://docs.arc.io/arc/references/contract-addresses
export const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

export const USDC_ABI = [
  { type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "allowance", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "approve", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ name: "", type: "uint8" }], stateMutability: "view" },
] as const;

// Filled in after deployment — see app/.env.example.
export const SPLITLINE_ADDRESS = import.meta.env.VITE_SPLITLINE_ADDRESS as `0x${string}` | undefined;
