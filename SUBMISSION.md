# Arc Microgrants submission — Spliteline

Copy for the DoraHacks form. Every fact below is checkable onchain or in the Arc Studio
project.

## Links

- **Arc Studio project:** https://studio.arc.io/app/ecb4f201-d9d6-4667-b0f5-834883029d13
- **Live app:** https://spliteline.vercel.app
- **Repo:** https://github.com/angelraph/Spliteline
- **Contract (Arc mainnet):** `0xdB329C9f13705A819436e1e041Fb0b94c75DB1D5` —
  https://explorer.arc.io/address/0xdB329C9f13705A819436e1e041Fb0b94c75DB1D5
- **Example transaction (pay into a split, 2.000001 USDC):**
  https://explorer.arc.io/tx/0x2225c2aa10fcf48c53722ecd761d95d965ac7ed0e086d4493055a0e2ff2ef1a1
- **Full proof journey (6 mainnet txs):** https://spliteline.vercel.app/proof

## Short description

Spliteline is immutable, pull-based USDC revenue splitting on Arc. You create a split once
(up to 20 recipients, fixed percentages) and it can never be changed: no owner, no admin,
no fee, no upgrade path. Anyone pays USDC into a split by its id; each recipient claims
their exact share whenever they want, or anyone can push it to them with `release`. One
blocklisted or unresponsive recipient can never block anyone else's payout. The app reads
everything from onchain events, with no backend, and an `agent-pays.ts` script shows a
service paying revenue straight into a split with no human in the loop.

On Arc mainnet so far: a 60/40 split was created, paid 2.000001 USDC by hand and 0.05 USDC
by the agent script (ref `agent-demo`), and both recipients were paid out 1.23 and 0.82 USDC.

## How we used Arc Studio

The first version of the contract, Foundry tests, React app, and agent script was written
in our GitHub repo with an AI coding assistant, then imported into Arc Studio. In Studio we:

1. Built and tested it: compiled the contract and ran all 31 Foundry tests (26 unit, 3
   fuzz, 2 invariant), and ran the app in Studio's preview.
2. Had Studio security-review the contract (reentrancy, rounding, denial of service). It
   found nothing needing a fix; its design notes are in the README's "Honest limits".
3. Deployed to Arc Testnet from Studio and confirmed it onchain before going to mainnet.
4. Deployed to mainnet ourselves with the repo's Foundry script, since Studio can't sign
   from our own wallet, then had Studio verify the mainnet bytecode matches the compiled
   contract and record the deployment.
5. Built a new feature in Studio: per-recipient owed amounts and a Release button on the
   split page, which Studio tested end to end on Arc Testnet.
