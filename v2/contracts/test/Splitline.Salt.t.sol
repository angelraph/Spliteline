// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SplitlineTestBase} from "./Splitline.Base.t.sol";
import {Splitline} from "../Splitline.sol";

/// @dev Salt = keccak256(abi.encode(creator, name, recipients, bps)); id is not part of it.
contract SplitlineSaltTest is SplitlineTestBase {
    function test_Salt_SameCreatorNameConfigTwiceReverts() public {
        address[] memory r = _a2(alice, bob);
        uint16[] memory b = _b2(5000, 5000);
        sl.createSplit("dup", r, b);
        vm.expectRevert(Splitline.SplitAlreadyExists.selector);
        sl.createSplit("dup", r, b);
        assertEq(sl.nextId(), 2, "failed duplicate does not consume an id");
    }

    function test_Salt_DuplicateRevertsForNonTestCreatorToo() public {
        address[] memory r = _a1(alice);
        uint16[] memory b = _b1(10_000);
        vm.startPrank(bob);
        sl.createSplit("", r, b);
        vm.expectRevert(Splitline.SplitAlreadyExists.selector);
        sl.createSplit("", r, b);
        vm.stopPrank();
    }

    function test_Salt_SameConfigDifferentNameSucceedsWithDifferentAddress() public {
        address[] memory r = _a2(alice, bob);
        uint16[] memory b = _b2(5000, 5000);
        (uint256 id1, address d1) = sl.createSplit("one", r, b);
        (uint256 id2, address d2) = sl.createSplit("two", r, b);
        assertEq(id2, id1 + 1);
        assertTrue(d1 != d2);
        assertEq(d1, sl.predictDepositAddress(address(this), "one", r, b));
        assertEq(d2, sl.predictDepositAddress(address(this), "two", r, b));
    }

    function test_Salt_SameConfigDifferentCreatorSucceedsWithDifferentAddress() public {
        address[] memory r = _a2(alice, bob);
        uint16[] memory b = _b2(5000, 5000);
        vm.prank(alice);
        (, address d1) = sl.createSplit("same", r, b);
        vm.prank(bob);
        (, address d2) = sl.createSplit("same", r, b);
        assertTrue(d1 != d2);
        assertEq(d1, sl.predictDepositAddress(alice, "same", r, b));
        assertEq(d2, sl.predictDepositAddress(bob, "same", r, b));
    }

    /// @dev Predict for (alice, name, config); bob creates other splits first (ids shift); alice's
    /// address and the pre-funded USDC are unaffected.
    function test_Salt_FrontRunResistance() public {
        address[] memory r = _a3(alice, bob, carol);
        uint16[] memory b = _b3(5000, 3000, 2000);
        address predicted = sl.predictDepositAddress(alice, "alice split", r, b);

        usdc.mint(predicted, 100e6);
        assertEq(usdc.balanceOf(predicted), 100e6);

        // bob creates several splits first, including the very same config under his own account
        vm.startPrank(bob);
        sl.createSplit("alice split", r, b);
        sl.createSplit("b1", _a1(bob), _b1(10_000));
        sl.createSplit("b2", _a2(alice, bob), _b2(1, 9999));
        sl.createSplit("b3", _a1(carol), _b1(10_000));
        vm.stopPrank();
        assertEq(sl.nextId(), 5);

        vm.prank(alice);
        (uint256 aliceId, address dep) = sl.createSplit("alice split", r, b);
        assertEq(aliceId, 5, "id shifted");
        assertEq(dep, predicted);
        assertEq(sl.depositAddressOf(aliceId), predicted);
        assertEq(usdc.balanceOf(predicted), 100e6, "funds still there");

        assertEq(sl.sweep(aliceId), 100e6);
        (,,,, uint256 total) = sl.getSplit(aliceId);
        assertEq(total, 100e6);
        assertEq(sl.owed(aliceId, alice), 50e6);
        assertEq(sl.owed(aliceId, bob), 30e6);
        assertEq(sl.owed(aliceId, carol), 20e6);
    }

    function test_Salt_IdIsNotPartOfSalt() public {
        address[] memory r = _a2(alice, bob);
        uint16[] memory b = _b2(5000, 5000);
        address predicted = sl.predictDepositAddress(carol, "n", r, b);
        // shift the id with unrelated splits
        sl.createSplit("f1", _a1(dave), _b1(10_000));
        sl.createSplit("f2", _a1(eve), _b1(10_000));
        assertEq(sl.predictDepositAddress(carol, "n", r, b), predicted, "prediction stable under id shifts");
        vm.prank(carol);
        (, address dep) = sl.createSplit("n", r, b);
        assertEq(dep, predicted);
    }

    function test_Salt_PredictionMatchesIndependentFormula() public {
        address[] memory r = _a3(alice, bob, carol);
        uint16[] memory b = _b3(5000, 3000, 2000);
        assertEq(sl.predictDepositAddress(dave, "formula", r, b), _independentPredict(dave, "formula", r, b));
        vm.prank(dave);
        (, address dep) = sl.createSplit("formula", r, b);
        assertEq(dep, _independentPredict(dave, "formula", r, b));
    }

    function test_Salt_DifferentCreatorOrNameOrConfigChangesPrediction() public view {
        address[] memory r = _a2(alice, bob);
        uint16[] memory b = _b2(5000, 5000);
        address base = sl.predictDepositAddress(alice, "n", r, b);
        assertTrue(base != sl.predictDepositAddress(bob, "n", r, b));
        assertTrue(base != sl.predictDepositAddress(alice, "m", r, b));
        assertTrue(base != sl.predictDepositAddress(alice, "n", r, _b2(4999, 5001)));
        assertTrue(base != sl.predictDepositAddress(alice, "n", _a2(bob, alice), b));
    }
}
