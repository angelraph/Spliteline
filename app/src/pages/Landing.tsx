import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Reveal } from "../components/Reveal";
import { HeroShowcase } from "../components/HeroShowcase";

export function Landing() {
  const meshRef = useRef<HTMLDivElement>(null);

  // A gentle scroll-linked parallax on the hero mesh — it drifts slower than the page
  // scrolls, the way Stripe's hero gradient shifts under the content instead of being a
  // static background.
  useEffect(() => {
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (meshRef.current) {
          meshRef.current.style.transform = `translateY(${window.scrollY * 0.18}px)`;
        }
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="landing">
      <section className="hero">
        <div className="mesh-pos" aria-hidden="true" ref={meshRef}>
          <div className="mesh" />
        </div>
        <div className="container hero-grid">
          <div className="hero-inner">
            <span className="eyebrow">
              <span className="dot" />
              Built with Arc Studio · live on Arc
            </span>
            <h1>
              Split revenue. <b className="gradient-text">Build together.</b>
            </h1>
            <p className="lead">
              Splitline turns one payment link into a fair, instant, provable payout for a whole
              team. Send USDC to one split — every recipient gets their exact share, claimable
              any time, and nobody, not even the creator, can ever change the rules.
            </p>
            <div className="hero-actions">
              <Link to="/create" className="btn btn-primary">
                Create a split
              </Link>
              <Link to="/docs" className="link-arrow">
                Read the docs <span aria-hidden="true">→</span>
              </Link>
            </div>
            <p className="hero-note">No owner. No admin. No fee. No upgrade path.</p>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <HeroShowcase />
          </div>
        </div>
      </section>

      <div className="container">
        <Reveal>
          <div className="trust-strip">
            <div className="trust-item">
              <span className="num">30/30</span>
              <span className="label">Foundry tests passing</span>
            </div>
            <div className="trust-item">
              <span className="num">20</span>
              <span className="label">Max recipients per split</span>
            </div>
            <div className="trust-item">
              <span className="num">0</span>
              <span className="label">Admin functions</span>
            </div>
            <div className="trust-item">
              <span className="num gradient-text">100%</span>
              <span className="label">Pull-based payouts</span>
            </div>
          </div>
        </Reveal>
      </div>

      <section className="container">
        <Reveal>
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2>Three steps, and it's done forever</h2>
            <p>No accounts, no backend, no one you have to trust after the split is created.</p>
          </div>
        </Reveal>
        <div className="steps">
          <Reveal delay={0}>
            <div className="step">
              <div className="step-num">1</div>
              <h3>Create a split</h3>
              <p>
                Name it, add up to 20 recipients with percentages — a live meter shows the total
                reaching 100%. Confirm, and it's locked in forever.
              </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="step">
              <div className="step-num">2</div>
              <h3>Share the link</h3>
              <p>
                Anyone opens <code>/s/&lt;id&gt;</code>, enters an amount and an optional
                reference, approves USDC, and pays — straight into the split.
              </p>
            </div>
          </Reveal>
          <Reveal delay={240}>
            <div className="step">
              <div className="step-num">3</div>
              <h3>Get paid</h3>
              <p>
                Each recipient connects a wallet, sees exactly what they're owed, and claims it —
                any time, to any address they control.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="container">
        <Reveal>
          <div className="section-head">
            <span className="eyebrow">Why Splitline</span>
            <h2>The complete, trustworthy version</h2>
            <p>Most splitters stop at "it compiles." This is the one you'd actually adopt.</p>
          </div>
        </Reveal>
        <div className="bento">
          <Reveal delay={0} className="bento-card span-2">
            <div className="split-mock">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="bento-icon">🔒</div>
                <h3>Locked splits</h3>
                <p>
                  Recipients and shares are fixed forever at creation — no owner, no admin, no
                  fee, no upgrade function anywhere in the contract. Trust is the product, and
                  it's enforced by code, not a promise.
                </p>
              </div>
              <div className="split-mock-rows mock-card" style={{ padding: 16, maxWidth: 220 }}>
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
          </Reveal>
          <Reveal delay={90} className="bento-card">
            <div className="bento-icon">↺</div>
            <h3>Pull-based payouts</h3>
            <p>One blocklisted or broken recipient can never block anyone else's claim.</p>
          </Reveal>
          <Reveal delay={180} className="bento-card">
            <div className="bento-icon">📡</div>
            <h3>Real receipts</h3>
            <p>
              Every split's page shows who gets what and a live payment feed — all read straight
              from the chain, no database involved.
            </p>
            <div className="bento-mock">
              <div className="feed-mock-row paid">
                <span>
                  <span className="dot" />
                  Paid by 0x7a…3f1
                </span>
                <span className="feed-mock-amount">$50.00</span>
              </div>
              <div className="feed-mock-row claimed">
                <span>
                  <span className="dot" />
                  Claimed by 0x9c…b42
                </span>
                <span className="feed-mock-amount">$25.00</span>
              </div>
            </div>
          </Reveal>
          <Reveal delay={270} className="bento-card">
            <div className="bento-icon">🤖</div>
            <h3>Software pays software</h3>
            <p>
              A script can bill a customer and forward the revenue through a split automatically
              — no human in the loop.
            </p>
          </Reveal>
          <Reveal delay={360} className="bento-card span-2">
            <div className="bento-icon">✓</div>
            <h3>Proof, not promises</h3>
            <p>
              Every mainnet transaction in this project's build is listed on the{" "}
              <Link to="/proof" className="gradient-text">
                proof page
              </Link>{" "}
              with explorer links, and the contract carries 30 passing tests — unit, fuzz, and
              invariant — covering exactly these guarantees.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="container">
        <Reveal>
          <div className="section-head">
            <span className="eyebrow">For builders</span>
            <h2>Two calls. That's the whole integration.</h2>
            <p>Pay into a split, or let your recipients claim from it. The rest is on-chain.</p>
          </div>
        </Reveal>
        <Reveal>
          <pre className="code-panel">
            <code>
              <span className="c">// forward revenue through a split — software paying software</span>
              {"\n"}
              <span className="k">await</span> splitline.pay(id, amount, ref){"\n\n"}
              <span className="c">// each recipient claims their exact proportional share</span>
              {"\n"}
              <span className="k">await</span> splitline.claim(id)
            </code>
          </pre>
        </Reveal>
      </section>

      <section className="container">
        <Reveal>
          <div className="cta-panel">
            <h2>Ready to split revenue the right way?</h2>
            <p>Create a split in under a minute. No sign-up, no backend, no trust required.</p>
            <div className="hero-actions">
              <Link to="/create" className="btn btn-primary">
                Create a split
              </Link>
              <a
                href="https://github.com/angelraph/Spliteline/blob/main/contracts/src/Splitline.sol"
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline"
              >
                View the contract
              </a>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
