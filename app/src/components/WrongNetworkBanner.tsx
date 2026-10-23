import { useAccount, useSwitchChain } from "wagmi";
import { arcMainnet, arcTestnet } from "../chains/arc";

export function WrongNetworkBanner() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  const onArc = chainId === arcMainnet.id || chainId === arcTestnet.id;
  if (!isConnected || onArc) return null;

  return (
    <div className="banner banner-warning">
      <span>Your wallet is on an unsupported network. Splitline runs on Arc.</span>
      <button
        type="button"
        className="btn btn-sm"
        disabled={isPending}
        onClick={() => switchChain({ chainId: arcMainnet.id })}
      >
        {isPending ? "Switching…" : "Switch to Arc"}
      </button>
    </div>
  );
}
