// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Splitline} from "../src/Splitline.sol";
import {ARC_USDC} from "../src/interfaces/IUSDC.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {SplitlineHandler} from "./handlers/SplitlineHandler.sol";

/// @notice Runs many random createSplit/pay/claim/claimTo/release calls (via SplitlineHandler)
///         across multiple splits and asserts Splitline's core safety invariants hold no
///         matter the call sequence.
contract SplitlineInvariantTest is Test {
    Splitline internal splitline;
    MockUSDC internal usdc;
    SplitlineHandler internal handler;

    function setUp() public {
        splitline = new Splitline();

        MockUSDC impl = new MockUSDC();
        vm.etch(ARC_USDC, address(impl).code);
        usdc = MockUSDC(ARC_USDC);

        handler = new SplitlineHandler(splitline, usdc);
        targetContract(address(handler));
    }

    /// @dev The contract's token balance always equals everything ever paid in minus
    ///      everything ever paid out — no value can appear or disappear.
    function invariant_BalanceEqualsPaidMinusClaimed() public view {
        assertEq(usdc.balanceOf(address(splitline)), handler.ghost_totalPaid() - handler.ghost_totalClaimed());
    }

    /// @dev For every split ever created, every recipient's `owed()` view always resolves
    ///      without reverting and never exceeds their proportional share of what that split
    ///      has received — i.e. claimed + owed can never exceed received.
    function invariant_NoRecipientEverOwedMoreThanTheirShare() public view {
        uint256 n = handler.splitCount();
        for (uint256 i; i < n; ++i) {
            uint256 id = handler.splitIdAt(i);
            (, address[] memory recipients, uint16[] memory bps, uint256 totalReceived,) = splitline.getSplit(id);
            for (uint256 j; j < recipients.length; ++j) {
                uint256 entitled = (totalReceived * bps[j]) / 10_000;
                uint256 owed = splitline.owed(id, recipients[j]);
                assertLe(owed, entitled);
            }
        }
    }
}
