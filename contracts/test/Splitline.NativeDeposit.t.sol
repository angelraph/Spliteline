// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {SplitlineNativeBase} from "./Splitline.NativeBase.t.sol";
import {Splitline} from "../Splitline.sol";
import {DepositAddress} from "../DepositAddress.sol";

/// @dev Native sends to deposit clones under the unified-balance model.
contract SplitlineNativeDepositTest is SplitlineNativeBase {
    function test_NativeDeposit_PlainSendSucceedsWithNoEvent() public {
        (, address dep) = _create3();
        vm.recordLogs();
        _native(dep, 7e6 * SCALE);
        assertEq(vm.getRecordedLogs().length, 0, "receive emits nothing");
        assertEq(dep.balance, 7e6 * SCALE);
        assertEq(usdc.balanceOf(dep), 7e6, "ERC-20 view rises by value/1e12");
    }

    function test_NativeDeposit_SweepCreditsExactlyAndEmitsSwept() public {
        (uint256 id, address dep) = _create3();
        _native(dep, 7e6 * SCALE);
        assertEq(_total(id), 0, "not credited until sweep");

        vm.expectEmit(true, false, false, true, address(sl));
        emit Splitline.Swept(id, 7e6);
        assertEq(sl.sweep(id), 7e6);

        assertEq(_total(id), 7e6);
        assertEq(dep.balance, 0);
        assertEq(address(sl).balance, 7e6 * SCALE);
        assertEq(usdc.balanceOf(address(sl)), 7e6);
    }

    function test_NativeDeposit_AnyoneCanSweep() public {
        (uint256 id, address dep) = _create3();
        _native(dep, 3e6 * SCALE);
        vm.prank(eve);
        assertEq(sl.sweep(id), 3e6);
    }

    function test_NativeDeposit_ClaimAutoSweepsAndPaysRightShare() public {
        (uint256 id, address dep) = _create3();
        _native(dep, 10e6 * SCALE);
        vm.expectEmit(true, true, false, true, address(sl));
        emit Splitline.Claimed(id, alice, alice, 5e6);
        vm.prank(alice);
        sl.claim(id);
        assertEq(usdc.balanceOf(alice), 5e6);
        assertEq(_total(id), 10e6);
        assertEq(dep.balance, 0);
        assertEq(address(sl).balance, 5e6 * SCALE);
    }

    function test_NativeDeposit_ClaimToAutoSweepsAndPaysRightShare() public {
        (uint256 id, address dep) = _create3();
        _native(dep, 10e6 * SCALE);
        vm.prank(bob);
        sl.claimTo(id, dave);
        assertEq(usdc.balanceOf(dave), 3e6);
        assertEq(dave.balance, 3e6 * SCALE);
        assertEq(_total(id), 10e6);
        assertEq(dep.balance, 0);
    }

    function test_NativeDeposit_ReleaseAutoSweepsAndPaysRightShare() public {
        (uint256 id, address dep) = _create3();
        _native(dep, 10e6 * SCALE);
        vm.recordLogs();
        vm.prank(eve);
        sl.release(id, carol);
        (uint256 cnt, uint256 sum) = _swept(vm.getRecordedLogs(), id);
        assertEq(cnt, 1);
        assertEq(sum, 10e6);
        assertEq(usdc.balanceOf(carol), 2e6);
        assertEq(_total(id), 10e6);
    }

    function test_NativeDeposit_SubUnitRemainderStaysInCloneAfterSweep() public {
        (uint256 id, address dep) = _create3();
        _native(dep, SCALE + 5);
        assertEq(usdc.balanceOf(dep), 1);
        assertEq(sl.sweep(id), 1, "forward moves exactly 1 unit");
        assertEq(_total(id), 1);
        assertEq(dep.balance, 5, "5 wei remain in the clone");
        assertEq(address(sl).balance, SCALE);

        vm.expectRevert(Splitline.NothingToSweep.selector);
        sl.sweep(id);
        assertEq(dep.balance, 5);
        assertEq(_total(id), 1);
    }

    function test_NativeDeposit_RemainderOnlySendCannotBeSwept() public {
        (uint256 id, address dep) = _create3();
        _native(dep, 5);
        assertEq(usdc.balanceOf(dep), 0);
        vm.expectRevert(Splitline.NothingToSweep.selector);
        sl.sweep(id);
        assertEq(dep.balance, 5);
        // the payout path silently no-ops on the same state
        vm.prank(alice);
        vm.expectRevert(Splitline.NothingOwed.selector);
        sl.claim(id);
    }

    function test_NativeDeposit_RemainderRecoverableWithLaterWholeUnitSend() public {
        (uint256 id, address dep) = _create3();
        _native(dep, 5);
        _native(dep, SCALE - 5);
        assertEq(dep.balance, SCALE);
        assertEq(sl.sweep(id), 1, "combined remainders form a whole unit");
        assertEq(dep.balance, 0);
        assertEq(_total(id), 1);
    }

    function test_NativeDeposit_RemainderPersistsAcrossLaterWholeSends() public {
        (uint256 id, address dep) = _create3();
        _native(dep, 5);
        _native(dep, 2 * SCALE);
        assertEq(sl.sweep(id), 2);
        assertEq(dep.balance, 5);
        _native(dep, 3 * SCALE);
        assertEq(sl.sweep(id), 3);
        assertEq(dep.balance, 5);
        assertEq(_total(id), 5);
    }

    function test_NativeDeposit_ClaimWithRemainderOnlyDoesNotRevertTheSweepPart() public {
        (uint256 id, address dep) = _create3();
        _payNative(id, 10e6 * SCALE);
        _native(dep, 5);
        vm.prank(alice);
        sl.claim(id);
        assertEq(usdc.balanceOf(alice), 5e6);
        assertEq(dep.balance, 5);
    }

    function test_NativeDeposit_SendToImplementationSucceedsButIsStuck() public {
        address impl = sl.DEPOSIT_IMPLEMENTATION();
        _native(impl, 4e6 * SCALE);
        assertEq(impl.balance, 4e6 * SCALE);
        vm.prank(eve);
        vm.expectRevert(DepositAddress.NotSplitline.selector);
        _dep(impl).forward();
        vm.expectRevert(DepositAddress.NotSplitline.selector);
        _dep(impl).forward();
        assertEq(impl.balance, 4e6 * SCALE, "documented as stuck");
        assertEq(address(sl).balance, 0);
    }

    function test_NativeDeposit_DifferentClonesAreIndependent() public {
        (uint256 id1, address d1) = _create3();
        (uint256 id2, address d2) = sl.createSplit("two", _a3(alice, bob, carol), _b3(5000, 3000, 2000));
        _native(d1, 2e6 * SCALE);
        _native(d2, 9e6 * SCALE);
        sl.sweep(id1);
        assertEq(d2.balance, 9e6 * SCALE);
        assertEq(_total(id2), 0);
        assertEq(_total(id1), 2e6);
        sl.sweep(id2);
        assertEq(_total(id2), 9e6);
    }

    function test_NativeDeposit_FundedBeforeCreationThenSweepCredits() public {
        address[] memory r = _a3(alice, bob, carol);
        uint16[] memory b = _b3(5000, 3000, 2000);
        address predicted = sl.predictDepositAddress(address(this), "early", r, b);
        // a codeless address accepts native value trivially
        _native(predicted, 6e6 * SCALE);
        (uint256 id, address dep) = sl.createSplit("early", r, b);
        assertEq(dep, predicted);
        assertEq(sl.sweep(id), 6e6);
        assertEq(sl.owed(id, alice), 3e6);
    }

    function test_NativeDeposit_MixedFlowsAccumulate() public {
        (uint256 id, address dep) = _create3();
        (address signer, uint256 signerPk) = makeAddrAndKey("signer");
        usdc.mint(signer, 5e6);

        _pay(id, 1e6); // approve + transferFrom
        _permitPay(signer, signerPk, id, 2e6);
        _payNative(id, 3e6 * SCALE);
        _erc20(dep, 4e6);
        _native(dep, 5e6 * SCALE);

        assertEq(_total(id), 1e6 + 2e6 + 3e6, "direct payments credited immediately");
        assertEq(sl.sweep(id), 9e6, "ERC-20 + native deposits swept together");
        assertEq(_total(id), 15e6);
        assertEq(usdc.balanceOf(address(sl)), 15e6);
        assertEq(address(sl).balance, 15e6 * SCALE);

        vm.prank(alice);
        sl.claim(id);
        vm.prank(bob);
        sl.claim(id);
        vm.prank(carol);
        sl.claim(id);
        assertEq(usdc.balanceOf(alice), 7_500_000);
        assertEq(usdc.balanceOf(bob), 4_500_000);
        assertEq(usdc.balanceOf(carol), 3_000_000);
        assertEq(address(sl).balance, 0);
    }

    function _permitPay(address signer, uint256 signerPk, uint256 id, uint256 amount) internal {
        uint256 deadline = block.timestamp + 1 days;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                signer,
                address(sl),
                amount,
                usdc.nonces(signer),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        vm.prank(signer);
        sl.payWithPermit(id, amount, bytes32(0), deadline, v, r, s);
    }
}
