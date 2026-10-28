// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {DepositAddress} from "./DepositAddress.sol";

/// @title Splitline
/// @notice Immutable, permissionless, pull-based Arc USDC revenue splits.
/// @dev Assumes trusted USDC with exact transfers (not fee-on-transfer). All amounts use six decimals.
/// USDC sent directly to Splitline outside pay/payWithPermit/sweep, or sent to the DepositAddress
/// implementation, is not creditable and is permanently stuck. There is no rescue or administrator.
/// A blocklisted deposit address prevents only that split's sweep; direct pay remains available
/// subject to USDC's other transfer restrictions. Payouts are independent and never iterate recipients.
/// Cumulative floor-rounded entitlements are monotonic; unallocated rounding dust is less than the
/// recipient count in base units per split and stays here until later revenue changes entitlements.
/// Clone addresses commit to creator, name and recipient configuration. Under hash preimage/fixed-point
/// hardness, this makes cyclic address dependencies computationally infeasible (not a mathematical
/// assertion that hash fixed points do not exist). Self-deposit recipients are also explicitly rejected.
/// claim, claimTo and release first sweep the split's own deposit clone best-effort (zero balance or a
/// failing clone never reverts the payout), so direct deposits count without a separate sweep call.
/// For nesting, release(parent, childDeposit) funds a child clone; the child is credited by the next
/// sweep(child) or by any claim, claimTo or release on the child.
/// There is no automatic recursive sweep, payable entry point, receive, or fallback function.
contract Splitline is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Arc USDC ERC-20 address; six decimals.
    address public constant USDC = 0x3600000000000000000000000000000000000000;
    /// @notice Maximum recipients in a split.
    uint256 public constant MAX_RECIPIENTS = 20;
    /// @notice Stateless implementation used by every deterministic deposit clone.
    address public immutable DEPOSIT_IMPLEMENTATION;
    /// @notice Next split id; existing ids satisfy 0 < id < nextId.
    uint256 public nextId = 1;

    uint256 private constant BPS_DENOMINATOR = 10_000;

    struct Split {
        string name;
        address[] recipients;
        uint16[] bps;
        address depositAddress;
        uint256 totalReceived;
    }

    mapping(uint256 => Split) private _splits;
    mapping(uint256 => mapping(address => uint256)) private _released;
    mapping(uint256 => mapping(address => uint16)) private _bpsOf;

    /// @notice The specified split does not exist.
    error SplitNotFound();
    /// @notice This creator already created a split with the same name, recipients and weights.
    error SplitAlreadyExists();
    /// @notice A name exceeds 64 bytes.
    error NameTooLong();
    /// @notice Recipient count is outside 1..20.
    error InvalidRecipientCount();
    /// @notice Recipient and basis-point arrays have different lengths.
    error LengthMismatch();
    /// @notice A recipient is zero, forbidden, or the split's own deposit address.
    error InvalidRecipient();
    /// @notice A recipient occurs more than once.
    error DuplicateRecipient();
    /// @notice A weight is zero or weights do not total 10,000.
    error InvalidBps();
    /// @notice Payment amount is zero.
    error ZeroAmount();
    /// @notice The deposit clone has no USDC to credit.
    error NothingToSweep();
    /// @notice The account is not a recipient of the split.
    error NotRecipient();
    /// @notice A payout destination is zero or Splitline itself.
    error InvalidDestination();
    /// @notice The recipient has no currently claimable entitlement.
    error NothingOwed();

    /// @notice Emitted when an immutable split and its deposit clone are created.
    event SplitCreated(
        uint256 indexed id,
        address indexed creator,
        address indexed depositAddress,
        string name,
        address[] recipients,
        uint16[] bps
    );
    /// @notice Emitted for a credited direct payment with a caller-supplied reference.
    event Paid(uint256 indexed id, address indexed payer, uint256 amount, bytes32 indexed ref);
    /// @notice Emitted when a nonzero clone balance is forwarded and credited.
    event Swept(uint256 indexed id, uint256 amount);
    /// @notice Emitted for a payout against a recipient's cumulative entitlement.
    event Claimed(uint256 indexed id, address indexed recipient, address to, uint256 amount);

    /// @notice Create the immutable deposit implementation, with this contract as its sole caller.
    constructor() {
        DEPOSIT_IMPLEMENTATION = address(new DepositAddress());
    }

    /// @notice Create a permanently immutable split and deterministic deposit clone.
    /// @dev The salt is keccak256(abi.encode(msg.sender, name, recipients, bps)); it excludes the id so the
    /// address is stable under concurrent creations. Creating the same (creator, name, recipients, bps) twice
    /// reverts SplitAlreadyExists; vary the name for a second split with identical recipients.
    /// Address dependencies prevent feasible cyclic nesting under hash fixed-point hardness.
    /// To nest, prefer a recipient that is an already-created split's depositAddressOf; a recipient that
    /// is a not-yet-created deposit address only works if that exact split is later created.
    /// @param name Display name, at most 64 bytes; may be empty.
    /// @param recipients Unique permitted recipient addresses, between one and twenty.
    /// @param bps Positive weights totaling exactly 10,000 in recipient order.
    /// @return id The newly allocated split id.
    /// @return depositAddress Its deployed EIP-1167 deposit clone.
    function createSplit(string calldata name, address[] calldata recipients, uint16[] calldata bps)
        external
        nonReentrant
        returns (uint256 id, address depositAddress)
    {
        if (bytes(name).length > 64) revert NameTooLong();
        uint256 count = recipients.length;
        if (count == 0 || count > MAX_RECIPIENTS) revert InvalidRecipientCount();
        if (count != bps.length) revert LengthMismatch();

        id = nextId;
        bytes32 salt = _salt(msg.sender, name, recipients, bps);
        depositAddress = Clones.predictDeterministicAddress(DEPOSIT_IMPLEMENTATION, salt, address(this));
        if (depositAddress.code.length != 0) revert SplitAlreadyExists();
        Split storage split = _splits[id];
        uint256 sum;
        for (uint256 i; i < count; ++i) {
            address recipient = recipients[i];
            uint16 weight = bps[i];
            if (
                recipient == address(0) || recipient == address(this) || recipient == DEPOSIT_IMPLEMENTATION
                    || recipient == USDC || recipient == depositAddress
            ) revert InvalidRecipient();
            if (weight == 0) revert InvalidBps();
            if (_bpsOf[id][recipient] != 0) revert DuplicateRecipient();
            _bpsOf[id][recipient] = weight;
            split.recipients.push(recipient);
            split.bps.push(weight);
            sum += weight;
        }
        if (sum != BPS_DENOMINATOR) revert InvalidBps();
        split.name = name;
        split.depositAddress = depositAddress;
        nextId = id + 1;

        Clones.cloneDeterministic(DEPOSIT_IMPLEMENTATION, salt);
        emit SplitCreated(id, msg.sender, depositAddress, name, recipients, bps);
    }

    /// @notice Credit an exact USDC payment to an existing split using an ERC-20 allowance.
    /// @param id Existing split id.
    /// @param amount Positive USDC amount in base units.
    /// @param ref Caller-supplied payment reference.
    function pay(uint256 id, uint256 amount, bytes32 ref) external nonReentrant {
        _pay(id, amount, ref);
    }

    /// @notice Attempt EIP-2612 permit, then credit the same payment as pay.
    /// @dev Permit failure is tolerated for front-run permits or an already sufficient allowance;
    /// transferFrom must still succeed. Unknown ids and zero amounts revert before the permit call.
    /// @param id Existing split id.
    /// @param amount Positive USDC amount and permit allowance in base units.
    /// @param ref Caller-supplied payment reference.
    /// @param deadline Permit expiry timestamp.
    /// @param v Signature recovery byte.
    /// @param r Signature r component.
    /// @param s Signature s component.
    function payWithPermit(
        uint256 id,
        uint256 amount,
        bytes32 ref,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        _requireSplit(id);
        if (amount == 0) revert ZeroAmount();
        try IERC20Permit(USDC).permit(msg.sender, address(this), amount, deadline, v, r, s) {} catch {}
        _pay(id, amount, ref);
    }

    /// @notice Forward and credit an existing split's entire deposit balance; callable by anyone.
    /// @dev Zero balance reverts NothingToSweep with no event or state change. The guard covers
    /// the forward-before-accounting interaction; this is necessary to discover the exact amount.
    /// @param id Existing split id.
    /// @return amount USDC base units forwarded and credited.
    function sweep(uint256 id) external nonReentrant returns (uint256 amount) {
        Split storage split = _requireSplit(id);
        amount = DepositAddress(split.depositAddress).forward();
        if (amount == 0) revert NothingToSweep();
        split.totalReceived += amount;
        emit Swept(id, amount);
    }

    /// @dev Best-effort sweep used by payouts. A zero balance is a silent no-op, and a failing forward
    /// (for example a blocklisted deposit clone) is swallowed so one tainted clone can never block
    /// anyone's payout of already-credited revenue. The public sweep still reverts in both cases.
    /// Only the trusted clone and USDC are called, and every caller is nonReentrant.
    function _trySweep(uint256 id, Split storage split) private {
        try DepositAddress(split.depositAddress).forward() returns (uint256 amount) {
            if (amount != 0) {
                split.totalReceived += amount;
                emit Swept(id, amount);
            }
        } catch {}
    }

    /// @notice Claim the caller's currently owed USDC to the caller's address.
    /// @param id Existing split id containing the caller as a recipient.
    function claim(uint256 id) external nonReentrant {
        _release(id, msg.sender, msg.sender);
    }

    /// @notice Claim the caller's entitlement to another destination, including for blocklist redirection.
    /// @param id Existing split id containing the caller as a recipient.
    /// @param to Destination other than zero or Splitline itself.
    function claimTo(uint256 id, address to) external nonReentrant {
        _requireSplit(id);
        if (_bpsOf[id][msg.sender] == 0) revert NotRecipient();
        if (to == address(0) || to == address(this)) revert InvalidDestination();
        _release(id, msg.sender, to);
    }

    /// @notice Release a recipient's entitlement only to that recipient; callable by anyone.
    /// @dev Use this for nested split deposit clones, which cannot initiate claims themselves.
    /// @param id Existing split id.
    /// @param recipient Recipient whose entitlement is paid to its own address.
    function release(uint256 id, address recipient) external nonReentrant {
        _release(id, recipient, recipient);
    }

    /// @notice Return an existing split's immutable configuration and cumulative credited revenue.
    /// @param id Existing split id; otherwise reverts SplitNotFound.
    /// @return name Display name.
    /// @return recipients Ordered recipient addresses.
    /// @return bps Ordered basis-point weights.
    /// @return depositAddress Deployed clone address.
    /// @return totalReceived Lifetime credited USDC, without deducting payouts.
    function getSplit(uint256 id)
        external
        view
        returns (
            string memory name,
            address[] memory recipients,
            uint16[] memory bps,
            address depositAddress,
            uint256 totalReceived
        )
    {
        Split storage split = _requireSplit(id);
        return (split.name, split.recipients, split.bps, split.depositAddress, split.totalReceived);
    }

    /// @notice Return the unpaid cumulative floor-rounded entitlement; non-recipients return zero.
    /// @param id Existing split id; otherwise reverts SplitNotFound.
    /// @param recipient Account to query.
    /// @return amount Currently owed USDC base units.
    function owed(uint256 id, address recipient) external view returns (uint256 amount) {
        Split storage split = _requireSplit(id);
        return _entitlement(split.totalReceived, _bpsOf[id][recipient]) - _released[id][recipient];
    }

    /// @notice Return lifetime USDC released against a recipient, with mapping-compatible ABI.
    /// @param id Existing split id; otherwise reverts SplitNotFound.
    /// @param recipient Account to query; non-recipients return zero.
    /// @return amount Cumulative released USDC base units, regardless of payout destination.
    function released(uint256 id, address recipient) external view returns (uint256 amount) {
        _requireSplit(id);
        return _released[id][recipient];
    }

    /// @notice Return a recipient's immutable weight; zero means not a recipient.
    /// @param id Existing split id; otherwise reverts SplitNotFound.
    /// @param recipient Account to query.
    /// @return weight Basis-point weight.
    function bpsOf(uint256 id, address recipient) external view returns (uint16 weight) {
        _requireSplit(id);
        return _bpsOf[id][recipient];
    }

    /// @notice Look up the stored deposit address after split creation.
    /// @param id Existing split id; otherwise reverts SplitNotFound.
    /// @return depositAddress The deployed deposit clone.
    function depositAddressOf(uint256 id) external view returns (address depositAddress) {
        return _requireSplit(id).depositAddress;
    }

    /// @notice Predict a deposit address before creation, also reproducible off-chain.
    /// @dev Intentionally accepts prospective configurations without validity checks. The address
    /// depends only on (creator, name, recipients, bps), never on the split id, so concurrent
    /// creations by other accounts cannot shift or hijack it. Funds sent to it before creation are
    /// recovered by sweep once the creator creates exactly this configuration; they are stranded if it is never created.
    /// @param creator Account that will call createSplit.
    /// @param name Exact display name that will be passed to createSplit.
    /// @param recipients Recipient addresses in their exact intended order.
    /// @param bps Basis-point weights in the same order.
    /// @return depositAddress Predicted address for this factory and implementation.
    function predictDepositAddress(
        address creator,
        string calldata name,
        address[] calldata recipients,
        uint16[] calldata bps
    ) external view returns (address depositAddress) {
        return Clones.predictDeterministicAddress(
            DEPOSIT_IMPLEMENTATION, _salt(creator, name, recipients, bps), address(this)
        );
    }

    function _pay(uint256 id, uint256 amount, bytes32 ref) private {
        Split storage split = _requireSplit(id);
        if (amount == 0) revert ZeroAmount();
        split.totalReceived += amount;
        IERC20(USDC).safeTransferFrom(msg.sender, address(this), amount);
        emit Paid(id, msg.sender, amount, ref);
    }

    function _release(uint256 id, address recipient, address to) private {
        Split storage split = _requireSplit(id);
        uint16 weight = _bpsOf[id][recipient];
        if (weight == 0) revert NotRecipient();
        // The sweep must precede the owed computation: it can only raise totalReceived, and the
        // released update below still happens before the payout transfer.
        _trySweep(id, split);
        uint256 amount = _entitlement(split.totalReceived, weight) - _released[id][recipient];
        if (amount == 0) revert NothingOwed();
        _released[id][recipient] += amount;
        IERC20(USDC).safeTransfer(to, amount);
        emit Claimed(id, recipient, to, amount);
    }

    function _requireSplit(uint256 id) private view returns (Split storage split) {
        if (id == 0 || id >= nextId) revert SplitNotFound();
        return _splits[id];
    }

    function _entitlement(uint256 totalReceived, uint16 weight) private pure returns (uint256) {
        return Math.mulDiv(totalReceived, uint256(weight), BPS_DENOMINATOR);
    }

    function _salt(address creator, string calldata name, address[] calldata recipients, uint16[] calldata bps)
        private
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(creator, name, recipients, bps));
    }
}
