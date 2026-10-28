import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { useSwitchChain } from 'wagmi'
import { AlertTriangle, ChevronDown, Menu, Wallet, X } from 'lucide-react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { Brand, AddressLink, shortAddress } from '@/components/bits'
import { NetworkSwitcher } from '@/components/NetworkSwitcher'
import { Button } from '@/components/ui'
import { useNetwork, useWalletStatus } from '@/hooks/useNetwork'
import { useIndexer } from '@/hooks/useIndexer'
import { explainError } from '@/lib/errors'
import { getChain } from '@/onchain-facts'

const NAV = [
  { to: '/docs', label: 'Docs' },
  { to: '/faq', label: 'FAQ' },
  { to: '/claim', label: 'Claim' },
  { to: '/proof', label: 'Proof' },
]

function ConnectPill({ full = false }: { full?: boolean }) {
  return (
    <ConnectKitButton.Custom>
      {({ isConnected, isConnecting, show, address }) =>
        isConnected && address ? (
          <button
            type="button"
            onClick={show}
            className={clsx(
              'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-white/[0.03] px-4 text-[13px] font-semibold text-ink transition hover:bg-white/[0.08]',
              full && 'w-full',
            )}
          >
            <span className="size-2 rounded-full bg-success" aria-hidden />
            <span className="mono">{shortAddress(address, 5, 4)}</span>
            <ChevronDown className="size-3.5 text-muted" aria-hidden />
          </button>
        ) : (
          <Button variant="secondary" size="sm" full={full} onClick={show} loading={isConnecting}>
            <Wallet className="size-4" /> Connect<span className="hidden lg:inline"> Wallet</span>
          </Button>
        )
      }
    </ConnectKitButton.Custom>
  )
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium transition',
    isActive ? 'bg-white/[0.07] text-ink' : 'text-muted hover:text-ink',
  )

function Banners() {
  const { network, wrongNetwork, walletChainId } = useWalletStatus()
  const { switchChain, isPending } = useSwitchChain()
  const indexer = useIndexer()

  return (
    <div>
      {network.address && !network.isTestnet && (
        <div role="status" className="bg-warn/10 px-4 py-2.5 text-center text-[13px] leading-snug text-ink2">
          You are on Arc mainnet. Transactions move real USDC and cannot be undone. Not audited. Use small amounts.
        </div>
      )}
      {wrongNetwork && (
        <div role="alert" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 bg-danger/15 px-4 py-2.5 text-center text-[13px] leading-snug text-ink2">
          <span className="inline-flex items-center gap-2 text-left">
            <AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden />
            Your wallet is on {walletChainId ? (getChain(walletChainId)?.name ?? `network ${walletChainId}`) : 'another network'}. Spliteline is set to {network.label}.
          </span>
          <Button
            size="sm"
            loading={isPending}
            onClick={() => switchChain({ chainId: network.chainId }, { onError: (e) => toast.error(explainError(e).message) })}
          >
            Switch to {network.label}
          </Button>
        </div>
      )}
      {indexer.configured && indexer.status === 'error' && (
        <div role="status" className="bg-warn/10 px-4 py-2 text-center text-xs text-ink2">
          Having trouble reading the latest activity. Retrying automatically.
        </div>
      )}
    </div>
  )
}

function Header() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link to="/" aria-label="Spliteline home" className="flex min-h-11 shrink-0 items-center" onClick={close}>
          <Brand />
        </Link>
        <nav className="ml-4 hidden items-center gap-0.5 md:flex" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={navClass}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <NetworkSwitcher className="hidden md:block" />
          <ConnectPill />
          <Link to="/create" className="hidden md:block">
            <Button size="sm">Create a split</Button>
          </Link>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="flex size-11 items-center justify-center rounded-full border border-line bg-white/[0.03] text-ink transition hover:bg-white/[0.08] md:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-menu" className="border-t border-line bg-bg/95 px-4 pb-5 pt-3 md:hidden">
          <nav className="flex flex-col" aria-label="Mobile">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                onClick={close}
                className={({ isActive }) =>
                  clsx(
                    'flex min-h-12 items-center border-b border-line/60 text-base font-medium',
                    isActive ? 'text-ink' : 'text-ink2',
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-4 space-y-3">
            <NetworkSwitcher block />
            <Link to="/create" onClick={close} className="block">
              <Button full size="lg">Create a split</Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}

function FooterColumn({ title, links }: { title: string; links: Array<{ label: string; to?: string; href?: string }> }) {
  const linkClass = 'inline-flex min-h-11 min-w-11 items-center text-sm text-muted transition hover:text-ink md:min-h-9'
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-subtle">{title}</h3>
      <ul className="mt-2">
        {links.map((l) => (
          <li key={l.label}>
            {l.to ? (
              <Link to={l.to} className={linkClass}>{l.label}</Link>
            ) : (
              <a href={l.href} target="_blank" rel="noopener noreferrer" className={linkClass}>{l.label}</a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Footer() {
  const { network } = useNetwork()
  return (
    <footer className="border-t border-line px-4 pb-24 pt-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="col-span-2 md:col-span-1">
            <Brand />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              Immutable, pull-based USDC revenue splits on Arc. No owner, no admin, no fee, no upgrade path. Ever.
            </p>
            {network.address && (
              <p className="mt-4 flex items-center gap-2 text-xs text-muted">
                Contract <AddressLink address={network.address} />
              </p>
            )}
          </div>
          <FooterColumn
            title="Product"
            links={[
              { label: 'Create a split', to: '/create' },
              { label: 'Claim', to: '/claim' },
              { label: 'Proof', to: '/proof' },
            ]}
          />
          <FooterColumn
            title="Resources"
            links={[
              { label: 'Docs', to: '/docs' },
              { label: 'FAQ', to: '/faq' },
              { label: 'GitHub', href: 'https://github.com/angelraph/Spliteline' },
            ]}
          />
          <FooterColumn
            title="Network"
            links={[
              { label: 'Arc docs', href: 'https://docs.arc.io' },
              { label: 'Arc explorer', href: 'https://explorer.arc.io' },
              { label: 'Arc Microgrants', href: 'https://dorahacks.io/hackathon/arc-microgrants-2/detail' },
            ]}
          />
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>Spliteline. Built with Arc Studio.</p>
          <p>Not audited. Use small amounts.</p>
        </div>
      </div>
    </footer>
  )
}

export function Layout() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <Banners />
      <main className={clsx('w-full flex-1', pathname !== '/' && 'mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12')}>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
