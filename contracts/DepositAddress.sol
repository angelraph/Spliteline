// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title DepositAddress
/// @notice Stateless EIP-1167 implementation forwarding Arc USDC only to its creating Splitline.
/// @dev Immutables are embedded in implementation code and remain correct through delegatecall.
/// No initialization, storage, rescue, or administrative authority exists.
///
/// Native USDC on Arc. Arc has ONE USDC balance per account, exposed two ways: the native balance
/// (18 decimals, what a wallet's normal "Send" moves as `msg.value`) and the ERC-20 interface at
/// 0x3600...0000 (6 decimals, `balanceOf`/`transfer`). They are the same funds, related by a factor
/// of 1e12: 1 ERC-20 unit (0.000001 USDC) == 1e12 native wei. A clone is a contract, so a plain native
/// send to it needs a `receive()`; without one the send reverts. With it, native USDC sent to a deposit
/// address is immediately visible to `balanceOf` in 6-decimal units, and `forward()` (reached through
/// sweep and the auto-sweep inside claim, claimTo and release) moves it to Splitline over the ERC-20
/// interface like any other deposit.
///
/// Sub-micro-USDC dust. The ERC-20 interface cannot express amounts below 1e12 wei. If a clone ever
/// holds a native remainder smaller than 1e12 wei (for example from a native send that is not a whole
/// number of micro-USDC) that remainder cannot move through `forward()` and stays in the clone. It is
/// worth less than 0.000001 USDC per occurrence. Wallets send whole micro-USDC amounts, so this is rare.
///
/// Gas. A clone call goes through the EIP-1167 proxy, which costs more than a bare 21,000-gas
/// transfer, so a sender that hard-codes exactly 21,000 gas can run out of gas. Wallets that estimate
/// gas (MetaMask and similar) are fine.
contract DepositAddress {
    using SafeERC20 for IERC20;

    /// @dev The only address authorized to forward USDC; shared by all clones. Kept private so
    /// that forward() is the clone's single external function.
    address private immutable SPLITLINE = msg.sender;

    /// @dev Arc USDC ERC-20 address (six decimals), not a native-currency interface.
    address private constant USDC = 0x3600000000000000000000000000000000000000;

    /// @notice The caller is not the creating Splitline.
    error NotSplitline();

    /// @notice Accept a plain native USDC send (an ordinary wallet "Send" on Arc).
    /// @dev Intentionally empty: no logic, no events. The funds are the same balance that `balanceOf`
    /// reports in 6-decimal units, and `forward()` moves them to Splitline.
    receive() external payable {}

    /// @notice Forward this clone's entire USDC balance to Splitline.
    /// @dev Only Splitline can enter; its sweep entry point is nonReentrant. No storage is used here.
    /// @return amount The transferred balance, or zero if there was nothing to forward.
    function forward() external returns (uint256 amount) {
        if (msg.sender != SPLITLINE) revert NotSplitline();
        amount = IERC20(USDC).balanceOf(address(this));
        if (amount > 0) IERC20(USDC).safeTransfer(SPLITLINE, amount);
    }
}
