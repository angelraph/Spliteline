import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowDownLeft, ArrowUpRight, History, Inbox } from 'lucide-react'
import { clsx } from 'clsx'
import { AddressLink, SplitLink, TxLink, UsdcAmount } from '@/components/bits'
import { Button, Card, CardHeader, EmptyState, ErrorState, Skeleton } from '@/components/ui'
import { useIndexer } from '@/hooks/useIndexer'
import { timeAgo, useBlockTime } from '@/hooks/useBlockTime'
import { decodeRef } from '@/lib/ref'
import { formatUsdc } from '@/lib/usdc'
import type { Activity } from '@/lib/indexer'

function ActivityRow({ item }: { item: Activity }) {
  const idx = useIndexer()
  const time = useBlockTime(item.block)
  const amount = <UsdcAmount value={formatUsdc(item.amount)} className="text-sm" />
  const ref = item.ref ? decodeRef(item.ref) : undefined
  const nestedTo = item.to ? idx.byDeposit.get(item.to.toLowerCase()) : undefined

  const config = {
    Paid: { icon: ArrowDownLeft, tone: 'bg-success/15 text-success', title: 'Payment received' },
    Swept: { icon: Inbox, tone: 'bg-accent/15 text-accent', title: 'Deposit swept in' },
    Claimed: { icon: ArrowUpRight, tone: 'bg-white/[0.08] text-ink2', title: 'Share paid out' },
  }[item.kind]
  const Icon = config.icon

  const parts: ReactNode[] = []
  if (item.kind === 'Paid' && item.payer) {
    parts.push(<span className="inline-flex items-center gap-1">from <AddressLink address={item.payer} className="text-xs" /></span>)
  }
  if (item.kind === 'Claimed' && item.recipient) {
    const forwarded = item.to && item.to.toLowerCase() !== item.recipient.toLowerCase()
    parts.push(
      <span className="inline-flex flex-wrap items-center gap-1">
        to <AddressLink address={item.recipient} className="text-xs" />
        {forwarded && item.to && (
          <>
            sent on to {nestedTo ? <SplitLink id={nestedTo.id} /> : <AddressLink address={item.to} className="text-xs" />}
          </>
        )}
        {!forwarded && nestedTo && (
          <>
            (<SplitLink id={nestedTo.id} />)
          </>
        )}
      </span>,
    )
  }
  if (ref && !ref.empty) {
    parts.push(
      <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-ink2">
        ref: <span className="mono">{ref.text ?? `${ref.hex.slice(0, 10)}…`}</span>
      </span>,
    )
  }
  parts.push(time.data ? <span>{timeAgo(time.data)}</span> : <Skeleton className="h-3 w-10" />)
  parts.push(<TxLink hash={item.txHash} label="Tx" />)

  return (
    <li className="flex gap-3 px-5 py-3.5 sm:px-6">
      <div className={clsx('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', config.tone)}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-semibold text-ink">{config.title}</p>
          {amount}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {parts.map((part, i) => (
            <span key={i} className="inline-flex items-center gap-x-2">
              {i > 0 && <span aria-hidden>·</span>}
              {part}
            </span>
          ))}
        </div>
      </div>
    </li>
  )
}

/** Seconds spent waiting while `active`; resets whenever it turns off or `resetKey` changes. */
function useWaitSeconds(active: boolean, resetKey: number) {
  const [state, setState] = useState({ key: resetKey, seconds: 0 })
  useEffect(() => {
    if (!active) return
    const started = Date.now()
    const timer = window.setInterval(() => setState({ key: resetKey, seconds: Math.floor((Date.now() - started) / 1000) }), 1000)
    return () => window.clearInterval(timer)
  }, [active, resetKey])
  return active && state.key === resetKey ? state.seconds : 0
}

const SLOW_AFTER_S = 10
const GIVE_UP_AFTER_S = 25

export function ActivityFeed({ splitId }: { splitId: bigint }) {
  const idx = useIndexer()
  const [limit, setLimit] = useState(12)
  const [attempt, setAttempt] = useState(0)
  const items = useMemo(() => idx.activity.filter((a) => a.id === splitId).reverse(), [idx.activity, splitId])
  const waiting = items.length === 0 && idx.status !== 'live'
  const seconds = useWaitSeconds(waiting, attempt)
  // Always resolve: items, an empty state, or a retryable error. Never an endless spinner.
  const failed = items.length === 0 && (idx.status === 'error' || seconds >= GIVE_UP_AFTER_S)
  const loading = waiting && !failed
  const retry = () => {
    setAttempt((a) => a + 1)
    void idx.refresh()
  }

  return (
    <Card>
      <CardHeader
        title="Activity"
        hint="Payments, sweeps and payouts, straight from the chain."
        aside={
          idx.status === 'live' ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <span className="size-1.5 animate-pulse rounded-full bg-success" aria-hidden /> Live
            </span>
          ) : idx.isCatchingUp ? (
            <span className="num text-xs text-muted">Syncing {Math.round(idx.progress * 100)}%</span>
          ) : undefined
        }
      />
      <div className="mt-3">
        {failed ? (
          <ErrorState
            compact
            title="Could not load activity"
            body="We could not read this split's history from the network. Your funds are not affected."
            onRetry={retry}
          />
        ) : loading ? (
          <div className="space-y-4 px-5 pb-5 sm:px-6" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            {seconds >= SLOW_AFTER_S && (
              <p role="status" className="text-center text-xs text-muted">
                Still reading the chain{idx.isCatchingUp ? ` (${Math.round(idx.progress * 100)}%)` : ''}. This is taking longer than usual.{' '}
                <button type="button" onClick={retry} className="inline-flex min-h-11 items-center font-semibold text-accent hover:underline">Retry now</button>
              </p>
            )}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={<History className="size-5" />} title="No activity yet" body="Payments and payouts will appear here the moment they land." />
        ) : (
          <>
            <ul className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
              {items.slice(0, limit).map((item) => (
                <ActivityRow key={`${item.txHash}:${item.logIndex}`} item={item} />
              ))}
            </ul>
            {items.length > limit && (
              <div className="border-t border-white/[0.06] p-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + 12)}>
                  Show more ({items.length - limit})
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
