// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ARC_USDC} from "./interfaces/IUSDC.sol";

/// @title Splitline
/// @notice Immutable, pull-based USDC revenue splits on Arc.
/// @dev No owner, no admin, no fee, no upgrade path, not payable. Once created, a split's
///      recipients and shares can never change. Anyone may pay USDC into a split by id;
///      each recipient can claim their proportional share at any time (or redirect it to
///      another address they control), and anyone may push a payout to a fixed recipient.
///      Accounting is cumulative so that one reverting/blocklisted recipient can never
///      block another recipient's claim, and so rounding dust never accumulates beyond
///      the recipient count. Only the Arc ERC-20 USDC interface is used; no native value
///      is ever accepted.
contract Splitline is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_RECIPIENTS = 20;
    uint256 public constant TOTAL_BPS = 10_000;

    struct Split {
        string name;
        address[] recipients;
        uint16[] bps;
        uint256 totalReceived;
        uint256 totalReleased;
        mapping(address => uint256) released;
    }

    uint256 public nextId;
    mapping(uint256 => Split) private splits;

    event SplitCreated(uint256 indexed id, address indexed creator, string name, address[] recipients, uint16[] bps);
    event Paid(uint256 indexed id, address indexed payer, uint256 amount, bytes32 ref);
    event Claimed(uint256 indexed id, address indexed recipient, address to, uint256 amount);

    error InvalidRecipientCount();
    error ArrayLengthMismatch();
    error ZeroAddressRecipient();
    error DuplicateRecipient();
    error SelfReferentialRecipient();
    error BpsSumMismatch(uint256 sum);
    error SplitNotFound();
    error ZeroAmount();
    error NothingOwed();

    /// @notice Create an immutable split. Recipients and shares can never be changed afterward.
    /// @param name A human-readable label for the split.
    /// @param recipients Up to `MAX_RECIPIENTS` distinct, non-zero addresses.
    /// @param bps Basis-point share per recipient, parallel to `recipients`, summing to `TOTAL_BPS`.
    function createSplit(string calldata name, address[] calldata recipients, uint16[] calldata bps)
        external
        returns (uint256 id)
    {
        uint256 len = recipients.length;
        if (len == 0 || len > MAX_RECIPIENTS) revert InvalidRecipientCount();
        if (len != bps.length) revert ArrayLengthMismatch();

        uint256 sum;
        for (uint256 i = 0; i < len; ++i) {
            address r = recipients[i];
            if (r == address(0)) revert ZeroAddressRecipient();
            if (r == address(this)) revert SelfReferentialRecipient();
            for (uint256 j = i + 1; j < len; ++j) {
                if (recipients[j] == r) revert DuplicateRecipient();
            }
            sum += bps[i];
        }
        if (sum != TOTAL_BPS) revert BpsSumMismatch(sum);

        id = nextId++;
        Split storage s = splits[id];
        s.name = name;
        s.recipients = recipients;
        s.bps = bps;

        emit SplitCreated(id, msg.sender, name, recipients, bps);
    }

    /// @notice Pay USDC into a split. Caller must have approved this contract for `amount`.
    /// @param id The split to pay into.
    /// @param amount USDC amount in the token's 6-decimal base units.
    /// @param ref Opaque caller-supplied reference (e.g. an invoice id or its hash).
    function pay(uint256 id, uint256 amount, bytes32 ref) external nonReentrant {
        Split storage s = splits[id];
        if (s.recipients.length == 0) revert SplitNotFound();
        if (amount == 0) revert ZeroAmount();

        s.totalReceived += amount;
        IERC20(ARC_USDC).safeTransferFrom(msg.sender, address(this), amount);

        emit Paid(id, msg.sender, amount, ref);
    }

    /// @notice The amount `recipient` can currently claim from split `id`.
    function owed(uint256 id, address recipient) public view returns (uint256) {
        Split storage s = splits[id];
        if (s.recipients.length == 0) revert SplitNotFound();

        uint16 share = _bpsOf(s, recipient);
        if (share == 0) return 0;

        uint256 entitled = (s.totalReceived * share) / TOTAL_BPS;
        return entitled - s.released[recipient];
    }

    /// @notice Claim the caller's owed share of split `id` to the caller's own address.
    function claim(uint256 id) external nonReentrant {
        _release(id, msg.sender, msg.sender);
    }

    /// @notice Claim the caller's owed share of split `id` to an arbitrary address.
    /// @dev Escape hatch for a recipient whose own address cannot receive USDC
    ///      (for example, a blocklisted address) to redirect their payout elsewhere.
    function claimTo(uint256 id, address to) external nonReentrant {
        _release(id, msg.sender, to);
    }

    /// @notice Push `recipient`'s owed share of split `id` to `recipient`. Callable by anyone.
    /// @dev Always pays the recipient's own fixed address — there is no redirect here,
    ///      since the caller is not the recipient and so cannot authorize one.
    function release(uint256 id, address recipient) external nonReentrant {
        _release(id, recipient, recipient);
    }

    /// @notice The immutable configuration and running totals of split `id`.
    function getSplit(uint256 id)
        external
        view
        returns (
            string memory name,
            address[] memory recipients,
            uint16[] memory bps,
            uint256 totalReceived,
            uint256 totalReleased
        )
    {
        Split storage s = splits[id];
        if (s.recipients.length == 0) revert SplitNotFound();
        return (s.name, s.recipients, s.bps, s.totalReceived, s.totalReleased);
    }

    function _release(uint256 id, address recipient, address to) internal {
        if (to == address(0)) revert ZeroAddressRecipient();

        uint256 amount = owed(id, recipient);
        if (amount == 0) revert NothingOwed();

        Split storage s = splits[id];
        s.released[recipient] += amount;
        s.totalReleased += amount;

        IERC20(ARC_USDC).safeTransfer(to, amount);

        emit Claimed(id, recipient, to, amount);
    }

    function _bpsOf(Split storage s, address recipient) internal view returns (uint16) {
        address[] storage recipients = s.recipients;
        uint256 len = recipients.length;
        for (uint256 i = 0; i < len; ++i) {
            if (recipients[i] == recipient) return s.bps[i];
        }
        return 0;
    }
}
