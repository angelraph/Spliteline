// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @dev Test-only USDC mimic: 6 decimals, EIP-2612 permit, public mint, and a blocklist
/// that makes any transfer touching a blocked address revert (like Circle's USDC).
/// Safe to `vm.etch`: only immutables (EIP712 name/version) are relied on; the blocklist
/// and balances start empty after etch.
contract MockUSDC is ERC20Permit {
    error Blocked(address account);

    mapping(address => bool) public blocked;

    constructor() ERC20("USD Coin", "USDC") ERC20Permit("USD Coin") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address account, bool isBlocked) external {
        blocked[account] = isBlocked;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (blocked[from]) revert Blocked(from);
        if (blocked[to]) revert Blocked(to);
        super._update(from, to, value);
    }
}
