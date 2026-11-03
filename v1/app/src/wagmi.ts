import { createConfig, http, injected } from "wagmi";
import { arcMainnet, arcTestnet } from "./chains/arc";

// Arc is too new to be in RainbowKit/ConnectKit's chain metadata, so this app connects
// wallets directly through wagmi's injected (EIP-1193 / MetaMask-compatible) connector
// rather than fighting those libraries' chain-list assumptions.
export const wagmiConfig = createConfig({
  chains: [arcMainnet, arcTestnet],
  connectors: [injected()],
  transports: {
    [arcMainnet.id]: http(),
    [arcTestnet.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
