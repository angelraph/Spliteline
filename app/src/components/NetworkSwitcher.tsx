import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'
import { useNetwork } from '@/hooks/useNetwork'

export function NetworkSwitcher({ className, block = false }: { className?: string; block?: boolean }) {
  const { network, networks, setNetworkKey } = useNetwork()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className={clsx('relative', block && 'w-full', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Network: ${network.label}. Change network`}
        className={clsx(
          'inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3.5 text-[13px] font-semibold text-ink2 transition hover:bg-white/[0.07]',
          block && 'w-full justify-between',
        )}
      >
        <span className="inline-flex items-center gap-2">
          <span className={clsx('size-2 rounded-full', network.isTestnet ? 'bg-warn' : 'bg-success')} aria-hidden />
          {network.label}
        </span>
        <ChevronDown className={clsx('size-3.5 text-muted transition', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Network"
          className={clsx('absolute right-0 z-50 mt-2 min-w-[14rem] overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-card', block && 'left-0 right-0')}
        >
          {networks.map((n) => (
            <li key={n.key} role="option" aria-selected={n.key === network.key}>
              <button
                type="button"
                onClick={() => {
                  setNetworkKey(n.key)
                  setOpen(false)
                }}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm font-semibold text-ink2 transition hover:bg-white/[0.06]"
              >
                <span className="inline-flex items-center gap-2">
                  <span className={clsx('size-2 rounded-full', n.isTestnet ? 'bg-warn' : 'bg-success')} aria-hidden />
                  {n.label}
                  {!n.address && <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Soon</span>}
                </span>
                {n.key === network.key && <Check className="size-4 text-accent" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
