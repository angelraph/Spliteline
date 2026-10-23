import type { AbiEvent, Log, PublicClient } from "viem";

// Arc's primary RPC is load-balanced across backends that can lag a few blocks behind
// each other (see docs.arc.io/arc/references/rpc-endpoints — error -32014 means "haven't
// imported that block yet"), and in general providers may not keep full history on their
// default tier. Reading event history here always goes through a dedicated events client
// (see src/chains/arc.ts) in small block ranges, with a short retry on transient errors,
// rather than one unbounded getLogs call.
const CHUNK_SIZE = 2_000n;
const MAX_RETRIES = 3;

export async function getLogsChunked<const TAbiEvent extends AbiEvent>(
  client: PublicClient,
  params: {
    address: `0x${string}`;
    event: TAbiEvent;
    fromBlock: bigint;
    toBlock: bigint;
  },
): Promise<Log[]> {
  const { address, event, fromBlock, toBlock } = params;
  const logs: Log[] = [];

  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    const end = start + CHUNK_SIZE - 1n > toBlock ? toBlock : start + CHUNK_SIZE - 1n;

    let attempt = 0;
    for (;;) {
      try {
        const chunk = await client.getLogs({ address, event, fromBlock: start, toBlock: end });
        logs.push(...chunk);
        break;
      } catch (err) {
        attempt += 1;
        if (attempt >= MAX_RETRIES) throw err;
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    }
  }

  return logs;
}

/// The block to start event scans from. Arc mainnet is already tens of millions of blocks
/// in by the time most contracts deploy on it (0.5s block time), so scanning from block 0
/// would mean tens of thousands of chunked eth_getLogs calls on every page load. Set
/// VITE_SPLITLINE_DEPLOY_BLOCK to the contract's actual deployment block once known;
/// defaults to 0 for local chains (Anvil, etc.) where that's genuinely cheap.
export const DEPLOY_BLOCK = BigInt((import.meta.env.VITE_SPLITLINE_DEPLOY_BLOCK as string) || 0);
