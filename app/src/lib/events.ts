import type { AbiEvent, Log, PublicClient } from "viem";

// Arc's primary RPC is load-balanced across backends that can lag a few blocks behind
// each other (see docs.arc.io/arc/references/rpc-endpoints — error -32014 means "haven't
// imported that block yet"), and it also rate-limits bursts of requests (HTTP 429) —
// measured directly against Arc mainnet, firing ~30+ chunked eth_getLogs calls back to
// back reliably triggers this. So chunks here are as large as the RPC accepts (5,000
// blocks works; 10,000 is rejected with "requested range too large") and paced with a
// small delay between requests rather than fired as fast as possible, with a longer
// backoff on retry so a 429 actually has time to clear before the next attempt.
const CHUNK_SIZE = 5_000n;
const REQUEST_SPACING_MS = 120;
const MAX_RETRIES = 4;

function isRateLimited(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("429") || message.toLowerCase().includes("rate limit") || message.toLowerCase().includes("too many requests");
}

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
  let first = true;

  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    const end = start + CHUNK_SIZE - 1n > toBlock ? toBlock : start + CHUNK_SIZE - 1n;

    if (!first) await new Promise((resolve) => setTimeout(resolve, REQUEST_SPACING_MS));
    first = false;

    let attempt = 0;
    for (;;) {
      try {
        const chunk = await client.getLogs({ address, event, fromBlock: start, toBlock: end });
        logs.push(...chunk);
        break;
      } catch (err) {
        attempt += 1;
        if (attempt >= MAX_RETRIES) throw err;
        const backoff = isRateLimited(err) ? 800 * attempt : 300 * attempt;
        await new Promise((resolve) => setTimeout(resolve, backoff));
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
