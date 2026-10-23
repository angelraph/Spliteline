const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "how-it-works", label: "How splits work" },
  { id: "contract", label: "Contract reference" },
  { id: "arc", label: "Arc-specific details" },
  { id: "security", label: "Security & limits" },
  { id: "integrate", label: "Integrating" },
];

export function Docs() {
  return (
    <div className="docs-layout">
      <nav className="docs-toc">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`}>
            {s.label}
          </a>
        ))}
      </nav>

      <div className="docs-content">
        <h1>Docs</h1>
        <p className="lead">
          Splitline is an immutable, pull-based USDC revenue-split contract on Arc. This page
          covers how it works, its exact contract surface, and the Arc-specific details that
          shaped its design.
        </p>

        <section id="overview" className="docs-section">
          <h2>Overview</h2>
          <p>
            A <strong>split</strong> is created once with a name, a list of up to 20 recipient
            addresses, and a basis-point share for each one summing to exactly 10,000 (100.00%).
            Once created, a split can never be edited — there is no owner, no admin function, no
            fee, and no upgrade path anywhere in the contract.
          </p>
          <p>
            Anyone can pay USDC into a split by its id. Each recipient can claim their exact
            proportional share of everything the split has ever received, at any time. Anyone —
            not just the recipient — can also push a payout to a fixed recipient via{" "}
            <code>release</code>.
          </p>
        </section>

        <section id="how-it-works" className="docs-section">
          <h2>How splits work</h2>
          <h3>Cumulative accounting</h3>
          <p>
            Splitline never tracks "this payment goes to that recipient." Instead, every payment
            adds to a split's <code>totalReceived</code>, and each recipient's owed amount is
            computed fresh, every time, as:
          </p>
          <pre className="code-panel">
            <code>owed = totalReceived * bps / 10000 - released</code>
          </pre>
          <p>
            This is what makes the contract safe against reordering, partial payments, and
            repeated claims — a recipient's entitlement only ever depends on the split's running
            total and what they've already claimed, never on which specific payment they're
            "owed from."
          </p>
          <h3>Pull, with a push escape hatch</h3>
          <p>
            <code>claim</code> and <code>claimTo</code> are pull-based: a recipient (or no one)
            decides when to collect. <code>release</code> is the push variant — anyone can call it
            to pay a recipient their due share, useful for automation or for recipients who can't
            call the contract themselves. Because every recipient's accounting is fully
            independent, one recipient reverting (for example, a blocklisted address) can never
            block another recipient's claim or release.
          </p>
        </section>

        <section id="contract" className="docs-section">
          <h2>Contract reference</h2>
          <p>
            Full source:{" "}
            <a
              href="https://github.com/angelraph/Spliteline/blob/main/contracts/src/Splitline.sol"
              target="_blank"
              rel="noreferrer"
            >
              contracts/src/Splitline.sol
            </a>
            .
          </p>
          <table className="docs-table">
            <thead>
              <tr>
                <th>Function</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>createSplit(name, recipients[], bps[])</code>
                </td>
                <td>Creates an immutable split. Returns its id.</td>
              </tr>
              <tr>
                <td>
                  <code>pay(id, amount, ref)</code>
                </td>
                <td>Pays USDC into a split. Caller must approve first.</td>
              </tr>
              <tr>
                <td>
                  <code>owed(id, recipient)</code>
                </td>
                <td>View: the amount a recipient can currently claim.</td>
              </tr>
              <tr>
                <td>
                  <code>claim(id)</code>
                </td>
                <td>Claims the caller's owed share to their own address.</td>
              </tr>
              <tr>
                <td>
                  <code>claimTo(id, to)</code>
                </td>
                <td>Claims the caller's owed share to any address.</td>
              </tr>
              <tr>
                <td>
                  <code>release(id, recipient)</code>
                </td>
                <td>Anyone can push a recipient's owed share to them.</td>
              </tr>
              <tr>
                <td>
                  <code>getSplit(id)</code>
                </td>
                <td>View: name, recipients, shares, and running totals.</td>
              </tr>
            </tbody>
          </table>
          <h3>Events</h3>
          <p>
            Splitline keeps no off-chain database — the app reads everything from{" "}
            <code>SplitCreated</code>, <code>Paid</code>, and <code>Claimed</code> events.
          </p>
        </section>

        <section id="arc" className="docs-section">
          <h2>Arc-specific details</h2>
          <p>
            USDC is Arc's native gas token, with two interfaces sharing one underlying balance: a
            native 18-decimal interface (used for gas) and an ERC-20 interface at the fixed
            address <code>0x3600000000000000000000000000000000000000</code> (6 decimals), used
            for <code>transferFrom</code>/<code>approve</code>/<code>allowance</code>. Splitline
            only ever touches the ERC-20 interface — it is not payable and never accepts native
            value.
          </p>
          <p>
            That address is hardcoded as a constant rather than a constructor parameter: it's
            fixed network-wide on Arc, so making it configurable would only add a one-shot
            footgun to an otherwise admin-less, immutable contract.
          </p>
        </section>

        <section id="security" className="docs-section">
          <h2>Security & limits</h2>
          <ul>
            <li>Uses OpenZeppelin's SafeERC20 and ReentrancyGuard on every value-moving call.</li>
            <li>Checks-effects-interactions throughout: state updates before external calls.</li>
            <li>Rejects zero addresses, duplicate recipients, the contract's own address, bad basis-point sums, and more than 20 recipients.</li>
            <li>30 Foundry tests: 25 unit, 3 fuzz (1024 runs each), and an invariant suite with 16,000+ randomized calls.</li>
            <li><strong>Not audited.</strong> Use small amounts. Splits are permanently locked — a mistaken recipient can't be fixed, only replaced by creating a new split.</li>
          </ul>
        </section>

        <section id="integrate" className="docs-section">
          <h2>Integrating</h2>
          <p>
            Paying into a split or forwarding revenue through one is two calls:{" "}
            <code>approve</code> then <code>pay(id, amount, ref)</code>. See{" "}
            <a
              href="https://github.com/angelraph/Spliteline/blob/main/scripts/agent-pays.ts"
              target="_blank"
              rel="noreferrer"
            >
              scripts/agent-pays.ts
            </a>{" "}
            for a complete example of a service autonomously forwarding collected revenue through
            a split — no human in the loop.
          </p>
        </section>
      </div>
    </div>
  );
}
