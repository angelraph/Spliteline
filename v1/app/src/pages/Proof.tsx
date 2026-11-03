import proofTransactions from "../data/proof-transactions.json";

const EXPLORER_BASE = "https://explorer.arc.io/tx/";

export function Proof() {
  const hasAny = proofTransactions.some((tx) => tx.hash);

  return (
    <div className="page page-proof">
      <h1>Proof journey</h1>
      <p className="subtitle">
        Every mainnet transaction in this project's build-and-deploy journey, with links to Arc's explorer. Filled
        in by hand after the real deploy — see the README's deployment &amp; proof runbook.
      </p>

      {!hasAny && (
        <p className="empty-state">
          No mainnet transactions recorded yet. This page will populate once <code>src/data/proof-transactions.json</code>{" "}
          is filled in after deployment.
        </p>
      )}

      <ol className="proof-list">
        {proofTransactions.map((tx, i) => (
          <li key={i} className={tx.hash ? "proof-item done" : "proof-item pending"}>
            <span className="proof-label">{tx.label}</span>
            {tx.hash ? (
              <a href={`${EXPLORER_BASE}${tx.hash}`} target="_blank" rel="noreferrer" className="proof-link">
                {tx.hash.slice(0, 10)}…{tx.hash.slice(-8)} ↗
              </a>
            ) : (
              <span className="proof-pending">pending</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
