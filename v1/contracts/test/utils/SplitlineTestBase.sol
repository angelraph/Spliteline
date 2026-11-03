// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Splitline} from "../../src/Splitline.sol";
import {ARC_USDC} from "../../src/interfaces/IUSDC.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";

/// @notice Shared fixture: deploys Splitline and places MockUSDC's bytecode at Arc's fixed
///         USDC address via `vm.etch`, so the contract-under-test's hardcoded `ARC_USDC`
///         constant resolves to a controllable, mintable token during tests — exactly as it
///         would resolve to real USDC on Arc mainnet.
abstract contract SplitlineTestBase is Test {
    Splitline internal splitline;
    MockUSDC internal usdc;

    function setUp() public virtual {
        splitline = new Splitline();

        MockUSDC impl = new MockUSDC();
        vm.etch(ARC_USDC, address(impl).code);
        usdc = MockUSDC(ARC_USDC);
    }

    function _mintAndApprove(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        IERC20(ARC_USDC).approve(address(splitline), amount);
    }

    function _defaultRecipients() internal pure returns (address[] memory recipients, uint16[] memory bps) {
        recipients = new address[](3);
        recipients[0] = address(0x1111);
        recipients[1] = address(0x2222);
        recipients[2] = address(0x3333);
        bps = new uint16[](3);
        bps[0] = 5000;
        bps[1] = 3000;
        bps[2] = 2000;
    }
}
