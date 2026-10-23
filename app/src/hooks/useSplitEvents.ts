import { useCallback, useEffect, useState } from "react";
import { parseAbiItem } from "viem";
import { useEventsClient } from "./useEventsClient";
import { getLogsChunked, DEPLOY_BLOCK } from "../lib/events";
import { SPLITLINE_ADDRESS } from "../abi/splitline";

const SPLIT_CREATED_EVENT = parseAbiItem(
  "event SplitCreated(uint256 indexed id, address indexed creator, string name, address[] recipients, uint16[] bps)",
);
const PAID_EVENT = parseAbiItem(
  "event Paid(uint256 indexed id, address indexed payer, uint256 amount, bytes32 ref)",
);
const CLAIMED_EVENT = parseAbiItem(
  "event Claimed(uint256 indexed id, address indexed recipient, address to, uint256 amount)",
);

export type SplitSummary = {
  id: bigint;
  creator: `0x${string}`;
  name: string;
  recipients: readonly `0x${string}`[];
  bps: readonly number[];
};

/// Every split ever created, read entirely from SplitCreated logs — the recipient list
/// isn't indexed, so filtering "splits this wallet belongs to" happens client-side.
export function useAllSplits() {
  const client = useEventsClient();
  const [splits, setSplits] = useState<SplitSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const refetch = useCallback(() => setRefreshIndex((n) => n + 1), []);

  useEffect(() => {
    if (!SPLITLINE_ADDRESS) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        const toBlock = await client.getBlockNumber();
        const logs = await getLogsChunked(client, {
          address: SPLITLINE_ADDRESS,
          event: SPLIT_CREATED_EVENT,
          fromBlock: DEPLOY_BLOCK,
          toBlock,
        });
        if (cancelled) return;
        const parsed = logs.map((log) => {
          const { args } = log as unknown as { args: SplitSummary };
          return args;
        });
        setSplits(parsed);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err as Error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, refreshIndex]);

  return { splits, isLoading, error, refetch };
}

/// Splits where `address` appears in the recipient list.
export function useSplitsForRecipient(address: `0x${string}` | undefined) {
  const { splits, isLoading, error, refetch } = useAllSplits();
  const filtered = address
    ? splits.filter((s) => s.recipients.some((r) => r.toLowerCase() === address.toLowerCase()))
    : [];
  return { splits: filtered, isLoading, error, refetch };
}

export type PaymentEvent = {
  kind: "paid";
  payer: `0x${string}`;
  amount: bigint;
  ref: `0x${string}`;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
};

export type ClaimEvent = {
  kind: "claimed";
  recipient: `0x${string}`;
  to: `0x${string}`;
  amount: bigint;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
};

/// The live payment + claim feed for one split, shown on /s/:id, read purely from chain
/// events (Splitline keeps no off-chain database). Exposes `refetch` because, unlike the
/// split's own totals (read fresh via useSplit), this event scan only ever runs once on
/// mount/id-change otherwise — a payment made from this same page wouldn't show up here
/// until the page was reloaded.
export function useSplitFeed(id: bigint | undefined) {
  const client = useEventsClient();
  const [events, setEvents] = useState<(PaymentEvent | ClaimEvent)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const refetch = useCallback(() => setRefreshIndex((n) => n + 1), []);

  useEffect(() => {
    if (id === undefined || !SPLITLINE_ADDRESS) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        const toBlock = await client.getBlockNumber();
        const [paidLogs, claimedLogs] = await Promise.all([
          getLogsChunked(client, { address: SPLITLINE_ADDRESS, event: PAID_EVENT, fromBlock: DEPLOY_BLOCK, toBlock }),
          getLogsChunked(client, { address: SPLITLINE_ADDRESS, event: CLAIMED_EVENT, fromBlock: DEPLOY_BLOCK, toBlock }),
        ]);
        if (cancelled) return;

        const paid: PaymentEvent[] = paidLogs
          .map((log) => {
            const { args, blockNumber, transactionHash } = log as unknown as {
              args: { id: bigint; payer: `0x${string}`; amount: bigint; ref: `0x${string}` };
              blockNumber: bigint;
              transactionHash: `0x${string}`;
            };
            return { kind: "paid" as const, ...args, blockNumber, transactionHash };
          })
          .filter((e) => e.id === id);

        const claimed: ClaimEvent[] = claimedLogs
          .map((log) => {
            const { args, blockNumber, transactionHash } = log as unknown as {
              args: { id: bigint; recipient: `0x${string}`; to: `0x${string}`; amount: bigint };
              blockNumber: bigint;
              transactionHash: `0x${string}`;
            };
            return { kind: "claimed" as const, ...args, blockNumber, transactionHash };
          })
          .filter((e) => e.id === id);

        const combined = [...paid, ...claimed].sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1));
        setEvents(combined);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err as Error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, id, refreshIndex]);

  return { events, isLoading, error, refetch };
}
