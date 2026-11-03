// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {SplitlineTestBase} from "./Splitline.Base.t.sol";
import {Splitline} from "../Splitline.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @dev Auto-sweep behaviour with a blocklisted deposit clone, and nesting driven only by release/claim.
contract SplitlineAutoSweepNestedTest is SplitlineTestBase {
    address internal a = makeAddr("a");
    address internal b = makeAddr("b");
    address internal c = makeAddr("c");

    // ------------------------------------------------------------ (5) blocklisted deposit clone
    function test_AutoSweepBlocklist_PayoutsProceedOnCreditedRevenueAndSweepStillReverts() public {
        (uint256 id, address dep) = _create3();
        _direct(dep, 100e6); // stranded in the clone
        usdc.setBlocked(dep, true);
        _pay(id, 1000e6); // credited via pay

        vm.recordLogs();
        vm.prank(alice);
        sl.claim(id);
        vm.prank(bob);
        sl.claimTo(id, dave);
        sl.release(id, carol);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        (uint256 swept,) = _swept(logs, 0);
        assertEq(swept, 0, "failed sweeps emit nothing");
        assertEq(_claimedCount(logs), 3);
        assertEq(usdc.balanceOf(alice), 500e6);
        assertEq(usdc.balanceOf(dave), 300e6);
        assertEq(usdc.balanceOf(carol), 200e6);
        assertEq(usdc.balanceOf(address(sl)), 0);
        assertEq(usdc.balanceOf(dep), 100e6, "stranded funds untouched");
        assertEq(_total(id), 1000e6, "totalReceived excludes stranded funds");

        // public sweep keeps propagating the failure, with no state change
        vm.expectRevert(abi.encodeWithSelector(MockUSDC.Blocked.selector, dep));
        sl.sweep(id);
        assertEq(_total(id), 1000e6);
    }

    function test_AutoSweepBlocklist_UnblockThenClaimAutoSweepsStrandedFunds() public {
        (uint256 id, address dep) = _create3();
        _direct(dep, 100e6);
        usdc.setBlocked(dep, true);
        _pay(id, 1000e6);

        vm.prank(alice);
        sl.claim(id); // 500 of the credited 1000; stranded clone swallowed
        assertEq(_total(id), 1000e6);

        usdc.setBlocked(dep, false);
        vm.expectEmit(true, false, false, true, address(sl));
        emit Splitline.Swept(id, 100e6);
        vm.expectEmit(true, true, false, true, address(sl));
        emit Splitline.Claimed(id, alice, alice, 50e6);
        vm.prank(alice);
        sl.claim(id);

        assertEq(usdc.balanceOf(alice), 550e6);
        assertEq(usdc.balanceOf(dep), 0);
        assertEq(_total(id), 1100e6);
        assertEq(sl.owed(id, bob), 330e6);
        assertEq(sl.owed(id, carol), 220e6);

        sl.release(id, bob);
        sl.release(id, carol);
        assertEq(usdc.balanceOf(bob), 330e6);
        assertEq(usdc.balanceOf(carol), 220e6);
        assertEq(usdc.balanceOf(address(sl)), 0);
    }

    function test_AutoSweepBlocklist_NothingOwedStillRevertsNothingOwedNotBlocked() public {
        (uint256 id, address dep) = _create3();
        _direct(dep, 100e6);
        usdc.setBlocked(dep, true);
        vm.prank(alice);
        vm.expectRevert(Splitline.NothingOwed.selector);
        sl.claim(id);
        vm.expectRevert(Splitline.NothingOwed.selector);
        sl.release(id, bob);
    }

    function test_AutoSweepBlocklist_OtherSplitsAutoSweepUnaffected() public {
        (uint256 id1, address dep1) = _create3();
        (uint256 id2, address dep2) = sl.createSplit("two", _a2(alice, bob), _b2(5000, 5000));
        _direct(dep1, 10e6);
        _direct(dep2, 70e6);
        usdc.setBlocked(dep1, true);

        vm.prank(alice);
        vm.expectRevert(Splitline.NothingOwed.selector); // split 1: blocked clone, nothing credited
        sl.claim(id1);

        vm.prank(alice);
        sl.claim(id2);
        assertEq(usdc.balanceOf(alice), 35e6);
        assertEq(usdc.balanceOf(dep2), 0);
    }

    // ------------------------------------------------------------ (6) nesting via release/claim only
    function _twoLevel() internal returns (uint256 childId, address childDep, uint256 parentId, address parentDep) {
        (childId, childDep) = _create(_a2(b, c), _b2(5000, 5000));
        (parentId, parentDep) = _create(_a2(a, childDep), _b2(6000, 4000));
    }

    function test_AutoSweepNested_ReleaseParentThenChildRecipientsClaimWithoutSweep() public {
        (uint256 childId, address childDep, uint256 parentId,) = _twoLevel();
        _pay(parentId, 1000e6);

        sl.release(parentId, a);
        sl.release(parentId, childDep);
        assertEq(usdc.balanceOf(a), 600e6);
        assertEq(usdc.balanceOf(childDep), 400e6);
        assertEq(_total(childId), 0, "child not credited yet");

        vm.expectEmit(true, false, false, true, address(sl));
        emit Splitline.Swept(childId, 400e6);
        vm.expectEmit(true, true, false, true, address(sl));
        emit Splitline.Claimed(childId, b, b, 200e6);
        vm.prank(b);
        sl.claim(childId);

        vm.prank(c);
        sl.claim(childId);

        assertEq(usdc.balanceOf(b), 200e6);
        assertEq(usdc.balanceOf(c), 200e6);
        assertEq(usdc.balanceOf(childDep), 0);
        assertEq(usdc.balanceOf(address(sl)), 0);
        assertEq(_total(childId), 400e6);
    }

    function test_AutoSweepNested_ThirdPartyReleaseOnChildPaysBoth() public {
        (uint256 childId, address childDep, uint256 parentId,) = _twoLevel();
        _pay(parentId, 1000e6);
        sl.release(parentId, childDep);

        vm.prank(eve);
        sl.release(childId, b);
        sl.release(childId, c);
        assertEq(usdc.balanceOf(b), 200e6);
        assertEq(usdc.balanceOf(c), 200e6);
        assertEq(usdc.balanceOf(address(sl)), 600e6, "only a's unreleased parent share remains");
    }

    function test_AutoSweepNested_ChildSweptByClaimToThenSiblingExactShare() public {
        (uint256 childId, address childDep, uint256 parentId,) = _twoLevel();
        _pay(parentId, 1_000_003);
        sl.release(parentId, childDep); // floor(400001.2) = 400001

        vm.prank(b);
        sl.claimTo(childId, dave); // floor(200000.5) = 200000
        assertEq(usdc.balanceOf(dave), 200_000);
        assertEq(sl.owed(childId, c), 200_000, "sibling's owed reflects the auto-swept amount");
        vm.prank(c);
        sl.claim(childId);
        assertEq(usdc.balanceOf(c), 200_000);
        sl.release(parentId, a); // floor(600001.8) = 600001
        assertEq(usdc.balanceOf(a), 600_001);
        assertEq(usdc.balanceOf(address(sl)), 1 /*parent dust*/ + 1 /*child dust*/);
    }

    function test_AutoSweepNested_ChildDirectTransferPlusParentRoutedFundsSweptTogether() public {
        (uint256 childId, address childDep, uint256 parentId,) = _twoLevel();
        _pay(parentId, 1000e6);
        sl.release(parentId, childDep); // 400
        _direct(childDep, 100e6);

        vm.prank(b);
        sl.claim(childId);
        assertEq(usdc.balanceOf(b), 250e6);
        assertEq(_total(childId), 500e6);
        vm.prank(c);
        sl.claim(childId);
        assertEq(usdc.balanceOf(c), 250e6);
    }

    function test_AutoSweepNested_ThreeLevelChainDrivenOnlyByReleaseAndClaim() public {
        address x = makeAddr("x");
        address y = makeAddr("y");
        address m = makeAddr("m");
        address n = makeAddr("n");

        (uint256 idC, address depC) = _create(_a2(x, y), _b2(5000, 5000));
        (uint256 idB, address depB) = _create(_a2(m, depC), _b2(7000, 3000));
        (uint256 idA,) = _create(_a2(n, depB), _b2(2000, 8000));

        _pay(idA, 10_000_000);
        sl.release(idA, n); // 2.0e6
        sl.release(idA, depB); // 8.0e6 into B's clone
        vm.prank(m);
        sl.claim(idB); // auto-sweeps B's clone, pays 5.6e6
        sl.release(idB, depC); // 2.4e6 into C's clone
        vm.prank(x);
        sl.claim(idC); // auto-sweeps C's clone, pays 1.2e6
        sl.release(idC, y); // 1.2e6

        assertEq(usdc.balanceOf(n), 2_000_000);
        assertEq(usdc.balanceOf(m), 5_600_000);
        assertEq(usdc.balanceOf(x), 1_200_000);
        assertEq(usdc.balanceOf(y), 1_200_000);
        assertEq(usdc.balanceOf(address(sl)), 0);
        assertEq(usdc.balanceOf(depB), 0);
        assertEq(usdc.balanceOf(depC), 0);
        assertEq(_total(idB), 8_000_000);
        assertEq(_total(idC), 2_400_000);
    }

    function test_AutoSweepNested_DirectTransferToParentDepositPushedDownWithReleaseAndClaimOnly() public {
        (uint256 childId, address childDep, uint256 parentId, address parentDep) = _twoLevel();
        _direct(parentDep, 1000e6);
        assertEq(_total(parentId), 0);

        sl.release(parentId, childDep); // auto-sweeps the parent's clone first, then pays 400 into childDep
        assertEq(_total(parentId), 1000e6);
        assertEq(usdc.balanceOf(parentDep), 0);
        assertEq(usdc.balanceOf(childDep), 400e6);

        vm.prank(a);
        sl.claim(parentId);
        assertEq(usdc.balanceOf(a), 600e6);

        vm.prank(b);
        sl.claim(childId);
        vm.prank(c);
        sl.claim(childId);
        assertEq(usdc.balanceOf(b), 200e6);
        assertEq(usdc.balanceOf(c), 200e6);
        assertEq(usdc.balanceOf(address(sl)), 0);
        assertEq(usdc.balanceOf(childDep), 0);
    }

    function test_AutoSweepNested_ThreeLevelDirectTransferToTopPushedAllTheWayDown() public {
        address x = makeAddr("x");
        address y = makeAddr("y");
        address m = makeAddr("m");
        address n = makeAddr("n");
        (uint256 idC, address depC) = _create(_a2(x, y), _b2(5000, 5000));
        (uint256 idB, address depB) = _create(_a2(m, depC), _b2(7000, 3000));
        (uint256 idA, address depA) = _create(_a2(n, depB), _b2(2000, 8000));

        _direct(depA, 10_000_000);
        sl.release(idA, depB); // sweeps A, pays 8e6 into depB
        sl.release(idB, depC); // sweeps B, pays 2.4e6 into depC
        sl.release(idC, x);
        sl.release(idC, y); // sweeps C
        sl.release(idB, m);
        sl.release(idA, n);

        assertEq(usdc.balanceOf(n), 2_000_000);
        assertEq(usdc.balanceOf(m), 5_600_000);
        assertEq(usdc.balanceOf(x), 1_200_000);
        assertEq(usdc.balanceOf(y), 1_200_000);
        assertEq(usdc.balanceOf(address(sl)), 0);
        assertEq(usdc.balanceOf(depA) + usdc.balanceOf(depB) + usdc.balanceOf(depC), 0);
    }
}
