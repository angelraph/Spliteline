# Arc Microgrants submission — Spliteline

Copy for the DoraHacks form. Everything below is final and checkable onchain or in the Arc
Studio project.

## Links

- **Arc Studio project:** https://studio.arc.io/app/a27d937d-b07d-4e2c-9f4c-4a4d3ee574d0
- **Live app:** https://spliteline.xyz
- **Repo:** https://github.com/angelraph/Spliteline
- **Contract (Arc mainnet, source-verified):** `0x44e2d6ca200bf106626d94fc560db81354209b3c` —
  https://explorer.arc.io/address/0x44e2d6ca200bf106626d94fc560db81354209b3c
- **Example transaction:** 1.00 USDC paid into split #1 with `payNative` (one transaction,
  native USDC) —
  https://explorer.arc.io/tx/0x9d6e11060fde0ec84d58820ecba9dc382d45a2ad2cd60c07516c66b555c31f94
  (deploy tx: https://explorer.arc.io/tx/0x316f6a0c131d85025a708ef5d49e09546a807bc85a7262289ee75a336fce93ea)
- **Proof journey:** https://spliteline.xyz/proof

## Short description

Spliteline is immutable USDC revenue splitting on Arc. You create a split once — up to 20
recipients with fixed percentages — and nobody can ever change it: no owner, no admin, no
fee, no upgrade path.

What makes it different: every split gets its own deposit address, so any wallet, exchange,
payroll tool or AI agent can pay it with a plain USDC send, no integration needed — including
MetaMask's normal Send of Arc's native USDC. Recipients claim their exact share whenever they
want, and each claim automatically collects whatever is waiting at the deposit address. On
the site, paying is Arc-native: one transaction with native USDC, no approve and no signature. Splits can feed other splits, so revenue can flow down a chain
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
4. When our own mainnet test showed a MetaMask Send to a deposit address reverting, Studio
   made Spliteline Arc-native: it added native-USDC support, proved on Arc Testnet that native
   USDC lands exactly in the ERC-20 balance and pays out correctly, wrote 54 more tests (223
   total), made native payment the app default, and verified the source on the explorer. We
   redeployed that version to mainnet from our own wallet; both contracts are source-verified
   on explorer.arc.io.

An earlier v1 prototype was written outside Studio and later imported into a separate Studio
project for testing and review; it also moved real USDC on mainnet. v2 replaces it, and the
README explains both honestly.
