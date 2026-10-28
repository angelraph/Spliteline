# Spliteline

**Live app:** [spliteline.xyz](https://spliteline.xyz) · **Arc Studio project:**
[Spliteline v2](https://studio.arc.io/app/a27d937d-b07d-4e2c-9f4c-4a4d3ee574d0) · **Repo:**
[github.com/angelraph/Spliteline](https://github.com/angelraph/Spliteline)

**Split revenue. Build together.** Spliteline is immutable, pull-based USDC revenue splitting
on [Arc](https://docs.arc.io). Create a split once — up to 20 recipients, fixed percentages —
and it can never be changed: no owner, no admin, no fee, no upgrade path.

Built for DoraHacks' [Arc Microgrants: Built with Arc Studio](https://dorahacks.io/hackathon/arc-microgrants-2/detail).

## What makes v2 different

- **Every split has its own deposit address.** A plain USDC transfer from any wallet,
  exchange, payroll tool or AI agent counts — no integration, no special function call.
  Each address is a deterministic EIP-1167 clone that can only forward to Spliteline.
- **Claims sweep automatically.** USDC waiting at a deposit address is picked up by the next
  `claim`, `claimTo` or `release`, so recipients never need a separate step.
- **One-transaction payments.** `payWithPermit` uses Arc USDC's EIP-2612 permit (verified on
  Arc Testnet), so payers sign once instead of approve-then-pay. The app falls back to
  approve + pay if a wallet can't sign.
- **Splits can feed other splits.** A recipient can be another split's deposit address, so
  revenue flows down a chain (label → band → members) without trapping funds.
- **Pull-based and failure-isolated.** Each recipient's payout is independent; one blocklisted
  or broken recipient can never block anyone else. A blocklisted recipient can still redirect
  their share with `claimTo`.
- **Payment links and an embeddable pay widget.** `/s/:id?amount=5&ref=invoice-42` pre-fills
  the pay card; `/embed/:id` drops into any site as an iframe.

## How it was built with Arc Studio

Spliteline v2 was built in the Arc Studio project linked above, from the first contract
prompt:

1. **Contract and tests.** Studio wrote `Splitline.sol` and `DepositAddress.sol` from a written
   spec, checked on Arc Testnet that USDC supports permit, and wrote 164 tests plus 4
   invariants (unit, fuzz, nested, blocklist, front-running and salt tests). Its own security
   review caught and fixed a real issue in its first version: a deposit-address salt that a
   front-runner could shift.
2. **Auto-sweep.** Added after review; Studio re-ran the full suite and a second security pass.
3. **Testnet end-to-end.** Studio deployed to Arc Testnet and ran 19 transactions covering
   every flow, checking every balance onchain — see [`v2/TESTNET.md`](v2/TESTNET.md).
4. **App.** Studio built the web app, then tested it in a headless browser against testnet
   (14 more transactions), fixed the bugs it found, and audited every page at 375px and
   1280px for overflow and console errors.
5. **Brand.** Studio matched the existing Spliteline brand and site structure, added Docs,
   FAQ and Proof pages, and wired in Arc mainnet.

Code was exported from Studio with its *Download Code* button and committed under `v2/`.
Everything outside `v2/` is v1, the earlier prototype (see below).

## Repository layout

```
v2/                  Spliteline v2 — the Arc Studio project
  contracts/         Splitline.sol, DepositAddress.sol, tests (forge test)
  src/               React + Vite + wagmi/viem app
  public/            Brand assets (mark, wordmark, icons, OG image)
  scripts/           Arc Studio deploy helpers
  TESTNET.md         Testnet end-to-end transaction log
contracts/, app/, scripts/   v1 prototype
```

## Run it

```bash
cd v2
bun install
cp .env.example .env
bun run dev              # app
forge test               # contracts: 164 tests + 4 invariants
bun run build            # production build
```

Environment variables (all public, no secrets): `VITE_SPLITLINE_ADDRESS_TESTNET`,
`VITE_SPLITLINE_DEPLOY_BLOCK_TESTNET`, `VITE_SPLITLINE_ADDRESS_MAINNET`,
`VITE_SPLITLINE_DEPLOY_BLOCK_MAINNET`, `VITE_PUBLIC_URL`. While the mainnet address is empty,
mainnet views show "Coming soon on mainnet".

## Deployments

| Network | Contract | Status |
|---|---|---|
| Arc Testnet | `0x8dc07d75917bfaed1b7cc389fccc98ffc23bd13f` | Live, 33 end-to-end transactions |
| Arc mainnet (v2) | — | Pending deploy |
| Arc mainnet (v1) | [`0xdB329C9f13705A819436e1e041Fb0b94c75DB1D5`](https://explorer.arc.io/address/0xdB329C9f13705A819436e1e041Fb0b94c75DB1D5) | Live, 6 transactions |

## v1 prototype

v1 (`contracts/`, `app/`, `scripts/`) is the first version: a single-contract split with
`pay`, `claim`, `claimTo` and `release`, 30 Foundry tests, and an `agent-pays.ts`
software-to-software demo. It was written outside Arc Studio, then imported into a separate
Studio project for testing, review and a testnet deploy; its mainnet deploy was run locally
with Foundry. It moved real USDC on Arc mainnet: a 60/40 split, a 2.000001 USDC payment, an
`agent-pays.ts` payment of 0.05 USDC (ref `agent-demo`), and two payouts of 1.23 and 0.82
USDC. v2 replaces it.

## Honest limits

Not audited — keep balances small. Splits are permanently locked once created; a mistaken
recipient can only be fixed by creating a new split. USDC sent straight to the Spliteline
contract (not through `pay`, `payWithPermit` or a deposit address) can't be recovered, since
there is no admin. If Circle ever blocklisted the Spliteline contract itself, every payout
would freeze. A recipient that is itself a contract must be able to call `claim`/`claimTo`,
or rely on anyone calling `release` for it.
