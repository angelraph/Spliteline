import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { ConnectWallet } from "./ConnectWallet";
import { WrongNetworkBanner } from "./WrongNetworkBanner";
import { Footer } from "./Footer";
import logo from "../assets/mark.png";

const NAV_LINKS = [
  { to: "/docs", label: "Docs" },
  { to: "/faq", label: "FAQ" },
  { to: "/claim", label: "Claim" },
  { to: "/proof", label: "Proof" },
];

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/" className="brand" end onClick={() => setMenuOpen(false)}>
          <img src={logo} alt="" className="brand-mark" />
          Splitline
        </NavLink>
        <nav className="app-nav">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          <ConnectWallet />
          <NavLink to="/create" className="btn btn-primary btn-sm">
            Create a split
          </NavLink>
        </div>
        <button
          type="button"
          className="nav-toggle"
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {menuOpen ? (
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </header>

      {menuOpen && (
        <div className="mobile-menu">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} onClick={() => setMenuOpen(false)}>
              {link.label}
            </NavLink>
          ))}
          <div className="mobile-menu-actions">
            <ConnectWallet />
            <NavLink to="/create" className="btn btn-primary" onClick={() => setMenuOpen(false)}>
              Create a split
            </NavLink>
          </div>
        </div>
      )}

      <WrongNetworkBanner />
      <main className="app-main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
