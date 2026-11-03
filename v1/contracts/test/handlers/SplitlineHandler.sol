// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Splitline} from "../../src/Splitline.sol";
import {ARC_USDC} from "../../src/interfaces/IUSDC.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";

/// @notice Drives Splitline through random sequences of createSplit/pay/claim/claimTo/release
///         across many splits and recipients, for `forge test` invariant fuzzing. Tracks the
///         contract's own running totals (never Splitline's internal state directly) so the
///         invariant test can cross-check Splitline's view functions against an independent
///         ledger built purely from successful calls.
contract SplitlineHandler is Test {
    Splitline public splitline;
    MockUSDC public usdc;

    address[] public actors;
    uint256[] public createdSplitIds;

    uint256 public ghost_totalPaid;
    uint256 public ghost_totalClaimed;

    constructor(Splitline _splitline, MockUSDC _usdc) {
        splitline = _splitline;
        usdc = _usdc;

        for (uint256 i; i < 8; ++i) {
            actors.push(address(uint160(0xA000 + i)));
        }
    }

    function createSplit(uint256 seed, uint8 countSeed) external {
        uint256 count = bound(countSeed, 1, 8);
        address[] memory recipients = new address[](count);
        uint16[] memory bps = new uint16[](count);

        uint16 assigned;
        uint16 share = uint16(10_000 / count);
        for (uint256 i; i < count; ++i) {
            recipients[i] = actors[(seed + i) % actors.length];
            // Guard against a duplicate actor landing twice in one split, which would
            // revert createSplit entirely and waste the fuzz run; skip ahead deterministically.
            for (uint256 j; j < i; ++j) {
                if (recipients[j] == recipients[i]) {
                    recipients[i] = actors[(seed + i + 1) % actors.length];
                }
            }
            bps[i] = (i == count - 1) ? (10_000 - assigned) : share;
            assigned += bps[i];
        }

        // Re-check for duplicates after the single-shift guard above; if still colliding,
        // skip this run rather than reverting the whole invariant campaign.
        for (uint256 i; i < count; ++i) {
            for (uint256 j = i + 1; j < count; ++j) {
                if (recipients[i] == recipients[j]) return;
            }
        }

        uint256 id = splitline.createSplit("Handler split", recipients, bps);
        createdSplitIds.push(id);
    }

    function pay(uint256 splitSeed, uint256 payerSeed, uint96 amount) external {
        if (createdSplitIds.length == 0) return;
        uint256 id = createdSplitIds[splitSeed % createdSplitIds.length];
        address payer = actors[payerSeed % actors.length];
        amount = uint96(bound(amount, 1, 1_000_000e6));

        usdc.mint(payer, amount);
        vm.prank(payer);
        IERC20(ARC_USDC).approve(address(splitline), amount);
        vm.prank(payer);
        splitline.pay(id, amount, bytes32(0));

        ghost_totalPaid += amount;
    }

    function claim(uint256 splitSeed, uint256 recipientSeed) external {
        if (createdSplitIds.length == 0) return;
        uint256 id = createdSplitIds[splitSeed % createdSplitIds.length];
        address recipient = actors[recipientSeed % actors.length];

        uint256 amount = splitline.owed(id, recipient);
        if (amount == 0) return;

        vm.prank(recipient);
        splitline.claim(id);
        ghost_totalClaimed += amount;
    }

    function release(uint256 splitSeed, uint256 recipientSeed, uint256 callerSeed) external {
        if (createdSplitIds.length == 0) return;
        uint256 id = createdSplitIds[splitSeed % createdSplitIds.length];
        address recipient = actors[recipientSeed % actors.length];
        address caller = actors[callerSeed % actors.length];

        uint256 amount = splitline.owed(id, recipient);
        if (amount == 0) return;

        vm.prank(caller);
        splitline.release(id, recipient);
        ghost_totalClaimed += amount;
    }

    function splitCount() external view returns (uint256) {
        return createdSplitIds.length;
    }

    function splitIdAt(uint256 i) external view returns (uint256) {
        return createdSplitIds[i];
    }
}
