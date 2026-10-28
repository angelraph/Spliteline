import type { ReactNode } from 'react'
import { clsx } from 'clsx'

export function DocSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 border-b border-line py-10 first:pt-0 last:border-0">
      <h2 className="text-2xl font-bold sm:text-[1.75rem]">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-ink2">{children}</div>
    </section>
  )
}

export const H3 = ({ children }: { children: ReactNode }) => <h3 className="!mt-7 text-base font-semibold text-ink">{children}</h3>

export const Code = ({ children }: { children: ReactNode }) => (
  <code className="mono break-words rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[0.86em] text-ink">{children}</code>
)

export const Formula = ({ children }: { children: ReactNode }) => (
  <div className="mono overflow-x-auto rounded-xl border border-line bg-[#080b10] px-4 py-3 text-[13px] text-ink" tabIndex={0}>
    {children}
  </div>
)

export function Callout({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
  return (
    <div className={clsx('rounded-xl border px-4 py-3 text-sm leading-relaxed', tone === 'warn' ? 'border-warn/30 bg-warn/10 text-ink2' : 'border-accent/25 bg-accent/10 text-ink2')}>
      {children}
    </div>
  )
}

/** A reference list that stacks on phones and becomes two columns on larger screens (no sideways scrolling). */
export function RefList({ head, rows }: { head: [string, string]; rows: Array<[ReactNode, ReactNode]> }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="hidden grid-cols-[minmax(0,20rem)_1fr] gap-4 border-b border-line bg-white/[0.03] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-subtle md:grid">
        <span>{head[0]}</span>
        <span>{head[1]}</span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map(([a, b], i) => (
          <li key={i} className="grid gap-1.5 px-4 py-3 md:grid-cols-[minmax(0,20rem)_1fr] md:gap-4">
            <div className="min-w-0 break-words">{a}</div>
            <div className="min-w-0 text-sm text-muted">{b}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
