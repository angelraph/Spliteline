import { keccak256, encodeAbiParameters, toBytes, stringToBytes } from "viem";

const TOKEN = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
const CHAIN_ID = 196n;
const EXPECTED = "0xd591d9baf744328d9400b923cb02c9474d367d591ca1ab24d8c4068be527599d";

const TYPEHASH = keccak256(stringToBytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));

function computeDomainSeparator(name, version) {
  const nameHash = keccak256(stringToBytes(name));
  const versionHash = keccak256(stringToBytes(version));
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [TYPEHASH, nameHash, versionHash, CHAIN_ID, TOKEN],
    ),
  );
}

const names = ["USD₮0", "USDT0", "USD₮0"];
const versions = ["1", "2", "0", "1.0", "USDT0"];

for (const name of names) {
  for (const version of versions) {
    const computed = computeDomainSeparator(name, version);
    const match = computed.toLowerCase() === EXPECTED.toLowerCase();
    if (match) console.log("MATCH -> name:", JSON.stringify(name), "version:", JSON.stringify(version));
  }
}
console.log("expected:", EXPECTED);
console.log("done scanning", names.length * versions.length, "combos");
