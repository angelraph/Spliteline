# Splitline v2

Immutable, pull-based USDC revenue splits for Arc. Create a split with up to 20 recipients, share its deposit address, and each recipient claims their share whenever they like. No owner, no admin, no fees. Splits can be nested so revenue flows down a chain of splits.

Built with [Arc Studio](https://studio.arc.io)

## Tech stack

- Solidity 0.8.28 with OpenZeppelin v5, tested with Foundry
- React, Vite, TypeScript, Tailwind CSS, wagmi, viem (app coming next)
- Arc Testnet, USDC (6 decimals)

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://book.getfoundry.sh).

```bash
bun install
bun run contracts:build   # forge build
bun run contracts:test    # forge test
bun run dev               # frontend dev server
```

### Environment variables

None.
