// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Marker alias for Arc's fixed ERC-20 USDC interface.
/// @dev On Arc, USDC is the native gas asset (18 decimals) and additionally exposes a
///      standard ERC-20 interface at a fixed protocol address (6 decimals) for
///      transferFrom/approve/allowance-based application transfers. Splitline only ever
///      touches that ERC-20 interface — it never accepts or sends native value.
///      See: https://docs.arc.io/arc/references/contract-addresses
address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

interface IUSDC is IERC20 {}
