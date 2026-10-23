import { useAccount, useConnect, useDisconnect } from "wagmi";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

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

  const connector = connectors[0];

  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={!connector || isPending}
      onClick={() => connector && connect({ connector })}
    >
      {isPending ? "Connecting…" : connector ? "Connect Wallet" : "No wallet found"}
    </button>
  );
}
