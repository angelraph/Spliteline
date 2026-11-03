// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SplitlineNativeBase} from "./Splitline.NativeBase.t.sol";
import {Splitline} from "../Splitline.sol";

contract SplitlineNativeFuzzTest is SplitlineNativeBase {
    function testFuzz_PayNativeCreditsExactlyValueOverScale(uint256 units, bytes32 ref) public {
        units = bound(units, 1, 1e12);
        (uint256 id,) = _create3();
        vm.expectEmit(true, true, true, true, address(sl));
        emit Splitline.Paid(id, payer, units, ref);
        _payNativeFrom(payer, id, units * SCALE, ref);
        assertEq(_total(id), units);
        assertEq(address(sl).balance, units * SCALE);
        assertEq(usdc.balanceOf(address(sl)), units);
    }

    function testFuzz_PayNativeRejectsNonWholeValue(uint256 units, uint256 rem) public {
        units = bound(units, 0, 1e12);
        rem = bound(rem, 1, SCALE - 1);
        (uint256 id,) = _create3();
        vm.prank(payer);
        vm.expectRevert(Splitline.NativeAmountNotWhole.selector);
        sl.payNative{value: units * SCALE + rem}(id, bytes32(0));
        assertEq(_total(id), 0);
        assertEq(address(sl).balance, 0);
    }

    function testFuzz_NativeToCloneSweepAndRemainder(uint256 weiAmt) public {
        weiAmt = bound(weiAmt, 1, 1e24);
        (uint256 id, address dep) = _create3();
        _native(dep, weiAmt);
        assertEq(usdc.balanceOf(dep), weiAmt / SCALE);
        uint256 units = weiAmt / SCALE;
        if (units == 0) {
            vm.expectRevert(Splitline.NothingToSweep.selector);
            sl.sweep(id);
            assertEq(dep.balance, weiAmt);
            return;
        }
        assertEq(sl.sweep(id), units);
        assertEq(_total(id), units, "credited == wei / 1e12");
        assertEq(dep.balance, weiAmt % SCALE, "remainder == wei % 1e12");
        assertEq(address(sl).balance, units * SCALE);
    }

    function testFuzz_RemaindersAccumulateAcrossSends(uint256 w1, uint256 w2) public {
        w1 = bound(w1, 1, 5e18);
        w2 = bound(w2, 1, 5e18);
        (uint256 id, address dep) = _create3();
        _native(dep, w1);
        _native(dep, w2);
        uint256 units = (w1 + w2) / SCALE;
        if (units == 0) {
            vm.expectRevert(Splitline.NothingToSweep.selector);
            sl.sweep(id);
            return;
        }
        assertEq(sl.sweep(id), units);
        assertEq(dep.balance, (w1 + w2) % SCALE);
    }

    /// @dev Mixed native / ERC-20 inputs, then every recipient claims in a fuzzed order.
    function testFuzz_MixedPaymentsNeverOverpayAndDustBelowRecipientCount(
        uint256 n,
        uint256 seed,
        uint256 a1,
        uint256 a2,
        uint256 a3,
        uint256 a4
    ) public {
        n = bound(n, 2, 8);
        a1 = bound(a1, 1e4, 1e12);
        a2 = bound(a2, 1, 1e12);
        a3 = bound(a3, 1, 1e12);
        a4 = bound(a4, 1, 1e24); // wei, includes sub-unit remainders

        address[] memory r = new address[](n);
        uint16[] memory b = _partition(seed, n);
        for (uint256 i; i < n; ++i) {
            r[i] = address(uint160(0xA000 + i));
        }
        (uint256 id, address dep) = _create(r, b);

        _payNative(id, a1 * SCALE);
        _pay(id, a2);
        _erc20(dep, a3);
        _native(dep, a4);
        uint256 expectedTotal = a1 + a2 + a3 + a4 / SCALE;

        // claim in a pseudo-random order, the first claim also auto-sweeps the clone
        uint256 start = uint256(keccak256(abi.encode(seed, "order"))) % n;
        // two passes: a zero-share claim reverts (NothingOwed) before the first successful claim sweeps
        for (uint256 k; k < 2 * n; ++k) {
            address who = r[(start + k) % n];
            if (k % 2 == 0) {
                vm.prank(who);
                (bool ok,) = address(sl).call(abi.encodeCall(Splitline.claim, (id)));
                ok; // NothingOwed is legitimate when the floor share is zero
            } else {
                (bool ok2,) = address(sl).call(abi.encodeCall(Splitline.release, (id, who)));
                ok2;
            }
        }
        assertEq(_total(id), expectedTotal, "all inputs credited");
        uint256 paid;
        for (uint256 i; i < n; ++i) {
            uint256 cap = expectedTotal * b[i] / 10_000;
            uint256 got = usdc.balanceOf(r[i]);
            assertLe(got, cap, "never more than floor(total*bps/10000)");
            assertEq(got, cap, "exactly the floor share after claiming");
            assertEq(sl.released(id, r[i]), got);
            paid += got;
        }
        uint256 dust = expectedTotal - paid;
        assertLt(dust, n, "dust below recipient count");
        assertEq(usdc.balanceOf(address(sl)), dust);
        assertEq(address(sl).balance, dust * SCALE);
        assertEq(dep.balance, a4 % SCALE);
    }

    /// @dev Local copy of the deterministic partition of 10000 into n positive weights.
    function _partition(uint256 seed, uint256 n) internal pure returns (uint16[] memory b) {
        b = new uint16[](n);
        uint256 rem = 10_000 - n;
        for (uint256 i; i + 1 < n; ++i) {
            uint256 cap = 2 * rem / (n - i);
            if (cap > rem) cap = rem;
            uint256 x = uint256(keccak256(abi.encode(seed, i))) % (cap + 1);
            b[i] = uint16(1 + x);
            rem -= x;
        }
        b[n - 1] = uint16(1 + rem);
    }
}
