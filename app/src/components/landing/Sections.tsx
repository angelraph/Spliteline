import { Link } from 'react-router-dom'
import { ArrowRight, Bot, Check, GitFork, Inbox, PenLine, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { clsx } from 'clsx'
import { Reveal } from '@/components/Reveal'
import { CopyButton } from '@/components/bits'
import { Button, Card } from '@/components/ui'
import wordmarkUrl from '@/assets/logo.webp'

export function SectionHeading({ eyebrow, title, body }: { eyebrow?: string; title: string; body?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>}
      <h2 className="mt-2 text-balance text-[1.75rem] font-bold leading-tight sm:text-4xl">{title}</h2>
      {body && <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-muted">{body}</p>}
    </div>
  )
}

const STEPS = [
  {
    n: '01',
    title: 'Create a split',
    body: 'Name it and add up to 20 recipients with percentages. A live meter must reach exactly 100% and then it is locked in forever. A recipient can even be another split.',
  },
  {
    n: '02',
    title: 'Share the address',
    body: 'Every split has its own deposit address. Anyone can send USDC to it from any wallet, exchange or agent, or pay on the split page, with a payment link or an embedded widget.',
  },
  {
    n: '03',
    title: 'Get paid',
    body: 'Each recipient sees exactly what they are owed and claims it any time, to any address. Claiming also collects whatever is waiting at the deposit address.',
  },
]

export function HowItWorks() {
  return (
    <section id="how" className="px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <SectionHeading eyebrow="How it works" title="Three steps, and it is done forever" body="No accounts, no backend, and no one you have to trust after the split is created." />
        </Reveal>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 90}>
              <Card className="h-full p-6">
                <p className="num text-gradient text-3xl font-bold">{s.n}</p>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </Card>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

function BentoCard({ icon: Icon, title, body, className, children }: { icon: typeof Inbox; title: string; body: string; className?: string; children?: React.ReactNode }) {
  return (
    <Card className={clsx('flex h-full flex-col overflow-hidden p-6', className)}>
      <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-accent">
        <Icon className="size-5" aria-hidden />
      </span>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
      {children && <div className="mt-5 flex-1">{children}</div>}
    </Card>
  )
}

const Chip = ({ children, strong }: { children: React.ReactNode; strong?: boolean }) => (
  <span className={clsx('inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold', strong ? 'border-transparent bg-brand text-accent-ink' : 'border-line bg-white/[0.03] text-ink2')}>{children}</span>
)

export function WhySpliteline() {
  return (
    <section id="why" className="px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <SectionHeading eyebrow="Why Spliteline" title="The complete, trustworthy version" body="Most splitters stop at it compiles. v2 is built so anyone can pay in, anyone can pay out, and nobody can change the rules." />
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-6">
          <Reveal className="md:col-span-3">
            <BentoCard icon={Inbox} title="A deposit address per split" body="Every split gets its own address. Any wallet, exchange or agent can just send USDC to it. No app, no approval, no contract call.">
              <div className="rounded-xl border border-line bg-bg/70 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">Send USDC here from any wallet or exchange</p>
                <p className="mono mt-1.5 break-all text-xs text-ink2">0x36A1…e4c9</p>
              </div>
            </BentoCard>
          </Reveal>
          <Reveal className="md:col-span-3" delay={80}>
            <BentoCard icon={PenLine} title="One-transaction pay" body="Sign a permit and pay in a single transaction instead of approve then pay. Wallets that cannot sign fall back to two steps automatically.">
              <div className="flex flex-wrap items-center gap-2">
                <Chip>Sign</Chip>
                <ArrowRight className="size-3.5 text-subtle" aria-hidden />
                <Chip strong>Pay</Chip>
                <span className="text-xs text-subtle">one transaction</span>
              </div>
            </BentoCard>
          </Reveal>
          <Reveal className="md:col-span-2">
            <BentoCard icon={GitFork} title="Nested splits" body="A recipient can be another split. Revenue flows down the chain with nothing to trap it, and cycles cannot be built.">
              <div className="flex items-center gap-2 text-xs font-semibold text-ink2">
                <Chip>Split #1</Chip>
                <ArrowRight className="size-3.5 text-subtle" aria-hidden />
                <Chip>Split #2</Chip>
              </div>
            </BentoCard>
          </Reveal>
          <Reveal className="md:col-span-2" delay={80}>
            <BentoCard icon={Zap} title="Auto-sweep" body="Claim, claim to another address and release collect whatever is waiting at the deposit address first. No separate sweep step.">
              <div className="flex flex-wrap items-center gap-2">
                <Chip>Claim</Chip>
                <ArrowRight className="size-3.5 text-subtle" aria-hidden />
                <Chip strong>Swept + paid</Chip>
              </div>
            </BentoCard>
          </Reveal>
          <Reveal className="md:col-span-2" delay={160}>
            <BentoCard icon={ShieldCheck} title="Pull-based payouts" body="Every recipient is paid independently, so one blocklisted or broken recipient can never block anyone else.">
              <div className="flex items-center gap-2 text-xs text-ink2">
                <Check className="size-4 text-success" aria-hidden /> Everyone else still gets paid
              </div>
            </BentoCard>
          </Reveal>
          <Reveal className="md:col-span-6">
            <Card className="p-6">
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="max-w-md">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-accent">
                    <Sparkles className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">No owner, no admin, no fee</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">Recipients and shares are fixed at creation. There is no owner, no admin, no fee and no upgrade function anywhere in the contract. Trust is enforced by code.</p>
                </div>
                <dl className="grid grid-cols-4 gap-2 text-center sm:gap-4">
                  {['Owner', 'Admin', 'Fee', 'Upgrade'].map((k) => (
                    <div key={k} className="rounded-xl border border-line bg-bg/60 px-2 py-3 sm:px-5">
                      <dd className="num text-gradient text-2xl font-bold sm:text-3xl">0</dd>
                      <dt className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{k}</dt>
                    </div>
                  ))}
                </dl>
              </div>
            </Card>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

const SNIPPET = `// 1. Pay a split in one transaction with an EIP-2612 permit
await wallet.writeContract({
  address: SPLITLINE, abi: splitlineAbi,
  functionName: 'payWithPermit',
  args: [id, amount, ref, deadline, v, r, s],
})

// 2. Or skip the contract: a plain USDC transfer to the split's deposit address
await wallet.writeContract({
  address: USDC, abi: erc20Abi,
  functionName: 'transfer',
  args: [depositAddress, amount],
})

// 3. Recipients claim. Anything waiting at the deposit address is swept in first
await wallet.writeContract({
  address: SPLITLINE, abi: splitlineAbi,
  functionName: 'claim',
  args: [id],
})`

export function CodeBlock({ code, className }: { code: string; className?: string }) {
  return (
    <div className={clsx('overflow-hidden rounded-2xl border border-line bg-[#080b10]', className)}>
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <span className="text-xs font-semibold text-subtle">TypeScript · viem</span>
        <CopyButton value={code} label="Copy" size="sm" />
      </div>
      <pre className="mono overflow-x-auto p-4 text-[12.5px] leading-relaxed text-ink2" tabIndex={0}>
        <code>
          {code.split('\n').map((line, i) => (
            <span key={i} className={clsx('block whitespace-pre', line.trim().startsWith('//') && 'text-subtle')}>
              {line || ' '}
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}

export function ForBuilders() {
  return (
    <section id="builders" className="px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1fr_1.2fr]">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">For builders</p>
          <h2 className="mt-2 text-balance text-[1.75rem] font-bold leading-tight sm:text-4xl">Three calls. That is the whole integration.</h2>
          <p className="mt-3 max-w-md text-base leading-relaxed text-muted">
            Pay into a split, send plain USDC to its deposit address, or let recipients claim. Software can pay software with no human in the loop.
          </p>
          <div className="mt-5 flex items-start gap-3 text-sm text-ink2">
            <Bot className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
            <p>Agents and exchanges do not need the contract at all: a USDC transfer to the deposit address is enough.</p>
          </div>
          <Link to="/docs#integrating" className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent hover:underline">
            Read the integration guide <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Reveal>
        <Reveal delay={100} className="min-w-0">
          <CodeBlock code={SNIPPET} />
        </Reveal>
      </div>
    </section>
  )
}

export function FinalCta() {
  return (
    <section className="px-4 pb-16 pt-8 sm:px-6 sm:pb-24">
      <Reveal>
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-line bg-surface">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(520px_280px_at_100%_0%,rgba(59,130,246,0.22),transparent_70%),radial-gradient(520px_280px_at_100%_100%,rgba(34,197,94,0.18),transparent_70%)]" aria-hidden />
          <div className="relative grid items-center gap-8 p-6 sm:p-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <h2 className="text-balance text-[1.75rem] font-bold leading-tight sm:text-4xl">Ready to split revenue the right way?</h2>
              <p className="mt-3 max-w-md text-base leading-relaxed text-muted">Create a split in under a minute. No sign-up, no backend, and no trust required.</p>
              <div className="mt-6 flex flex-col gap-3 min-[420px]:flex-row">
                <Link to="/create" className="min-[420px]:w-auto">
                  <Button size="lg" full>Create a split</Button>
                </Link>
                <Link to="/docs">
                  <Button size="lg" variant="secondary" full>Read the docs</Button>
                </Link>
              </div>
            </div>
            <img src={wordmarkUrl} alt="Split revenue. Build together." width={1536} height={1024} loading="lazy" className="mx-auto w-full max-w-sm rounded-2xl opacity-95 lg:max-w-none" />
          </div>
        </div>
      </Reveal>
    </section>
  )
}
