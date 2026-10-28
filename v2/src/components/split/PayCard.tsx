import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { erc20Abi } from 'viem'
import { useAccount, useReadContracts } from 'wagmi'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { TxLink } from '@/components/bits'
import { Button, Card, Label, Notice, TextInput } from '@/components/ui'
import { useNetwork } from '@/hooks/useNetwork'
import { usePay, type PayPhase } from '@/hooks/usePay'
import { encodeRef } from '@/lib/ref'
import { formatUsdc, parseUsdcInput } from '@/lib/usdc'

const QUICK = ['1', '5', '10', '25']

const PHASE_COPY: Partial<Record<PayPhase, string>> = {
  signing: 'Sign the payment in your wallet…',
  'approve-wallet': 'Step 1 of 2: approve USDC in your wallet…',
  'approve-confirming': 'Step 1 of 2: confirming approval…',
  'pay-wallet': 'Confirm the payment in your wallet…',
  'pay-confirming': 'Confirming payment on Arc…',
}

export function PayCard({
  splitId,
  initialAmount = '',
  initialRef = '',
  compact = false,
}: {
  splitId: bigint
  initialAmount?: string
  initialRef?: string
  compact?: boolean
}) {
  const { network } = useNetwork()
  const { address: account } = useAccount()
  const payment = usePay()
  const [amount, setAmount] = useState(initialAmount)
  const [ref, setRef] = useState(initialRef)
  const [showRef, setShowRef] = useState(Boolean(initialRef))

  const reads = useReadContracts({
    contracts:
      account && network.address
        ? [
            { address: network.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [account], chainId: network.chainId },
            { address: network.usdc, abi: erc20Abi, functionName: 'allowance', args: [account, network.address], chainId: network.chainId },
          ]
        : [],
    query: { enabled: Boolean(account && network.address), refetchInterval: 10_000 },
  })
  const balance = reads.data?.[0]?.status === 'success' ? (reads.data[0].result) : undefined
  const allowance = reads.data?.[1]?.status === 'success' ? (reads.data[1].result) : undefined

  const parsed = amount.trim() === '' ? null : parseUsdcInput(amount)
  const refResult = encodeRef(ref)
  const amountError =
    amount.trim() !== '' && parsed === null
      ? 'Enter a valid amount with up to 6 decimals.'
      : parsed === 0n
        ? 'Amount must be above 0.'
        : parsed !== null && balance !== undefined && parsed > balance
          ? `Your balance is ${formatUsdc(balance)} USDC.`
          : undefined
  const canPay = Boolean(parsed && parsed > 0n && !amountError && refResult.ok && network.address)
  const { state } = payment
  const success = state.phase === 'success'

  const submit = (forceApprove = false) => {
    if (!parsed || !refResult.ok) return
    void payment.pay({ id: splitId, amount: parsed, ref: refResult.value, forceApprove })
  }

  const hint =
    parsed && allowance !== undefined && allowance >= parsed
      ? 'You already approved enough USDC, so this is a single transaction.'
      : 'One transaction with a signature. If your wallet cannot sign, we switch to approve then pay.'

  return (
    <Card className={clsx(compact && 'border-0 bg-transparent shadow-none')}>
      <div className={clsx('p-5 sm:p-6', compact && 'p-0')}>
        {!compact && <h2 className="text-base font-semibold sm:text-lg">Pay this split</h2>}
        {!compact && <p className="mt-0.5 text-[13px] text-muted">Your payment is divided between the recipients automatically.</p>}

        {success ? (
          <div className="mt-5 rounded-xl border border-success/25 bg-success/10 p-4">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="size-5" />
              <p className="font-semibold">Payment sent</p>
            </div>
            <p className="mt-1.5 text-sm text-ink2">
              {parsed ? `${formatUsdc(parsed)} USDC` : 'Your payment'} was added to Split #{splitId.toString()}.
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              {state.hash && <TxLink hash={state.hash} />}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  payment.reset()
                  setAmount('')
                }}
              >
                Pay again
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div>
              <Label htmlFor={`amount-${splitId}`} hint={balance !== undefined ? `Balance ${formatUsdc(balance)} USDC` : undefined}>
                Amount
              </Label>
              <div className={clsx('rounded-xl border bg-white/[0.03] px-4 pb-3 pt-2.5', amountError ? 'border-danger/60' : 'border-line focus-within:border-accent/60')}>
                <div className="flex items-baseline gap-2">
                  <input
                    id={`amount-${splitId}`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    value={amount}
                    disabled={payment.busy}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) {
                        setAmount(v)
                        if (state.phase === 'error') payment.reset()
                      }
                    }}
                    className="display num w-full min-w-0 bg-transparent text-[34px] font-semibold sm:text-4xl text-ink outline-none placeholder:text-subtle"
                  />
                  <span className="text-sm font-semibold text-muted">USDC</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {QUICK.map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={payment.busy}
                      onClick={() => setAmount(q)}
                      className="min-h-11 min-w-11 rounded-full bg-white/[0.06] px-4 text-sm font-semibold text-ink2 transition hover:bg-white/[0.12] disabled:opacity-40 sm:min-h-9 sm:text-xs"
                    >
                      {q}
                    </button>
                  ))}
                  {balance !== undefined && balance > 0n && (
                    <button
                      type="button"
                      disabled={payment.busy}
                      onClick={() => setAmount(formatUsdc(balance, 0).replace(/,/g, ''))}
                      className="min-h-11 rounded-full px-3 text-sm font-semibold text-accent hover:underline disabled:opacity-40 sm:min-h-9 sm:text-xs"
                    >
                      Max
                    </button>
                  )}
                </div>
              </div>
              {amountError && <p role="alert" className="mt-1.5 text-xs text-danger">{amountError}</p>}
            </div>

            <div>
              {showRef ? (
                <>
                  <Label htmlFor={`ref-${splitId}`} hint="Optional, up to 32 bytes">Reference</Label>
                  <TextInput
                    id={`ref-${splitId}`}
                    placeholder="e.g. invoice-1042"
                    value={ref}
                    disabled={payment.busy}
                    invalid={!refResult.ok}
                    onChange={(e) => setRef(e.target.value)}
                    autoComplete="off"
                  />
                  {!refResult.ok && <p role="alert" className="mt-1.5 text-xs text-danger">{refResult.message}</p>}
                </>
              ) : (
                <button type="button" onClick={() => setShowRef(true)} className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent hover:underline">
                  Add a reference
                </button>
              )}
            </div>

            {state.phase === 'error' && state.error && (
              <Notice tone={state.rejected ? 'info' : 'danger'}>
                {state.error}
                {state.canUseApprove && (
                  <button type="button" onClick={() => submit(true)} className="mt-2 block min-h-11 py-2 font-semibold text-accent hover:underline">
                    Approve and pay in two steps
                  </button>
                )}
              </Notice>
            )}

            {!account ? (
              <ConnectKitButton.Custom>
                {({ show }) => (
                  <Button size="lg" full onClick={show}>Connect wallet to pay</Button>
                )}
              </ConnectKitButton.Custom>
            ) : (
              <Button size="lg" full onClick={() => submit(false)} disabled={!canPay || payment.busy}>
                {payment.busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> {PHASE_COPY[state.phase] ?? 'Working…'}
                  </>
                ) : parsed && parsed > 0n && !amountError ? (
                  `Pay ${formatUsdc(parsed)} USDC`
                ) : (
                  'Enter an amount'
                )}
              </Button>
            )}
            {account && !payment.busy && <p className="text-center text-xs text-muted">{hint}</p>}
            {payment.busy && state.hash && (
              <p className="text-center">
                <TxLink hash={state.hash} label="Track on the explorer" />
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
