import { useState } from "react";

const FAQS = [
  {
    q: "Can a split ever be edited or canceled?",
    a: "No. Recipients and shares are locked in permanently at the moment a split is created — there's no owner, admin, or upgrade function anywhere in the contract. If you add the wrong recipient, the fix is to create a new split, not edit the old one.",
  },
  {
    q: "What happens if one recipient's wallet is blocklisted or broken?",
    a: "Nothing happens to anyone else. Every recipient's accounting is fully independent, so one recipient being unable to receive funds (for example, a blocklisted address) can never block another recipient's claim or release. The affected recipient can also use claimTo to redirect their share to a different address they control.",
  },
  {
    q: "Who can pay into a split?",
    a: "Anyone. A split's id and its /s/:id page are public — any wallet can approve USDC and call pay() to contribute, whether that's a person, a customer, or an automated script.",
  },
  {
    q: "Who can claim a recipient's share?",
    a: "Only the recipient themselves, via claim() or claimTo() — or anyone, on the recipient's behalf, via release(), which always pays out to that recipient's own fixed address. There's no way for someone else to redirect a recipient's funds.",
  },
  {
    q: "Does Splitline take a fee?",
    a: "No. There is no fee logic anywhere in the contract. 100% of what's paid in is distributed to recipients according to their share.",
  },
  {
    q: "Why USDC specifically, and not any ERC-20 token?",
    a: "Splitline is built for Arc, where USDC is the native asset and has a fixed, protocol-level ERC-20 interface. The contract is intentionally scoped to that one interface rather than a generic \"any token\" design — it's what makes the accounting and decimal handling unambiguous.",
  },
  {
    q: "Has this contract been audited?",
    a: "No — it's a hackathon build. It has 30 passing Foundry tests (unit, fuzz, and invariant) covering its core guarantees, but that's not a substitute for an audit. Use small amounts.",
  },
  {
    q: "What's the maximum number of recipients?",
    a: "20 per split, enforced on-chain. This bounds gas costs for validation and keeps rounding dust from payouts below the recipient count, guaranteed by the test suite.",
  },
  {
    q: "How does the app know who owes what, without a backend?",
    a: "It doesn't have a backend. Every page reads directly from the contract's view functions and from its SplitCreated / Paid / Claimed events — the chain is the entire database.",
  },
  {
    q: "Can software — not just people — use Splitline?",
    a: "Yes. scripts/agent-pays.ts in the repo is exactly that: an autonomous script that collects revenue and forwards it through a split with no human in the loop, demonstrating software-to-software payments.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <h1>Frequently asked questions</h1>
      <p className="subtitle">Everything about how Splitline works, and what it doesn't do.</p>

      <div className="faq-list">
        {FAQS.map((item, i) => (
          <div key={item.q} className={`faq-item ${open === i ? "open" : ""}`}>
            <button
              type="button"
              className="faq-question"
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
            >
              {item.q}
              <svg
                className="faq-chevron"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="faq-answer">
              <p>{item.a}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
