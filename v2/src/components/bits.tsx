import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { clsx } from 'clsx'
import markUrl from '@/assets/mark.png'
import { useNetwork } from '@/hooks/useNetwork'
import { explorerAddress, explorerTx } from '@/lib/networks'

export function shortAddress(address: string, head = 6, tail = 4) {
  return `${address.slice(0, head)}…${address.slice(-tail)}`
}

export function Brand({ className, textClassName }: { className?: string; textClassName?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <img src={markUrl} alt="" width={32} height={32} className="size-8 rounded-lg" />
      <span className={clsx('text-[18px] font-bold tracking-tight text-ink', textClassName)}>Spliteline</span>
    </span>
  )
}

export function CopyButton({ value, label = 'Copy', className, size = 'md' }: { value: string; label?: string; className?: string; size?: 'sm' | 'md' }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const area = document.createElement('textarea')
      area.value = value
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1600)
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={copied ? 'Copied' : label}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-white/[0.04] font-semibold text-ink transition hover:bg-white/[0.1] active:scale-[0.98]',
        size === 'md' ? 'min-h-11 px-4 text-[13px]' : 'min-h-11 px-3 text-xs sm:min-h-8 sm:px-2.5',
        className,
      )}
    >
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      {copied ? 'Copied' : label}
    </button>
  )
}

export function AddressLink({ address, className, head = 6, tail = 4 }: { address: string; className?: string; head?: number; tail?: number }) {
  const { network } = useNetwork()
  return (
    <a
      href={explorerAddress(network, address)}
      target="_blank"
      rel="noopener noreferrer"
      title={address}
      className={clsx('mono relative before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[""] inline-flex items-center gap-1 text-[13px] text-ink2 hover:text-accent', className)}
    >
      {shortAddress(address, head, tail)}
      <ExternalLink className="size-3 opacity-60" aria-hidden />
    </a>
  )
}

export function TxLink({ hash, label = 'View transaction' }: { hash: string; label?: string }) {
  const { network } = useNetwork()
  return (
    <a
      href={explorerTx(network, hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="relative before:absolute before:-inset-x-2 before:-inset-y-3.5 before:content-[''] inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
    >
      {label} <ExternalLink className="size-3" aria-hidden />
    </a>
  )
}

export function SplitLink({ id, name, asText = false }: { id: bigint | string; name?: string; asText?: boolean }) {
  const content = (
    <>
      Split #{id.toString()}
      {name && <span className="max-w-[10rem] truncate font-medium text-ink2">{name}</span>}
    </>
  )
  if (asText) {
    return <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-accent">{content}</span>
  }
  return (
    <Link to={`/s/${id}`} className="relative before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[''] inline-flex items-center gap-1.5 rounded-md bg-accent/15 px-1.5 py-1 text-[13px] font-semibold text-accent hover:bg-accent/25">
      {content}
    </Link>
  )
}

export function UsdcAmount({ value, className, big, plain }: { value: string; className?: string; big?: boolean; plain?: boolean }) {
  return (
    <span className={clsx('num whitespace-nowrap', className)}>
      <span className={clsx('font-semibold', plain ? 'text-gradient' : 'text-ink', big && 'display')}>{value}</span>
      <span className="ml-1 text-[0.8em] font-medium text-muted">USDC</span>
    </span>
  )
}
