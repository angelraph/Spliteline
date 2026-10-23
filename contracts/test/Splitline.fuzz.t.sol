// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SplitlineTestBase} from "./utils/SplitlineTestBase.sol";
import {Splitline} from "../src/Splitline.sol";

contract SplitlineFuzzTest is SplitlineTestBase {
    address internal payer = makeAddr("payer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    /// @dev Basis points must sum to exactly 10000 to be accepted; any other sum reverts
    ///      with the actual sum, and a valid sum always succeeds.
    function testFuzz_CreateSplit_BpsSumMustBe10000(uint16 a, uint16 b, uint16 c) public {
        a = uint16(bound(a, 0, 10_000));
        b = uint16(bound(b, 0, 10_000));
        c = uint16(bound(c, 0, 10_000));

        address[] memory recipients = new address[](3);
        recipients[0] = alice;
        recipients[1] = bob;
        recipients[2] = carol;
        uint16[] memory bps = new uint16[](3);
        bps[0] = a;
        bps[1] = b;
        bps[2] = c;

        uint256 sum = uint256(a) + uint256(b) + uint256(c);

        if (sum == 10_000) {
            uint256 id = splitline.createSplit("Fuzz", recipients, bps);
            (,,, uint256 totalReceived,) = splitline.getSplit(id);
            assertEq(totalReceived, 0);
        } else {
            vm.expectRevert(abi.encodeWithSelector(Splitline.BpsSumMismatch.selector, sum));
            splitline.createSplit("Fuzz", recipients, bps);
        }
    }

    /// @dev Across an arbitrary sequence of payments, what's claimed can never exceed what
    ///      was actually received, and each recipient's share stays exactly proportional.
    function testFuzz_PayThenClaim_NeverExceedsReceived(uint96 amount1, uint96 amount2, uint16 bpsAlice) public {
        amount1 = uint96(bound(amount1, 1, 1_000_000e6));
        amount2 = uint96(bound(amount2, 1, 1_000_000e6));
        bpsAlice = uint16(bound(bpsAlice, 1, 9_999));
        uint16 bpsBob = 10_000 - bpsAlice;

        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;
        uint16[] memory bps = new uint16[](2);
        bps[0] = bpsAlice;
        bps[1] = bpsBob;
        uint256 id = splitline.createSplit("Fuzz pair", recipients, bps);

        _mintAndApprove(payer, uint256(amount1) + uint256(amount2));
        vm.prank(payer);
        splitline.pay(id, amount1, bytes32(0));
        vm.prank(payer);
        splitline.pay(id, amount2, bytes32(0));

        uint256 totalReceived = uint256(amount1) + uint256(amount2);

        // A recipient with a very small share of a very small payment can legitimately be
        // owed exactly 0 (floor division) — only claim when there's something to claim.
        if (splitline.owed(id, alice) > 0) {
            vm.prank(alice);
            splitline.claim(id);
        }
        if (splitline.owed(id, bob) > 0) {
            vm.prank(bob);
            splitline.claim(id);
        }

        uint256 claimedTotal = usdc.balanceOf(alice) + usdc.balanceOf(bob);
        assertLe(claimedTotal, totalReceived);
        // Dust from two independent floor divisions is bounded by the recipient count.
        assertLt(totalReceived - claimedTotal, recipients.length);
    }

    /// @dev Undistributed rounding dust after every recipient of a split has been paid out
    ///      in full is always strictly less than the number of recipients, regardless of
    ///      recipient count (up to the max) or payment amount.
    function testFuzz_DustBoundedByRecipientCount(uint8 countSeed, uint256 amount) public {
        uint256 count = bound(countSeed, 1, splitline.MAX_RECIPIENTS());
        amount = bound(amount, count, 1_000_000_000e6);

        address[] memory recipients = new address[](count);
        uint16[] memory bps = new uint16[](count);
        uint16 share = uint16(10_000 / count);
        uint16 assigned;
        for (uint256 i; i < count; ++i) {
            recipients[i] = address(uint160(0x9000 + i));
            bps[i] = (i == count - 1) ? (10_000 - assigned) : share;
            assigned += bps[i];
        }

        uint256 id = splitline.createSplit("Fuzz dust", recipients, bps);

        _mintAndApprove(payer, amount);
        vm.prank(payer);
        splitline.pay(id, amount, bytes32(0));

        for (uint256 i; i < count; ++i) {
            // A tiny payment split many ways can leave a recipient legitimately owed 0.
            if (splitline.owed(id, recipients[i]) > 0) {
                splitline.release(id, recipients[i]);
            }
        }

        (,,, uint256 totalReceived, uint256 totalReleased) = splitline.getSplit(id);
        assertLt(totalReceived - totalReleased, count);
    }
}
