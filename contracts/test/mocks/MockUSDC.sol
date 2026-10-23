// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice A 6-decimal ERC-20 standing in for Arc's USDC in tests. `Splitline` is deployed
///         against this mock via `vm.etch`-free constructor injection in a test harness,
///         never against the hardcoded mainnet address directly.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice A mock USDC that reverts transfers to a single blocklisted address, standing in
///         for Arc USDC's real blocklist behavior, to prove one bad recipient can never
///         block another recipient's claim.
contract BlocklistingMockUSDC is ERC20 {
    address public blocked;

    constructor() ERC20("Blocklisting Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address who) external {
        blocked = who;
    }

    function _update(address from, address to, uint256 value) internal override {
        // `blocked` defaults to address(0); only enforce once a real address is set,
        // otherwise minting (from == address(0)) would always revert.
        if (blocked != address(0)) {
            require(to != blocked && from != blocked, "blocklisted");
        }
        super._update(from, to, value);
    }
}
