import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { AddressLink, UsdcAmount } from '@/components/bits'
import { ActivityFeed } from '@/components/split/ActivityFeed'
import { DepositCard } from '@/components/split/DepositCard'
import { PayCard } from '@/components/split/PayCard'
import { RecipientsTable } from '@/components/split/RecipientsTable'
import { ShareTools } from '@/components/split/ShareTools'
import { ComingSoon } from '@/components/ComingSoon'
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui'
import { useIndexer } from '@/hooks/useIndexer'
import { useNetwork } from '@/hooks/useNetwork'
import { parseSplitId, useSplit } from '@/hooks/useSplit'
import { encodeRef } from '@/lib/ref'
import { formatUsdc, parseUsdcInput } from '@/lib/usdc'

function SplitSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  )
}

export function SplitPage() {
  const { id: rawId } = useParams()
  const id = parseSplitId(rawId)
  const { network } = useNetwork()
  const [params] = useSearchParams()
  const idx = useIndexer()
  const split = useSplit(id)

  const amountParam = params.get('amount') ?? ''
  const refParam = params.get('ref') ?? ''
  const initialAmount = amountParam && (parseUsdcInput(amountParam) ?? 0n) > 0n ? amountParam : ''
  const initialRef = refParam && encodeRef(refParam).ok ? refParam : ''

  if (id === undefined) {
    return (
      <Card className="mx-auto max-w-lg">
        <EmptyState
          icon={<Compass className="size-5" />}
          title="That is not a split link"
          body="Split links look like /s/1. Check the address and try again."
          action={<Link to="/"><Button size="sm">Back to home</Button></Link>}
        />
      </Card>
    )
  }

  if (!network.address) {
    return <ComingSoon />
  }

  if (split.isLoading || (!split.data && !split.notFound && !split.error)) return <SplitSkeleton />

  if (split.notFound) {
    return (
      <Card className="mx-auto max-w-lg">
        <EmptyState
          icon={<Compass className="size-5" />}
          title={`Split #${id} does not exist`}
          body={`There is no split with that number on ${network.label}. It may not have been created yet.`}
          action={<Link to="/create"><Button size="sm">Create a split</Button></Link>}
        />
      </Card>
    )
  }

  if (!split.data) {
    return (
      <Card className="mx-auto max-w-lg">
        <ErrorState title="Could not load this split" body="The network did not answer. Check your connection and try again." onRetry={() => void split.refetch()} />
      </Card>
    )
  }

  const data = split.data
  const info = idx.byId.get(id.toString())

  return (
    <div className="animate-rise">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="accent">Split #{id.toString()}</Badge>
            <Badge>{data.recipients.length} recipient{data.recipients.length === 1 ? '' : 's'}</Badge>
          </div>
          <h1 className="display break-words text-3xl font-bold sm:text-4xl">{data.name || `Split #${id}`}</h1>
          {info && (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
              Created by <AddressLink address={info.creator} />
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Total received</p>
          <UsdcAmount big value={formatUsdc(data.totalReceived + data.pending)} className="text-2xl" />
        </div>
      </div>

      {/* On small screens the wrappers dissolve so Pay can sit right under the deposit card. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_24rem] lg:items-start">
        <div className="contents lg:block lg:min-w-0 lg:space-y-6">
          <div className="order-1 min-w-0">
            <DepositCard split={data} />
          </div>
          <div className="order-3 min-w-0">
            <RecipientsTable split={data} />
          </div>
          <div className="order-4 min-w-0">
            <ActivityFeed splitId={id} />
          </div>
        </div>
        <div className="contents lg:sticky lg:top-24 lg:block lg:space-y-6">
          <div className="order-2">
            <PayCard key={`${initialAmount}|${initialRef}`} splitId={id} initialAmount={initialAmount} initialRef={initialRef} />
          </div>
          <div className="order-5">
            <ShareTools splitId={id} />
          </div>
        </div>
      </div>
    </div>
  )
}
