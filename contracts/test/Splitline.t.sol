// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SplitlineTestBase} from "./utils/SplitlineTestBase.sol";
import {Splitline} from "../src/Splitline.sol";
import {ARC_USDC} from "../src/interfaces/IUSDC.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BlocklistingMockUSDC} from "./mocks/MockUSDC.sol";

contract SplitlineTest is SplitlineTestBase {
    // Mirrors Splitline's event signatures so `vm.expectEmit` can match logs it emits.
    event Paid(uint256 indexed id, address indexed payer, uint256 amount, bytes32 ref);
    event Claimed(uint256 indexed id, address indexed recipient, address to, uint256 amount);

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal payer = makeAddr("payer");

    function _recipients() internal view returns (address[] memory recipients, uint16[] memory bps) {
        recipients = new address[](3);
        recipients[0] = alice;
        recipients[1] = bob;
        recipients[2] = carol;
        bps = new uint16[](3);
        bps[0] = 5000;
        bps[1] = 3000;
        bps[2] = 2000;
    }

    // ── createSplit ─────────────────────────────────────────────────────────

    function test_CreateSplit_Success() public {
        (address[] memory recipients, uint16[] memory bps) = _recipients();
        uint256 id = splitline.createSplit("Team", recipients, bps);

        (string memory name, address[] memory r, uint16[] memory b, uint256 totalReceived, uint256 totalReleased) =
            splitline.getSplit(id);

        assertEq(name, "Team");
        assertEq(r.length, 3);
        assertEq(r[0], alice);
        assertEq(b[0], 5000);
        assertEq(totalReceived, 0);
        assertEq(totalReleased, 0);
        assertEq(splitline.nextId(), 1);
    }

    function test_CreateSplit_RevertsOnTooManyRecipients() public {
        address[] memory recipients = new address[](21);
        uint16[] memory bps = new uint16[](21);
        for (uint256 i; i < 21; ++i) {
            recipients[i] = address(uint160(i + 1));
        }
        vm.expectRevert(Splitline.InvalidRecipientCount.selector);
        splitline.createSplit("Too many", recipients, bps);
    }

    function test_CreateSplit_RevertsOnZeroRecipients() public {
        vm.expectRevert(Splitline.InvalidRecipientCount.selector);
        splitline.createSplit("Empty", new address[](0), new uint16[](0));
    }

    function test_CreateSplit_RevertsOnLengthMismatch() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;
        uint16[] memory bps = new uint16[](1);
        bps[0] = 10_000;

        vm.expectRevert(Splitline.ArrayLengthMismatch.selector);
        splitline.createSplit("Mismatch", recipients, bps);
    }

    function test_CreateSplit_RevertsOnZeroAddress() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = address(0);
        uint16[] memory bps = new uint16[](2);
        bps[0] = 5000;
        bps[1] = 5000;

        vm.expectRevert(Splitline.ZeroAddressRecipient.selector);
        splitline.createSplit("Zero", recipients, bps);
    }

    function test_CreateSplit_RevertsOnDuplicateRecipient() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = alice;
        uint16[] memory bps = new uint16[](2);
        bps[0] = 5000;
        bps[1] = 5000;

        vm.expectRevert(Splitline.DuplicateRecipient.selector);
        splitline.createSplit("Dup", recipients, bps);
    }

    function test_CreateSplit_RevertsOnSelfReferentialRecipient() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = address(splitline);
        uint16[] memory bps = new uint16[](2);
        bps[0] = 5000;
        bps[1] = 5000;

        vm.expectRevert(Splitline.SelfReferentialRecipient.selector);
        splitline.createSplit("Self", recipients, bps);
    }

    function test_CreateSplit_RevertsOnBadBpsSum() public {
        (address[] memory recipients,) = _recipients();
        uint16[] memory bps = new uint16[](3);
        bps[0] = 5000;
        bps[1] = 3000;
        bps[2] = 1999; // sums to 9999, not 10000

        vm.expectRevert(abi.encodeWithSelector(Splitline.BpsSumMismatch.selector, 9999));
        splitline.createSplit("Bad sum", recipients, bps);
    }

    // ── pay ──────────────────────────────────────────────────────────────────

    function test_Pay_IncreasesTotalReceivedAndEmits() public {
        (address[] memory recipients, uint16[] memory bps) = _recipients();
        uint256 id = splitline.createSplit("Team", recipients, bps);

        _mintAndApprove(payer, 100e6);

        vm.expectEmit(true, true, false, true, address(splitline));
        emit Paid(id, payer, 100e6, bytes32("invoice-1"));

        vm.prank(payer);
        splitline.pay(id, 100e6, bytes32("invoice-1"));

        (,,, uint256 totalReceived,) = splitline.getSplit(id);
        assertEq(totalReceived, 100e6);
        assertEq(usdc.balanceOf(address(splitline)), 100e6);
    }

    function test_Pay_RevertsOnZeroAmount() public {
        (address[] memory recipients, uint16[] memory bps) = _recipients();
        uint256 id = splitline.createSplit("Team", recipients, bps);

        vm.expectRevert(Splitline.ZeroAmount.selector);
        splitline.pay(id, 0, bytes32(0));
    }

    function test_Pay_RevertsWhenSplitNotFound() public {
        vm.expectRevert(Splitline.SplitNotFound.selector);
        splitline.pay(999, 1, bytes32(0));
    }

    function test_Pay_AccumulatesAcrossMultiplePayers() public {
        (address[] memory recipients, uint16[] memory bps) = _recipients();
        uint256 id = splitline.createSplit("Team", recipients, bps);

        address payer2 = makeAddr("payer2");
        _mintAndApprove(payer, 60e6);
        _mintAndApprove(payer2, 40e6);

        vm.prank(payer);
        splitline.pay(id, 60e6, bytes32(0));
        vm.prank(payer2);
        splitline.pay(id, 40e6, bytes32(0));

        (,,, uint256 totalReceived,) = splitline.getSplit(id);
        assertEq(totalReceived, 100e6);
        assertEq(splitline.owed(id, alice), 50e6);
    }

    // ── owed / claim / claimTo / release ───────────────────────────────────

    function test_Owed_ComputesProportionalShare() public {
        (address[] memory recipients, uint16[] memory bps) = _recipients();
        uint256 id = splitline.createSplit("Team", recipients, bps);

        _mintAndApprove(payer, 100e6);
        vm.prank(payer);
        splitline.pay(id, 100e6, bytes32(0));

        assertEq(splitline.owed(id, alice), 50e6);
        assertEq(splitline.owed(id, bob), 30e6);
        assertEq(splitline.owed(id, carol), 20e6);
        assertEq(splitline.owed(id, payer), 0);
    }

    function test_Owed_RevertsWhenSplitNotFound() public {
        vm.expectRevert(Splitline.SplitNotFound.selector);
        splitline.owed(999, alice);
    }

    function test_Claim_TransfersAndUpdatesReleased() public {
        (address[] memory recipients, uint16[] memory bps) = _recipients();
        uint256 id = splitline.createSplit("Team", recipients, bps);

        _mintAndApprove(payer, 100e6);
        vm.prank(payer);
        splitline.pay(id, 100e6, bytes32(0));

        vm.expectEmit(true, true, false, true, address(splitline));
        emit Claimed(id, alice, alice, 50e6);

        vm.prank(alice);
        splitline.claim(id);

        assertEq(usdc.balanceOf(alice), 50e6);
        assertEq(splitline.owed(id, alice), 0);
        (,,,, uint256 totalReleased) = splitline.getSplit(id);
        assertEq(totalReleased, 50e6);
    }

    function test_ClaimTo_RedirectsToArbitraryAddress() public {
        (address[] memory recipients, uint16[] memory bps) = _recipients();
        uint256 id = splitline.createSplit("Team", recipients, bps);

        _mintAndApprove(payer, 100e6);
        vm.prank(payer);
        splitline.pay(id, 100e6, bytes32(0));

        address rescue = makeAddr("rescue");
        vm.prank(alice);
        splitline.claimTo(id, rescue);

        assertEq(usdc.balanceOf(rescue), 50e6);
        assertEq(usdc.balanceOf(alice), 0);
    }

    function test_ClaimTo_RevertsOnZeroAddress() public {
        (address[] memory recipients, uint16[] memory bps) = _recipients();
        uint256 id = splitline.createSplit("Team", recipients, bps);

        _mintAndApprove(payer, 100e6);
        vm.prank(payer);
        splitline.pay(id, 100e6, bytes32(0));

        vm.prank(alice);
        vm.expectRevert(Splitline.ZeroAddressRecipient.selector);
        splitline.claimTo(id, address(0));
    }

    function test_Claim_RevertsWhenNothingOwed() public {
        (address[] memory recipients, uint16[] memory bps) = _recipients();
        uint256 id = splitline.createSplit("Team", recipients, bps);

        vm.prank(alice);
        vm.expectRevert(Splitline.NothingOwed.selector);
        splitline.claim(id);
    }

    function test_Claim_RevertsForNonRecipient() public {
        (address[] memory recipients, uint16[] memory bps) = _recipients();
        uint256 id = splitline.createSplit("Team", recipients, bps);

        _mintAndApprove(payer, 100e6);
        vm.prank(payer);
        splitline.pay(id, 100e6, bytes32(0));

        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(Splitline.NothingOwed.selector);
        splitline.claim(id);
    }

    function test_Claim_RevertsOnSecondClaimWithNothingNewOwed() public {
        (address[] memory recipients, uint16[] memory bps) = _recipients();
        uint256 id = splitline.createSplit("Team", recipients, bps);

        _mintAndApprove(payer, 100e6);
        vm.prank(payer);
        splitline.pay(id, 100e6, bytes32(0));

        vm.prank(alice);
        splitline.claim(id);

        vm.prank(alice);
        vm.expectRevert(Splitline.NothingOwed.selector);
        splitline.claim(id);
    }

    function test_Claim_SecondPaymentMakesMoreOwed() public {
        (address[] memory recipients, uint16[] memory bps) = _recipients();
        uint256 id = splitline.createSplit("Team", recipients, bps);

        _mintAndApprove(payer, 100e6);
        vm.prank(payer);
        splitline.pay(id, 100e6, bytes32(0));

        vm.prank(alice);
        splitline.claim(id);
        assertEq(usdc.balanceOf(alice), 50e6);

        _mintAndApprove(payer, 100e6);
        vm.prank(payer);
        splitline.pay(id, 100e6, bytes32(0));

        assertEq(splitline.owed(id, alice), 50e6);
        vm.prank(alice);
        splitline.claim(id);
        assertEq(usdc.balanceOf(alice), 100e6);
    }

    function test_Release_AnyoneCanPushToRecipient() public {
        (address[] memory recipients, uint16[] memory bps) = _recipients();
        uint256 id = splitline.createSplit("Team", recipients, bps);

        _mintAndApprove(payer, 100e6);
        vm.prank(payer);
        splitline.pay(id, 100e6, bytes32(0));

        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        splitline.release(id, bob);

        assertEq(usdc.balanceOf(bob), 30e6);
    }

    function test_Release_RevertsWhenNothingOwed() public {
        (address[] memory recipients, uint16[] memory bps) = _recipients();
        uint256 id = splitline.createSplit("Team", recipients, bps);

        vm.expectRevert(Splitline.NothingOwed.selector);
        splitline.release(id, alice);
    }

    // ── getSplit ─────────────────────────────────────────────────────────────

    function test_GetSplit_RevertsWhenNotFound() public {
        vm.expectRevert(Splitline.SplitNotFound.selector);
        splitline.getSplit(42);
    }

    function test_GetSplit_ReturnsCorrectData() public {
        (address[] memory recipients, uint16[] memory bps) = _recipients();
        uint256 id = splitline.createSplit("Founders", recipients, bps);

        _mintAndApprove(payer, 10e6);
        vm.prank(payer);
        splitline.pay(id, 10e6, bytes32(0));

        vm.prank(bob);
        splitline.claim(id);

        (string memory name, address[] memory r, uint16[] memory b, uint256 totalReceived, uint256 totalReleased) =
            splitline.getSplit(id);

        assertEq(name, "Founders");
        assertEq(r[2], carol);
        assertEq(b[1], 3000);
        assertEq(totalReceived, 10e6);
        assertEq(totalReleased, 3e6);
    }
}

