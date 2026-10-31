# Spliteline

**Live app:** [spliteline.xyz](https://spliteline.xyz) · **Demo video:** [youtu.be/KAPCC6YkgP4](https://youtu.be/KAPCC6YkgP4) · **Arc Studio project:** [Spliteline v2](https://studio.arc.io/app/a27d937d-b07d-4e2c-9f4c-4a4d3ee574d0) · **Proof:** [spliteline.xyz/proof](https://spliteline.xyz/proof) · **Repo:** [github.com/angelraph/Spliteline](https://github.com/angelraph/Spliteline)

**Split revenue. Build together.** Spliteline is immutable, pull-based USDC revenue splitting on [Arc](https://docs.arc.io). You create a split once — up to 20 recipients, fixed percentages — and from that moment nobody can ever touch it again. No owner, no admin, no fee, no upgrade path. Every split gets its own deposit address, so paying it is as easy as sending money to a person: any wallet, any exchange, any payroll tool, any AI agent, no integration required.

Built for DoraHacks' [Arc Microgrants: Built with Arc Studio](https://dorahacks.io/hackathon/arc-microgrants-2/detail), and built *in* Arc Studio, from the first prompt.

## At a glance

| | |
|---|---|
| Network | Arc mainnet (chain 5042), live since 2026-10-29 |
| Contract | [`Splitline`](v2/contracts/Splitline.sol), `0x44e2d6ca200bf106626d94fc560db81354209b3c`, source-verified on Sourcify and explorer.arc.io |
| Deposit model | Every split gets its own deterministic EIP-1167 clone that accepts a plain send and forwards straight into the split's balance |
| Payment paths | `payNative` (one-transaction native USDC), `pay` (ERC-20 allowance), `payWithPermit` (EIP-2612 signature), or just send USDC to the deposit address |
| Payout model | Pull-based: `claim`, `claimTo` (redirect), or `release` (anyone can push a payout, always to the recipient's own address) |
| Mainnet proof | 14 real transactions — 4 splits created, two one-shot native payments, four releases, a plain MetaMask send, two self-claims (one auto-sweeping a waiting deposit) |
| Tests | 223 Foundry tests: unit, fuzz, nested splits, blocklist isolation, front-running, salt collisions |
| Built with | Arc Studio, end to end — contracts, 223 tests, testnet run, the app, the brand |

## Contents

- [The idea in one minute](#the-idea-in-one-minute)
- [Live on Arc mainnet](#live-on-arc-mainnet)
- [Why Spliteline](#why-spliteline)
- [Product tour](#product-tour)
- [How it works](#how-it-works)
- [How it was built with Arc Studio](#how-it-was-built-with-arc-studio)
- [Security and verification](#security-and-verification)
- [Repository layout](#repository-layout)
- [Run it](#run-it)
- [Deployments](#deployments)
- [v1 prototype](#v1-prototype)
- [Honest limits](#honest-limits)

## The idea in one minute

Splitting revenue between people is normally a trust problem. Someone holds the money, someone decides who gets what, and everyone else just has to believe them. Spliteline removes the "someone" from that sentence.

A split is a name, a list of recipients, and a list of percentages, locked in forever the moment it's created. There's no admin key that can change the split later, no owner who can pause it, and no upgrade path that could quietly swap the rules. The contract doesn't even have a `receive()` function for itself — the only way money moves is through the paths it was built to allow.

The part that makes it actually usable: **every split gets its own address.** Not a reference number you have to remember to attach to a payment, not a contract call you need a special wallet for — an actual Arc address, the kind you can paste into any wallet, exchange withdrawal form, or payroll tool and just send USDC to. It shows up, and the next person who claims or releases a payout automatically sweeps it in. A revenue-split tool a non-technical collaborator can actually get paid from, the first time, with the "Send" button they already know how to use.

## Live on Arc mainnet

Everything below happened on Arc mainnet (chain 5042) and is independently checkable on [explorer.arc.io](https://explorer.arc.io).

### Contracts

| Component | Address |
|---|---|
| `Splitline` (ours — splits, payments, payouts) | [`0x44e2d6ca200bf106626d94fc560db81354209b3c`](https://explorer.arc.io/address/0x44e2d6ca200bf106626d94fc560db81354209b3c), Sourcify exact match |
| `DepositAddress` implementation (ours — the clone every deposit address shares) | [`0xd745E22e3C871D4486FD8e039b6B01948564743f`](https://explorer.arc.io/address/0xd745E22e3C871D4486FD8e039b6B01948564743f), Sourcify exact match |
| Arc USDC (ERC-20 interface, 6 decimals) | `0x3600000000000000000000000000000000000000` |
| Deploy wallet | `0x1003F5FFa32d586F553cd23e46975A6dfb11861b` |

### Key transactions

| # | What happened | Tx |
|---|---|---|
| 1 | Deploy Spliteline v2 (native-USDC support: deposit addresses accept plain sends, `payNative`), block 28,488,992 | [`0x316f6a0c…93ea`](https://explorer.arc.io/tx/0x316f6a0c131d85025a708ef5d49e09546a807bc85a7262289ee75a336fce93ea) |
| 2 | Create split #1 (50/50, two recipients) | [`0xc66691f5…654d`](https://explorer.arc.io/tx/0xc66691f5ab4873d8e86a7ed273f7b079390affd346fb9724bf768aa1d0f7654d) |
| 3 | Create split #2, "payment for alert subscription" (50/50) | [`0x15bf6df1…40d9d`](https://explorer.arc.io/tx/0x15bf6df1c794fb3b0e33c80c146e7931661984dd5c77b6e3939626fa7bc40d9d) |
| 4 | Pay 1.00 USDC into split #1 with `payNative` — one transaction, no approve | [`0x9d6e1106…c31f94`](https://explorer.arc.io/tx/0x9d6e11060fde0ec84d58820ecba9dc382d45a2ad2cd60c07516c66b555c31f94) |
| 5 | Create split #3 (50/50, two recipients) | [`0x59d0e710…9d3d3c`](https://explorer.arc.io/tx/0x59d0e71093493fa7a32c77419ec5ded28e6040d2e6ff4a9cbb0ce1753a9d3d3c) |
| 6 | Pay 1.00 USDC into split #3 with `payNative` | [`0x503cf402…781de`](https://explorer.arc.io/tx/0x503cf402532ddce3d61e991e6f05e6d8b30b91ef87d5ee9fa06e5fec269781de) |
| 7–10 | Release each recipient's 0.50 USDC on splits #1 and #3, four separate `release` calls, anyone can call them | [`0x3e0c79fe…22dd`](https://explorer.arc.io/tx/0x3e0c79fe1004015df4190d81822e1f82281c586146c204eda73b4db6930f22dd), [`0xa7754f58…0b557`](https://explorer.arc.io/tx/0xa7754f5852d4e4ddfaef52cb013b7ec03a4d280cc746d16d3710a10fdcd0b557), [`0x0d6fe9cd…bf85`](https://explorer.arc.io/tx/0x0d6fe9cdb49ce03e59a01afc4d70c4f4d192fd7d13b24b3c93bdbc0502edbf85), [`0xe2f44c4e…aad3b`](https://explorer.arc.io/tx/0xe2f44c4ea3d12b2b67b780090f2a779147ae05a6d2be73321ed68bea048aad3b) |
| 11 | Create split #4, "thank you for testing our app" (50/50, two friends' wallets) | [`0xb2d38faf…0c111`](https://explorer.arc.io/tx/0xb2d38faff4b1f714bf2fa6d4ed23186dad95a0927d7edc993eab9ab5e70c0111) |
| 12 | **A plain MetaMask Send** of 1.00 USDC, no app involved, straight to split #4's deposit address | [`0x72468fc5…e05fa7`](https://explorer.arc.io/tx/0x72468fc5641a30e473d4dd86cf3f5de65e42c26d393d565acbc74a298ee05fa7) |
| 13 | Friend `0x4775…AC7C3B` claims 0.50 USDC from their own wallet — this one transaction also auto-sweeps the 1.00 USDC waiting at the deposit address | [`0x1b5c7c87…97c6c8`](https://explorer.arc.io/tx/0x1b5c7c874ed972e7736b517dbfc66e2568ebc9665ef4ebc5337003908497c6c8) |
| 14 | Friend `0xb7Cc…ED61cB` claims their 0.50 USDC from their own wallet | [`0xd40859d4…999a919`](https://explorer.arc.io/tx/0xd40859d447a5112a66cede2959ff50083ccb6b677ef49f5ef7be9fadd999a919) |

That last stretch (#11–14) is the whole point in four transactions: a split gets created, someone pays it the way they'd pay a friend — no wallet connect, no approve, just "Send" — and both recipients walk away with their share by claiming from their own wallets, one claim quietly sweeping in money that was just sitting there waiting. Nobody but the two recipients touched a private key.

## Why Spliteline

- **Every split has its own deposit address.** A plain USDC send from any wallet, exchange, payroll tool, or AI agent counts — no integration, no special function call. It accepts both of Arc's USDC forms: the native balance (what MetaMask's normal *Send* moves) and the ERC-20 token. Each address is a deterministic clone that can only ever forward to Spliteline — nothing else can pull from it.
- **Arc-native, one-transaction payments.** `payNative` takes native USDC directly: one transaction, no approve, no signature. It's the default on the site and in the embed widget.
- **Claims sweep automatically.** USDC waiting at a deposit address gets picked up by the next `claim`, `claimTo`, or `release` — recipients never need a separate "collect" step.
- **A fallback for every wallet.** `payWithPermit` uses Arc USDC's EIP-2612 permit for a signature-based payment, and the app falls back to approve-then-pay if a wallet can't sign.
- **Splits can feed other splits.** A recipient can be another split's deposit address, so revenue flows down a chain — label, then band, then members — without ever trapping funds partway.
- **Pull-based and failure-isolated.** Each recipient's payout is computed and paid independently. One blocklisted or broken recipient can never hold up anyone else's money, and a blocklisted recipient can still redirect their own share with `claimTo`.
- **Payment links and an embeddable widget.** `/s/:id?amount=5&ref=invoice-42` pre-fills the pay card so you can text someone a link instead of an address, and `/embed/:id` drops the pay card into any site as an iframe.

## Product tour

The app is four real pages plus two supporting ones, all reading live from the contract and its events — there's no backend and no database, so what you see on screen is always exactly what's on chain.

- **`/` — Create.** Name a split, add up to 20 recipients, and set each one's share with a live basis-points meter that has to land on exactly 100% before the Create button unlocks. One transaction, and the split and its deposit address exist forever.
- **`/s/:id` — Pay and watch.** Shows the split's recipients and their shares, a QR code and the deposit address for a plain send, a pay card defaulting to one-click native USDC, a live activity feed read straight from `Paid`/`Claimed` events, and the "Share a payment link" box that pre-fills amount and reference for whoever you send it to.
- **`/claim` — Claim.** Every split the connected wallet is a recipient of, with exactly what's currently owed and a one-click claim that also sweeps in anything waiting at the deposit address.
- **`/proof` — Proof.** The project's real transaction history on both mainnet and testnet, each one linked straight to explorer.arc.io — the table above is pulled from this page.
- **`/embed/:id`** — the pay card alone, meant to be dropped into another site as an iframe so a creator or project can take payments without sending people away from their own page.
- **Docs and FAQ** — the plain-language version of this README: what a split is, what a deposit address is, what happens if you send USDC to the wrong place, and the handful of questions a first-time user actually asks.

## How it works

**Threshold, not configuration.** `createSplit(name, recipients[], bps[])` takes up to 20 recipients and their basis-point weights (must sum to exactly 10,000), computes a deterministic salt from the caller, name, recipients and weights, and deploys an EIP-1167 clone of `DepositAddress` at an address derived from that salt — so the deposit address exists and is known before a single cent moves, and two different people can never collide on the same split by accident.

**One balance, two doors.** Arc gives every account a single USDC balance exposed two ways: the native balance (18 decimals, what a wallet's ordinary "Send" moves) and the ERC-20 interface at `0x3600…0000` (6 decimals). `DepositAddress` has an empty `receive()` so a plain native send doesn't revert, and because native value and the ERC-20 balance are the same underlying funds related by a fixed `1e12` factor, whatever lands there is immediately visible to `balanceOf` and movable over the ERC-20 interface by `forward()`. `payNative` does the same unification one level up: it accepts `msg.value`, checks it's a whole number of 6-decimal units, and credits the split exactly as if it had arrived through `pay`.

**Cumulative accounting, not a running balance.** Spliteline never tracks "how much is left to pay" per recipient — it tracks `totalReceived` for the split and computes `entitlement = totalReceived * bps / 10000` on every claim, then pays the difference against what's already been released. That one design choice is what makes the failure isolation real: a recipient's payout is a pure function of total revenue and their own history, never of what happened to anyone else's claim.

**Auto-sweep, not a required step.** `claim`, `claimTo`, and `release` all try to forward the deposit address's balance into the split first, best-effort — if the clone has nothing, or forwarding fails for any reason, the payout still proceeds using whatever was already credited. So a recipient never has to know or care whether their split was paid through the app or through a plain wallet send sitting at the deposit address; claiming just picks both up.

**Push and pull, the same money.** `claim` pays the caller; `claimTo` lets a recipient redirect to another address (the escape hatch if a recipient's own address ever gets blocklisted); `release(id, recipient)` lets *anyone* trigger a specific recipient's payout, but it can only ever send to that recipient's own address — useful for nested splits, where the "recipient" is itself a deposit address that can't call `claim` on its own behalf.

## How it was built with Arc Studio

Spliteline v2 was built inside the [Arc Studio project linked above](https://studio.arc.io/app/a27d937d-b07d-4e2c-9f4c-4a4d3ee574d0), from the first contract prompt:

1. **Contract and tests.** Studio wrote `Splitline.sol` and `DepositAddress.sol` from a written spec, confirmed on Arc Testnet that USDC supports permit, and wrote 164 Foundry tests plus 4 invariant suites (unit, fuzz, nested, blocklist, front-running, salt). Its own security review caught and fixed a real issue in the first draft: a deposit-address salt a front-runner could have shifted.
2. **Auto-sweep.** Added after that review; Studio re-ran the full suite and a second security pass.
3. **Testnet, end to end.** Studio deployed to Arc Testnet and ran 19 transactions covering every flow — see [`v2/TESTNET.md`](v2/TESTNET.md) — checking every balance on chain, not just asserting it in a test.
4. **The app.** Studio built the frontend, tested it in a headless browser against testnet (14 more transactions), fixed what it found, and checked every page at 375px and 1280px for overflow and console errors.
5. **Brand.** Studio matched the existing Spliteline brand and site structure, and added the Docs, FAQ, and Proof pages.
6. **Mainnet.** Arc Studio doesn't sign mainnet transactions itself, so the mainnet deploy went out from the builder's own wallet through a one-button deploy page holding the compiled contract — checked byte-for-byte against Studio's already-tested testnet build before and after deploying.
7. **Going Arc-native.** The first real mainnet test exposed a bug: a plain MetaMask *Send* to a deposit address reverted, because the clone had no `receive()`. Studio added one, added `payNative`, proved on testnet that native USDC lands exactly right and sweeps and pays out correctly, wrote 54 more tests (223 total), made native the app's default payment path, and the redeployed contracts are source-verified exact matches on Sourcify and explorer.arc.io.

Code was exported from Studio with its *Download Code* button and committed under [`v2/`](v2/). Everything outside `v2/` is v1, the earlier prototype — see [below](#v1-prototype).

## Security and verification

- Both mainnet contracts are **source-verified, exact match, on Sourcify and explorer.arc.io** — what's deployed is exactly what's in this repo.
- **No admin, no owner, no pause, no upgrade path, not payable except through `payNative`.** There is no function anywhere in `Splitline.sol` that a privileged account can call that an ordinary recipient can't.
- `nonReentrant` on every state-changing function, `SafeERC20` for every transfer, checks-effects-interactions throughout, and `claim`/`claimTo`/`release`'s auto-sweep is wrapped in a `try/catch` so a failing or blocklisted deposit clone can never block a payout of revenue that's already credited.
- 223 Foundry tests: unit tests for every function and revert condition, fuzz tests (1024+ runs) proving `claimed + owed` never exceeds `received`, invariant campaigns across many splits and thousands of randomized calls, a dedicated blocklist test using a mock token that reverts transfers to a chosen address, and a front-running/salt-collision test proving a split's deposit address can't be hijacked by a second creator.
- **Not audited.** This is a hackathon build, reviewed by Arc Studio and tested hard, but keep balances small until it's had real outside eyes on it.

## Repository layout

```
v2/                  Spliteline v2 — the Arc Studio project, and the one that's live
  contracts/         Splitline.sol, DepositAddress.sol, tests (forge test)
  src/                React + Vite + wagmi/viem app
  public/             Brand assets (mark, wordmark, icons, OG image)
  scripts/            Arc Studio deploy helpers
  TESTNET.md          Testnet end-to-end transaction log
contracts/, app/, scripts/   v1 prototype (see below)
```

## Run it

```bash
cd v2
bun install
cp .env.example .env
bun run dev              # the app
forge test                # the contracts — 223 tests, including fuzz and invariants
bun run build              # production build
```

Every environment variable is public, nothing secret: `VITE_SPLITLINE_ADDRESS_TESTNET`, `VITE_SPLITLINE_DEPLOY_BLOCK_TESTNET`, `VITE_SPLITLINE_ADDRESS_MAINNET`, `VITE_SPLITLINE_DEPLOY_BLOCK_MAINNET`, `VITE_PUBLIC_URL`. While the mainnet address is empty, mainnet views just show "Coming soon on mainnet" instead of breaking.

## Deployments

| Network | Contract | Status |
|---|---|---|
| **Arc mainnet (v2, current)** | [`0x44e2d6ca200bf106626d94fc560db81354209b3c`](https://explorer.arc.io/address/0x44e2d6ca200bf106626d94fc560db81354209b3c) | Live, source-verified — deployed in [`0x316f6a0c…93ea`](https://explorer.arc.io/tx/0x316f6a0c131d85025a708ef5d49e09546a807bc85a7262289ee75a336fce93ea), block 28,488,992. Deposit-address implementation [`0xd745e22e…743f`](https://explorer.arc.io/address/0xd745E22e3C871D4486FD8e039b6B01948564743f) |
| Arc Testnet (v2, current) | [`0x03d335175967bc5d10d50b08fd9d63a768941721`](https://explorer.testnet.arc.io/address/0x03d335175967bc5d10d50b08fd9d63a768941721) | Source-verified, end-to-end run including native sends |
| Arc mainnet (v2, first deploy) | [`0xb34d3a3d293385f750fdfdd75f734f6cc52931a3`](https://explorer.arc.io/address/0xb34d3a3d293385f750fdfdd75f734f6cc52931a3) | Superseded — no native-USDC support; where the MetaMask-send bug was found |
| Arc Testnet (v2, first deploy) | `0x8dc07d75917bfaed1b7cc389fccc98ffc23bd13f` | Superseded, 33 end-to-end transactions |
| Arc mainnet (v1) | [`0xdB329C9f13705A819436e1e041Fb0b94c75DB1D5`](https://explorer.arc.io/address/0xdB329C9f13705A819436e1e041Fb0b94c75DB1D5) | Live, 6 transactions |

## v1 prototype

v1 (`contracts/`, `app/`, `scripts/`) was the first version: a single-contract split with `pay`, `claim`, `claimTo`, and `release`, 30 Foundry tests, and an `agent-pays.ts` software-to-software demo. It was written outside Arc Studio, then imported into a separate Studio project for testing, review, and a testnet deploy; its mainnet deploy ran locally with Foundry. It moved real USDC on Arc mainnet too: a 60/40 split, a 2.000001 USDC payment, an `agent-pays.ts` payment of 0.05 USDC (ref `agent-demo`), and two payouts of 1.23 and 0.82 USDC. v2 replaces it entirely, but it's kept in the repo because it's part of the honest history of how this got built.

## Honest limits

Not audited — keep balances small. Splits are permanently locked once created; a mistaken recipient can only be fixed by creating a new split, not editing the old one. USDC sent straight to the Spliteline contract itself (not through `pay`, `payWithPermit`, `payNative`, or a deposit address) can't be recovered — there's no admin to rescue it. If Circle ever blocklisted the Spliteline contract itself, every payout would freeze (a blocklisted *recipient* is fine — they can still `claimTo` another address). A recipient that's itself a contract needs to be able to call `claim`/`claimTo`, or needs to rely on someone else calling `release` for it.
