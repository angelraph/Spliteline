import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { useQuery } from '@tanstack/react-query'
import { isAddress, parseEventLogs, zeroAddress, type Address } from 'viem'
import { useAccount, usePublicClient, useReadContract, useReadContracts } from 'wagmi'
import { Plus, Wand2 } from 'lucide-react'
import { Meter, RecipientRow, type RecipientDraft, type ResolvedRow } from '@/components/create/RecipientRow'
import { AddressLink, CopyButton, SplitLink } from '@/components/bits'
import { ComingSoon } from '@/components/ComingSoon'
import { Button, Card, CardHeader, Label, Notice, Skeleton, TextInput } from '@/components/ui'
import { useIndexer } from '@/hooks/useIndexer'
import { useNetwork, useWalletStatus } from '@/hooks/useNetwork'
import { parseSplitId } from '@/hooks/useSplit'
import { useTx } from '@/hooks/useTx'
import { SPLITLINE_EVENTS } from '@/lib/indexer'
import { parsePercentToBps } from '@/lib/usdc'
import { splitlineAbi } from '@/lib/splitlineAbi'

const MAX_RECIPIENTS = 20
let rowCounter = 0
const newRow = (): RecipientDraft => ({ key: `r${rowCounter++}`, kind: 'address', value: '', percent: '' })

