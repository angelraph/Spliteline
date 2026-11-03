import { useEffect, useState } from "react";

const SCENES = [
  { name: "Core team revenue", amount: "$625.00", who: "You can claim" },
  { name: "Design retainer", amount: "$1,240.00", who: "You can claim" },
  { name: "Agent revenue split", amount: "$18.40", who: "You can claim" },
];

/// A phone mockup (cycling through example claim screens, the way Stripe's hero cards
/// cycle through example merchants) paired with a browser-window mockup of /s/:id behind
/// it — Stripe's pattern of showing the actual product inside device frames, not just a
/// floating card.
export function HeroShowcase() {
  const [scene, setScene] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setScene((s) => (s + 1) % SCENES.length), 2800);
    return () => clearInterval(id);
  }, []);

  const current = SCENES[scene];

  return (
    <div className="showcase">
      <div className="glow-blob" aria-hidden="true" />

      <div className="browser-frame">
        <div className="browser-bar">
          <span className="browser-dot" />
          <span className="browser-dot" />
          <span className="browser-dot" />
          <span className="browser-url">spliteline.vercel.app/s/0</span>
        </div>
        <div className="browser-body">
          <div className="mock-top">
            <span className="mock-title">{current.name}</span>
            <span className="mock-pill">live</span>
          </div>
          <div className="mock-row">
            <div className="mock-avatar" />
            <div className="mock-addr" style={{ maxWidth: "55%" }} />
            <span className="mock-pct">50%</span>
          </div>
          <div className="mock-row">
            <div className="mock-avatar" />
            <div className="mock-addr" style={{ maxWidth: "40%" }} />
            <span className="mock-pct">30%</span>
          </div>
          <div className="mock-row">
            <div className="mock-avatar" />
            <div className="mock-addr" style={{ maxWidth: "48%" }} />
            <span className="mock-pct">20%</span>
          </div>
        </div>
      </div>

      <div className="phone-frame">
        <div className="phone-notch" />
        <div className="phone-screen" key={scene}>
          <span className="phone-label">{current.who}</span>
          <span className="phone-amount">{current.amount}</span>
          <button type="button" className="phone-claim-btn" tabIndex={-1}>
            Claim
          </button>
        </div>
      </div>
    </div>
  );
}
