// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Splitline} from "../Splitline.sol";
import {DepositAddress} from "../DepositAddress.sol";
import {MockArcUSDC} from "./mocks/MockArcUSDC.sol";

/// @dev Fixture for the unified-balance model: MockArcUSDC etched at the canonical USDC address.
/// ERC-20 balanceOf(a) == a.balance / 1e12 and ERC-20 transfers move native balance.
abstract contract SplitlineNativeBase is Test {
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;
    uint256 internal constant SCALE = 1e12;

    MockArcUSDC internal usdc;
    Splitline internal sl;

    address internal payer = makeAddr("payer");
    address internal payer2 = makeAddr("payer2");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");
    address internal eve = makeAddr("eve");

    function setUp() public virtual {
        MockArcUSDC mock = new MockArcUSDC();
        vm.etch(USDC_ADDR, address(mock).code);
        usdc = MockArcUSDC(USDC_ADDR);
        sl = new Splitline();

        usdc.mint(payer, 1e15); // 1e27 wei
        usdc.mint(payer2, 1e15);
        vm.prank(payer);
        usdc.approve(address(sl), type(uint256).max);
        vm.prank(payer2);
        usdc.approve(address(sl), type(uint256).max);
    }

    // ---------------------------------------------------------------- array helpers
    function _a2(address x, address y) internal pure returns (address[] memory r) {
        r = new address[](2);
        r[0] = x;
        r[1] = y;
    }

    function _a3(address x, address y, address z) internal pure returns (address[] memory r) {
        r = new address[](3);
        r[0] = x;
        r[1] = y;
        r[2] = z;
    }

    function _b2(uint16 x, uint16 y) internal pure returns (uint16[] memory r) {
        r = new uint16[](2);
        r[0] = x;
        r[1] = y;
    }

    function _b3(uint16 x, uint16 y, uint16 z) internal pure returns (uint16[] memory r) {
        r = new uint16[](3);
        r[0] = x;
        r[1] = y;
        r[2] = z;
    }

    // ---------------------------------------------------------------- split helpers
    function _create(address[] memory r, uint16[] memory b) internal returns (uint256 id, address dep) {
        return sl.createSplit("split", r, b);
    }

    /// @dev alice 50% / bob 30% / carol 20%
    function _create3() internal returns (uint256 id, address dep) {
        return _create(_a3(alice, bob, carol), _b3(5000, 3000, 2000));
    }

    function _total(uint256 id) internal view returns (uint256 t) {
        (,,,, t) = sl.getSplit(id);
    }

    /// @dev ERC-20 `pay` from `payer`.
    function _pay(uint256 id, uint256 amount) internal {
        vm.prank(payer);
        sl.pay(id, amount, bytes32(0));
    }

    /// @dev payNative from `from` with `weiAmount`.
    function _payNativeFrom(address from, uint256 id, uint256 weiAmount, bytes32 ref) internal {
        vm.prank(from);
        sl.payNative{value: weiAmount}(id, ref);
    }

    function _payNative(uint256 id, uint256 weiAmount) internal {
        _payNativeFrom(payer, id, weiAmount, bytes32(0));
    }

    /// @dev Plain native send of `weiAmount` from `payer` to `to`.
    function _native(address to, uint256 weiAmount) internal {
        vm.prank(payer);
        (bool ok,) = to.call{value: weiAmount}("");
        require(ok, "native send failed");
    }

    /// @dev ERC-20 transfer of `amount` units from `payer` to `to`.
    function _erc20(address to, uint256 amount) internal {
        vm.prank(payer);
        usdc.transfer(to, amount);
    }

    /// @dev Count and sum Splitline `Swept` events (optionally filtered by id; id == 0 means any).
    function _swept(Vm.Log[] memory logs, uint256 id) internal view returns (uint256 count, uint256 sum) {
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != address(sl) || logs[i].topics[0] != Splitline.Swept.selector) continue;
            if (id != 0 && uint256(logs[i].topics[1]) != id) continue;
            ++count;
            sum += abi.decode(logs[i].data, (uint256));
        }
    }

    function _dep(address a) internal pure returns (DepositAddress) {
        return DepositAddress(payable(a));
    }
}
