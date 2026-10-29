# Spliteline

Immutable USDC revenue splits on Arc. Create a split, share its deposit address (any wallet, exchange or agent can send USDC to it, including MetaMask's normal Send), and every recipient claims their exact share. Splits can feed other splits, payers pay with a plain one-transaction USDC send (no approval, no signature) or fall back to a permit or approve then pay, and each split has a shareable payment link and an embeddable pay widget.

Built with [Arc Studio](https://studio.arc.io)

## Pages

- `/` Landing with live onchain stats
- `/create` Create a split (up to 20 recipients, wallets or other splits)
- `/s/:id` Split page: deposit address and QR, recipients, pay card, activity, payment link and embed code
- `/claim` Everything your wallet can claim
- `/docs`, `/faq` How it works and common questions
- `/proof` Real transactions from the build, linked to the Arc explorer
- `/embed/:id` Minimal pay widget for iframes

The app defaults to Arc mainnet once a mainnet contract address is configured, otherwise Arc Testnet. Connecting a wallet never switches its network; the app asks only when a transaction needs it.

## Tech stack

React, Vite, TypeScript, Tailwind CSS, wagmi, viem, ConnectKit, React Router. Smart contracts are Solidity with Foundry (see `contracts/`).

## Development

Prerequisites: [Bun](https://bun.sh).

```bash
bun install
bun run dev        # start the dev server
bun run check      # lint and typecheck
bun run build      # production build
```

### Environment variables

| Name | Purpose |
| --- | --- |
| `VITE_SPLITLINE_ADDRESS_TESTNET` | Splitline contract address on Arc Testnet |
| `VITE_SPLITLINE_DEPLOY_BLOCK_TESTNET` | Block the testnet contract was deployed at; history is read from here |
| `VITE_SPLITLINE_ADDRESS_MAINNET` | Splitline contract address on Arc mainnet (leave empty until deployed) |
| `VITE_SPLITLINE_DEPLOY_BLOCK_MAINNET` | Block the mainnet contract was deployed at |
| `VITE_PUBLIC_URL` | Public site URL used in shared payment links and embed code (defaults to `https://spliteline.xyz`) |

The app uses no private keys or secrets. Proof-page transactions live in `src/data/proof.json`.
