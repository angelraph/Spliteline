import { QRCodeSVG } from 'qrcode.react'
import { Inbox } from 'lucide-react'
import { AddressLink, CopyButton, TxLink, UsdcAmount } from '@/components/bits'
import { Button, Card, Notice } from '@/components/ui'
import { useNetwork } from '@/hooks/useNetwork'
import { useTx } from '@/hooks/useTx'
import { splitlineAbi } from '@/lib/splitlineAbi'
import { formatUsdc } from '@/lib/usdc'
import type { SplitView } from '@/hooks/useSplit'

export function DepositCard({ split }: { split: SplitView }) {
  const { network } = useNetwork()
  const tx = useTx()
  const hasPending = split.pending > 0n

  const sweep = () => {
    if (!network.address) return
    void tx.run({ address: network.address, abi: splitlineAbi, functionName: 'sweep', args: [split.id] })
  }

  return (
    <Card className="overflow-hidden">
      <div className="p-5 sm:p-7">
        <div className="mb-5 flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Inbox className="size-4" />
          </div>
          <p className="text-sm font-semibold text-ink">Send USDC here from any wallet or exchange</p>
        </div>

        <div className="flex flex-col items-stretch gap-5 sm:flex-row sm:items-center">
          <div className="mx-auto shrink-0 rounded-2xl bg-white p-3 sm:mx-0" aria-label="QR code for the deposit address">
            <QRCodeSVG value={split.depositAddress} size={132} level="M" bgColor="#ffffff" fgColor="#060a13" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Deposit address</p>
            <p className="mono mt-1.5 break-all text-[17px] font-medium leading-snug text-ink sm:text-xl">{split.depositAddress}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CopyButton value={split.depositAddress} label="Copy address" />
              <AddressLink address={split.depositAddress} head={8} tail={6} className="px-1" />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              USDC on {network.label} only. Plain transfers work, so nothing else is needed on the sender’s side.
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.06] bg-white/[0.02] p-5 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Waiting at the deposit address</p>
            <UsdcAmount big value={formatUsdc(split.pending)} className="mt-1 text-2xl" />
          </div>
          <Button variant="secondary" size="sm" onClick={sweep} loading={tx.busy} disabled={!hasPending || tx.busy}>
            {tx.state.phase === 'wallet' ? 'Confirm in wallet…' : tx.state.phase === 'confirming' ? 'Sweeping…' : 'Sweep now'}
          </Button>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {hasPending
            ? 'The next claim or release picks this up automatically. Sweeping is optional and just moves it into the split now.'
            : 'Nothing waiting. Anything sent here is picked up automatically by the next claim or release.'}
        </p>
        {tx.state.phase === 'success' && tx.state.hash && (
          <div className="mt-3 flex items-center gap-2 text-[13px] text-success">
            Swept into the split. <TxLink hash={tx.state.hash} />
          </div>
        )}
        {tx.state.phase === 'error' && tx.state.error && (
          <div className="mt-3">
            <Notice tone={tx.state.rejected ? 'info' : 'danger'}>{tx.state.error}</Notice>
          </div>
        )}
      </div>
    </Card>
  )
}
