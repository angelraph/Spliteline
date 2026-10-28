# Arc Microgrants submission — Spliteline

Copy for the DoraHacks form. Fill in the example transaction marked TODO after the first real
v2 mainnet payment; everything else is final and checkable onchain or in the Arc Studio
project.

## Links

- **Arc Studio project:** https://studio.arc.io/app/a27d937d-b07d-4e2c-9f4c-4a4d3ee574d0
- **Live app:** https://spliteline.xyz
- **Repo:** https://github.com/angelraph/Spliteline
- **Contract (Arc mainnet):** `0xb34d3a3d293385f750fdfdd75f734f6cc52931a3` —
  https://explorer.arc.io/address/0xb34d3a3d293385f750fdfdd75f734f6cc52931a3
- **Example transaction:** TODO — the first real v2 mainnet payment into a split,
  `https://explorer.arc.io/tx/<hash>` (deploy tx, for reference:
  https://explorer.arc.io/tx/0xc77b8a16ca7d1d2169da8875ed18060d5382e5ebd7d247f7f1e300167e009e39)
- **Proof journey:** https://spliteline.xyz/proof

## Short description

Spliteline is immutable USDC revenue splitting on Arc. You create a split once — up to 20
recipients with fixed percentages — and nobody can ever change it: no owner, no admin, no
fee, no upgrade path.

What makes it different: every split gets its own deposit address, so any wallet, exchange,
payroll tool or AI agent can pay it with a plain USDC transfer, no integration needed.
Recipients claim their exact share whenever they want, and each claim automatically
collects whatever is waiting at the deposit address. Payers can pay in one transaction with
a USDC permit signature. Splits can feed other splits, so revenue can flow down a chain
(label → band → members). Payouts are pull-based and independent, so one blocklisted or
broken recipient can never block anyone else. Every split also has a shareable payment link
and an embeddable pay widget, and the whole app reads straight from onchain events with no
backend.

## How we used Arc Studio

We built Spliteline v2 in Arc Studio from the first prompt:

1. Studio wrote the `Splitline` and `DepositAddress` contracts from our spec, checked on Arc
   Testnet that USDC supports permit, and wrote 164 Foundry tests plus 4 invariants. Its own
   security review found and fixed a real front-running issue in its first design.
2. Studio deployed to Arc Testnet and ran a 19-transaction end-to-end test covering every
   flow, then built the web app and tested it in a headless browser with 14 more testnet
   transactions, fixing the bugs it found.
3. Studio matched our existing brand and site, added Docs, FAQ and Proof pages, made every
   page work down to 360px wide, and wired in Arc mainnet.

An earlier v1 prototype was written outside Studio and later imported into a separate Studio
project for testing and review; it also moved real USDC on mainnet. v2 replaces it, and the
README explains both honestly.
