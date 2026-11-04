import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Button, Card, ErrorState, Skeleton } from '@/components/ui'
import { SplitLink, UsdcAmount } from '@/components/bits'
import { HeroMockup } from '@/components/landing/HeroMockup'
import { FinalCta, ForBuilders, HowItWorks, WhySpliteline } from '@/components/landing/Sections'
import { Reveal } from '@/components/Reveal'
import { useIndexer } from '@/hooks/useIndexer'
import { useNetwork } from '@/hooks/useNetwork'
import { COMING_SOON_MAINNET } from '@/lib/networks'
import { formatUsdc } from '@/lib/usdc'

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            'radial-gradient(640px 420px at 88% 8%, rgba(59,130,246,0.30), transparent 70%), radial-gradient(560px 420px at 96% 70%, rgba(34,197,94,0.22), transparent 70%), radial-gradient(420px 300px at 70% 30%, rgba(34,211,238,0.12), transparent 70%)',
        }}
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-ink2">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden /> Built with Arc Studio · live on Arc
          </span>
          <h1 className="mt-5 break-words text-[clamp(2rem,9.6vw,2.75rem)] font-bold leading-[1.04] sm:text-6xl lg:text-[4.25rem]">
            Split revenue.
            <br />
            <span className="text-gradient">Build together.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            Spliteline gives every revenue split its own USDC deposit address. Anyone can send money in, every recipient gets their exact share, claimable any time, and nobody, not even the creator, can ever change the rules.
          </p>
          <div className="mt-7 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center">
            <Link to="/create">
              <Button size="lg" full>Create a split</Button>
            </Link>
            <Link to="/docs" className="inline-flex min-h-12 items-center justify-center gap-2 px-4 text-[15px] font-semibold text-ink hover:text-accent">
              Read the docs <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <p className="mt-5 text-sm text-muted">No owner. No admin. No fee. No upgrade path.</p>
        </div>
        <Reveal className="min-w-0">
          <HeroMockup />
        </Reveal>
      </div>
    </section>
  )
}

function StatItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-2 py-4 text-center sm:px-4">
      <div className="display num truncate text-2xl font-bold sm:text-3xl">{children}</div>
      <p className="mt-1 text-xs leading-snug text-muted sm:text-[13px]">{label}</p>
    </div>
  )
}

function StatsStrip() {
  const { network } = useNetwork()
  const idx = useIndexer()
  const claims = idx.activity.filter((a) => a.kind === 'Claimed').length
  const loading = idx.configured && idx.splits.length === 0 && idx.activity.length === 0 && idx.status !== 'live' && idx.status !== 'error'

  return (
    <section className="px-4 pt-10 sm:px-6" aria-label="Live onchain numbers">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <Card className="overflow-hidden p-2 sm:p-3">
            {!idx.configured ? (
              <div className="flex flex-col items-center gap-1 px-4 py-6 text-center">
                <p className="text-lg font-semibold">{network.isTestnet ? `Not live on ${network.label} yet` : COMING_SOON_MAINNET}</p>
                <p className="text-sm text-muted">Live numbers appear here as soon as Spliteline is deployed on this network.</p>
              </div>
            ) : idx.status === 'error' && idx.splits.length === 0 ? (
              <ErrorState compact title="Could not load live numbers" body="We could not reach the network. Check your connection and try again." onRetry={() => void idx.refresh()} />
            ) : (
              <div className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
                <StatItem label="Splits created">{loading ? <Skeleton className="mx-auto h-8 w-14" /> : idx.splits.length.toLocaleString('en-US')}</StatItem>
                <StatItem label="USDC routed">
                  {loading ? (
                    <Skeleton className="mx-auto h-8 w-24" />
                  ) : (
                    <UsdcAmount value={formatUsdc(idx.routed)} plain />
                  )}
                </StatItem>
                <StatItem label="Payouts made">{loading ? <Skeleton className="mx-auto h-8 w-14" /> : claims.toLocaleString('en-US')}</StatItem>
                <StatItem label="Admin functions">0</StatItem>
              </div>
            )}
            {idx.configured && idx.isCatchingUp && (
              <p className="num border-t border-line px-4 py-2 text-center text-xs text-muted">
                Reading history: block {idx.scannedTo.toLocaleString('en-US')} of {idx.head.toLocaleString('en-US')}
              </p>
            )}
          </Card>
        </Reveal>
      </div>
    </section>
  )
}

function LatestSplits() {
  const idx = useIndexer()
  if (!idx.configured || idx.splits.length === 0) return null
  const latest = [...idx.splits].reverse().slice(0, 4)
  return (
    <section className="px-4 pt-6 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-subtle">Latest splits</p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {latest.map((s) => (
              <li key={s.id.toString()}>
                <Link
                  to={`/s/${s.id}`}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-line bg-surface/70 px-4 text-sm transition hover:border-white/20 hover:bg-surface"
                >
                  <SplitLink id={s.id} name={s.name} asText />
                  <span className="text-xs text-muted">{s.recipients.length} recipients</span>
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  )
}

export function Landing() {
  return (
    <>
      <Hero />
      <StatsStrip />
      <LatestSplits />
      <HowItWorks />
      <WhySpliteline />
      <ForBuilders />
      <FinalCta />
    </>
  )
}
