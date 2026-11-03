import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { erc20Abi, isAddress, type Address } from 'viem'
import { useAccount, useReadContracts } from 'wagmi'
import { toast } from 'sonner'
import { Wallet, WalletCards } from 'lucide-react'
import { SplitLink, TxLink, UsdcAmount } from '@/components/bits'
import { ComingSoon } from '@/components/ComingSoon'
import { Button, Card, EmptyState, ErrorState, Notice, Skeleton, TextInput } from '@/components/ui'
import { useIndexer } from '@/hooks/useIndexer'
import { useNetwork } from '@/hooks/useNetwork'
import { useTx } from '@/hooks/useTx'
import type { SplitInfo } from '@/lib/indexer'
import { splitlineAbi } from '@/lib/splitlineAbi'
import { formatBps, formatUsdc, shareOf } from '@/lib/usdc'

interface Row {
  split: SplitInfo
  bps: number
  claimable: bigint
  released: bigint
}

function ClaimRow({ row, account }: { row: Row; account: Address }) {
  const { network } = useNetwork()
  const tx = useTx()
  const [open, setOpen] = useState(false)
  const [dest, setDest] = useState('')
  const destValid = isAddress(dest.trim(), { strict: false })
  const destError = dest.trim() !== '' && !destValid ? 'This is not a valid wallet address.' : undefined

  const claim = async (to?: Address) => {
    if (!network.address) return
    const receipt = await tx.run(
      to
        ? { address: network.address, abi: splitlineAbi, functionName: 'claimTo', args: [row.split.id, to] }
        : { address: network.address, abi: splitlineAbi, functionName: 'claim', args: [row.split.id] },
    )
    if (receipt) {
      toast.success(`Claimed from Split #${row.split.id}`, { description: <TxLink hash={receipt.transactionHash} /> })
      setOpen(false)
      setDest('')
    }
  }

  return (
    <li className="px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <SplitLink id={row.split.id} name={row.split.name || undefined} />
          <p className="mt-1.5 text-xs text-muted">
            Your share {formatBps(row.bps)} · Already received <span className="num">{formatUsdc(row.released)}</span> USDC
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">Owed</p>
            <UsdcAmount value={formatUsdc(row.claimable)} className="text-base" />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void claim()} loading={tx.busy && !open} disabled={row.claimable === 0n || tx.busy}>
          {tx.state.phase === 'wallet' && !open ? 'Confirm in wallet…' : tx.state.phase === 'confirming' && !open ? 'Claiming…' : 'Claim'}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} disabled={row.claimable === 0n || tx.busy} aria-expanded={open}>
          Claim to another address
        </Button>
      </div>

      {open && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <label htmlFor={`dest-${row.split.id}`} className="mb-1.5 block text-xs font-semibold text-muted">
            Send my {formatUsdc(row.claimable)} USDC to
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <TextInput
              id={`dest-${row.split.id}`}
              placeholder="0x… destination address"
              value={dest}
              invalid={Boolean(destError)}
              onChange={(e) => setDest(e.target.value)}
              className="mono sm:!text-[13px]"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <Button onClick={() => void claim(dest.trim() as Address)} disabled={!destValid || tx.busy} loading={tx.busy && open}>
              Send
            </Button>
          </div>
          {destError && <p role="alert" className="mt-1.5 text-xs text-danger">{destError}</p>}
          {dest.trim().toLowerCase() === account.toLowerCase() && <p className="mt-1.5 text-xs text-muted">That is your own address. The regular Claim button does the same thing.</p>}
        </div>
      )}

      {tx.state.phase === 'error' && tx.state.error && (
        <div className="mt-3">
          <Notice tone={tx.state.rejected ? 'info' : 'danger'}>{tx.state.error}</Notice>
        </div>
      )}
    </li>
  )
}

