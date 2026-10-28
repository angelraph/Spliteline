import { useMemo, useSyncExternalStore } from 'react'
import { getIndexer, type Activity, type IndexerState, type SplitInfo } from '@/lib/indexer'
import { useNetwork } from '@/hooks/useNetwork'

export function useIndexer() {
  const { network } = useNetwork()
  const indexer = getIndexer(network)
  const state: IndexerState = useSyncExternalStore(indexer.subscribe, indexer.getSnapshot)

  const derived = useMemo(() => {
    const byDeposit = new Map<string, SplitInfo>()
    const byId = new Map<string, SplitInfo>()
    for (const s of state.splits) {
      byDeposit.set(s.depositAddress.toLowerCase(), s)
      byId.set(s.id.toString(), s)
    }
    let routed = 0n
    for (const a of state.activity) if (a.kind === 'Paid' || a.kind === 'Swept') routed += a.amount
    return { byDeposit, byId, routed }
  }, [state.splits, state.activity])

  const total = state.head - state.fromBlock + 1n
  const done = state.scannedTo - state.fromBlock + 1n
  const blocksBehind = state.head > state.scannedTo ? state.head - state.scannedTo : 0n

  return {
    ...state,
    ...derived,
    refresh: indexer.refresh,
    configured: Boolean(network.address),
    isCatchingUp: state.status === 'indexing' && blocksBehind > 0n,
    blocksBehind,
    progress: total > 0n ? Math.min(1, Number(done) / Number(total)) : 1,
  }
}

export function activityForSplit(activity: Activity[], id: bigint): Activity[] {
  return activity.filter((a) => a.id === id)
}
