// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SplitlineTestBase} from "./Splitline.Base.t.sol";
import {Splitline} from "../Splitline.sol";

contract SplitlineNestedTest is SplitlineTestBase {
    address internal a = makeAddr("a");
    address internal b = makeAddr("b");
    address internal c = makeAddr("c");

    function _twoLevel() internal returns (uint256 childId, address childDep, uint256 parentId, address parentDep) {
        (childId, childDep) = _create(_a2(b, c), _b2(5000, 5000));
        (parentId, parentDep) = _create(_a2(a, childDep), _b2(6000, 4000));
    }

    function test_Nested_TwoLevelExactBalances() public {
        (uint256 childId, address childDep, uint256 parentId,) = _twoLevel();

        _pay(parentId, 1000e6);
        assertEq(sl.owed(parentId, a), 600e6);
        assertEq(sl.owed(parentId, childDep), 400e6);

        sl.release(parentId, a);
        sl.release(parentId, childDep);
        assertEq(usdc.balanceOf(a), 600e6);
        assertEq(usdc.balanceOf(childDep), 400e6);
        assertEq(usdc.balanceOf(address(sl)), 0);

        sl.sweep(childId);
        assertEq(usdc.balanceOf(childDep), 0);
        assertEq(usdc.balanceOf(address(sl)), 400e6);

        sl.release(childId, b);
        sl.release(childId, c);
        assertEq(usdc.balanceOf(b), 200e6);
        assertEq(usdc.balanceOf(c), 200e6);
        assertEq(usdc.balanceOf(address(sl)), 0);
    }

    function test_Nested_TwoLevelWithDustAccounting() public {
        (uint256 childId, address childDep, uint256 parentId,) = _twoLevel();
        uint256 amt = 1_000_003;
        _pay(parentId, amt);

        sl.release(parentId, a); // floor(600001.8) = 600001
        sl.release(parentId, childDep); // floor(400001.2) = 400001
        assertEq(usdc.balanceOf(a), 600_001);
        assertEq(usdc.balanceOf(childDep), 400_001);
        assertEq(usdc.balanceOf(address(sl)), 1, "parent dust");

        sl.sweep(childId);
        sl.release(childId, b); // floor(200000.5)
        sl.release(childId, c);
        assertEq(usdc.balanceOf(b), 200_000);
        assertEq(usdc.balanceOf(c), 200_000);
        assertEq(usdc.balanceOf(address(sl)), 2, "parent dust + child dust");

        // conservation: everything paid is either with a recipient or dust inside Splitline
        uint256 held = usdc.balanceOf(a) + usdc.balanceOf(b) + usdc.balanceOf(c) + usdc.balanceOf(address(sl));
        assertEq(held, amt);
    }

    function test_Nested_ReleaseIntoChildDoesNotAutoCredit() public {
        (uint256 childId, address childDep, uint256 parentId,) = _twoLevel();
        _pay(parentId, 1000e6);
        sl.release(parentId, childDep);

        (,,,, uint256 childTotal) = sl.getSplit(childId);
        assertEq(childTotal, 0, "child not credited until sweep");
        assertEq(sl.owed(childId, b), 0);
        assertEq(usdc.balanceOf(childDep), 400e6);

        sl.sweep(childId);
        (,,,, childTotal) = sl.getSplit(childId);
        assertEq(childTotal, 400e6);
        assertEq(sl.owed(childId, b), 200e6);
    }

    function test_Nested_ChildDepositHasNoWayToClaimItself() public {
        (, address childDep, uint256 parentId,) = _twoLevel();
        _pay(parentId, 1000e6);
        // the clone exposes only forward(), so it can never call claim; permissionless release is the route
        (bool ok,) = childDep.call(abi.encodeCall(Splitline.claim, (parentId)));
        assertFalse(ok);
        assertEq(usdc.balanceOf(childDep), 0);
        sl.release(parentId, childDep);
        assertEq(usdc.balanceOf(childDep), 400e6);
    }

    function test_Nested_ChildPaidDirectlyAndViaParentAggregates() public {
        (uint256 childId, address childDep, uint256 parentId,) = _twoLevel();
        _pay(childId, 100e6);
        _pay(parentId, 1000e6);
        sl.release(parentId, childDep);
        sl.sweep(childId);
        (,,,, uint256 total) = sl.getSplit(childId);
        assertEq(total, 500e6);
        assertEq(sl.owed(childId, b), 250e6);
        assertEq(sl.owed(childId, c), 250e6);
    }

    function test_Nested_ThreeLevelChain() public {
        address x = makeAddr("x");
        address y = makeAddr("y");
        address m = makeAddr("m");
        address n = makeAddr("n");

        (uint256 idC, address depC) = _create(_a2(x, y), _b2(5000, 5000));
        (uint256 idB, address depB) = _create(_a2(m, depC), _b2(7000, 3000));
        (uint256 idA,) = _create(_a2(n, depB), _b2(2000, 8000));

        _pay(idA, 10_000_000);
        sl.release(idA, n); // 2.0e6
        sl.release(idA, depB); // 8.0e6
        sl.sweep(idB);
        sl.release(idB, m); // 5.6e6
        sl.release(idB, depC); // 2.4e6
        sl.sweep(idC);
        sl.release(idC, x); // 1.2e6
        sl.release(idC, y); // 1.2e6

        assertEq(usdc.balanceOf(n), 2_000_000);
        assertEq(usdc.balanceOf(m), 5_600_000);
        assertEq(usdc.balanceOf(x), 1_200_000);
        assertEq(usdc.balanceOf(y), 1_200_000);
        assertEq(usdc.balanceOf(address(sl)), 0);
        assertEq(usdc.balanceOf(depB), 0);
        assertEq(usdc.balanceOf(depC), 0);
    }

    function test_Nested_ChildCreatedAfterParentViaPredictedAddress() public {
        // Parent (id 1) lists the predicted deposit address of a child that will be id 2.
        address[] memory cr = _a2(b, c);
        uint16[] memory cb = _b2(5000, 5000);
        address childPredicted = sl.predictDepositAddress(address(this), "split", cr, cb);

        (uint256 parentId,) = _create(_a2(a, childPredicted), _b2(6000, 4000));
        (uint256 childId, address childDep) = _create(cr, cb);
        assertEq(parentId, 1);
        assertEq(childId, 2);
        assertEq(childDep, childPredicted);

        _pay(parentId, 100e6);
        sl.release(parentId, childPredicted);
        sl.sweep(childId);
        sl.release(childId, b);
        assertEq(usdc.balanceOf(b), 20e6);
    }

    // ------------------------------------------------------------ cycles
    function test_Cycle_SplitCannotListOwnDeposit() public {
        address[] memory r0 = _a2(alice, bob);
        uint16[] memory w = _b2(5000, 5000);
        address p0 = sl.predictDepositAddress(address(this), "x", r0, w);
        // listing p0 changes the config, hence the address: it can never equal the split's own deposit
        address p1 = sl.predictDepositAddress(address(this), "x", _a2(alice, p0), w);
        assertTrue(p1 != p0);
        (, address dep) = sl.createSplit("x", _a2(alice, p0), w);
        assertEq(dep, p1);
        assertEq(sl.bpsOf(1, dep), 0);
    }

    function test_Cycle_TwoCycleNotConstructible() public {
        uint16[] memory w = _b2(5000, 5000);

        // A commits to a guess G for the "future B" deposit address and is created successfully.
        address guessB = makeAddr("guessB");
        address[] memory aRecipients = _a2(alice, guessB);
        (uint256 idA, address depA) = sl.createSplit("A", aRecipients, w);
        assertEq(idA, 1);

        // B lists A's real deposit address. B's address depends on depA, which depends on guessB.
        address[] memory bRecipients = _a2(bob, depA);
        address predB = sl.predictDepositAddress(address(this), "B", bRecipients, w);
        assertTrue(predB != guessB, "B's real address differs from the one A committed to");

        // Re-creating A' to point at predB moves A's address, so B's address moves again: no fixed point.
        address predA2 = sl.predictDepositAddress(address(this), "A", _a2(alice, predB), w);
        assertTrue(predA2 != depA);
        address predB2 = sl.predictDepositAddress(address(this), "B", _a2(bob, predA2), w);
        assertTrue(predB2 != predB);

        // B is created; A's committed target (guessB) is not B's deposit => no cycle.
        (uint256 idB, address depB) = sl.createSplit("B", bRecipients, w);
        assertEq(idB, 2);
        assertEq(depB, predB);
        assertEq(sl.bpsOf(idA, depB), 0, "A does not list B");
        assertEq(sl.bpsOf(idB, depA), 5000, "B lists A");
    }

    /// @dev A lists B's predicted address and is created; B's real config (listing A) cannot land there.
    function test_Cycle_AListingPredictedBCanBeCreatedButBDiffers() public {
        uint16[] memory w = _b2(5000, 5000);
        // Step 1: guess B's address for the config "B lists a placeholder"; A commits to it.
        address[] memory bGuessRecipients = _a2(bob, makeAddr("placeholder"));
        address predB = sl.predictDepositAddress(address(this), "B", bGuessRecipients, w);
        (, address depA) = sl.createSplit("A", _a2(alice, predB), w);

        // Step 2: B actually lists A's deposit address.
        address[] memory bRecipients = _a2(bob, depA);
        address predBReal = sl.predictDepositAddress(address(this), "B", bRecipients, w);
        assertTrue(predBReal != predB, "B listing A cannot reach the address A committed to");

        (, address depB) = sl.createSplit("B", bRecipients, w);
        assertEq(depB, predBReal);
        assertTrue(depB != predB);
        assertEq(sl.bpsOf(1, depB), 0, "A does not list the real B");
        assertEq(sl.bpsOf(1, predB), 5000, "A lists the (never-created) predicted B");
    }
}
