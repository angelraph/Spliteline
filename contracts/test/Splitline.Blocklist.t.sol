// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SplitlineTestBase} from "./Splitline.Base.t.sol";
import {Splitline} from "../Splitline.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract SplitlineBlocklistTest is SplitlineTestBase {
    uint256 internal id;
    address internal dep;

    function setUp() public override {
        super.setUp();
        (id, dep) = _create3(); // alice 50 / bob 30 / carol 20
        _pay(id, 1000e6);
    }

    function test_Blocked_ReleaseAndClaimRevertForBlockedRecipient() public {
        usdc.setBlocked(bob, true);
        bytes memory err = abi.encodeWithSelector(MockUSDC.Blocked.selector, bob);

        vm.expectRevert(err);
        sl.release(id, bob);

        vm.prank(bob);
        vm.expectRevert(err);
        sl.claim(id);

        // state unchanged
        assertEq(sl.owed(id, bob), 300e6);
        assertEq(sl.released(id, bob), 0);
        assertEq(usdc.balanceOf(address(sl)), 1000e6);
    }

    function test_Blocked_OthersStillClaimFullShare() public {
        usdc.setBlocked(bob, true);
        vm.prank(alice);
        sl.claim(id);
        sl.release(id, carol);
        assertEq(usdc.balanceOf(alice), 500e6);
        assertEq(usdc.balanceOf(carol), 200e6);
        assertEq(usdc.balanceOf(address(sl)), 300e6, "bob's share remains");
        assertEq(sl.owed(id, bob), 300e6);
    }

    function test_Blocked_RecipientRecoversViaClaimTo() public {
        usdc.setBlocked(bob, true);
        vm.expectRevert();
        sl.release(id, bob);

        vm.prank(bob);
        sl.claimTo(id, dave);
        assertEq(usdc.balanceOf(dave), 300e6);
        assertEq(sl.owed(id, bob), 0);
        assertEq(sl.released(id, bob), 300e6);
        assertEq(usdc.balanceOf(bob), 0);
    }

    function test_Blocked_ClaimToBlockedDestinationReverts() public {
        usdc.setBlocked(dave, true);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MockUSDC.Blocked.selector, dave));
        sl.claimTo(id, dave);
        assertEq(sl.owed(id, alice), 500e6);
    }

    function test_Blocked_UnblockRestoresRelease() public {
        usdc.setBlocked(bob, true);
        vm.expectRevert();
        sl.release(id, bob);
        usdc.setBlocked(bob, false);
        sl.release(id, bob);
        assertEq(usdc.balanceOf(bob), 300e6);
    }

    function test_Blocked_DepositAddressOnlyBreaksThatSplitsSweep() public {
        (uint256 id2, address dep2) = _create(_a2(alice, bob), _b2(5000, 5000));

        // both deposits hold funds, then split-1's deposit gets blocklisted
        usdc.mint(dep, 50e6);
        usdc.mint(dep2, 70e6);
        usdc.setBlocked(dep, true);

        // sweep of the blocked split reverts, no state change
        (,,,, uint256 before) = sl.getSplit(id);
        vm.expectRevert();
        sl.sweep(id);
        (,,,, uint256 afterTotal) = sl.getSplit(id);
        assertEq(afterTotal, before);
        assertEq(usdc.balanceOf(dep), 50e6);

        // direct pay on the same split still works
        _pay(id, 10e6);
        (,,,, uint256 t) = sl.getSplit(id);
        assertEq(t, before + 10e6);

        // existing claims on the same split still work
        vm.prank(alice);
        sl.claim(id);

        // the other split is unaffected
        assertEq(sl.sweep(id2), 70e6);
        (,,,, uint256 t2) = sl.getSplit(id2);
        assertEq(t2, 70e6);

        // unblocking restores sweep
        usdc.setBlocked(dep, false);
        assertEq(sl.sweep(id), 50e6);
    }

    function test_Blocked_DirectTransferToBlockedDepositFailsAtToken() public {
        usdc.setBlocked(dep, true);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(MockUSDC.Blocked.selector, dep));
        usdc.transfer(dep, 1e6);
    }
}
