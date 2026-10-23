import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, type Connector } from "wagmi";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  if (isConnected && address) {
    return (
      <div className="connect-wallet">
        <span className="address-pill">{shortenAddress(address)}</span>
        <button type="button" className="btn btn-ghost" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  // wagmi auto-discovers every EIP-6963-announced wallet extension (MetaMask, Coinbase
  // Wallet, Rabby, etc.) alongside the generic injected() fallback. Once a browser has any
  // named wallet(s), the generic "Injected" entry is just a duplicate of one of them — drop
  // it so the list shows each real wallet once instead of an unlabelled extra option.
  const named = connectors.filter((c) => c.id !== "injected");
  const list: readonly Connector[] = named.length > 0 ? named : connectors;

  function pick(connector: Connector) {
    setOpen(false);
    connect({ connector });
  }

  return (
    <div className="connect-wallet-picker" ref={rootRef}>
      <button
        type="button"
        className="btn btn-primary"
        disabled={list.length === 0 || isPending}
        onClick={() => (list.length === 1 ? pick(list[0]) : setOpen((v) => !v))}
      >
        {isPending ? "Connecting…" : list.length === 0 ? "No wallet found" : "Connect Wallet"}
      </button>

      {open && list.length > 1 && (
        <div className="wallet-menu">
          {list.map((c) => (
            <button type="button" key={c.uid} className="wallet-menu-item" onClick={() => pick(c)}>
              {c.icon ? <img src={c.icon} alt="" className="wallet-icon" /> : <span className="wallet-icon-fallback" />}
              {c.name}
            </button>
          ))}
        </div>
      )}

      {error && <p className="form-error wallet-error">{error.message.split("\n")[0]}</p>}
    </div>
  );
}
