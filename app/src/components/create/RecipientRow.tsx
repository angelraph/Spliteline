import type { ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import { TextInput } from '@/components/ui'

export interface RecipientDraft {
  key: string
  kind: 'address' | 'split'
  value: string
  percent: string
}

export interface ResolvedRow {
  /** Final address sent to the contract, when the row is valid. */
  address?: `0x${string}`
  bps?: number
  /** Error for the recipient field. */
  recipientError?: string
  /** Error for the percentage field. */
  percentError?: string
  /** Friendly confirmation shown under the field, e.g. "Split #2 · Studio". */
  resolved?: ReactNode
  loading?: boolean
}

interface Props {
  index: number
  draft: RecipientDraft
  info: ResolvedRow
  canRemove: boolean
  remainingBps: number
  onChange: (patch: Partial<RecipientDraft>) => void
  onRemove: () => void
}

const KIND_BUTTON = 'min-h-11 rounded-md px-3.5 text-xs font-semibold transition sm:min-h-8 sm:px-2.5'

export function RecipientRow({ index, draft, info, canRemove, remainingBps, onChange, onRemove }: Props) {
  const canFill = remainingBps > 0 && draft.percent.trim() === ''
  return (
    <div className="rounded-xl border border-line bg-white/[0.02] p-3 sm:p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Recipient {index + 1}</span>
        <div className="flex items-center gap-1">
          <div role="group" aria-label="Recipient type" className="flex rounded-lg bg-white/[0.06] p-0.5">
            <button
              type="button"
              onClick={() => onChange({ kind: 'address', value: '' })}
              aria-pressed={draft.kind === 'address'}
              className={clsx(KIND_BUTTON, draft.kind === 'address' ? 'bg-white/[0.14] text-ink' : 'text-muted hover:text-ink')}
            >
              Address
            </button>
            <button
              type="button"
              onClick={() => onChange({ kind: 'split', value: '' })}
              aria-pressed={draft.kind === 'split'}
              className={clsx(KIND_BUTTON, draft.kind === 'split' ? 'bg-white/[0.14] text-ink' : 'text-muted hover:text-ink')}
            >
              Split
            </button>
          </div>
          <button
            type="button"
            onClick={onRemove}
            disabled={!canRemove}
            aria-label={`Remove recipient ${index + 1}`}
            className="flex size-11 items-center justify-center rounded-lg text-muted sm:size-9 transition hover:bg-danger/15 hover:text-danger disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-[1fr_9.5rem]">
        <div className="min-w-0">
          <TextInput
            aria-label={draft.kind === 'split' ? `Split id for recipient ${index + 1}` : `Wallet address for recipient ${index + 1}`}
            placeholder={draft.kind === 'split' ? 'Split id, e.g. 1' : '0x… wallet address'}
            inputMode={draft.kind === 'split' ? 'numeric' : 'text'}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={draft.value}
            invalid={Boolean(info.recipientError)}
            onChange={(e) => onChange({ value: draft.kind === 'split' ? e.target.value.replace(/\D/g, '') : e.target.value })}
            className={draft.kind === 'address' ? 'mono sm:!text-[13px]' : undefined}
          />
          {info.recipientError ? (
            <p role="alert" className="mt-1.5 text-xs text-danger">{info.recipientError}</p>
          ) : info.loading ? (
            <p className="mt-1.5 text-xs text-muted">Looking up split…</p>
          ) : info.resolved ? (
            <div className="mt-1.5 text-xs text-muted">{info.resolved}</div>
          ) : null}
        </div>
        <div className="min-w-0">
          <div className="relative">
            <TextInput
              aria-label={`Percentage for recipient ${index + 1}`}
              placeholder="0.00"
              inputMode="decimal"
              value={draft.percent}
              invalid={Boolean(info.percentError)}
              onChange={(e) => {
                const v = e.target.value
                if (/^\d{0,3}(\.\d{0,2})?$/.test(v)) onChange({ percent: v })
              }}
              className="num pr-8 text-right"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>
          </div>
          {info.percentError ? (
            <p role="alert" className="mt-1.5 text-xs text-danger">{info.percentError}</p>
          ) : canFill ? (
            <button
              type="button"
              onClick={() => onChange({ percent: (remainingBps / 100).toFixed(2).replace(/\.?0+$/, '') })}
              className="mt-0.5 inline-flex min-h-11 items-center text-xs font-semibold text-accent hover:underline"
            >
              Fill remaining {(remainingBps / 100).toFixed(2)}%
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function Meter({ bps }: { bps: number }) {
  const exact = bps === 10000
  const over = bps > 10000
  const tone = exact ? 'bg-success' : over ? 'bg-danger' : 'bg-brand'
  const text = exact ? 'text-success' : over ? 'text-danger' : 'text-ink'
  const left = 10000 - bps
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={clsx('display num text-3xl font-semibold', text)}>{(bps / 100).toFixed(2)}%</span>
        <span className="text-xs text-muted" aria-live="polite">
          {exact ? 'Exactly 100.00%' : over ? `${((bps - 10000) / 100).toFixed(2)}% over` : `${(left / 100).toFixed(2)}% left to assign`}
        </span>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, bps / 100)} aria-label="Total assigned">
        <div className={clsx('h-full w-full origin-left rounded-full transition-transform duration-300', tone)} style={{ transform: `scaleX(${Math.min(1, bps / 10000)})` }} />
      </div>
    </div>
  )
}
