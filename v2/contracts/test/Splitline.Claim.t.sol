// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SplitlineTestBase} from "./Splitline.Base.t.sol";
import {Splitline} from "../Splitline.sol";

contract SplitlineClaimTest is SplitlineTestBase {
    uint256 internal id;
    address internal dep;

    function setUp() public override {
        super.setUp();
        (id, dep) = _create3(); // alice 50%, bob 30%, carol 20%
    }

    // ------------------------------------------------------------ claim
    function test_Claim_PaysCallerAndEmits() public {
        _pay(id, 1000e6);
        vm.expectEmit(true, true, false, true, address(sl));
        emit Splitline.Claimed(id, alice, alice, 500e6);
        vm.prank(alice);
        sl.claim(id);

        assertEq(usdc.balanceOf(alice), 500e6);
        assertEq(sl.released(id, alice), 500e6);
        assertEq(sl.owed(id, alice), 0);
        assertEq(usdc.balanceOf(address(sl)), 500e6);
        // others untouched
        assertEq(sl.owed(id, bob), 300e6);
        assertEq(sl.owed(id, carol), 200e6);
    }

    function test_Claim_AllRecipientsDrainExactly() public {
        _pay(id, 1000e6);
        vm.prank(alice);
        sl.claim(id);
        vm.prank(bob);
        sl.claim(id);
        vm.prank(carol);
        sl.claim(id);
        assertEq(usdc.balanceOf(address(sl)), 0);
        assertEq(usdc.balanceOf(bob), 300e6);
        assertEq(usdc.balanceOf(carol), 200e6);
    }

    function test_Claim_RepeatedClaimPaysOnlyDelta() public {
        _pay(id, 1000e6);
        vm.prank(alice);
        sl.claim(id);
        assertEq(usdc.balanceOf(alice), 500e6);

        vm.prank(alice);
        vm.expectRevert(Splitline.NothingOwed.selector);
        sl.claim(id);

        _pay(id, 500e6); // alice share of new revenue: 250e6
        assertEq(sl.owed(id, alice), 250e6);
        vm.expectEmit(true, true, false, true, address(sl));
        emit Splitline.Claimed(id, alice, alice, 250e6);
        vm.prank(alice);
        sl.claim(id);
        assertEq(usdc.balanceOf(alice), 750e6);
        assertEq(sl.released(id, alice), 750e6);
    }

    function test_Revert_Claim_NotRecipient() public {
        _pay(id, 1000e6);
        vm.prank(eve);
        vm.expectRevert(Splitline.NotRecipient.selector);
        sl.claim(id);
    }

    function test_Revert_Claim_NothingOwedBeforeAnyPayment() public {
        vm.prank(alice);
        vm.expectRevert(Splitline.NothingOwed.selector);
        sl.claim(id);
    }

    function test_Revert_Claim_NothingOwedWhenFloorIsZero() public {
        _pay(id, 3); // alice floor(1.5)=1, bob floor(0.9)=0, carol floor(0.6)=0
        vm.prank(bob);
        vm.expectRevert(Splitline.NothingOwed.selector);
        sl.claim(id);
        vm.prank(carol);
        vm.expectRevert(Splitline.NothingOwed.selector);
        sl.claim(id);
        vm.prank(alice);
        sl.claim(id);
        assertEq(usdc.balanceOf(alice), 1);
        assertEq(usdc.balanceOf(address(sl)), 2, "dust stays");
    }

    function test_Revert_Claim_UnknownId() public {
        uint256 next = sl.nextId();
        vm.prank(alice);
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.claim(next);
        vm.prank(alice);
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.claim(0);
    }

    // ------------------------------------------------------------ claimTo
    function test_ClaimTo_PaysDestinationCreditsRecipient() public {
        _pay(id, 1000e6);
        vm.expectEmit(true, true, false, true, address(sl));
        emit Splitline.Claimed(id, bob, dave, 300e6);
        vm.prank(bob);
        sl.claimTo(id, dave);

        assertEq(usdc.balanceOf(dave), 300e6);
        assertEq(usdc.balanceOf(bob), 0);
        assertEq(sl.released(id, bob), 300e6);
        assertEq(sl.owed(id, bob), 0);
        assertEq(sl.released(id, dave), 0);
    }

    function test_Revert_ClaimTo_ZeroDestination() public {
        _pay(id, 1000e6);
        vm.prank(alice);
        vm.expectRevert(Splitline.InvalidDestination.selector);
        sl.claimTo(id, address(0));
    }

    function test_Revert_ClaimTo_SplitlineDestination() public {
        _pay(id, 1000e6);
        address self = address(sl);
        vm.prank(alice);
        vm.expectRevert(Splitline.InvalidDestination.selector);
        sl.claimTo(id, self);
    }

    function test_Revert_ClaimTo_NotRecipientCheckedBeforeDestination() public {
        _pay(id, 1000e6);
        vm.prank(eve);
        vm.expectRevert(Splitline.NotRecipient.selector);
        sl.claimTo(id, address(0));
        vm.prank(eve);
        vm.expectRevert(Splitline.NotRecipient.selector);
        sl.claimTo(id, dave);
    }

    function test_Revert_ClaimTo_NothingOwed() public {
        vm.prank(alice);
        vm.expectRevert(Splitline.NothingOwed.selector);
        sl.claimTo(id, dave);
    }

    function test_Revert_ClaimTo_UnknownId() public {
        uint256 next = sl.nextId();
        vm.prank(alice);
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.claimTo(next, dave);
        vm.prank(alice);
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.claimTo(0, dave);
    }

    function test_ClaimTo_ThenClaimDeltaOnlyPaysNewRevenue() public {
        _pay(id, 1000e6);
        vm.prank(alice);
        sl.claimTo(id, dave);
        _pay(id, 200e6);
        vm.prank(alice);
        sl.claim(id);
        assertEq(usdc.balanceOf(dave), 500e6);
        assertEq(usdc.balanceOf(alice), 100e6);
        assertEq(sl.released(id, alice), 600e6);
    }

    // ------------------------------------------------------------ release
    function test_Release_ThirdPartyPaysRecipientOwnAddress() public {
        _pay(id, 1000e6);
        vm.expectEmit(true, true, false, true, address(sl));
        emit Splitline.Claimed(id, carol, carol, 200e6);
        vm.prank(eve);
        sl.release(id, carol);

        assertEq(usdc.balanceOf(carol), 200e6);
        assertEq(usdc.balanceOf(eve), 0);
        assertEq(sl.released(id, carol), 200e6);
        assertEq(sl.released(id, eve), 0);
    }

    function test_Release_RecipientCanReleaseSelf() public {
        _pay(id, 1000e6);
        vm.prank(alice);
        sl.release(id, alice);
        assertEq(usdc.balanceOf(alice), 500e6);
    }

    function test_Revert_Release_NotRecipient() public {
        _pay(id, 1000e6);
        vm.expectRevert(Splitline.NotRecipient.selector);
        sl.release(id, eve);
        vm.expectRevert(Splitline.NotRecipient.selector);
        sl.release(id, address(0));
    }

    function test_Revert_Release_NothingOwed() public {
        vm.expectRevert(Splitline.NothingOwed.selector);
        sl.release(id, alice);
        _pay(id, 1000e6);
        sl.release(id, alice);
        vm.expectRevert(Splitline.NothingOwed.selector);
        sl.release(id, alice);
    }

    function test_Revert_Release_UnknownId() public {
        uint256 next = sl.nextId();
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.release(next, alice);
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.release(0, alice);
    }

    // ------------------------------------------------------------ views
    function test_View_GetSplitContents() public {
        _pay(id, 77e6);
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
        assertEq(total, 77e6);
    }

    function test_View_OwedForNonRecipientIsZero() public {
        _pay(id, 1000e6);
        assertEq(sl.owed(id, eve), 0);
        assertEq(sl.owed(id, address(0)), 0);
        assertEq(sl.owed(id, dep), 0);
    }

    function test_View_OwedReflectsFloorRounding() public {
        _pay(id, 7);
        assertEq(sl.owed(id, alice), 3); // 3.5
        assertEq(sl.owed(id, bob), 2); // 2.1
        assertEq(sl.owed(id, carol), 1); // 1.4
    }

    function test_View_DepositAddressOfAndPredict() public view {
        assertEq(sl.depositAddressOf(id), dep);
        address[] memory r = _a3(alice, bob, carol);
        uint16[] memory b = _b3(5000, 3000, 2000);
        assertEq(sl.predictDepositAddress(address(this), "split", r, b), dep);
    }

    function test_View_BpsOf() public view {
        assertEq(sl.bpsOf(id, alice), 5000);
        assertEq(sl.bpsOf(id, bob), 3000);
        assertEq(sl.bpsOf(id, carol), 2000);
        assertEq(sl.bpsOf(id, eve), 0);
    }

    function test_View_Released() public {
        assertEq(sl.released(id, alice), 0);
        _pay(id, 100e6);
        sl.release(id, alice);
        assertEq(sl.released(id, alice), 50e6);
        assertEq(sl.released(id, bob), 0);
        assertEq(sl.released(id, eve), 0);
    }

    function test_View_PredictDoesNotRequireExistence() public view {
        address[] memory r = _a1(dave);
        uint16[] memory b = _b1(10_000);
        // arbitrary prospective creator/name, no revert
        assertTrue(sl.predictDepositAddress(address(12345), "never created", r, b) != address(0));
    }

    function test_Revert_Views_UnknownId() public {
        uint256 next = sl.nextId();
        uint256[2] memory bad = [uint256(0), next];
        for (uint256 i; i < 2; ++i) {
            uint256 x = bad[i];
            vm.expectRevert(Splitline.SplitNotFound.selector);
            sl.getSplit(x);
            vm.expectRevert(Splitline.SplitNotFound.selector);
            sl.owed(x, alice);
            vm.expectRevert(Splitline.SplitNotFound.selector);
            sl.released(x, alice);
            vm.expectRevert(Splitline.SplitNotFound.selector);
            sl.bpsOf(x, alice);
            vm.expectRevert(Splitline.SplitNotFound.selector);
            sl.depositAddressOf(x);
        }
    }
}
