import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize = 'md' | 'sm' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  full?: boolean
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-accent-ink shadow-brand hover:brightness-110 disabled:shadow-none',
  secondary: 'bg-white/[0.04] text-ink border border-line hover:bg-white/[0.08] hover:border-white/20',
  ghost: 'text-ink2 hover:text-ink hover:bg-white/[0.06]',
}
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-4 text-[13px] rounded-full gap-1.5 sm:min-h-9 sm:px-3.5',
  md: 'min-h-11 px-5 text-sm rounded-full gap-2',
  lg: 'min-h-12 px-7 text-[15px] rounded-full gap-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, full, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        full && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
})

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={clsx('rounded-2xl border border-line bg-surface/90 shadow-card', className)}>
      {children}
    </section>
  )
}

export function CardHeader({ title, aside, hint }: { title: ReactNode; aside?: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink sm:text-lg">{title}</h2>
        {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
      </div>
      {aside}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={clsx('relative overflow-hidden rounded-md bg-white/[0.06]', className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('size-4 animate-spin', className)} aria-label="Loading" />
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'success' | 'warn' }) {
  const tones = {
    neutral: 'bg-white/[0.07] text-ink2',
    accent: 'bg-accent/15 text-accent',
    success: 'bg-success/15 text-success',
    warn: 'bg-warn/15 text-warn',
  }
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide', tones[tone])}>
      {children}
    </span>
  )
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-white/[0.06] text-muted">{icon}</div>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ title = 'Could not load this', body, onRetry, compact = false }: { title?: string; body?: string; onRetry?: () => void; compact?: boolean }) {
  return (
    <div role="alert" className={clsx('flex flex-col items-center px-6 text-center', compact ? 'py-6' : 'py-10')}>
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-danger/15 text-danger">
        <AlertTriangle className="size-5" />
      </div>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="size-3.5" /> Try again
        </Button>
      )}
    </div>
  )
}

export function Notice({
  tone = 'info',
  children,
  action,
}: {
  tone?: 'info' | 'success' | 'warn' | 'danger'
  children: ReactNode
  action?: ReactNode
}) {
  const tones = {
    info: ['border-accent/25 bg-accent/10 text-ink2', <Info key="i" className="size-4 shrink-0 text-accent" />],
    success: ['border-success/25 bg-success/10 text-ink2', <CheckCircle2 key="s" className="size-4 shrink-0 text-success" />],
    warn: ['border-warn/25 bg-warn/10 text-ink2', <AlertTriangle key="w" className="size-4 shrink-0 text-warn" />],
    danger: ['border-danger/25 bg-danger/10 text-ink2', <AlertTriangle key="d" className="size-4 shrink-0 text-danger" />],
  } as const
  const [cls, icon] = tones[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={clsx('flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed', cls)}>
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  )
}

export function Label({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
      <span>{children}</span>
      {hint && <span className="text-[11px] font-medium normal-case tracking-normal text-subtle">{hint}</span>}
    </label>
  )
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function TextInput({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={clsx(
          'min-h-11 w-full rounded-xl border bg-white/[0.03] px-3.5 text-base text-ink outline-none transition focus:border-accent/60 focus:bg-white/[0.05] sm:text-[15px]',
          invalid ? 'border-danger/60' : 'border-line',
          className,
        )}
        {...rest}
      />
    )
  },
)

export function Stat({ label, value, loading, gradient }: { label: string; value: ReactNode; loading?: boolean; gradient?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      {loading ? <Skeleton className="mt-2 h-8 w-28" /> : <p className={clsx('display num mt-1 truncate text-2xl font-bold sm:text-3xl', gradient ? 'text-gradient' : 'text-ink')}>{value}</p>}
    </div>
  )
}
