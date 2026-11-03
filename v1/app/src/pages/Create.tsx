import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { decodeEventLog, isAddress } from "viem";
import { usePublicClient, useAccount } from "wagmi";
import { BpsMeter } from "../components/BpsMeter";
import { useCreateSplit } from "../hooks/useSplitline";
import { getFriendlyErrorMessage } from "../lib/errors";
import { SPLITLINE_ABI, SPLITLINE_ADDRESS } from "../abi/splitline";

type RecipientRow = { address: string; percent: string };

const emptyRow = (): RecipientRow => ({ address: "", percent: "" });

export function Create() {
  const navigate = useNavigate();
  const publicClient = usePublicClient();
  const { isConnected } = useAccount();
  const { createSplit, isPending } = useCreateSplit();

  const [name, setName] = useState("");
  const [rows, setRows] = useState<RecipientRow[]>([emptyRow(), emptyRow()]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "confirming" | "done">("idle");

  const bpsSum = rows.reduce((sum, row) => {
    const n = Number(row.percent);
    return sum + (Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0);
  }, 0);

  const addressErrors = rows.map((row) => (row.address && !isAddress(row.address) ? "Invalid address" : null));
  const hasValidRows = rows.every((row) => row.address && isAddress(row.address) && Number(row.percent) > 0);
  const canSubmit =
    isConnected && name.trim().length > 0 && rows.length >= 1 && rows.length <= 20 && hasValidRows && bpsSum === 10_000;

  function updateRow(index: number, patch: Partial<RecipientRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    if (rows.length >= 20) return;
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(index: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !publicClient || !SPLITLINE_ADDRESS) return;
    const splitlineAddress = SPLITLINE_ADDRESS;
    setSubmitError(null);
    setStatus("confirming");

    try {
      const recipients = rows.map((r) => r.address as `0x${string}`);
      const bps = rows.map((r) => Math.round(Number(r.percent) * 100));
      const hash = await createSplit(name.trim(), recipients, bps);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      const createdLog = receipt.logs.find((log) => log.address.toLowerCase() === splitlineAddress.toLowerCase());
      let id: bigint | null = null;
      if (createdLog) {
        try {
          const decoded = decodeEventLog({ abi: SPLITLINE_ABI, data: createdLog.data, topics: createdLog.topics });
          if (decoded.eventName === "SplitCreated") id = decoded.args.id;
        } catch {
          // fall through — if decoding fails for any reason, send the user to /claim instead
        }
      }

      setStatus("done");
      navigate(id !== null ? `/s/${id.toString()}` : "/claim");
    } catch (err) {
      setSubmitError(getFriendlyErrorMessage(err));
      setStatus("idle");
    }
  }

  return (
    <div className="page page-create">
      <h1>Create a split</h1>
      <p className="subtitle">
        Recipients and shares are locked in forever once you create this split — there's no owner, admin, or way to
        edit it afterward.
      </p>

      <form onSubmit={onSubmit} className="create-form">
        <label className="field">
          <span>Split name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Core team revenue"
            maxLength={64}
          />
        </label>

        <div className="recipients">
          <div className="recipients-header">
            <span>Recipient address</span>
            <span>Share %</span>
          </div>
          {rows.map((row, i) => (
            <div className="recipient-row" key={i}>
              <input
                type="text"
                value={row.address}
                onChange={(e) => updateRow(i, { address: e.target.value })}
                placeholder="0x..."
                className={addressErrors[i] ? "invalid" : ""}
              />
              <input
                type="number"
                value={row.percent}
                onChange={(e) => updateRow(i, { percent: e.target.value })}
                placeholder="0"
                min="0"
                max="100"
                step="0.01"
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => removeRow(i)}
                disabled={rows.length <= 1}
                aria-label="Remove recipient"
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost" onClick={addRow} disabled={rows.length >= 20}>
            + Add recipient ({rows.length}/20)
          </button>
        </div>

        <BpsMeter sum={bpsSum} />

        {submitError && <p className="form-error">{submitError}</p>}
        {!isConnected && <p className="form-hint">Connect a wallet to create a split.</p>}

        <button type="submit" className="btn btn-primary btn-lg" disabled={!canSubmit || isPending}>
          {status === "confirming" || isPending ? "Confirm in wallet…" : "Create split"}
        </button>
      </form>
    </div>
  );
}