export function Create() {
  const navigate = useNavigate()
  const { network } = useNetwork()
  const { address: account } = useAccount()
  const { wrongNetwork } = useWalletStatus()
  const idx = useIndexer()
  const publicClient = usePublicClient({ chainId: network.chainId })
  const tx = useTx()

  const [name, setName] = useState('')
  const [rows, setRows] = useState<RecipientDraft[]>(() => [newRow(), newRow()])

  const nameBytes = useMemo(() => new TextEncoder().encode(name).length, [name])

  // Resolve "Split" rows to their deposit addresses straight from the chain.
  const splitRowIds = useMemo(() => rows.map((r) => (r.kind === 'split' ? parseSplitId(r.value) : undefined)), [rows])
  const lookups = useReadContracts({
    contracts: splitRowIds.map((id) => ({
      address: network.address,
      abi: splitlineAbi,
      functionName: 'depositAddressOf' as const,
      args: [id ?? 0n] as const,
      chainId: network.chainId,
    })),
    query: { enabled: Boolean(network.address) && splitRowIds.some((id) => id !== undefined) },
  })

  const reserved = useReadContract({
    address: network.address,
    abi: splitlineAbi,
    functionName: 'DEPOSIT_IMPLEMENTATION',
    chainId: network.chainId,
    query: { enabled: Boolean(network.address), staleTime: Infinity },
  })

  const resolved: ResolvedRow[] = useMemo(() => {
    const blocked = new Set<string>(
      [network.address, network.usdc, reserved.data].filter(Boolean).map((a) => (a as string).toLowerCase()),
    )
    const seen = new Map<string, number>()
    const out: ResolvedRow[] = rows.map((row, i) => {
      const info: ResolvedRow = {}
      const pct = row.percent.trim()
      if (pct === '') info.percentError = undefined
      else {
        const bps = parsePercentToBps(pct)
        if (bps === null) info.percentError = 'Use up to 2 decimals, max 100.'
        else if (bps === 0) info.percentError = 'Must be above 0%.'
        else info.bps = bps
      }

      let address: Address | undefined
      if (row.kind === 'address') {
        const v = row.value.trim()
        if (v) {
          if (!isAddress(v, { strict: false })) info.recipientError = 'This is not a valid wallet address.'
          else if (v.toLowerCase() === zeroAddress) info.recipientError = 'The empty address cannot receive funds.'
          else if (blocked.has(v.toLowerCase())) info.recipientError = 'This address cannot be a recipient (it is the Splitline or USDC contract).'
          else address = v
        }
      } else {
        const id = splitRowIds[i]
        if (row.value.trim()) {
          if (id === undefined) info.recipientError = 'Enter a split id of 1 or more.'
          else {
            const res = lookups.data?.[i]
            if (lookups.isLoading || !res) info.loading = true
            else if (res.status !== 'success') info.recipientError = `Split #${id} does not exist on ${network.label}.`
            else {
              address = res.result as Address
              const name = idx.byId.get(id.toString())?.name
              info.resolved = (
                <span className="flex flex-wrap items-center gap-2">
                  <SplitLink id={id} name={name || undefined} />
                  <span className="mono">{address.slice(0, 8)}…{address.slice(-6)}</span>
                </span>
              )
            }
          }
        }
      }
      if (address) {
        const key = address.toLowerCase()
        if (seen.has(key)) info.recipientError = `Already listed in recipient ${seen.get(key)! + 1}. Each recipient can only appear once.`
        else seen.set(key, i)
        if (!info.recipientError) info.address = address
      }
      return info
    })
    return out
  }, [rows, lookups.data, lookups.isLoading, network, reserved.data, idx.byId, splitRowIds])

  const totalBps = resolved.reduce((sum, r) => sum + (r.bps ?? 0), 0)
  const remaining = 10000 - totalBps

  const complete = rows.every((r, i) => resolved[i].address && resolved[i].bps && !resolved[i].recipientError && !resolved[i].percentError)
  const nameOk = nameBytes <= 64
  const valid = complete && totalBps === 10000 && nameOk && rows.length >= 1 && rows.length <= MAX_RECIPIENTS

  const recipientsArg = valid ? resolved.map((r) => r.address as Address) : undefined
  const bpsArg = valid ? resolved.map((r) => r.bps as number) : undefined

  const predicted = useReadContract({
    address: network.address,
    abi: splitlineAbi,
    functionName: 'predictDepositAddress',
    args: account && recipientsArg && bpsArg ? [account, name, recipientsArg, bpsArg] : undefined,
    chainId: network.chainId,
    query: { enabled: Boolean(account && recipientsArg && bpsArg && network.address) },
  })

  const existing = useQuery({
    queryKey: ['code', network.chainId, predicted.data],
    enabled: Boolean(predicted.data && publicClient),
    queryFn: async () => {
      const code = await publicClient!.getCode({ address: predicted.data as Address })
      return Boolean(code && code !== '0x')
    },
  })
  const alreadyExists = existing.data === true

  const clearError = () => {
    if (tx.state.phase === 'error') tx.reset()
  }

  const updateRow = (key: string, patch: Partial<RecipientDraft>) => {
    clearError()
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const splitEvenly = () => {
    const n = rows.length
    const base = Math.floor(10000 / n)
    const extra = 10000 - base * n
    setRows((rs) => rs.map((r, i) => ({ ...r, percent: ((base + (i < extra ? 1 : 0)) / 100).toFixed(2) })))
  }

  const create = async () => {
    if (!valid || !recipientsArg || !bpsArg || !network.address) return
    const receipt = await tx.run({
      address: network.address,
      abi: splitlineAbi,
      functionName: 'createSplit',
      args: [name, recipientsArg, bpsArg],
    })
    if (!receipt) return
    const [created] = parseEventLogs({ abi: SPLITLINE_EVENTS, logs: receipt.logs, eventName: 'SplitCreated' })
    if (created) void navigate(`/s/${created.args.id}`)
  }

  const notDeployed = !network.address
  const busy = tx.busy

  if (notDeployed) return <ComingSoon />

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="display text-3xl font-bold sm:text-4xl">Create a split</h1>
        <p className="mt-2 max-w-xl text-muted">
          Choose who gets paid and how much. A split can never be changed after you create it.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="space-y-6">
          <Card>
            <div className="p-5 sm:p-6">
              <Label htmlFor="split-name" hint={`${nameBytes}/64 bytes`}>Name</Label>
              <TextInput
                id="split-name"
                placeholder="e.g. Studio revenue"
                value={name}
                invalid={!nameOk}
                onChange={(e) => {
                  clearError()
                  setName(e.target.value)
                }}
                autoComplete="off"
              />
              {!nameOk && <p role="alert" className="mt-1.5 text-xs text-danger">That name is too long. Keep it to 64 bytes or fewer.</p>}
              <p className="mt-1.5 text-xs text-subtle">Optional. Shown on the split page. Two splits with identical recipients need different names.</p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Recipients"
              hint={`${rows.length} of ${MAX_RECIPIENTS}. A recipient can be a wallet or another split.`}
              aside={
                <Button variant="secondary" size="sm" className="shrink-0 whitespace-nowrap" onClick={splitEvenly} disabled={rows.length === 0}>
                  <Wand2 className="size-3.5" /> Split evenly
                </Button>
              }
            />
            <div className="space-y-3 p-5 sm:p-6">
              {rows.map((row, i) => (
                <RecipientRow
                  key={row.key}
                  index={i}
                  draft={row}
                  info={resolved[i] ?? {}}
                  canRemove={rows.length > 1}
                  remainingBps={remaining > 0 ? remaining : 0}
                  onChange={(patch) => updateRow(row.key, patch)}
                  onRemove={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                />
              ))}
              <Button
                variant="secondary"
                full
                onClick={() => setRows((rs) => [...rs, newRow()])}
                disabled={rows.length >= MAX_RECIPIENTS}
              >
                <Plus className="size-4" /> Add recipient
              </Button>
              {rows.length >= MAX_RECIPIENTS && <p className="text-center text-xs text-muted">That is the maximum of {MAX_RECIPIENTS} recipients.</p>}
            </div>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <Card className="p-5 sm:p-6">
            <Label>Total assigned</Label>
            <Meter bps={totalBps} />

            <div className="mt-6">
              <Label>Deposit address</Label>
              {!valid ? (
                <p className="text-[13px] text-muted">Complete the recipients and reach exactly 100.00% to preview your deposit address.</p>
              ) : !account ? (
                <p className="text-[13px] text-muted">Connect your wallet to preview the deposit address. It depends on who creates the split.</p>
              ) : predicted.isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : predicted.data ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="mono break-all text-[13px] leading-relaxed text-ink">{predicted.data}</p>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <CopyButton value={predicted.data} size="sm" />
                    <AddressLink address={predicted.data} />
                  </div>
                  <p className="mt-2 text-[11px] text-subtle">Final once you create. You can share it right away.</p>
                </div>
              ) : (
                <p className="text-[13px] text-danger">Could not compute the deposit address. Try again in a moment.</p>
              )}
            </div>

            {alreadyExists && (
              <div className="mt-4">
                <Notice tone="warn">You already created a split with this exact name and recipients. Change the name to create another.</Notice>
              </div>
            )}

            {tx.state.phase === 'error' && tx.state.error && !tx.state.rejected && (
              <div className="mt-4">
                <Notice tone="danger">{tx.state.error}</Notice>
              </div>
            )}
            {tx.state.phase === 'error' && tx.state.rejected && (
              <div className="mt-4">
                <Notice tone="info">{tx.state.error}</Notice>
              </div>
            )}

            <div className="mt-5">
              {!account ? (
                <ConnectKitButton.Custom>
                  {({ show }) => (
                    <Button size="lg" full onClick={show}>Connect wallet to create</Button>
                  )}
                </ConnectKitButton.Custom>
              ) : (
                <Button size="lg" full onClick={() => void create()} loading={busy} disabled={!valid || alreadyExists || busy}>
                  {tx.state.phase === 'wallet'
                    ? 'Confirm in your wallet…'
                    : tx.state.phase === 'confirming'
                      ? 'Creating on Arc…'
                      : wrongNetwork
                        ? `Switch to ${network.label} and create`
                        : 'Create split'}
                </Button>
              )}
              {!valid && account && (
                <p className="mt-2 text-center text-xs text-muted">
                  {totalBps !== 10000 ? 'Percentages must total exactly 100.00%.' : 'Fix the highlighted fields to continue.'}
                </p>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  )
}
