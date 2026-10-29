// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @dev Test-only model of Arc's unified USDC balance. There is ONE balance per account: the native
/// balance (18 decimals). The ERC-20 view (6 decimals) is `account.balance / 1e12`, and every ERC-20
/// movement (mint / transfer / transferFrom) moves NATIVE balance via the forge `vm.deal` cheatcode, so
/// native value and the ERC-20 view always move together. Allowances and permit nonces are ordinary
/// storage. The blocklist mimics Circle's USDC (any transfer touching a blocked address reverts).
/// Safe to `vm.etch`: only immutables (EIP712 name/version) are relied on; storage starts empty.
/// Note: totalSupply() is not tracked (it is meaningless for a native-backed balance).
contract MockArcUSDC is ERC20Permit {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant SCALE = 1e12;

    error Blocked(address account);

    mapping(address => bool) public blocked;

    constructor() ERC20("USD Coin", "USDC") ERC20Permit("USD Coin") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @dev The unified balance: native wei / 1e12.
    function balanceOf(address account) public view override returns (uint256) {
        return account.balance / SCALE;
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
        if (from != address(0)) {
            uint256 bal = from.balance / SCALE;
            if (bal < value) revert ERC20InsufficientBalance(from, bal, value);
            vm.deal(from, from.balance - value * SCALE);
        }
        if (to != address(0)) {
            // re-read after the debit so from == to is a no-op overall
            vm.deal(to, to.balance + value * SCALE);
        }
        emit Transfer(from, to, value);
    }
}
