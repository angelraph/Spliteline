// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SplitlineTestBase} from "./Splitline.Base.t.sol";
import {Splitline} from "../Splitline.sol";
import {DepositAddress} from "../DepositAddress.sol";

contract SplitlineDepositTest is SplitlineTestBase {
    // ------------------------------------------------------------ DepositAddress contract
    function test_Deposit_ForwardRevertsForNonSplitlineOnClone() public {
        (, address dep) = _create3();
        usdc.mint(dep, 5e6);
        vm.prank(eve);
        vm.expectRevert(DepositAddress.NotSplitline.selector);
        DepositAddress(payable(dep)).forward();
        vm.prank(alice);
        vm.expectRevert(DepositAddress.NotSplitline.selector);
        DepositAddress(payable(dep)).forward();
        assertEq(usdc.balanceOf(dep), 5e6, "funds untouched");
    }

    function test_Deposit_ForwardRevertsForTestContractCaller() public {
        (, address dep) = _create3();
        vm.expectRevert(DepositAddress.NotSplitline.selector);
        DepositAddress(payable(dep)).forward();
    }

    function test_Deposit_ForwardOnImplementationRevertsForNonSplitline() public {
        address impl = sl.DEPOSIT_IMPLEMENTATION();
        vm.prank(eve);
        vm.expectRevert(DepositAddress.NotSplitline.selector);
        DepositAddress(payable(impl)).forward();
        vm.expectRevert(DepositAddress.NotSplitline.selector);
        DepositAddress(payable(impl)).forward();
    }

    function test_Deposit_ForwardByImplementationBoundToSplitlineWorksOnlyForSplitline() public {
        // the only authorised caller is Splitline itself (sweep path)
        (uint256 id, address dep) = _create3();
        usdc.mint(dep, 9e6);
        assertEq(sl.sweep(id), 9e6);
        assertEq(usdc.balanceOf(dep), 0);
    }

    function test_Deposit_CloneAcceptsPlainNativeSend() public {
        (, address dep) = _create3();
        vm.deal(address(this), 1 ether);
        vm.recordLogs();
        (bool ok,) = dep.call{value: 1 ether}("");
        assertTrue(ok, "receive must accept plain native send");
        assertEq(dep.balance, 1 ether);
        assertEq(vm.getRecordedLogs().length, 0, "receive emits no event");
    }

    function test_Deposit_CloneRejectsEthWithData() public {
        (, address dep) = _create3();
        vm.deal(address(this), 1 ether);
        (bool ok,) = dep.call{value: 1}(hex"deadbeef");
        assertFalse(ok);
        assertEq(dep.balance, 0);
    }

    function test_Deposit_CloneRejectsUnknownSelector() public {
        (, address dep) = _create3();
        (bool ok,) = dep.call(hex"deadbeef");
        assertFalse(ok, "no fallback");
    }

    function test_Deposit_CloneEmptyCalldataNoValueSucceedsViaReceive() public {
        (, address dep) = _create3();
        (bool ok,) = dep.call("");
        assertTrue(ok, "receive accepts empty calldata (zero value)");
        assertEq(dep.balance, 0);
    }

    function test_Deposit_CloneShortCalldataRejected() public {
        (, address dep) = _create3();
        vm.deal(address(this), 1 ether);
        (bool ok,) = dep.call(hex"01");
        assertFalse(ok, "1-byte calldata hits no fallback");
        (ok,) = dep.call{value: 1}(hex"01020304");
        assertFalse(ok);
        assertEq(dep.balance, 0);
    }

    function test_Deposit_ForwardIsNotPayable() public {
        (, address dep) = _create3();
        vm.deal(address(sl), 1 ether);
        vm.prank(address(sl));
        (bool ok,) = dep.call{value: 1}(abi.encodeWithSignature("forward()"));
        assertFalse(ok, "forward() is non-payable");
        assertEq(dep.balance, 0);
    }

    function test_Deposit_CloneOnlyExposesForward() public {
        (, address dep) = _create3();
        string[6] memory sigs = [
            "SPLITLINE()",
            "USDC()",
            "owner()",
            "initialize(address)",
            "rescue(address,uint256)",
            "transfer(address,uint256)"
        ];
        for (uint256 i; i < sigs.length; ++i) {
            (bool ok,) = dep.call(abi.encodeWithSignature(sigs[i]));
            assertFalse(ok, sigs[i]);
        }
        for (uint256 i; i < sigs.length; ++i) {
            vm.deal(address(this), 1);
            (bool okV,) = dep.call{value: 1}(abi.encodeWithSignature(sigs[i]));
            assertFalse(okV, sigs[i]);
        }
        assertEq(dep.balance, 0, "only receive() accepts value");
        (bool okFwd, bytes memory ret) = dep.call(abi.encodeWithSignature("forward()"));
        assertFalse(okFwd, "forward() reverts for non-Splitline");
        assertEq(bytes4(ret), DepositAddress.NotSplitline.selector);
    }

    function test_Deposit_ImplementationIsNotAFundableRecipient() public {
        address impl = sl.DEPOSIT_IMPLEMENTATION();
        address[] memory r = _a2(alice, impl);
        uint16[] memory b = _b2(5000, 5000);
        vm.expectRevert(Splitline.InvalidRecipient.selector);
        sl.createSplit("x", r, b);
    }

    // ------------------------------------------------------------ predictability
    function test_Deposit_AddressPredictableBeforeCreation() public {
        address[] memory r = _a3(alice, bob, carol);
        uint16[] memory b = _b3(5000, 3000, 2000);
        uint256 nextId = sl.nextId();
        address predicted = _independentPredict(address(this), "x", r, b);
        assertEq(predicted.code.length, 0, "no code yet");
        assertEq(sl.predictDepositAddress(address(this), "x", r, b), predicted);

        (uint256 id, address dep) = sl.createSplit("x", r, b);
        assertEq(id, nextId);
        assertEq(dep, predicted);
        assertGt(dep.code.length, 0);
    }

    function test_Deposit_NameAffectsAddress() public {
        address[] memory r = _a2(alice, bob);
        uint16[] memory b = _b2(5000, 5000);
        address p = sl.predictDepositAddress(address(this), "one", r, b);
        assertTrue(p != sl.predictDepositAddress(address(this), "two", r, b));
        (, address dep) = sl.createSplit("one", r, b);
        assertEq(dep, p);
    }

    function test_Deposit_FundedBeforeCreationThenSweepCredits() public {
        address[] memory r = _a3(alice, bob, carol);
        uint16[] memory b = _b3(5000, 3000, 2000);
        address predicted = _independentPredict(address(this), "x", r, b);

        vm.prank(payer);
        usdc.transfer(predicted, 100e6); // split does not exist yet
        assertEq(usdc.balanceOf(predicted), 100e6);

        (uint256 id,) = sl.createSplit("x", r, b);
        (,,,, uint256 before) = sl.getSplit(id);
        assertEq(before, 0, "not credited until sweep");

        assertEq(sl.sweep(id), 100e6);
        (,,,, uint256 total) = sl.getSplit(id);
        assertEq(total, 100e6);
        assertEq(sl.owed(id, alice), 50e6);
        assertEq(sl.owed(id, bob), 30e6);
        assertEq(sl.owed(id, carol), 20e6);
        assertEq(usdc.balanceOf(address(sl)), 100e6);
    }

    function test_Deposit_DirectTransferThenSweepEquivalentToPay() public {
        (uint256 idA,) = _create3();
        (uint256 idB, address depB) =
            sl.createSplit("split-b", _a3(alice, bob, carol), _b3(5000, 3000, 2000)); // same config, different name
        uint256 amt = 123_456_789;

        _pay(idA, amt);
        vm.prank(payer);
        usdc.transfer(depB, amt);
        sl.sweep(idB);

        (,,,, uint256 ta) = sl.getSplit(idA);
        (,,,, uint256 tb) = sl.getSplit(idB);
        assertEq(ta, tb);
        assertEq(sl.owed(idA, alice), sl.owed(idB, alice));
        assertEq(sl.owed(idA, bob), sl.owed(idB, bob));
        assertEq(sl.owed(idA, carol), sl.owed(idB, carol));
    }

    function test_Deposit_SweepTwiceSecondRevertsNothingToSweep() public {
        (uint256 id, address dep) = _create3();
        vm.prank(payer);
        usdc.transfer(dep, 10e6);
        sl.sweep(id);
        vm.expectRevert(Splitline.NothingToSweep.selector);
        sl.sweep(id);
        (,,,, uint256 total) = sl.getSplit(id);
        assertEq(total, 10e6);
    }

    function test_Deposit_RepeatedFundingAndSweepAccumulates() public {
        (uint256 id, address dep) = _create3();
        for (uint256 i = 1; i <= 3; ++i) {
            vm.prank(payer);
            usdc.transfer(dep, i * 1e6);
            sl.sweep(id);
        }
        (,,,, uint256 total) = sl.getSplit(id);
        assertEq(total, 6e6);
    }

    function test_Deposit_SameConfigDifferentNameGetsDifferentAddresses() public {
        (uint256 id1, address d1) = _create3();
        (uint256 id2, address d2) = sl.createSplit("split-2", _a3(alice, bob, carol), _b3(5000, 3000, 2000));
        assertTrue(id1 != id2);
        assertTrue(d1 != d2);
    }

    function test_Deposit_DifferentConfigSameCreatorNameDifferentAddress() public view {
        address a = sl.predictDepositAddress(address(this), "x", _a2(alice, bob), _b2(5000, 5000));
        address b = sl.predictDepositAddress(address(this), "x", _a2(alice, bob), _b2(5001, 4999));
        address c = sl.predictDepositAddress(address(this), "x", _a2(bob, alice), _b2(5000, 5000));
        assertTrue(a != b);
        assertTrue(a != c);
        assertTrue(b != c);
    }

    function test_Deposit_SweepingOneSplitDoesNotTouchAnother() public {
        (uint256 id1, address d1) = _create3();
        (uint256 id2, address d2) = sl.createSplit("split-2", _a3(alice, bob, carol), _b3(5000, 3000, 2000));
        usdc.mint(d1, 5e6);
        usdc.mint(d2, 7e6);
        sl.sweep(id1);
        assertEq(usdc.balanceOf(d2), 7e6);
        (,,,, uint256 t2) = sl.getSplit(id2);
        assertEq(t2, 0);
    }
}
