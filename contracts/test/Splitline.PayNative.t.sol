// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {SplitlineNativeBase} from "./Splitline.NativeBase.t.sol";
import {Splitline} from "../Splitline.sol";

/// @dev Force-feeds native value to a target without calling any code on it.
contract ForceSend {
    constructor(address payable target) payable {
        selfdestruct(target);
    }
}

/// @dev A malicious recipient: any native callback would try to re-enter Splitline.
contract ReenteringRecipient {
    Splitline public immutable SL;
    uint256 public hits;
    uint256 public id;

    constructor(Splitline s) {
        SL = s;
    }

    function setId(uint256 id_) external {
        id = id_;
    }

    receive() external payable {
        ++hits;
        SL.claim(id);
    }

    fallback() external payable {
        ++hits;
        SL.payNative{value: msg.value}(id, bytes32(0));
    }

    function doClaim(uint256 id_) external {
        SL.claim(id_);
    }
}

contract SplitlinePayNativeTest is SplitlineNativeBase {
    function test_PayNative_HappyPathCreditsUnitsAndEmitsPaid() public {
        (uint256 id,) = _create3();
        uint256 units = 12_345_678;
        bytes32 ref = keccak256("invoice-1");
        uint256 payerUnitsBefore = usdc.balanceOf(payer);
        uint256 payerWeiBefore = payer.balance;

        vm.expectEmit(true, true, true, true, address(sl));
        emit Splitline.Paid(id, payer, units, ref);
        _payNativeFrom(payer, id, units * SCALE, ref);

        assertEq(_total(id), units, "totalReceived");
        assertEq(address(sl).balance, units * SCALE, "native balance");
        assertEq(usdc.balanceOf(address(sl)), units, "unified ERC-20 view");
        assertEq(address(sl).balance, usdc.balanceOf(address(sl)) * SCALE);
        assertEq(payerWeiBefore - payer.balance, units * SCALE);
        assertEq(payerUnitsBefore - usdc.balanceOf(payer), units);
        assertEq(sl.owed(id, alice), units * 5000 / 10_000);
    }

    function test_PayNative_RevertsZeroAmount() public {
        (uint256 id,) = _create3();
        vm.prank(payer);
        vm.expectRevert(Splitline.ZeroAmount.selector);
        sl.payNative{value: 0}(id, bytes32(0));
        assertEq(_total(id), 0);
    }

    function test_PayNative_RevertsNotWholeForOneWei() public {
        (uint256 id,) = _create3();
        vm.prank(payer);
        vm.expectRevert(Splitline.NativeAmountNotWhole.selector);
        sl.payNative{value: 1}(id, bytes32(0));
        assertEq(_total(id), 0);
        assertEq(address(sl).balance, 0, "reverted value not retained");
    }

    function test_PayNative_RevertsNotWholeForScaleMinusOne() public {
        (uint256 id,) = _create3();
        vm.prank(payer);
        vm.expectRevert(Splitline.NativeAmountNotWhole.selector);
        sl.payNative{value: SCALE - 1}(id, bytes32(0));
    }

    function test_PayNative_RevertsNotWholeForScalePlusOne() public {
        (uint256 id,) = _create3();
        vm.prank(payer);
        vm.expectRevert(Splitline.NativeAmountNotWhole.selector);
        sl.payNative{value: SCALE + 1}(id, bytes32(0));
        assertEq(_total(id), 0);
    }

    function test_PayNative_RevertsNotWholeForFractionalMultiple() public {
        (uint256 id,) = _create3();
        vm.prank(payer);
        vm.expectRevert(Splitline.NativeAmountNotWhole.selector);
        sl.payNative{value: 7 * SCALE + 999_999_999_999}(id, bytes32(0));
    }

    function test_PayNative_SplitNotFoundForIdZero() public {
        _create3();
        vm.prank(payer);
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.payNative{value: SCALE}(0, bytes32(0));
    }

    function test_PayNative_SplitNotFoundForNextId() public {
        _create3();
        uint256 next = sl.nextId();
        vm.prank(payer);
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.payNative{value: SCALE}(next, bytes32(0));
        vm.prank(payer);
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.payNative{value: SCALE}(type(uint256).max, bytes32(0));
    }

    function test_PayNative_SplitNotFoundCheckedBeforeValueRules() public {
        _create3();
        uint256 next = sl.nextId();
        // zero value on a missing id -> SplitNotFound, not ZeroAmount
        vm.prank(payer);
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.payNative{value: 0}(0, bytes32(0));
        vm.prank(payer);
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.payNative{value: 0}(next, bytes32(0));
        // non-whole value on a missing id -> SplitNotFound, not NativeAmountNotWhole
        vm.prank(payer);
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.payNative{value: 1}(0, bytes32(0));
        vm.prank(payer);
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.payNative{value: 1}(next, bytes32(0));
    }

    function test_PayNative_ZeroAmountCheckedBeforeNotWhole() public {
        (uint256 id,) = _create3();
        // zero is a multiple of 1e12 but must still be ZeroAmount
        vm.prank(payer);
        vm.expectRevert(Splitline.ZeroAmount.selector);
        sl.payNative(id, bytes32(0));
    }

    function test_PayNative_ExactScaleCreditsOneUnit() public {
        (uint256 id,) = _create3();
        vm.expectEmit(true, true, true, true, address(sl));
        emit Splitline.Paid(id, payer, 1, bytes32(uint256(9)));
        _payNativeFrom(payer, id, SCALE, bytes32(uint256(9)));
        assertEq(_total(id), 1);
        assertEq(usdc.balanceOf(address(sl)), 1);
        assertEq(address(sl).balance, SCALE);
        // 1 unit * 50% floors to 0 owed for alice, cumulative entitlement is floor-rounded
        assertEq(sl.owed(id, alice), 0);
    }

    function test_PayNative_MultiplePayersAccumulate() public {
        (uint256 id,) = _create3();
        vm.expectEmit(true, true, true, true, address(sl));
        emit Splitline.Paid(id, payer, 4e6, bytes32("a"));
        _payNativeFrom(payer, id, 4e6 * SCALE, bytes32("a"));
        vm.expectEmit(true, true, true, true, address(sl));
        emit Splitline.Paid(id, payer2, 6e6, bytes32("b"));
        _payNativeFrom(payer2, id, 6e6 * SCALE, bytes32("b"));
        assertEq(_total(id), 10e6);
        assertEq(address(sl).balance, 10e6 * SCALE);
        assertEq(sl.owed(id, alice), 5e6);
        assertEq(sl.owed(id, bob), 3e6);
        assertEq(sl.owed(id, carol), 2e6);
    }

    function test_PayNative_DifferentSplitsAreIndependent() public {
        (uint256 id1,) = _create3();
        (uint256 id2,) = sl.createSplit("two", _a2(alice, bob), _b2(5000, 5000));
        _payNative(id1, 3e6 * SCALE);
        _payNative(id2, 8e6 * SCALE);
        assertEq(_total(id1), 3e6);
        assertEq(_total(id2), 8e6);
        assertEq(usdc.balanceOf(address(sl)), 11e6);
    }

    function test_PayNative_ThenClaimPaysSharesOverErc20Interface() public {
        (uint256 id,) = _create3();
        _payNative(id, 10e6 * SCALE);

        vm.recordLogs();
        vm.prank(alice);
        sl.claim(id);
        vm.prank(bob);
        sl.claim(id);
        vm.prank(carol);
        sl.claim(id);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(usdc.balanceOf(alice), 5e6);
        assertEq(usdc.balanceOf(bob), 3e6);
        assertEq(usdc.balanceOf(carol), 2e6);
        assertEq(alice.balance, 5e6 * SCALE, "native moved with ERC-20 view");
        assertEq(bob.balance, 3e6 * SCALE);
        assertEq(carol.balance, 2e6 * SCALE);
        assertEq(address(sl).balance, 0);
        assertEq(sl.released(id, alice), 5e6);
        // each payout emitted ERC-20 Transfer from the mock
        uint256 transfers;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == USDC_ADDR) ++transfers;
        }
        assertEq(transfers, 3);
    }

    function test_PayNative_ClaimEmitsClaimedWithNativeFundedAmount() public {
        (uint256 id,) = _create3();
        _payNative(id, 10e6 * SCALE);
        vm.expectEmit(true, true, false, true, address(sl));
        emit Splitline.Claimed(id, bob, dave, 3e6);
        vm.prank(bob);
        sl.claimTo(id, dave);
        assertEq(dave.balance, 3e6 * SCALE);
    }

    function test_PayNative_MaliciousRecipientCannotReenter() public {
        ReenteringRecipient atk = new ReenteringRecipient(sl);
        (uint256 id,) = sl.createSplit("atk", _a2(address(atk), bob), _b2(5000, 5000));
        atk.setId(id);
        _payNative(id, 10e6 * SCALE);

        atk.doClaim(id);
        assertEq(usdc.balanceOf(address(atk)), 5e6);
        assertEq(atk.hits(), 0, "payout is ERC-20 based: no native callback to the recipient");
        assertEq(sl.released(id, address(atk)), 5e6);
        // a second claim has nothing owed (no double pay)
        vm.expectRevert(Splitline.NothingOwed.selector);
        atk.doClaim(id);
        assertEq(address(sl).balance, 5e6 * SCALE);
        assertEq(_total(id), 10e6);
    }

    function test_PayNative_PlainNativeSendToSplitlineReverts() public {
        vm.deal(address(this), 10 ether);
        (bool ok,) = address(sl).call{value: 1 ether}("");
        assertFalse(ok, "no receive");
        (ok,) = address(sl).call{value: SCALE}("");
        assertFalse(ok);
        assertEq(address(sl).balance, 0);
    }

    function test_PayNative_NativeSendWithDataToSplitlineReverts() public {
        vm.deal(address(this), 10 ether);
        (bool ok,) = address(sl).call{value: 1 ether}(hex"deadbeef");
        assertFalse(ok, "no fallback");
        (ok,) = address(sl).call{value: 1}(hex"01");
        assertFalse(ok);
        (ok,) = address(sl).call(hex"deadbeef");
        assertFalse(ok);
        (ok,) = address(sl).call("");
        assertFalse(ok, "empty calldata zero value: no receive either");
        assertEq(address(sl).balance, 0);
    }

    function test_PayNative_ValueOnNonPayableFunctionsReverts() public {
        (uint256 id,) = _create3();
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(sl).call{value: 1}(abi.encodeCall(Splitline.pay, (id, 1, bytes32(0))));
        assertFalse(ok, "pay is non-payable");
        (ok,) = address(sl).call{value: 1}(abi.encodeCall(Splitline.sweep, (id)));
        assertFalse(ok, "sweep is non-payable");
        (ok,) = address(sl).call{value: 1}(abi.encodeCall(Splitline.claim, (id)));
        assertFalse(ok, "claim is non-payable");
        assertEq(address(sl).balance, 0);
    }

    function test_PayNative_ForcedNativeViaDealIsNotCredited() public {
        (uint256 id,) = _create3();
        vm.deal(address(sl), 3 * SCALE + 7);
        assertEq(_total(id), 0, "not credited");
        assertEq(sl.owed(id, alice), 0);

        _payNative(id, 10e6 * SCALE);
        assertEq(_total(id), 10e6, "later payment credited exactly");
        vm.prank(alice);
        sl.claim(id);
        vm.prank(bob);
        sl.claim(id);
        vm.prank(carol);
        sl.claim(id);
        assertEq(usdc.balanceOf(alice), 5e6);
        assertEq(usdc.balanceOf(bob), 3e6);
        assertEq(usdc.balanceOf(carol), 2e6);
        assertEq(address(sl).balance, 3 * SCALE + 7, "forced funds remain, untouched");
    }

    function test_PayNative_SelfdestructForcedNativeIsNotCredited() public {
        (uint256 id,) = _create3();
        new ForceSend{value: 5 * SCALE + 3}(payable(address(sl)));
        assertEq(address(sl).balance, 5 * SCALE + 3);
        assertEq(_total(id), 0);

        _payNative(id, 4e6 * SCALE);
        _pay(id, 6e6);
        assertEq(_total(id), 10e6);
        assertEq(sl.owed(id, alice), 5e6);
        vm.prank(alice);
        sl.claim(id);
        assertEq(usdc.balanceOf(alice), 5e6);
        // unsweepable-by-design donation stays; still more than owed to the others
        assertEq(address(sl).balance, 5 * SCALE + 3 + 5e6 * SCALE);
        vm.prank(bob);
        sl.claim(id);
        vm.prank(carol);
        sl.claim(id);
        assertEq(address(sl).balance, 5 * SCALE + 3);
    }
}
