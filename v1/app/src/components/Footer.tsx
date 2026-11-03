import { Link } from "react-router-dom";
import logo from "../assets/mark.png";

export function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <Link to="/" className="brand">
            <img src={logo} alt="" className="brand-mark" />
            Splitline
          </Link>
          <p>
            Immutable, pull-based USDC revenue splits on Arc. No owner, no admin, no fee, no
            upgrade path — ever.
          </p>
        </div>
        <div className="footer-col">
          <h4>Product</h4>
          <Link to="/create">Create a split</Link>
          <Link to="/claim">Claim</Link>
          <Link to="/proof">Proof journey</Link>
        </div>
        <div className="footer-col">
          <h4>Resources</h4>
          <Link to="/docs">Docs</Link>
          <Link to="/faq">FAQ</Link>
          <a href="https://github.com/angelraph/Spliteline" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
        <div className="footer-col">
          <h4>Network</h4>
          <a href="https://docs.arc.io" target="_blank" rel="noreferrer">
            Arc docs
          </a>
          <a href="https://explorer.arc.io" target="_blank" rel="noreferrer">
            Arc explorer
          </a>
          <a href="https://dorahacks.io/hackathon/arc-microgrants-2/detail" target="_blank" rel="noreferrer">
            Arc Microgrants
          </a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>Splitline — built with Arc Studio</span>
        <span>Not audited. Use small amounts.</span>
      </div>
    </footer>
  );
}
