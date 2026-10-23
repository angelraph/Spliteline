import { NavLink, Outlet } from "react-router-dom";
import { ConnectWallet } from "./ConnectWallet";
import { WrongNetworkBanner } from "./WrongNetworkBanner";

export function Layout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/" className="brand" end>
          Splitline
        </NavLink>
        <nav className="app-nav">
          <NavLink to="/" end>
            Create
          </NavLink>
          <NavLink to="/claim">Claim</NavLink>
          <NavLink to="/proof">Proof</NavLink>
        </nav>
        <ConnectWallet />
      </header>
      <WrongNetworkBanner />
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        <span>Immutable USDC revenue splits on Arc. No owner, no admin, no fee.</span>
      </footer>
    </div>
  );
}
