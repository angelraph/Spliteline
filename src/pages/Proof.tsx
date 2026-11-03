import { useState } from 'react'
import { ExternalLink, ShieldCheck } from 'lucide-react'
import { clsx } from 'clsx'
import { CopyButton } from '@/components/bits'
import { Card, EmptyState } from '@/components/ui'
import proof from '@/data/proof.json'
import { buildAddressExplorerUrl, buildTxExplorerUrl, requireChain } from '@/onchain-facts'
import { NETWORKS } from '@/lib/networks'

interface ProofTx {
  label: string
  hash: string
}

interface ProofSection {
  contract: string
  transactions: ProofTx[]
}

const isHash = (h: string) => /^0x[0-9a-fA-F]{64}$/.test(h)
const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-8)}`

function TxList({ chainId, txs }: { chainId: number; txs: ProofTx[] }) {
  return (
    <ol className="divide-y divide-line">
      {txs.filter((t) => isHash(t.hash)).map((t, i) => (
        <li key={t.hash} className="flex flex-col gap-1 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="num mt-0.5 w-6 shrink-0 text-xs font-semibold text-subtle">{i + 1}</span>
            <p className="min-w-0 break-words text-sm font-medium text-ink">{t.label}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1 pl-9 sm:pl-0">
            <a
              href={buildTxExplorerUrl(chainId, t.hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="mono inline-flex min-h-11 items-center gap-1.5 text-xs text-accent hover:underline"
              aria-label={`View transaction ${t.hash} on the explorer`}
            >
              {shortHash(t.hash)} <ExternalLink className="size-3" aria-hidden />
            </a>
            <CopyButton value={t.hash} label="" size="sm" />
          </div>
        </li>
      ))}
    </ol>
  )
}

function Section({ title, subtitle, chainId, data, emptyTitle, emptyBody }: { title: string; subtitle: string; chainId: number; data: ProofSection; emptyTitle: string; emptyBody: string }) {
  const txs = data.transactions.filter((t) => isHash(t.hash))
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-4 sm:px-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
        {/^0x[0-9a-fA-F]{40}$/.test(data.contract) && (
          <a
            href={buildAddressExplorerUrl(chainId, data.contract)}
            target="_blank"
            rel="noopener noreferrer"
            className="mono mt-2 inline-flex min-h-11 items-center gap-1.5 break-all text-xs text-accent hover:underline"
          >
            Contract {data.contract} <ExternalLink className="size-3 shrink-0" aria-hidden />
          </a>
        )}
      </div>
      {txs.length === 0 ? <EmptyState icon={<ShieldCheck className="size-5" />} title={emptyTitle} body={emptyBody} /> : <TxList chainId={chainId} txs={txs} />}
    </Card>
  )
}

export function Proof() {
  const mainnet = NETWORKS.find((n) => n.key === 'mainnet')
  const testnet = NETWORKS.find((n) => n.key === 'testnet')
  const [tab, setTab] = useState<'mainnet' | 'testnet'>('mainnet')
  const data = proof as { mainnet: ProofSection; testnet: ProofSection }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-bold sm:text-5xl">Proof</h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
        Real transactions from Spliteline&apos;s build and deploy journey, each linked to the Arc explorer so you can check them yourself. The mainnet list is filled in after the v2 mainnet deployment.
      </p>

      <div role="tablist" aria-label="Network" className="mt-6 inline-flex rounded-full border border-line bg-white/[0.03] p-1">
        {(['mainnet', 'testnet'] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={clsx('min-h-11 rounded-full px-5 text-sm font-semibold transition', tab === k ? 'bg-brand text-accent-ink' : 'text-muted hover:text-ink')}
          >
            {k === 'mainnet' ? 'Mainnet' : 'Testnet'}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'mainnet' ? (
          <Section
            title="Arc mainnet"
            subtitle="Real USDC. Every mainnet transaction in the v2 journey."
            chainId={requireChain(mainnet?.chainId ?? 5042).chainId}
            data={data.mainnet}
            emptyTitle="Mainnet proof is coming soon"
            emptyBody="Spliteline v2 has not been deployed to Arc mainnet yet. The deploy and first transactions will be listed here with explorer links."
          />
        ) : (
          <Section
            title="Arc Testnet"
            subtitle="Test USDC. The full v2 run: deploy, create, pay, sweep, claim, release and nested splits."
            chainId={requireChain(testnet?.chainId ?? 5042002).chainId}
            data={data.testnet}
            emptyTitle="No testnet transactions yet"
            emptyBody="Testnet transactions will be listed here."
          />
        )}
      </div>
    </div>
  )
}
