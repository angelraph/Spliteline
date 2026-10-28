import { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Brand } from '@/components/bits'
import { PayCard } from '@/components/split/PayCard'
import { ComingSoon } from '@/components/ComingSoon'
import { ErrorState, Skeleton } from '@/components/ui'
import { useNetwork } from '@/hooks/useNetwork'
import { parseSplitId, useSplit } from '@/hooks/useSplit'
import { encodeRef } from '@/lib/ref'
import { parseUsdcInput } from '@/lib/usdc'

/** Minimal, iframe-friendly pay widget for one split. No site chrome. */
export function Embed() {
  const { id: rawId } = useParams()
  const id = parseSplitId(rawId)
  const { network } = useNetwork()
  const [params] = useSearchParams()
  const split = useSplit(id)

  useEffect(() => {
    document.body.style.backgroundImage = 'none'
    document.body.style.backgroundColor = 'rgb(var(--bg))'
  }, [])

  const amountParam = params.get('amount') ?? ''
  const refParam = params.get('ref') ?? ''
  const initialAmount = amountParam && (parseUsdcInput(amountParam) ?? 0n) > 0n ? amountParam : ''
  const initialRef = refParam && encodeRef(refParam).ok ? refParam : ''

  return (
    <div className="mx-auto flex min-h-dvh max-w-[420px] flex-col p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Brand className="scale-90 origin-left" />
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-semibold text-muted">{network.label}</span>
      </div>

      {id === undefined || split.notFound ? (
        <ErrorState title="Split not found" body={`This payment link points to a split that does not exist on ${network.label}.`} />
      ) : !network.address ? (
        <ComingSoon compact />
      ) : split.isLoading || (!split.data && !split.error) ? (
        <div className="space-y-3">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-52 w-full" />
        </div>
      ) : !split.data ? (
        <ErrorState title="Could not load this split" body="Check your connection and try again." onRetry={() => void split.refetch()} />
      ) : (
        <>
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Paying</p>
            <h1 className="display break-words text-2xl font-bold">{split.data.name || `Split #${id}`}</h1>
            <p className="mt-1 text-[13px] text-muted">
              Shared between {split.data.recipients.length} recipient{split.data.recipients.length === 1 ? '' : 's'} automatically.
            </p>
          </div>
          <PayCard key={`${initialAmount}|${initialRef}`} splitId={id} initialAmount={initialAmount} initialRef={initialRef} compact />
        </>
      )}
      <p className="mt-auto pt-6 text-center text-[11px] text-subtle">Powered by Spliteline on Arc</p>
    </div>
  )
}