export function Claim() {
  const { network } = useNetwork()
  const { address: account, isConnecting } = useAccount()
  const idx = useIndexer()

  const mine = useMemo(() => {
    if (!account) return []
    return idx.splits
      .map((s) => {
        const i = s.recipients.findIndex((r) => r.toLowerCase() === account.toLowerCase())
        return i >= 0 ? { split: s, bps: s.bps[i] } : undefined
      })
      .filter((x): x is { split: SplitInfo; bps: number } => Boolean(x))
  }, [idx.splits, account])

  const reads = useReadContracts({
    contracts:
      account && network.address
        ? mine.flatMap(({ split }) => [
            { address: network.address as Address, abi: splitlineAbi, functionName: 'getSplit' as const, args: [split.id] as const, chainId: network.chainId },
            { address: network.usdc, abi: erc20Abi, functionName: 'balanceOf' as const, args: [split.depositAddress] as const, chainId: network.chainId },
            { address: network.address as Address, abi: splitlineAbi, functionName: 'released' as const, args: [split.id, account] as const, chainId: network.chainId },
          ])
        : [],
    query: { enabled: Boolean(account && network.address && mine.length > 0), refetchInterval: 10_000 },
  })

  const rows: Row[] = useMemo(() => {
    if (!reads.data) return []
    return mine
      .map(({ split, bps }, i): Row | undefined => {
        const core = reads.data[i * 3]
        const bal = reads.data[i * 3 + 1]
        const rel = reads.data[i * 3 + 2]
        if (core?.status !== 'success' || bal?.status !== 'success' || rel?.status !== 'success') return undefined
        const total = (core.result as readonly [string, readonly Address[], readonly number[], Address, bigint])[4]
        const released = rel.result as bigint
        const entitled = shareOf(total + (bal.result as bigint), bps)
        return { split, bps, released, claimable: entitled > released ? entitled - released : 0n }
      })
      .filter((r): r is Row => Boolean(r))
      .sort((a, b) => (a.claimable === b.claimable ? Number(a.split.id - b.split.id) : a.claimable > b.claimable ? -1 : 1))
  }, [reads.data, mine])

  const totalOwed = rows.reduce((sum, r) => sum + r.claimable, 0n)
  const indexing = idx.status !== 'live' && idx.status !== 'error' && idx.splits.length === 0

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="display text-3xl font-bold sm:text-4xl">Claim your earnings</h1>
        <p className="mt-2 text-muted">Every split that pays your wallet, with what you can take right now.</p>
      </div>

      {!network.address ? (
        <ComingSoon heading="h2" />
      ) : !account ? (
        <Card>
          <EmptyState
            icon={<Wallet className="size-5" />}
            title={isConnecting ? 'Connecting your wallet…' : 'Connect your wallet'}
            body="We will list every split where your address is a recipient."
            action={
              <ConnectKitButton.Custom>
                {({ show }) => <Button onClick={show}>Connect wallet</Button>}
              </ConnectKitButton.Custom>
            }
          />
        </Card>
      ) : (
        <>
          <Card className="mb-6 p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Total owed to you</p>
            {indexing || (mine.length > 0 && reads.isLoading) ? (
              <Skeleton className="mt-2 h-10 w-48" />
            ) : (
              <UsdcAmount big value={formatUsdc(totalOwed)} className="mt-1 text-4xl" />
            )}
            <p className="mt-2 text-[13px] text-muted">
              Across {rows.length} split{rows.length === 1 ? '' : 's'}. Anything sent straight to a deposit address is counted and collected when you claim.
            </p>
          </Card>

          <Card>
            {indexing ? (
              <div className="space-y-4 p-5 sm:p-6">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                {idx.isCatchingUp && (
                  <p className="num text-xs text-muted">
                    Reading history: block {idx.scannedTo.toLocaleString('en-US')} of {idx.head.toLocaleString('en-US')}
                  </p>
                )}
              </div>
            ) : idx.status === 'error' && idx.splits.length === 0 ? (
              <ErrorState title="Could not read your splits" body="The network did not answer. We will keep retrying." onRetry={() => void idx.refresh()} />
            ) : mine.length === 0 ? (
              <EmptyState
                icon={<WalletCards className="size-5" />}
                title="No splits pay this wallet yet"
                body="When someone adds your address to a split, it shows up here automatically."
                action={<Link to="/create"><Button size="sm" variant="secondary">Create a split</Button></Link>}
              />
            ) : reads.isLoading ? (
              <div className="space-y-4 p-5 sm:p-6">
                <Skeleton className="h-16 w-full" />
              </div>
            ) : reads.isError ? (
              <ErrorState title="Could not load your balances" onRetry={() => void reads.refetch()} />
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {rows.map((row) => (
                  <ClaimRow key={row.split.id.toString()} row={row} account={account} />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
