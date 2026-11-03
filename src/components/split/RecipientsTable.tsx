import { toast } from 'sonner'
import { useAccount } from 'wagmi'
import { Badge, Button, Card, CardHeader } from '@/components/ui'
import { AddressLink, SplitLink, TxLink, UsdcAmount } from '@/components/bits'
import { useIndexer } from '@/hooks/useIndexer'
import { useNetwork } from '@/hooks/useNetwork'
import { useTx } from '@/hooks/useTx'
import { splitlineAbi } from '@/lib/splitlineAbi'
import { formatBps, formatUsdc } from '@/lib/usdc'
import type { SplitView } from '@/hooks/useSplit'
import type { Address } from 'viem'

function ReleaseButton({ id, recipient, disabled }: { id: bigint; recipient: Address; disabled: boolean }) {
  const { network } = useNetwork()
  const tx = useTx()

  const release = async () => {
    if (!network.address) return
    const receipt = await tx.run({ address: network.address, abi: splitlineAbi, functionName: 'release', args: [id, recipient] })
    if (receipt) toast.success('Released to the recipient', { description: <TxLink hash={receipt.transactionHash} /> })
  }

  return (
    <div className="flex flex-col items-stretch sm:items-end">
      <Button variant="secondary" size="sm" onClick={() => void release()} loading={tx.busy} disabled={disabled || tx.busy} className="w-full sm:w-auto">
        {tx.state.phase === 'wallet' ? 'Confirm…' : tx.state.phase === 'confirming' ? 'Releasing…' : 'Release'}
      </Button>
      {tx.state.phase === 'error' && tx.state.error && !tx.state.rejected && (
        <p role="alert" className="mt-1.5 max-w-[16rem] text-xs text-danger sm:text-right">{tx.state.error}</p>
      )}
    </div>
  )
}

export function RecipientsTable({ split }: { split: SplitView }) {
  const { address: account } = useAccount()
  const idx = useIndexer()

  return (
    <Card>
      <CardHeader
        title="Recipients"
        hint="Anyone can release a recipient’s share. It always goes to that recipient’s own address."
      />
      <div className="mt-4 hidden grid-cols-[1fr_5.5rem_9rem_9rem_6.5rem] gap-4 border-b border-white/[0.06] px-6 pb-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted sm:grid">
        <span>Recipient</span>
        <span className="text-right">Share</span>
        <span className="text-right">Owed now</span>
        <span className="text-right">Released</span>
        <span />
      </div>
      <ul className="divide-y divide-white/[0.06]">
        {split.recipients.map((recipient, i) => {
          const nested = idx.byDeposit.get(recipient.toLowerCase())
          const isYou = account?.toLowerCase() === recipient.toLowerCase()
          return (
            <li
              key={recipient}
              className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-[1fr_5.5rem_9rem_9rem_6.5rem] sm:items-center sm:px-6"
            >
              <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 sm:col-span-1">
                {nested ? <SplitLink id={nested.id} name={nested.name || undefined} /> : <AddressLink address={recipient} head={8} tail={6} />}
                {isYou && <Badge tone="accent">You</Badge>}
                {nested && <AddressLink address={recipient} className="text-xs text-muted" head={5} tail={4} />}
              </div>
              <div className="sm:text-right">
                <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle sm:hidden">Share</p>
                <p className="num text-sm font-semibold">{formatBps(split.bps[i])}</p>
              </div>
              <div className="sm:text-right">
                <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle sm:hidden">Owed now</p>
                <UsdcAmount value={formatUsdc(split.claimable[i])} className="text-sm" />
              </div>
              <div className="sm:text-right">
                <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle sm:hidden">Released</p>
                <UsdcAmount value={formatUsdc(split.released[i])} className="text-sm text-ink2" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <ReleaseButton id={split.id} recipient={recipient} disabled={split.claimable[i] === 0n} />
              </div>
            </li>
          )
        })}
      </ul>
      <p className="border-t border-white/[0.06] px-5 py-3 text-xs text-muted sm:px-6">
        Owed includes USDC waiting at the deposit address. Tiny rounding remainders stay in the split until more revenue arrives.
      </p>
    </Card>
  )
}
