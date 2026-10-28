// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SplitlineTestBase} from "./Splitline.Base.t.sol";
import {Splitline} from "../Splitline.sol";

contract SplitlineCreateTest is SplitlineTestBase {
    // ------------------------------------------------------------ happy paths
    function test_Create_NextIdStartsAtOneAndIncrements() public {
        assertEq(sl.nextId(), 1);
        (uint256 id1,) = _create3();
        assertEq(id1, 1);
        assertEq(sl.nextId(), 2);
        (uint256 id2,) = _create(_a1(alice), _b1(10_000));
        assertEq(id2, 2);
        (uint256 id3,) = _create(_a1(bob), _b1(10_000));
        assertEq(id3, 3);
        assertEq(sl.nextId(), 4);
    }

    function test_Create_AnyoneCanCreate() public {
        vm.prank(eve);
        (uint256 id, address dep) = sl.createSplit("by eve", _a2(alice, bob), _b2(1, 9999));
        assertEq(id, 1);
        assertEq(sl.depositAddressOf(1), dep);
    }

    function test_Create_EmitsSplitCreatedWithDepositAddress() public {
        address[] memory r = _a3(alice, bob, carol);
        uint16[] memory b = _b3(5000, 3000, 2000);
        address expected = _independentPredict(eve, "my split", r, b);

        vm.expectEmit(true, true, true, true, address(sl));
        emit Splitline.SplitCreated(1, eve, expected, "my split", r, b);
        vm.prank(eve);
        (uint256 id, address dep) = sl.createSplit("my split", r, b);
        assertEq(id, 1);
        assertEq(dep, expected);
        assertGt(dep.code.length, 0, "clone deployed");
    }

    function test_Create_StoresConfiguration() public {
        (uint256 id, address dep) = _create3();
        (string memory name, address[] memory r, uint16[] memory b, address d, uint256 total) = sl.getSplit(id);
        assertEq(name, "split");
        assertEq(r.length, 3);
        assertEq(r[0], alice);
        assertEq(r[1], bob);
        assertEq(r[2], carol);
        assertEq(b[0], 5000);
        assertEq(b[1], 3000);
        assertEq(b[2], 2000);
        assertEq(d, dep);
        assertEq(total, 0);
    }

    function test_Create_NameOfExactly64BytesOk() public {
        string memory name = "0123456789012345678901234567890123456789012345678901234567890123";
        assertEq(bytes(name).length, 64);
        (uint256 id,) = sl.createSplit(name, _a1(alice), _b1(10_000));
        (string memory stored,,,,) = sl.getSplit(id);
        assertEq(stored, name);
    }

    function test_Create_EmptyNameOk() public {
        (uint256 id,) = sl.createSplit("", _a1(alice), _b1(10_000));
        (string memory stored,,,,) = sl.getSplit(id);
        assertEq(stored, "");
    }

    function test_Create_TwentyRecipientsOk() public {
        address[] memory r = _recipients(20, 0x1000);
        (uint256 id,) = sl.createSplit("max", r, _uniform(20, 500));
        (, address[] memory stored,,,) = sl.getSplit(id);
        assertEq(stored.length, 20);
    }

    function test_Create_SingleRecipientFullWeightOk() public {
        (uint256 id,) = _create(_a1(alice), _b1(10_000));
        assertEq(sl.bpsOf(id, alice), 10_000);
    }

    function test_Create_OneBpsRecipientOk() public {
        (uint256 id,) = _create(_a2(alice, bob), _b2(1, 9999));
        assertEq(sl.bpsOf(id, alice), 1);
        assertEq(sl.bpsOf(id, bob), 9999);
    }

    // ------------------------------------------------------------ reverts
    function test_Revert_NameTooLong() public {
        string memory name = "01234567890123456789012345678901234567890123456789012345678901234";
        assertEq(bytes(name).length, 65);
        address[] memory r = _a1(alice);
        uint16[] memory b = _b1(10_000);
        vm.expectRevert(Splitline.NameTooLong.selector);
        sl.createSplit(name, r, b);
    }

    function test_Revert_ZeroRecipients() public {
        address[] memory r = new address[](0);
        uint16[] memory b = new uint16[](0);
        vm.expectRevert(Splitline.InvalidRecipientCount.selector);
        sl.createSplit("x", r, b);
    }

    function test_Revert_TwentyOneRecipients() public {
        address[] memory r = _recipients(21, 0x1000);
        uint16[] memory b = _uniform(21, 400);
        vm.expectRevert(Splitline.InvalidRecipientCount.selector);
        sl.createSplit("x", r, b);
    }

    function test_Revert_LengthMismatch_MoreRecipients() public {
        address[] memory r = _a2(alice, bob);
        uint16[] memory b = _b1(10_000);
        vm.expectRevert(Splitline.LengthMismatch.selector);
        sl.createSplit("x", r, b);
    }

    function test_Revert_LengthMismatch_MoreWeights() public {
        address[] memory r = _a1(alice);
        uint16[] memory b = _b2(5000, 5000);
        vm.expectRevert(Splitline.LengthMismatch.selector);
        sl.createSplit("x", r, b);
    }

    function test_Revert_ZeroBps() public {
        address[] memory r = _a2(alice, bob);
        uint16[] memory b = _b2(0, 10_000);
        vm.expectRevert(Splitline.InvalidBps.selector);
        sl.createSplit("x", r, b);
    }

    function test_Revert_BpsSumTooLow() public {
        address[] memory r = _a2(alice, bob);
        uint16[] memory b = _b2(4000, 5999);
        vm.expectRevert(Splitline.InvalidBps.selector);
        sl.createSplit("x", r, b);
    }

    function test_Revert_BpsSumTooHigh() public {
        address[] memory r = _a2(alice, bob);
        uint16[] memory b = _b2(5000, 5001);
        vm.expectRevert(Splitline.InvalidBps.selector);
        sl.createSplit("x", r, b);
    }

    function test_Revert_SingleRecipientNot10000() public {
        address[] memory r = _a1(alice);
        uint16[] memory b = _b1(9999);
        vm.expectRevert(Splitline.InvalidBps.selector);
        sl.createSplit("x", r, b);
    }

    function test_Revert_ZeroAddressRecipient() public {
        address[] memory r = _a2(alice, address(0));
        uint16[] memory b = _b2(5000, 5000);
        vm.expectRevert(Splitline.InvalidRecipient.selector);
        sl.createSplit("x", r, b);
    }

    function test_Revert_DuplicateRecipient_Adjacent() public {
        address[] memory r = _a2(alice, alice);
        uint16[] memory b = _b2(5000, 5000);
        vm.expectRevert(Splitline.DuplicateRecipient.selector);
        sl.createSplit("x", r, b);
    }

    function test_Revert_DuplicateRecipient_NonAdjacent() public {
        address[] memory r = _a3(alice, bob, alice);
        uint16[] memory b = _b3(3000, 3000, 4000);
        vm.expectRevert(Splitline.DuplicateRecipient.selector);
        sl.createSplit("x", r, b);
    }

    function test_Revert_RecipientIsSplitline() public {
        address[] memory r = _a2(alice, address(sl));
        uint16[] memory b = _b2(5000, 5000);
        vm.expectRevert(Splitline.InvalidRecipient.selector);
        sl.createSplit("x", r, b);
    }

    function test_Revert_RecipientIsDepositImplementation() public {
        address impl = sl.DEPOSIT_IMPLEMENTATION();
        address[] memory r = _a2(alice, impl);
        uint16[] memory b = _b2(5000, 5000);
        vm.expectRevert(Splitline.InvalidRecipient.selector);
        sl.createSplit("x", r, b);
    }

    function test_Revert_RecipientIsUSDC() public {
        address[] memory r = _a2(alice, USDC_ADDR);
        uint16[] memory b = _b2(5000, 5000);
        vm.expectRevert(Splitline.InvalidRecipient.selector);
        sl.createSplit("x", r, b);
    }

    function test_Revert_InvalidRecipientBeatsBpsSum() public {
        // zero address with a bad sum: the per-recipient check fires inside the loop first
        address[] memory r = _a2(address(0), alice);
        uint16[] memory b = _b2(1, 1);
        vm.expectRevert(Splitline.InvalidRecipient.selector);
        sl.createSplit("x", r, b);
    }

    function test_Revert_FailedCreateDoesNotConsumeId() public {
        address[] memory r = _a1(alice);
        uint16[] memory b = _b1(1);
        vm.expectRevert(Splitline.InvalidBps.selector);
        sl.createSplit("x", r, b);
        assertEq(sl.nextId(), 1);
        (uint256 id,) = _create3();
        assertEq(id, 1);
    }

    /// @dev The `recipient == depositAddress` branch needs a hash fixed point (the address commits to
    /// the recipient list), so it is not constructible. Demonstrate: listing a split's would-be
    /// address as a recipient moves the address, so the listed value is never the split's own deposit.
    function test_OwnDepositAddressCannotBeListed() public {
        address[] memory r0 = _a2(alice, bob);
        uint16[] memory b = _b2(5000, 5000);
        address p0 = sl.predictDepositAddress(address(this), "x", r0, b);

        address[] memory r1 = _a2(alice, p0);
        address p1 = sl.predictDepositAddress(address(this), "x", r1, b);
        assertTrue(p1 != p0, "listing p0 moves the address");

        (, address dep) = sl.createSplit("x", r1, b);
        assertEq(dep, p1);
        assertTrue(dep != p0);
        assertEq(sl.bpsOf(1, dep), 0, "own deposit is not a recipient");
    }
}
