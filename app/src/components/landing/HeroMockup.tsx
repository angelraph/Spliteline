import markUrl from '@/assets/mark.png'

/**
 * Decorative product preview: a browser showing a split page and a phone showing a claim.
 * Everything is sized in container-query units so it scales cleanly from 320px to desktop.
 * It is labelled as an example everywhere; no figure in it is real data.
 */
const cq = (n: number) => `${n}cqw`
/** Text never drops below a readable size, even in a narrow container. */
const fs = (n: number) => `max(10px, ${n}cqw)`

const ROWS = [
  { pct: 50, bar: 78 },
  { pct: 30, bar: 48 },
  { pct: 20, bar: 32 },
]

export function HeroMockup() {
  return (
    <figure className="mx-auto w-full max-w-[540px]" aria-label="Example preview of a split page and a claim screen">
      <div className="relative w-full [container-type:inline-size]" style={{ aspectRatio: '1 / 0.74' }}>
        {/* Browser window */}
        <div
          className="absolute overflow-hidden border border-line bg-surface shadow-card"
          style={{ left: 0, top: cq(9), width: cq(66), borderRadius: cq(3) }}
        >
          <div className="flex items-center border-b border-line bg-surface2" style={{ gap: cq(1.2), padding: `${cq(1.8)} ${cq(2.4)}` }}>
            {[0, 1, 2].map((i) => (
              <span key={i} className="rounded-full bg-white/15" style={{ width: cq(1.5), height: cq(1.5) }} />
            ))}
            <span className="mono truncate text-subtle" style={{ marginLeft: cq(2), fontSize: fs(2.4) }}>
              spliteline.xyz/s/42
            </span>
          </div>
          <div style={{ padding: cq(3.2) }}>
            <div className="flex items-center justify-between" style={{ gap: cq(2) }}>
              <p className="truncate font-semibold text-ink" style={{ fontSize: fs(3.4) }}>
                Design retainer
              </p>
              <span className="shrink-0 rounded-full bg-success/15 font-semibold text-success" style={{ fontSize: fs(2.1), padding: `${cq(0.5)} ${cq(1.8)}` }}>
                Example
              </span>
            </div>
            <div className="rounded-lg border border-line bg-bg/60" style={{ marginTop: cq(2.4), padding: `${cq(1.6)} ${cq(2)}` }}>
              <p className="uppercase tracking-wider text-subtle" style={{ fontSize: fs(2) }}>Send USDC here</p>
              <p className="mono truncate text-ink2" style={{ fontSize: fs(2.5), marginTop: cq(0.6) }}>0x36A1…e4c9</p>
            </div>
            <div className="flex flex-col" style={{ marginTop: cq(2.6), gap: cq(2.2) }}>
              {ROWS.map((r, i) => (
                <div key={r.pct} className="flex items-center" style={{ gap: cq(2) }}>
                  <span
                    className="shrink-0 rounded-full"
                    style={{ width: cq(4.2), height: cq(4.2), background: ['#3b82f6', '#22d3ee', '#22c55e'][i] }}
                  />
                  <span className="relative block flex-1 overflow-hidden rounded-full bg-white/[0.07]" style={{ height: cq(1.7) }}>
                    <span className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${r.bar}%` }} />
                  </span>
                  <span className="num shrink-0 text-right font-semibold text-ink2" style={{ width: cq(7), fontSize: fs(2.8) }}>
                    {r.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Phone */}
        <div
          className="animate-float absolute overflow-hidden border-[#1c222c] bg-bg shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]"
          style={{ right: 0, top: 0, width: cq(33), aspectRatio: '9 / 17.5', borderWidth: cq(1.1), borderRadius: cq(6.2), transform: 'rotate(3deg)' }}
        >
          <div className="absolute left-1/2 -translate-x-1/2 rounded-full bg-[#1c222c]" style={{ top: cq(1.2), width: cq(9), height: cq(2.2) }} />
          <div className="flex h-full flex-col" style={{ padding: `${cq(6.5)} ${cq(3.2)} ${cq(3.2)}` }}>
            <div className="flex items-center" style={{ gap: cq(1.6) }}>
              <img src={markUrl} alt="" className="rounded-md" style={{ width: cq(4.2), height: cq(4.2) }} />
              <span className="font-semibold text-ink" style={{ fontSize: fs(2.8) }}>Spliteline</span>
            </div>
            <p className="text-muted" style={{ marginTop: cq(5), fontSize: fs(2.5) }}>You can claim</p>
            <p className="num text-gradient font-bold leading-none tracking-tight" style={{ marginTop: cq(1), fontSize: fs(4.8) }}>
              $1,240.00
            </p>
            <p className="text-subtle" style={{ marginTop: cq(1.4), fontSize: fs(2.2) }}>Across 2 splits</p>
            <div className="mt-auto rounded-full bg-brand text-center font-bold text-accent-ink shadow-brand" style={{ padding: `${cq(2.2)} 0`, fontSize: fs(3) }}>
              Claim
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-subtle">Example preview. Not real data.</figcaption>
    </figure>
  )
}
