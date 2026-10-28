import { useState } from 'react'
import { Code2, Link2 } from 'lucide-react'
import { CopyButton } from '@/components/bits'
import { Card, Label, TextInput } from '@/components/ui'
import { embedPath, publicUrl, splitPath } from '@/lib/links'
import { useNetwork } from '@/hooks/useNetwork'
import { encodeRef } from '@/lib/ref'
import { parseUsdcInput } from '@/lib/usdc'

export function ShareTools({ splitId }: { splitId: bigint }) {
  const [amount, setAmount] = useState('')
  const [ref, setRef] = useState('')
  const { network } = useNetwork()

  const amountValid = amount.trim() === '' || (parseUsdcInput(amount) ?? 0n) > 0n
  const refValid = encodeRef(ref).ok

  const link = publicUrl(
    splitPath(splitId, network, {
      amount: amount.trim() && amountValid ? amount.trim() : undefined,
      ref: ref.trim() && refValid ? ref.trim() : undefined,
    }),
  )
  const embedSrc = publicUrl(embedPath(splitId, network))

  const snippet = `<iframe src="${embedSrc}" title="Pay Spliteline split #${splitId}" width="100%" style="max-width:420px;border:0;border-radius:16px" height="560" loading="lazy"></iframe>`

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Link2 className="size-4 text-accent" />
        <h2 className="text-base font-semibold sm:text-lg">Share a payment link</h2>
      </div>
      <p className="mt-0.5 text-[13px] text-muted">Pre-fill the amount and a reference so payers only have to confirm.</p>

      <div className="mt-4 grid gap-3 min-[420px]:grid-cols-2">
        <div>
          <Label htmlFor="share-amount">Amount (optional)</Label>
          <TextInput
            id="share-amount"
            inputMode="decimal"
            placeholder="25.00"
            value={amount}
            invalid={!amountValid}
            onChange={(e) => /^\d*\.?\d{0,6}$/.test(e.target.value) && setAmount(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="share-ref">Reference (optional)</Label>
          <TextInput id="share-ref" placeholder="invoice-1042" value={ref} invalid={!refValid} onChange={(e) => setRef(e.target.value)} />
        </div>
      </div>
      {!refValid && <p role="alert" className="mt-1.5 text-xs text-danger">Keep the reference to 32 bytes or fewer.</p>}

      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <p className="mono break-all text-xs leading-relaxed text-ink2">{link}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton value={link} label="Copy link" />
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center rounded-lg px-3 text-[13px] font-semibold text-accent hover:underline"
          >
            Open in new tab
          </a>
        )}
      </div>

      <div className="mt-6 border-t border-white/[0.06] pt-5">
        <div className="flex items-center gap-2">
          <Code2 className="size-4 text-accent" />
          <h3 className="text-sm font-semibold">Embed a pay button</h3>
        </div>
        <p className="mt-0.5 text-[13px] text-muted">Paste this on any site to take payments into this split.</p>
        <pre className="mono mt-3 max-h-36 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] leading-relaxed text-ink2">
          {snippet}
        </pre>
        <div className="mt-3">
          <CopyButton value={snippet} label="Copy embed code" />
        </div>
      </div>
    </Card>
  )
}
