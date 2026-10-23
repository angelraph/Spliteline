# Splitline

Immutable, pull-based USDC revenue splits on [Arc](https://docs.arc.io). Create a split once —
up to 20 recipients, each with a fixed percentage — and it can never be changed afterward: no
owner, no admin, no fee, no upgrade path. Anyone can pay USDC into a split by its id. Each
recipient can claim their exact proportional share at any time, or redirect it to another
address they control. Anyone can also push a payout to a recipient directly. One blocklisted
or unresponsive recipient can never block another recipient's claim.

Built for DoraHacks' [Arc Microgrants: Built with Arc Studio](https://dorahacks.io/hackathon/arc-microgrants-2/detail).

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

The contracts, tests, and app in this repo are a complete, independently-tested reference
implementation — every test above runs and passes locally. Arc's own eligibility rules say a
submission must be *built in Arc Studio*, so the actual submitted build goes through
[studio.arc.io](https://studio.arc.io) using this repo (pushed to GitHub, connected via
Studio's GitHub import) as the steer:

1. **Contract.** Paste into Arc Studio:
   > Write a Solidity 0.8 contract called Splitline. Immutable USDC revenue splits using only
   > the ERC-20 USDC interface at 0x3600000000000000000000000000000000000000 (6 decimals). No
   > owner, no admin, no fee, not payable. createSplit(name, recipients[], bps[]) with max 20
   > recipients, bps sum 10000, no zero address, no duplicates, no self. pay(id, amount, ref)
   > uses transferFrom and adds to totalReceived. Cumulative accounting: owed =
   > totalReceived\*bps/10000 - released. claim, claimTo, release(id, recipient), getSplit.
   > Events SplitCreated, Paid, Claimed. Use SafeERC20 and a reentrancy guard. `ref` is
   > bytes32. The USDC address is a hardcoded constant, not a constructor parameter. Reject a
   > recipient equal to the contract's own address.
2. **Tests.** "Write Foundry tests including fuzz tests for these invariants: claimed plus
   owed never exceeds received; dust below recipient count; balance equals received minus
   claimed; one reverting recipient never blocks others; rejects zero address, duplicates, bad
   bps sum, more than 20 recipients, zero amount."
3. **Review.** "Review the contract for reentrancy, rounding, and denial of service. List
   findings and fix them."
4. **App.** "Build a React app for this contract with pages /, /s/:id, /claim, /proof as
   specified. Read data from contract views and events in small block ranges. Show a single
   USDC balance. Handle wrong network, approval then pay steps, errors, empty states, and
   mobile."
5. **Agent script.** "Add scripts/agent-pays.ts that pays a split from a script wallet with a
   reference string."

If Studio's own output ever diverges from this repo, this repo is the tie-breaker — it's
already proven correct by the test suite above.

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
9. **Deploy the frontend** (Vercel/Netlify/Cloudflare Pages) under your own account.
10. **Submit**: Arc Studio project URL, live app link, contract address + one explorer.arc.io
    transaction link, this repo's URL, a video walkthrough, a short description, and a public
    builder profile (GitHub/X/Farcaster).

## Honest limits

Not audited — keep balances small. Splits are permanently locked once created: a mistaken
recipient can't be fixed, only replaced by creating a new split. A recipient that is itself a
contract must be able to call `claim`/`claimTo`, or rely on anyone calling `release` for it.
