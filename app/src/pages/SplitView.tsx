import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { stringToHex, pad, zeroHash } from "viem";
import { useAccount } from "wagmi";
import { useSplit, useUsdcAllowance, useApproveUsdc, usePayIntoSplit } from "../hooks/useSplitline";
import { useSplitFeed } from "../hooks/useSplitEvents";
import { formatUsdc, parseUsdc } from "../lib/usdc";
import { getFriendlyErrorMessage } from "../lib/errors";
import { SPLITLINE_ADDRESS } from "../abi/splitline";

function refToBytes32(ref: string): `0x${string}` {
  if (!ref) return zeroHash;
  const hex = stringToHex(ref.slice(0, 31));
  return pad(hex, { size: 32 });
}

export function SplitView() {
  const { id: idParam } = useParams();
  const id = idParam !== undefined ? BigInt(idParam) : undefined;
  const { address } = useAccount();

  const { split, isLoading, error, refetch } = useSplit(id);
  const { events, isLoading: feedLoading } = useSplitFeed(id);
  const { data: allowance, refetch: refetchAllowance } = useUsdcAllowance(address);
  const { approve, isPending: approving } = useApproveUsdc();
  const { pay, isPending: paying } = usePayIntoSplit();

  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const amountBase = useMemo(() => {
    try {
      return amount ? parseUsdc(amount) : 0n;
    } catch {
      return null;
    }
  }, [amount]);

  const needsApproval = amountBase !== null && amountBase > 0n && (allowance === undefined || allowance < amountBase);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  async function onApprove() {
    if (amountBase === null || amountBase <= 0n) return;
    setFormError(null);
    try {
      await approve(amountBase);
      await refetchAllowance();
    } catch (err) {
      setFormError(getFriendlyErrorMessage(err));
    }
  }

  async function onPay(e: React.FormEvent) {
    e.preventDefault();
    if (id === undefined || amountBase === null || amountBase <= 0n) return;
    setFormError(null);
    try {
      await pay(id, amountBase, refToBytes32(ref));
      setAmount("");
      setRef("");
      await Promise.all([refetch(), refetchAllowance()]);
    } catch (err) {
      setFormError(getFriendlyErrorMessage(err));
    }
  }

  if (id === undefined) return <p className="page">Invalid split id.</p>;
  if (!SPLITLINE_ADDRESS) {
    return (
      <p className="page empty-state">
        No Splitline contract is configured yet. Set VITE_SPLITLINE_ADDRESS after deploying.
      </p>
    );
  }
  if (isLoading) return <p className="page">Loading split…</p>;
  if (error || !split) return <p className="page">Split #{id.toString()} not found.</p>;

  return (
    <div className="page page-split">
      <div className="split-header">
        <h1>{split.name}</h1>
        <span className="split-id">Split #{id.toString()}</span>
      </div>

      <section className="split-totals">
        <div>
          <span className="label">Total received</span>
          <span className="value">${formatUsdc(split.totalReceived)}</span>
        </div>
        <div>
          <span className="label">Total claimed</span>
          <span className="value">${formatUsdc(split.totalReleased)}</span>
        </div>
      </section>

      <section className="recipients-table">
        <h2>Recipients</h2>
        {split.recipients.map((r, i) => (
          <div className="recipient-line" key={r}>
            <span className="addr">{r}</span>
            <span className="share">{(split.bps[i] / 100).toFixed(2)}%</span>
          </div>
        ))}
      </section>

      <section className="pay-panel">
        <h2>Pay into this split</h2>
        <form onSubmit={onPay} className="pay-form">
          <label className="field">
            <span>Amount (USDC)</span>
            <input
              type="number"
              min="0"
              step="0.000001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <label className="field">
            <span>Reference (optional)</span>
            <input
              type="text"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="Invoice #1234"
              maxLength={31}
            />
          </label>

          {formError && <p className="form-error">{formError}</p>}

          {needsApproval ? (
            <button type="button" className="btn btn-primary" onClick={onApprove} disabled={approving}>
              {approving ? "Approving…" : "1. Approve USDC"}
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={paying || !amountBase || amountBase <= 0n}>
              {paying ? "Paying…" : "2. Pay"}
            </button>
          )}
        </form>
      </section>

      <section className="qr-panel">
        <h2>Share this split</h2>
        {shareUrl && <QRCodeSVG value={shareUrl} size={140} />}
        <code className="share-link">{shareUrl}</code>
      </section>

      <section className="live-feed">
        <h2>Live activity</h2>
        {feedLoading && <p>Loading activity…</p>}
        {!feedLoading && events.length === 0 && <p className="empty-state">No activity yet.</p>}
        <ul>
          {events.map((e) => (
            <li key={e.transactionHash + e.kind} className={`feed-item feed-${e.kind}`}>
              {e.kind === "paid" ? (
                <span>
                  <strong>${formatUsdc(e.amount)}</strong> paid by {e.payer.slice(0, 6)}…{e.payer.slice(-4)}
                </span>
              ) : (
                <span>
                  <strong>${formatUsdc(e.amount)}</strong> claimed by {e.recipient.slice(0, 6)}…{e.recipient.slice(-4)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
