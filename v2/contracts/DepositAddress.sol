// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title DepositAddress
/// @notice Stateless EIP-1167 implementation forwarding Arc USDC only to its creating Splitline.
/// @dev Immutables are embedded in implementation code and remain correct through delegatecall.
/// No native-currency entry point, initialization, storage, rescue, or administrative authority exists.
contract DepositAddress {
    using SafeERC20 for IERC20;

    /// @dev The only address authorized to forward USDC; shared by all clones. Kept private so
    /// that forward() is the clone's single external function.
    address private immutable SPLITLINE = msg.sender;

    /// @dev Arc USDC ERC-20 address (six decimals), not a native-currency interface.
    address private constant USDC = 0x3600000000000000000000000000000000000000;

    /// @notice The caller is not the creating Splitline.
    error NotSplitline();

    /// @notice Forward this clone's entire USDC balance to Splitline.
    /// @dev Only Splitline can enter; its sweep entry point is nonReentrant. No storage is used here.
    /// @return amount The transferred balance, or zero if there was nothing to forward.
    function forward() external returns (uint256 amount) {
        if (msg.sender != SPLITLINE) revert NotSplitline();
        amount = IERC20(USDC).balanceOf(address(this));
        if (amount > 0) IERC20(USDC).safeTransfer(SPLITLINE, amount);
    }
}
