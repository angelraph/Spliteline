// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {SplitlineTestBase} from "./Splitline.Base.t.sol";
import {Splitline} from "../Splitline.sol";

/// @dev claim / claimTo / release best-effort sweep their own deposit clone before computing what is owed.
contract SplitlineAutoSweepTest is SplitlineTestBase {
    uint256 internal id;
    address internal dep;

    function setUp() public override {
        super.setUp();
        (id, dep) = _create3(); // alice 50%, bob 30%, carol 20%
    }

    // ------------------------------------------------------------ (1) direct transfer, no explicit sweep
    function test_AutoSweep_ClaimPaysShareOfDirectTransferEmitsSweptThenClaimed() public {
        _direct(dep, 1000e6);
        assertEq(_total(id), 0, "not credited before the claim");

        vm.expectEmit(true, false, false, true, address(sl));
        emit Splitline.Swept(id, 1000e6);
        vm.expectEmit(true, true, false, true, address(sl));
        emit Splitline.Claimed(id, alice, alice, 500e6);
        vm.prank(alice);
        sl.claim(id);

        assertEq(usdc.balanceOf(alice), 500e6);
        assertEq(_total(id), 1000e6, "totalReceived updated");
        assertEq(usdc.balanceOf(dep), 0, "clone drained");
        assertEq(usdc.balanceOf(address(sl)), 500e6);
        assertEq(sl.released(id, alice), 500e6);
    }

    function test_AutoSweep_SweptEmittedBeforeClaimedInLogOrder() public {
        _direct(dep, 1000e6);
        vm.recordLogs();
        vm.prank(alice);
        sl.claim(id);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        int256 sweptAt = -1;
        int256 claimedAt = -1;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != address(sl)) continue;
            if (logs[i].topics[0] == Splitline.Swept.selector) sweptAt = int256(i);
            if (logs[i].topics[0] == Splitline.Claimed.selector) claimedAt = int256(i);
        }
        assertGe(sweptAt, 0, "Swept emitted");
        assertGt(claimedAt, sweptAt, "Claimed after Swept");
    }

    function test_AutoSweep_ClaimToPaysShareOfDirectTransfer() public {
        _direct(dep, 1000e6);

        vm.expectEmit(true, false, false, true, address(sl));
        emit Splitline.Swept(id, 1000e6);
        vm.expectEmit(true, true, false, true, address(sl));
        emit Splitline.Claimed(id, bob, dave, 300e6);
        vm.prank(bob);
        sl.claimTo(id, dave);

        assertEq(usdc.balanceOf(dave), 300e6);
        assertEq(usdc.balanceOf(bob), 0);
        assertEq(_total(id), 1000e6);
        assertEq(usdc.balanceOf(dep), 0);
        assertEq(sl.released(id, bob), 300e6);
    }

    function test_AutoSweep_ThirdPartyReleasePaysShareOfDirectTransfer() public {
        _direct(dep, 1000e6);

        vm.expectEmit(true, false, false, true, address(sl));
        emit Splitline.Swept(id, 1000e6);
        vm.expectEmit(true, true, false, true, address(sl));
        emit Splitline.Claimed(id, carol, carol, 200e6);
        vm.prank(eve);
        sl.release(id, carol);

        assertEq(usdc.balanceOf(carol), 200e6);
        assertEq(usdc.balanceOf(eve), 0);
        assertEq(_total(id), 1000e6);
        assertEq(usdc.balanceOf(dep), 0);
    }

    function test_AutoSweep_CombinesWithPaidRevenue() public {
        _pay(id, 400e6);
        _direct(dep, 600e6);
        vm.prank(alice);
        sl.claim(id);
        assertEq(usdc.balanceOf(alice), 500e6, "50% of 400 paid + 600 direct");
        assertEq(_total(id), 1000e6);
    }

    function test_AutoSweep_PublicSweepAfterAutoSweepStillRevertsNothingToSweep() public {
        _direct(dep, 10e6);
        vm.prank(alice);
        sl.claim(id);
        vm.expectRevert(Splitline.NothingToSweep.selector);
        sl.sweep(id);
    }

    function test_AutoSweep_ExplicitSweepThenClaimEmitsNoSecondSwept() public {
        _direct(dep, 10e6);
        sl.sweep(id);
        vm.recordLogs();
        vm.prank(alice);
        sl.claim(id);
        (uint256 count,) = _swept(vm.getRecordedLogs(), 0);
        assertEq(count, 0);
        assertEq(usdc.balanceOf(alice), 5e6);
    }

    function test_AutoSweep_SecondDirectTransferSweptByLaterClaim() public {
        _direct(dep, 100e6);
        vm.prank(alice);
        sl.claim(id); // 50
        _direct(dep, 100e6);
        vm.prank(alice);
        sl.claim(id); // +50
        assertEq(usdc.balanceOf(alice), 100e6);
        assertEq(_total(id), 200e6);
        assertEq(sl.owed(id, bob), 60e6);
    }

    // ------------------------------------------------------------ (2) zero deposit balance still works
    function test_AutoSweep_ClaimWithEmptyCloneNoRevertNoSwept() public {
        _pay(id, 1000e6);
        assertEq(usdc.balanceOf(dep), 0);
        vm.recordLogs();
        vm.prank(alice);
        sl.claim(id);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        (uint256 swept,) = _swept(logs, 0);
        assertEq(swept, 0, "no Swept on zero balance");
        assertEq(_claimedCount(logs), 1);
        assertEq(usdc.balanceOf(alice), 500e6);
        assertEq(_total(id), 1000e6);
    }

    function test_AutoSweep_ClaimToWithEmptyCloneNoRevertNoSwept() public {
        _pay(id, 1000e6);
        vm.recordLogs();
        vm.prank(bob);
        sl.claimTo(id, dave);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        (uint256 swept,) = _swept(logs, 0);
        assertEq(swept, 0);
        assertEq(_claimedCount(logs), 1);
        assertEq(usdc.balanceOf(dave), 300e6);
    }

    function test_AutoSweep_ReleaseWithEmptyCloneNoRevertNoSwept() public {
        _pay(id, 1000e6);
        vm.recordLogs();
        vm.prank(eve);
        sl.release(id, carol);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        (uint256 swept,) = _swept(logs, 0);
        assertEq(swept, 0);
        assertEq(_claimedCount(logs), 1);
        assertEq(usdc.balanceOf(carol), 200e6);
    }

    // ------------------------------------------------------------ (3) nothing owed still reverts NothingOwed
    function test_AutoSweep_NothingOwedAndEmptyCloneStillReverts() public {
        vm.prank(alice);
        vm.expectRevert(Splitline.NothingOwed.selector);
        sl.claim(id);
        vm.prank(alice);
        vm.expectRevert(Splitline.NothingOwed.selector);
        sl.claimTo(id, dave);
        vm.expectRevert(Splitline.NothingOwed.selector);
        sl.release(id, alice);
    }

    function test_AutoSweep_NothingOwedAfterFullClaimWithEmptyCloneReverts() public {
        _direct(dep, 1000e6);
        vm.prank(alice);
        sl.claim(id);
        vm.prank(alice);
        vm.expectRevert(Splitline.NothingOwed.selector);
        sl.claim(id);
        vm.expectRevert(Splitline.NothingOwed.selector);
        sl.release(id, alice);
    }

    function test_AutoSweep_NothingOwedRevertRollsBackTheSweep() public {
        _direct(dep, 3); // bob floor(0.9) == 0, so claim reverts and the sweep is undone with it
        vm.prank(bob);
        vm.expectRevert(Splitline.NothingOwed.selector);
        sl.claim(id);
        assertEq(usdc.balanceOf(dep), 3, "funds still in clone");
        assertEq(_total(id), 0, "totalReceived unchanged");
        assertEq(sl.sweep(id), 3, "public sweep still credits them");
    }

    function test_AutoSweep_NotRecipientAndUnknownIdStillRevertBeforeSweep() public {
        _direct(dep, 100e6);
        vm.prank(eve);
        vm.expectRevert(Splitline.NotRecipient.selector);
        sl.claim(id);
        vm.expectRevert(Splitline.NotRecipient.selector);
        sl.release(id, eve);
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.release(99, alice);
        assertEq(usdc.balanceOf(dep), 100e6, "clone untouched");
        assertEq(_total(id), 0);
    }

    function test_AutoSweep_PublicSweepOnZeroStillRevertsNothingToSweep() public {
        vm.expectRevert(Splitline.NothingToSweep.selector);
        sl.sweep(id);
    }

    // ------------------------------------------------------------ (4) other recipients see the swept amount
    function test_AutoSweep_OtherRecipientsOwedReflectsSweptAmountAndTheyClaimExactly() public {
        _direct(dep, 1000e6);
        assertEq(sl.owed(id, bob), 0, "view does not know about the unswept balance");

        vm.prank(alice);
        sl.claim(id);

        assertEq(sl.owed(id, bob), 300e6);
        assertEq(sl.owed(id, carol), 200e6);
        assertEq(sl.owed(id, alice), 0);

        vm.recordLogs();
        vm.prank(bob);
        sl.claim(id);
        (uint256 swept,) = _swept(vm.getRecordedLogs(), 0);
        assertEq(swept, 0, "nothing left to sweep for the next claimer");
        sl.release(id, carol);

        assertEq(usdc.balanceOf(bob), 300e6);
        assertEq(usdc.balanceOf(carol), 200e6);
        assertEq(usdc.balanceOf(address(sl)), 0);
    }

    function test_AutoSweep_DustFromAutoSweptRevenueStaysBelowRecipientCount() public {
        _direct(dep, 7);
        sl.release(id, alice); // 3
        sl.release(id, bob); // 2
        sl.release(id, carol); // 1
        assertEq(usdc.balanceOf(alice) + usdc.balanceOf(bob) + usdc.balanceOf(carol), 6);
        assertEq(usdc.balanceOf(address(sl)), 1, "dust < 3 stays");
    }
}
