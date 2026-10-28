# Spliteline

**Live app:** [spliteline.vercel.app](https://spliteline.vercel.app) · **Repo:**
[github.com/angelraph/Spliteline](https://github.com/angelraph/Spliteline)

Immutable, pull-based USDC revenue splits on [Arc](https://docs.arc.io). Create a split once —
up to 20 recipients, each with a fixed percentage — and it can never be changed afterward: no
owner, no admin, no fee, no upgrade path. Anyone can pay USDC into a split by its id. Each
recipient can claim their exact proportional share at any time, or redirect it to another
address they control. Anyone can also push a payout to a recipient directly. One blocklisted
or unresponsive recipient can never block another recipient's claim.

Built for DoraHacks' [Arc Microgrants: Built with Arc Studio](https://dorahacks.io/hackathon/arc-microgrants-2/detail).

> The repo, live app, and Vercel project are named **Spliteline**; the Solidity contract and
> in-app product name are **Splitline** (one word, no second "e") — the name used throughout
> the code, UI copy, and the original project brief. Say the word if you'd rather the contract
> and UI text matched the repo spelling exactly; it's a mechanical rename across a handful of
> files.

## Why

Most revenue-split demos stop at "it compiles." Splitline is the complete, trustworthy
version: the split configuration is genuinely immutable (verified by a Foundry invariant
suite, not just asserted in prose), payouts are pull-based so no single bad actor can freeze
anyone else's money, and the whole app — including a live payment feed and a recipient's
claim dashboard — reads straight from on-chain events, because Splitline keeps no database
of its own.

## Structure

```
contracts/   Foundry project — Splitline.sol, unit/fuzz/invariant tests, deploy script
app/         Vite + React + TypeScript + wagmi/viem frontend (/, /s/:id, /claim, /proof)
scripts/     agent-pays.ts — a "software pays software" demo
```

## Contract

[`contracts/src/Splitline.sol`](contracts/src/Splitline.sol) — see the file's NatSpec for the
full function and event surface. Highlights:

- Uses only Arc's ERC-20 USDC interface at the fixed address
  `0x3600000000000000000000000000000000000000` (6 decimals) — never native value. Arc's
  native USDC balance (18 decimals, used for gas) is a different interface over the same
  underlying balance; this contract never touches it. See
  [docs.arc.io's stablecoin native model](https://docs.arc.io/arc/concepts/stablecoin-native-model).
- `createSplit`, `pay`, `owed`, `claim`, `claimTo`, `release`, `getSplit` — exactly the
  surface described in the project brief, plus `SplitCreated`/`Paid`/`Claimed` events that
  the frontend uses as its entire data layer.
- `SafeERC20` + `ReentrancyGuard` (OpenZeppelin v5), custom errors, checks-effects-interactions
  throughout.
- A few deliberate, documented design calls where the brief was open-ended: the USDC address
  is a hardcoded constant (it's fixed network-wide on Arc, so making it configurable would
  only add a one-shot footgun to an otherwise admin-less contract); `pay(id, 0, ref)` reverts
  rather than silently no-opping; `ref` is `bytes32` rather than a free-text `string`, since
  it's cheaper on every payer's gas bill and still enough for an invoice id or its hash;
  "self-referential recipient" is rejected as "recipient == the Splitline contract's own
  address" — the one interpretation that actually prevents a fund trap.

### Tests

```bash
cd contracts
forge test          # 26 unit tests, 3 fuzz tests (1024 runs each), 2 invariant checks
forge test -vvv      # with traces
```

All 30 tests pass, including a fuzz test that bps must sum to exactly 10000, a fuzz test that
claimed can never exceed received, a fuzz test that rounding dust stays below the recipient
count, and an invariant campaign (16k+ randomized calls across many splits) asserting the
contract's USDC balance always equals total paid minus total claimed, and no recipient is
ever owed more than their exact proportional share. A dedicated test also proves one
blocklisted recipient never blocks another recipient's claim, using a mock token that reverts
transfers to a chosen address, standing in for Arc USDC's real blocklist behavior.

## App

```bash
cd app
npm install
cp .env.example .env   # fill in VITE_SPLITLINE_ADDRESS after deploying
npm run dev
```

Four routes, all reading live from the contract and its events — no backend:

- `/` — create a split, with a live basis-points meter
- `/s/:id` — pay into a split (approve → pay, shown as two explicit steps), see recipients,
  a live payment/claim feed, and a QR code for the link
- `/claim` — every split the connected wallet is a recipient of, with a claim button
- `/proof` — the project's mainnet transaction journey, filled in after deployment (see below)

Built with **wagmi + viem**, not ethers — Arc's dual-decimal USDC model (18-decimal native,
6-decimal ERC-20) needs explicit, auditable decimal handling at every read, which viem's
`formatUnits`/`parseUnits` make obvious at each call site. The app deliberately shows a
**single** USDC balance (the ERC-20 interface only), per Arc's own guidance against splitting
native/ERC-20 balances into two rows. Wallet connection is a minimal custom button over
wagmi's injected connector rather than RainbowKit/ConnectKit, since Arc is too new to be in
their default chain metadata.

## Agent script

```bash
cd scripts
npm install
cp .env.example .env   # PRIVATE_KEY (the service's own wallet), SPLITLINE_ADDRESS, SPLIT_ID
npm run agent-pays -- --amount 0.05 --ref "invoice-1234"
```

Plays an autonomous API service that has just collected revenue from a customer and forwards
it straight into a split, with no human in the loop — the "software-to-software payments"
starting point from the Arc Microgrants brief. Verified end-to-end against a local Anvil
chain (deploy → create a 50/30/20 split → `agent-pays.ts` approves and pays → a recipient
claims their exact share) before this README was written.

## How this was built with Arc Studio

**Arc Studio project:**
[studio.arc.io/app/ecb4f201-d9d6-4667-b0f5-834883029d13](https://studio.arc.io/app/ecb4f201-d9d6-4667-b0f5-834883029d13)

To be straightforward about who did what: the first version of the contract, tests, app, and
agent script was written in this repo with an AI coding assistant (Claude Code), then
imported into Arc Studio from GitHub. Since then, Arc Studio has been the workbench for
testing, reviewing, deploying to testnet, verifying the mainnet deploy, and building new
features:

1. **Import, build, and test** (Oct 23). Studio created the project from this repo,
   installed dependencies, compiled the contract, ran the full Foundry suite (31 tests: 26
   unit, 3 fuzz, 2 invariant — all passing), and brought the app up in its live preview.
2. **Security review.** Studio reviewed `Splitline.sol` for reentrancy, rounding, and
   denial of service. It found no issues requiring a fix, and listed design notes that are
   now in [Honest limits](#honest-limits): anyone can `release` a recipient's payout at a
   time they didn't choose, a 0-bps recipient wastes a slot, USDC sent to the contract outside
   `pay` is unrecoverable, and a Circle blocklisting of the contract itself would freeze
   payouts.
3. **Testnet deploy.** Studio deployed Splitline to Arc Testnet, wired the preview to it,
   and confirmed the deployment onchain before any mainnet step.
4. **Mainnet deploy — done outside Studio.** Studio can't sign mainnet transactions from the
   builder's own wallet, so the mainnet deploy was run locally with this repo's
   `contracts/script/Deploy.s.sol` (Foundry). Studio then verified it onchain: the runtime
   bytecode at `0xdB329C9f13705A819436e1e041Fb0b94c75DB1D5` matches the compiled
   `Splitline.sol` exactly, `nextId()` reads as expected, and the deploy is recorded in the
   project's `AGENTS.md`.
5. **New feature: push payouts from the UI.** The contract's `release(id, recipient)` had no
   button in the app. Studio added per-recipient owed amounts and a Release button on
   `/s/:id` (new `RecipientRow` component and `useReleaseToRecipient` hook, with feed and
   totals refreshing after a confirmed release). It ran `forge test` (31/31), `npm run build`,
   and `npm run lint`, then exercised the same calls on Arc Testnet with a throwaway wallet:
   a 0.10 USDC payment into a 60/40 split showed 0.06 / 0.04 owed, `release` paid out the
   0.06, and a second `release` correctly reverted with `NothingOwed`. The work is on the
   `studio/release-button` branch.

## Deployment & proof runbook

Everything up to here is code. **Nothing past this point can be done by an AI assistant** —
deploying to mainnet, funding a wallet, and signing transactions are all steps only a human
with their own Arc Studio account and their own wallet can take. This is the exact sequence,
in order, using small amounts and fresh wallets:

1. **Fund a deploy wallet** with a small amount of mainnet USDC (Arc's native gas token).
   Never reuse a key that holds anything else of value.
2. **Deploy**, preferably through Arc Studio directly (one-click deploy to Arc mainnet from
   your logged-in session — this is what produces the "Arc Studio project URL" the submission
   needs). Alternatively:
   ```bash
   cd contracts
   cp .env.example .env   # PRIVATE_KEY = your deploy wallet's key
   forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast   # testnet first, always
   forge script script/Deploy.s.sol --rpc-url arc_mainnet --broadcast  # only once confident
   ```
3. **Record the contract address** — put it in `app/.env` (`VITE_SPLITLINE_ADDRESS`) and
   `scripts/.env` (`SPLITLINE_ADDRESS`).
4. **Create the demo split** — a 50/30/20 split among three wallets you control, via the app's
   `/` page or Arc Studio's contract panel.
5. **Pay a small amount** (e.g. $0.10) into it from a second wallet, via the app's `/s/:id`
   page.
6. **Run `agent-pays.ts`** with a real funded key to generate the software-to-software proof
   transaction.
7. **Claim** from each recipient wallet via `/claim`.
8. **Record every transaction hash** in `app/src/data/proof-transactions.json` — this is what
   powers the `/proof` page. Be honest in the README/video about which wallets are yours.
9. **Deploy the frontend** — already live at [spliteline.vercel.app](https://spliteline.vercel.app),
   connected to this repo's `main` branch for auto-deploys. Once you have a deployed contract
   address, set `VITE_SPLITLINE_ADDRESS` as an environment variable on the Vercel project
   (`vercel env add VITE_SPLITLINE_ADDRESS production`) and redeploy.
10. **Submit**: Arc Studio project URL, live app link, contract address + one explorer.arc.io
    transaction link, this repo's URL, a video walkthrough, a short description, and a public
    builder profile (GitHub/X/Farcaster).

## Honest limits

Not audited — keep balances small. Splits are permanently locked once created: a mistaken
recipient can't be fixed, only replaced by creating a new split. A recipient that is itself a
contract must be able to call `claim`/`claimTo`, or rely on anyone calling `release` for it.

From Arc Studio's review: anyone can `release` a recipient's payout at a time the recipient
didn't choose (it always goes to their own address); a recipient with 0 basis points can
never claim and only wastes one of the 20 slots; USDC transferred straight to the contract
instead of through `pay` isn't attributed to any split and can't be recovered, which is
inherent to a contract with no admin; and if Circle ever blocklisted the Splitline contract
address itself, every payout would freeze.
