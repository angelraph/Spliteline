// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Splitline} from "../Splitline.sol";
import {DepositAddress} from "../DepositAddress.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @dev Shared fixture: MockUSDC etched at the canonical USDC address, then Splitline deployed.
abstract contract SplitlineTestBase is Test {
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;
    bytes32 internal constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    MockUSDC internal usdc;
    Splitline internal sl;

    address internal payer = makeAddr("payer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");
    address internal eve = makeAddr("eve");

    function setUp() public virtual {
        MockUSDC mock = new MockUSDC();
        vm.etch(USDC_ADDR, address(mock).code);
        usdc = MockUSDC(USDC_ADDR);
        sl = new Splitline();

        usdc.mint(payer, 1e15);
        vm.prank(payer);
        usdc.approve(address(sl), type(uint256).max);
    }

    // ---------------------------------------------------------------- array helpers
    function _a1(address x) internal pure returns (address[] memory r) {
        r = new address[](1);
        r[0] = x;
    }

    function _a2(address x, address y) internal pure returns (address[] memory r) {
        r = new address[](2);
        r[0] = x;
        r[1] = y;
    }

    function _a3(address x, address y, address z) internal pure returns (address[] memory r) {
        r = new address[](3);
        r[0] = x;
        r[1] = y;
        r[2] = z;
    }

    function _b1(uint16 x) internal pure returns (uint16[] memory r) {
        r = new uint16[](1);
        r[0] = x;
    }

    function _b2(uint16 x, uint16 y) internal pure returns (uint16[] memory r) {
        r = new uint16[](2);
        r[0] = x;
        r[1] = y;
    }

    function _b3(uint16 x, uint16 y, uint16 z) internal pure returns (uint16[] memory r) {
        r = new uint16[](3);
        r[0] = x;
        r[1] = y;
        r[2] = z;
    }

    /// @dev n distinct addresses base, base+1, ...
    function _recipients(uint256 n, uint160 base) internal pure returns (address[] memory r) {
        r = new address[](n);
        for (uint256 i; i < n; ++i) {
            r[i] = address(base + uint160(i));
        }
    }

    function _uniform(uint256 n, uint16 w) internal pure returns (uint16[] memory b) {
        b = new uint16[](n);
        for (uint256 i; i < n; ++i) {
            b[i] = w;
        }
    }

    /// @dev Deterministic pseudo-random partition of 10000 into n positive weights (1 <= n <= 20).
    function _partition(uint256 seed, uint256 n) internal pure returns (uint16[] memory b) {
        b = new uint16[](n);
        uint256 rem = 10_000 - n; // extra weight beyond the 1 each recipient gets
        for (uint256 i; i + 1 < n; ++i) {
            uint256 cap = 2 * rem / (n - i);
            if (cap > rem) cap = rem;
            uint256 x = uint256(keccak256(abi.encode(seed, i))) % (cap + 1);
            b[i] = uint16(1 + x);
            rem -= x;
        }
        b[n - 1] = uint16(1 + rem);
    }

    function _isValidBps(uint16[] memory b) internal pure returns (bool) {
        if (b.length == 0 || b.length > 20) return false;
        uint256 sum;
        for (uint256 i; i < b.length; ++i) {
            if (b[i] == 0) return false;
            sum += b[i];
        }
        return sum == 10_000;
    }

    // ---------------------------------------------------------------- split helpers
    function _create(address[] memory r, uint16[] memory b) internal returns (uint256 id, address dep) {
        return sl.createSplit("split", r, b);
    }

    /// @dev alice 50% / bob 30% / carol 20%
    function _create3() internal returns (uint256 id, address dep) {
        return _create(_a3(alice, bob, carol), _b3(5000, 3000, 2000));
    }

    /// @dev Direct (non-pay) USDC transfer into a deposit clone, from `payer`.
    function _direct(address to, uint256 amount) internal {
        vm.prank(payer);
        usdc.transfer(to, amount);
    }

    /// @dev Count and sum Splitline `Swept` events (optionally filtered by id; id == 0 means any).
    function _swept(Vm.Log[] memory logs, uint256 id) internal view returns (uint256 count, uint256 sum) {
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != address(sl) || logs[i].topics[0] != Splitline.Swept.selector) continue;
            if (id != 0 && uint256(logs[i].topics[1]) != id) continue;
            ++count;
            sum += abi.decode(logs[i].data, (uint256));
        }
    }

    /// @dev Count Splitline `Claimed` events.
    function _claimedCount(Vm.Log[] memory logs) internal view returns (uint256 count) {
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(sl) && logs[i].topics[0] == Splitline.Claimed.selector) ++count;
        }
    }

    function _total(uint256 id) internal view returns (uint256 t) {
        (,,,, t) = sl.getSplit(id);
    }

    function _pay(uint256 id, uint256 amount) internal {
        vm.prank(payer);
        sl.pay(id, amount, bytes32(0));
    }

    /// @dev Recomputes the deposit address "off-chain style", independent of Splitline's own helper.
    function _independentPredict(address creator, string memory name, address[] memory r, uint16[] memory b)
        internal
        view
        returns (address)
    {
        bytes32 salt = keccak256(abi.encode(creator, name, r, b));
        return Clones.predictDeterministicAddress(sl.DEPOSIT_IMPLEMENTATION(), salt, address(sl));
    }

    function _permitSig(uint256 pk, address owner_, uint256 value, uint256 deadline)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 structHash =
            keccak256(abi.encode(PERMIT_TYPEHASH, owner_, address(sl), value, usdc.nonces(owner_), deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(pk, digest);
    }
}
