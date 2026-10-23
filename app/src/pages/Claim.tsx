import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { useSplitsForRecipient } from "../hooks/useSplitEvents";
import { useOwed, useClaim } from "../hooks/useSplitline";
import { formatUsdc } from "../lib/usdc";
import { getFriendlyErrorMessage } from "../lib/errors";
import { useState } from "react";

function ClaimRow({ id, name }: { id: bigint; name: string }) {
  const { address } = useAccount();
  const { data: owed, refetch } = useOwed(id, address);
  const { claim, isPending } = useClaim();
  const [error, setError] = useState<string | null>(null);

  async function onClaim() {
    setError(null);
    try {
      await claim(id);
      await refetch();
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    }
  }

  const hasOwed = owed !== undefined && owed > 0n;

  return (
    <div className="claim-row">
      <div className="claim-info">
        <Link to={`/s/${id.toString()}`}>{name || `Split #${id.toString()}`}</Link>
        <span className="owed-amount">{owed !== undefined ? `$${formatUsdc(owed)} owed` : "Loading…"}</span>
      </div>
      <button type="button" className="btn btn-primary" onClick={onClaim} disabled={!hasOwed || isPending}>
        {isPending ? "Claiming…" : hasOwed ? "Claim" : "Nothing to claim"}
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

export function Claim() {
  const { address, isConnected } = useAccount();
  const { splits, isLoading } = useSplitsForRecipient(address);

  if (!isConnected) {
    return (
      <div className="page">
        <h1>Your claims</h1>
        <p className="empty-state">Connect a wallet to see splits you're a recipient of.</p>
      </div>
    );
  }

  return (
    <div className="page page-claim">
      <h1>Your claims</h1>
      {isLoading && <p>Scanning splits…</p>}
      {!isLoading && splits.length === 0 && (
        <p className="empty-state">You're not a recipient of any split yet.</p>
      )}
      <div className="claim-list">
        {splits.map((s) => (
          <ClaimRow key={s.id.toString()} id={s.id} name={s.name} />
        ))}
      </div>
    </div>
  );
}
