// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SplitlineTestBase} from "./Splitline.Base.t.sol";
import {Splitline} from "../Splitline.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract SplitlinePayTest is SplitlineTestBase {
    uint256 internal id;
    address internal dep;

    function setUp() public override {
        super.setUp();
        (id, dep) = _create3();
    }

    // ------------------------------------------------------------ pay
    function test_Pay_CreditsTotalReceivedAndMovesFunds() public {
        uint256 before = usdc.balanceOf(payer);
        _pay(id, 1000e6);
        (,,,, uint256 total) = sl.getSplit(id);
        assertEq(total, 1000e6);
        assertEq(usdc.balanceOf(address(sl)), 1000e6);
        assertEq(usdc.balanceOf(payer), before - 1000e6);
        assertEq(sl.owed(id, alice), 500e6);
        assertEq(sl.owed(id, bob), 300e6);
        assertEq(sl.owed(id, carol), 200e6);
    }

    function test_Pay_AccumulatesAcrossPayments() public {
        _pay(id, 100e6);
        _pay(id, 250e6);
        (,,,, uint256 total) = sl.getSplit(id);
        assertEq(total, 350e6);
    }

    function test_Pay_EmitsPaidWithRef() public {
        bytes32 ref = keccak256("invoice-42");
        vm.expectEmit(true, true, true, true, address(sl));
        emit Splitline.Paid(id, payer, 123e6, ref);
        vm.prank(payer);
        sl.pay(id, 123e6, ref);
    }

    function test_Pay_OnlyCreditsTargetSplit() public {
        (uint256 id2,) = _create(_a1(dave), _b1(10_000));
        _pay(id, 10e6);
        (,,,, uint256 t2) = sl.getSplit(id2);
        assertEq(t2, 0);
    }

    function test_Revert_Pay_ZeroAmount() public {
        vm.prank(payer);
        vm.expectRevert(Splitline.ZeroAmount.selector);
        sl.pay(id, 0, bytes32(0));
    }

    function test_Revert_Pay_UnknownIdZero() public {
        vm.prank(payer);
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.pay(0, 1e6, bytes32(0));
    }

    function test_Revert_Pay_UnknownIdNextId() public {
        uint256 next = sl.nextId();
        vm.prank(payer);
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.pay(next, 1e6, bytes32(0));
    }

    function test_Revert_Pay_UnknownIdBeforeZeroAmount() public {
        vm.prank(payer);
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.pay(99, 0, bytes32(0));
    }

    function test_Revert_Pay_InsufficientAllowance() public {
        usdc.mint(dave, 100e6);
        vm.prank(dave);
        usdc.approve(address(sl), 10e6);
        vm.prank(dave);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(sl), 10e6, 11e6)
        );
        sl.pay(id, 11e6, bytes32(0));
        (,,,, uint256 total) = sl.getSplit(id);
        assertEq(total, 0, "no credit on revert");
    }

    function test_Revert_Pay_NoAllowance() public {
        usdc.mint(dave, 100e6);
        vm.prank(dave);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(sl), 0, 1e6)
        );
        sl.pay(id, 1e6, bytes32(0));
    }

    function test_Revert_Pay_InsufficientBalance() public {
        vm.prank(dave);
        usdc.approve(address(sl), type(uint256).max);
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, dave, 0, 1e6));
        sl.pay(id, 1e6, bytes32(0));
    }

    // ------------------------------------------------------------ payWithPermit
    function test_PayWithPermit_ValidSignature() public {
        (address signer, uint256 pk) = makeAddrAndKey("signer");
        usdc.mint(signer, 1000e6);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(pk, signer, 100e6, deadline);

        vm.expectEmit(true, true, true, true, address(sl));
        emit Splitline.Paid(id, signer, 100e6, bytes32("ref"));
        vm.prank(signer);
        sl.payWithPermit(id, 100e6, bytes32("ref"), deadline, v, r, s);

        (,,,, uint256 total) = sl.getSplit(id);
        assertEq(total, 100e6);
        assertEq(usdc.balanceOf(signer), 900e6);
        assertEq(usdc.allowance(signer, address(sl)), 0);
        assertEq(usdc.nonces(signer), 1);
    }

    function test_PayWithPermit_FrontRunPermitStillSucceeds() public {
        (address signer, uint256 pk) = makeAddrAndKey("signer");
        usdc.mint(signer, 1000e6);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(pk, signer, 100e6, deadline);

        // attacker front-runs by submitting the permit directly
        vm.prank(eve);
        usdc.permit(signer, address(sl), 100e6, deadline, v, r, s);
        assertEq(usdc.allowance(signer, address(sl)), 100e6);

        vm.prank(signer);
        sl.payWithPermit(id, 100e6, bytes32(0), deadline, v, r, s);
        (,,,, uint256 total) = sl.getSplit(id);
        assertEq(total, 100e6);
        assertEq(usdc.allowance(signer, address(sl)), 0);
    }

    function test_PayWithPermit_InvalidSignatureWithExistingAllowanceSucceeds() public {
        usdc.mint(dave, 100e6);
        vm.prank(dave);
        usdc.approve(address(sl), 50e6);
        vm.prank(dave);
        sl.payWithPermit(id, 50e6, bytes32(0), block.timestamp + 1, 27, bytes32(uint256(1)), bytes32(uint256(2)));
        (,,,, uint256 total) = sl.getSplit(id);
        assertEq(total, 50e6);
    }

    function test_Revert_PayWithPermit_InvalidSignatureNoAllowance() public {
        (address signer,) = makeAddrAndKey("signer");
        (, uint256 wrongPk) = makeAddrAndKey("wrong");
        usdc.mint(signer, 1000e6);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(wrongPk, signer, 100e6, deadline);

        vm.prank(signer);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(sl), 0, 100e6)
        );
        sl.payWithPermit(id, 100e6, bytes32(0), deadline, v, r, s);
    }

    function test_Revert_PayWithPermit_ExpiredDeadlineNoAllowance() public {
        (address signer, uint256 pk) = makeAddrAndKey("signer");
        usdc.mint(signer, 1000e6);
        vm.warp(10_000);
        uint256 deadline = block.timestamp - 1;
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(pk, signer, 100e6, deadline);

        vm.prank(signer);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(sl), 0, 100e6)
        );
        sl.payWithPermit(id, 100e6, bytes32(0), deadline, v, r, s);
        assertEq(usdc.nonces(signer), 0, "permit not consumed");
    }

    function test_Revert_PayWithPermit_ReplayedPermitNoAllowance() public {
        (address signer, uint256 pk) = makeAddrAndKey("signer");
        usdc.mint(signer, 1000e6);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(pk, signer, 100e6, deadline);
        vm.prank(signer);
        sl.payWithPermit(id, 100e6, bytes32(0), deadline, v, r, s);

        // same signature again: nonce consumed, allowance spent
        vm.prank(signer);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(sl), 0, 100e6)
        );
        sl.payWithPermit(id, 100e6, bytes32(0), deadline, v, r, s);
    }

    function test_Revert_PayWithPermit_ZeroAmount() public {
        vm.prank(payer);
        vm.expectRevert(Splitline.ZeroAmount.selector);
        sl.payWithPermit(id, 0, bytes32(0), block.timestamp + 1, 27, bytes32(0), bytes32(0));
    }

    function test_Revert_PayWithPermit_UnknownId() public {
        uint256 next = sl.nextId();
        vm.prank(payer);
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.payWithPermit(next, 1e6, bytes32(0), block.timestamp + 1, 27, bytes32(0), bytes32(0));
        vm.prank(payer);
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.payWithPermit(0, 1e6, bytes32(0), block.timestamp + 1, 27, bytes32(0), bytes32(0));
    }

    // ------------------------------------------------------------ sweep
    function test_Sweep_CreditsDirectTransfer() public {
        vm.prank(payer);
        usdc.transfer(dep, 400e6);
        assertEq(usdc.balanceOf(dep), 400e6);

        vm.expectEmit(true, false, false, true, address(sl));
        emit Splitline.Swept(id, 400e6);
        uint256 amount = sl.sweep(id);

        assertEq(amount, 400e6);
        assertEq(usdc.balanceOf(dep), 0);
        assertEq(usdc.balanceOf(address(sl)), 400e6);
        (,,,, uint256 total) = sl.getSplit(id);
        assertEq(total, 400e6);
        assertEq(sl.owed(id, alice), 200e6);
    }

    function test_Sweep_AnyoneCanCall() public {
        vm.prank(payer);
        usdc.transfer(dep, 10e6);
        vm.prank(eve);
        assertEq(sl.sweep(id), 10e6);
    }

    function test_Sweep_AccumulatesWithPay() public {
        _pay(id, 100e6);
        vm.prank(payer);
        usdc.transfer(dep, 50e6);
        sl.sweep(id);
        (,,,, uint256 total) = sl.getSplit(id);
        assertEq(total, 150e6);
    }

    function test_Revert_Sweep_NothingToSweep_NoStateChange() public {
        _pay(id, 100e6);
        (,,,, uint256 totalBefore) = sl.getSplit(id);
        uint256 balBefore = usdc.balanceOf(address(sl));

        vm.recordLogs();
        vm.expectRevert(Splitline.NothingToSweep.selector);
        sl.sweep(id);
        assertEq(vm.getRecordedLogs().length, 0);

        (,,,, uint256 totalAfter) = sl.getSplit(id);
        assertEq(totalAfter, totalBefore);
        assertEq(usdc.balanceOf(address(sl)), balBefore);
    }

    function test_Revert_Sweep_UnknownId() public {
        uint256 next = sl.nextId();
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.sweep(next);
        vm.expectRevert(Splitline.SplitNotFound.selector);
        sl.sweep(0);
    }
}
