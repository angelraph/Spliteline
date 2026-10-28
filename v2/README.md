# Spliteline

Immutable USDC revenue splits on Arc. Create a split, share its deposit address (any wallet, exchange or agent can send USDC to it), and every recipient claims their exact share. Splits can feed other splits, payers can use a one-transaction permit payment, and each split has a shareable payment link and an embeddable pay widget.

Built with [Arc Studio](https://studio.arc.io)

## Pages

- `/` Landing with live onchain stats
- `/create` Create a split (up to 20 recipients, wallets or other splits)
- `/s/:id` Split page: deposit address and QR, recipients, pay card, activity, payment link and embed code
- `/claim` Everything your wallet can claim
- `/docs`, `/faq` How it works and common questions
- `/proof` Real transactions from the build, linked to the Arc explorer
- `/embed/:id` Minimal pay widget for iframes

Arc Testnet is the default network. Arc mainnet shows "Coming soon on mainnet" until a mainnet contract address is configured.

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
