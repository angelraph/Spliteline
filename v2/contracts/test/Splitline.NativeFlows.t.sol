// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SplitlineNativeBase} from "./Splitline.NativeBase.t.sol";
import {Splitline} from "../Splitline.sol";
import {MockArcUSDC} from "./mocks/MockArcUSDC.sol";

/// @dev Nested and blocklist flows under the unified-balance model, plus mock sanity checks.
contract SplitlineNativeFlowsTest is SplitlineNativeBase {
    // ------------------------------------------------------------ mock sanity (unified balance)
    function test_Mock_BalanceOfIsNativeOverScale() public {
        vm.deal(alice, 5 * SCALE + 999);
        assertEq(usdc.balanceOf(alice), 5);
    }

    function test_Mock_TransferMovesNativeBalance() public {
        uint256 before_ = payer.balance;
        _erc20(alice, 3e6);
        assertEq(alice.balance, 3e6 * SCALE);
        assertEq(before_ - payer.balance, 3e6 * SCALE);
        assertEq(usdc.balanceOf(alice), 3e6);
    }

    function test_Mock_InsufficientBalanceReverts() public {
        vm.deal(alice, 2 * SCALE + 5);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("ERC20InsufficientBalance(address,uint256,uint256)", alice, 2, 3));
        usdc.transfer(bob, 3);
    }

    function test_Mock_BlockedTransferReverts() public {
        usdc.setBlocked(alice, true);
        vm.expectRevert(abi.encodeWithSelector(MockArcUSDC.Blocked.selector, alice));
        usdc.mint(alice, 1);
        assertTrue(usdc.blocked(alice));
    }

    // ------------------------------------------------------------ nested split paid natively
    function test_Nested_TwoLevelPaidNativelyEndToEnd() public {
        // child: dave 60% / eve 40%; parent: alice 50% / child deposit 50%
        (uint256 childId, address childDep) = sl.createSplit("child", _a2(dave, eve), _b2(6000, 4000));
        (uint256 parentId,) = sl.createSplit("parent", _a2(alice, childDep), _b2(5000, 5000));

        _payNative(parentId, 10e6 * SCALE);
        assertEq(_total(parentId), 10e6);
        assertEq(address(sl).balance, 10e6 * SCALE);

        vm.prank(alice);
        sl.claim(parentId);
        assertEq(usdc.balanceOf(alice), 5e6);

        // release to the child's deposit address is an ERC-20 transfer (moves native balance)
        sl.release(parentId, childDep);
        assertEq(usdc.balanceOf(childDep), 5e6);
        assertEq(childDep.balance, 5e6 * SCALE);
        assertEq(_total(childId), 0, "not credited until swept");

        // child claim auto-sweeps
        vm.prank(dave);
        sl.claim(childId);
        assertEq(_total(childId), 5e6);
        assertEq(usdc.balanceOf(dave), 3e6);
        vm.prank(eve);
        sl.claim(childId);
        assertEq(usdc.balanceOf(eve), 2e6);

        assertEq(address(sl).balance, 0, "everything distributed");
        assertEq(childDep.balance, 0);
        assertEq(alice.balance + dave.balance + eve.balance, 10e6 * SCALE);
    }

    function test_Nested_NativeDirectlyToChildDepositAlsoFlows() public {
        (uint256 childId, address childDep) = sl.createSplit("child", _a2(dave, eve), _b2(6000, 4000));
        (uint256 parentId,) = sl.createSplit("parent", _a2(alice, childDep), _b2(5000, 5000));
        _payNative(parentId, 4e6 * SCALE);
        _native(childDep, 6e6 * SCALE);
        sl.release(parentId, childDep); // 2e6 more into child
        vm.prank(dave);
        sl.claim(childId); // sweeps 8e6
        assertEq(_total(childId), 8e6);
        assertEq(usdc.balanceOf(dave), 4_800_000);
        sl.release(childId, eve);
        assertEq(usdc.balanceOf(eve), 3_200_000);
    }

    // ------------------------------------------------------------ blocked deposit address
    function test_Blocked_DepositOnlyBreaksThatSplitsPublicSweep() public {
        (uint256 id1, address d1) = _create3();
        (uint256 id2, address d2) = sl.createSplit("two", _a3(alice, bob, carol), _b3(5000, 3000, 2000));
        usdc.setBlocked(d1, true);

        // native value can still be sent to the blocked clone (the native path is not an ERC-20 transfer)
        _native(d1, 4e6 * SCALE);
        _native(d2, 6e6 * SCALE);
        assertEq(d1.balance, 4e6 * SCALE);

        vm.expectRevert(abi.encodeWithSelector(MockArcUSDC.Blocked.selector, d1));
        sl.sweep(id1);
        assertEq(sl.sweep(id2), 6e6, "other split unaffected");
        assertEq(_total(id1), 0);

        // direct payNative / pay on the tainted split still work
        _payNative(id1, 10e6 * SCALE);
        _pay(id1, 10e6);
        vm.prank(alice);
        sl.claim(id1); // best-effort sweep is swallowed
        assertEq(usdc.balanceOf(alice), 10e6);
        assertEq(d1.balance, 4e6 * SCALE, "blocked funds untouched");
        assertEq(_total(id1), 20e6);

        // unblocking restores sweep
        usdc.setBlocked(d1, false);
        assertEq(sl.sweep(id1), 4e6);
        assertEq(_total(id1), 24e6);
    }

    function test_Blocked_RecipientDoesNotBlockOtherPayouts() public {
        (uint256 id,) = _create3();
        _payNative(id, 10e6 * SCALE);
        usdc.setBlocked(alice, true);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MockArcUSDC.Blocked.selector, alice));
        sl.claim(id);
        vm.prank(alice);
        sl.claimTo(id, dave); // redirect still blocked? sender is the recipient, destination dave is clean
        assertEq(usdc.balanceOf(dave), 5e6);
        vm.prank(bob);
        sl.claim(id);
        assertEq(usdc.balanceOf(bob), 3e6);
    }
}
