# Splitline v2 on Arc Testnet

End-to-end run performed by Arc Studio on 2026-10-28, with throwaway wallets. No mainnet
transactions.

- Chain: Arc Testnet (chain ID 5042002)
- USDC: `0x3600000000000000000000000000000000000000` (6 decimals)
- Splitline: `0x8dc07d75917bfaed1b7cc389fccc98ffc23bd13f`

Wallets: P is the payer; A, B, C are the child split's recipients (50 / 30 / 20); F is B's
`claimTo` destination; E is the parent split's other recipient (60, with the child split's
deposit address as the 40).

| # | Step | Tx hash |
|---|------|---------|
| 1 | Deploy Splitline | `0xef91ad3cb537edc07a66ec9d516ca6e7cce41ad9a7ccec4652e0351dabd1003e` |
| 2 | Fund A with gas, 1.0 | `0x05074f7acaefd7a8dcd528a60730d46e491d17363a8ad8bc15a3c10ef78adf91` |
| 3 | Fund B with gas, 1.0 | `0xf8a6f37018072d014f1a3acdc41e3a0c072e698bfc5c8943d76a147b15c8cd20` |
| 4 | `createSplit` child (A 50 / B 30 / C 20) | `0xb91c8843e9f13eb9b796b4faacbdb67f0285b3cab200106a5ef3697862f7bc85` |
| 5 | USDC `approve` 2.0 | `0xdafb99dc3ac120453defe2a8f0edd2b18fb130c621df37843757adc93dc1e0f4` |
| 6 | `pay` 2.0 | `0x93cdff28c2f93917e326e95fd715818e3cfe02e331a1cbf06e8fc66b51589638` |
| 7 | `payWithPermit` 3.0, one transaction | `0x5cf6c1483de52bd682ffbcb5380497531dd2c0a841ef1411b8db6588f66c13c3` |
| 8 | Plain USDC transfer 2.5 to the child's deposit address | `0x5c0dd3409d3f8538923bd59c3832a7a161072577dec345c3c8a57d58bd170e48` |
| 9 | A `claim` (auto-sweeps 2.5, pays 3.75) | `0x5662bcfbb00e5d70f8e8b5196965e8dae186bae20d78579ab0bc301d158826b4` |
| 10 | B `claimTo` wallet F (2.25) | `0x352f6755217fd6a4d96350f4a1d8f1fc19d64756f095019792296f57fb5b2221` |
| 11 | P `release` for C (1.5) | `0x2a75dd8a287c299fed7906b60344b1bf040b7e8ab56ee28c255a67d74da398a8` |
| 12 | `createSplit` parent (E 60 / child deposit address 40) | `0xdae41d01d861f622572867b2748a43630c0029b48897f7b2dd536988e30712ce` |
| 13 | USDC `approve` 4.0 | `0x79779cba00f2109aae9f89a5a38d0dccf106527d3353c21c5e2e4a9f9d678c45` |
| 14 | `pay` parent 4.0 | `0xe70d9975d73234435ddfad787d008db8fabd6f4c23a0c4bf2cf7f9bc2bcd2c63` |
| 15 | `release` parent to E (2.4) | `0x809798fa2a065ca860f3b5bac646f4dc222477fa063c65a123e4e61b9b07b24f` |
| 16 | `release` parent to child deposit address (1.6) | `0x484ed98d4a936ff89e790933e57e353b5e51cc4e5077986b045bf045b3033096` |
| 17 | A `claim` on child (auto-sweeps 1.6, pays 0.8) | `0x32182a7b2b9a44b5ff7e8ec267297275dc28cbb9917ddf52829c3660152a82d0` |
| 18 | `release` child to B (0.48) | `0x212c63a94d8d4d0a38096a0e82e603c4ce3749d2c2f3d2def76b173fe75008e9` |
| 19 | `release` child to C (0.32) | `0x52e88fef19ac04a654a4e5c2f6d517f3c7a8d14699c3ccd08f3a39428305bf2d` |

## Final state, read onchain

- Splitline contract: 0 USDC. Everything paid out, no dust at these amounts.
- Child and parent deposit addresses: 0 USDC. Both the 2.5 direct transfer and the 1.6 from
  the parent were swept by claims, with no separate `sweep` call.
- Child split total received: 9.1 USDC (2.0 `pay` + 3.0 `payWithPermit` + 2.5 direct +
  1.6 from the parent). Released: A 4.55 (50%), B 2.73 (30%), C 1.82 (20%). Nothing owed.
- Parent split total received: 4.0 USDC. Released: E 2.4 (60%), child deposit address 1.6
  (40%).
