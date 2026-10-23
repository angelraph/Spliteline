import { useMemo } from "react";
import { createPublicClient, http } from "viem";
import { useChainId } from "wagmi";
import { arcMainnet, arcTestnet, ARC_MAINNET_EVENTS_RPC, ARC_TESTNET_EVENTS_RPC } from "../chains/arc";

/// A viem public client pointed at a full-history RPC for the currently-connected Arc
/// network, for use with getLogsChunked (src/lib/events.ts). Separate from wagmi's own
/// client, which stays on the default/injected-wallet transport for reads and writes.
export function useEventsClient() {
  const chainId = useChainId();

  return useMemo(() => {
    const isTestnet = chainId === arcTestnet.id;
    return createPublicClient({
      chain: isTestnet ? arcTestnet : arcMainnet,
      transport: http(isTestnet ? ARC_TESTNET_EVENTS_RPC : ARC_MAINNET_EVENTS_RPC),
    });
  }, [chainId]);
}