/// @notice Proves a single blocklisted/reverting recipient can never block another
///         recipient's claim — accounting and payouts are fully independent per recipient.
contract SplitlineBlocklistTest is SplitlineTestBase {
    function setUp() public override {
        splitline = new Splitline();

        BlocklistingMockUSDC impl = new BlocklistingMockUSDC();
        vm.etch(ARC_USDC, address(impl).code);
        // Note: deliberately not assigning the inherited `usdc` (typed MockUSDC) field —
        // this fixture etches a different mock with an incompatible type; all token calls
        // below go through BlocklistingMockUSDC(ARC_USDC) / IERC20(ARC_USDC) directly.
    }

    function test_OneBlocklistedRecipient_DoesNotBlockOthers() public {
        address alice = makeAddr("alice");
        address bob = makeAddr("bob");
        address payer = makeAddr("payer");

        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;
        uint16[] memory bps = new uint16[](2);
        bps[0] = 6000;
        bps[1] = 4000;
        uint256 id = splitline.createSplit("Pair", recipients, bps);

        BlocklistingMockUSDC(ARC_USDC).mint(payer, 100e6);
        vm.prank(payer);
        IERC20(ARC_USDC).approve(address(splitline), 100e6);
        vm.prank(payer);
        splitline.pay(id, 100e6, bytes32(0));

        BlocklistingMockUSDC(ARC_USDC).setBlocked(alice);

        vm.prank(alice);
        vm.expectRevert();
        splitline.claim(id);

        vm.prank(bob);
        splitline.claim(id);
        assertEq(IERC20(ARC_USDC).balanceOf(bob), 40e6);

        address rescue = makeAddr("rescue");
        vm.prank(alice);
        splitline.claimTo(id, rescue);
        assertEq(IERC20(ARC_USDC).balanceOf(rescue), 60e6);
    }
}
