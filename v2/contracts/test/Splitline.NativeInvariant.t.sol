// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {SplitlineNativeBase} from "./Splitline.NativeBase.t.sol";
import {Splitline} from "../Splitline.sol";
import {MockArcUSDC} from "./mocks/MockArcUSDC.sol";

/// @dev Drives native + ERC-20 payments, direct deposits (incl. sub-unit remainders), sweeps and payouts
/// across several splits, tracking ghosts in 6-decimal units (wei where noted).
contract NativeHandler is Test {
    uint256 internal constant SCALE = 1e12;
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    Splitline public immutable SL;
    MockArcUSDC internal usdc = MockArcUSDC(USDC_ADDR);
    address public payer;
    address public sink = makeAddr("sink");
    uint256 public nIds;

    // aggregate ghosts (6-decimal units)
    uint256 public totalPaid;
    uint256 public totalSwept;
    uint256 public totalClaimed;
    // per-split ghosts
    mapping(uint256 => uint256) public directOf; // pay + payNative units
    mapping(uint256 => uint256) public sweptOf; // swept units
    mapping(uint256 => uint256) public weiIn; // wei that entered the split's clone
    mapping(uint256 => uint256) public nativeIn; // wei sent natively to the clone
    mapping(uint256 => mapping(address => uint256)) public claimedBy;
    // topology
    mapping(address => uint256) public depId;
    mapping(uint256 => address[]) internal _recipients;
    mapping(uint256 => address[]) internal _eoas;
    address[] internal _deps;
    address[] internal _dests;
    uint256 public initialNative;

    constructor(Splitline sl_, address payer_, uint256 n) {
        SL = sl_;
        payer = payer_;
        nIds = n;
        _dests.push(sink);
        for (uint256 id = 1; id <= n; ++id) {
            (,,, address dep,) = sl_.getSplit(id);
            depId[dep] = id;
            _deps.push(dep);
            _dests.push(dep);
        }
        for (uint256 id = 1; id <= n; ++id) {
            (, address[] memory rs,,,) = sl_.getSplit(id);
            for (uint256 i; i < rs.length; ++i) {
                _recipients[id].push(rs[i]);
                if (depId[rs[i]] == 0) {
                    _eoas[id].push(rs[i]);
                    _dests.push(rs[i]);
                }
            }
        }
        initialNative = trackedNative();
    }

    // ---------------------------------------------------------------- views for invariants
    function depositOf(uint256 id) external view returns (address) {
        return _deps[id - 1];
    }

    function recipientsOf(uint256 id) external view returns (address[] memory) {
        return _recipients[id];
    }

    /// @dev Sum of native balances of every account that can ever hold value in this scenario.
    function trackedNative() public view returns (uint256 sum) {
        sum = address(SL).balance + payer.balance + sink.balance;
        for (uint256 i; i < _deps.length; ++i) {
            sum += _deps[i].balance;
        }
        for (uint256 id = 1; id <= nIds; ++id) {
            for (uint256 j; j < _eoas[id].length; ++j) {
                sum += _eoas[id][j].balance;
            }
        }
        // an eoa may appear in several splits: subtract duplicates
        sum -= _duplicateBalances();
    }

    function _duplicateBalances() internal view returns (uint256 dup) {
        for (uint256 id = 1; id <= nIds; ++id) {
            for (uint256 j; j < _eoas[id].length; ++j) {
                address a = _eoas[id][j];
                for (uint256 prev = 1; prev < id; ++prev) {
                    if (_contains(_eoas[prev], a)) {
                        dup += a.balance;
                        break;
                    }
                }
            }
        }
    }

    function _contains(address[] storage arr, address a) internal view returns (bool) {
        for (uint256 i; i < arr.length; ++i) {
            if (arr[i] == a) return true;
        }
        return false;
    }

    // ---------------------------------------------------------------- helpers
    function _id(uint256 seed) internal view returns (uint256) {
        return (seed % nIds) + 1;
    }

    function _absorb() internal {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != address(SL)) continue;
            bytes32 t0 = logs[i].topics[0];
            if (t0 == Splitline.Swept.selector) {
                uint256 id = uint256(logs[i].topics[1]);
                uint256 amt = abi.decode(logs[i].data, (uint256));
                totalSwept += amt;
                sweptOf[id] += amt;
            } else if (t0 == Splitline.Claimed.selector) {
                uint256 id = uint256(logs[i].topics[1]);
                address rcpt = address(uint160(uint256(logs[i].topics[2])));
                (address to, uint256 amt) = abi.decode(logs[i].data, (address, uint256));
                totalClaimed += amt;
                claimedBy[id][rcpt] += amt;
                if (depId[to] != 0) weiIn[depId[to]] += amt * SCALE;
            }
        }
    }

    // ---------------------------------------------------------------- actions
    function payNative(uint256 idSeed, uint256 units, bytes32 ref) external {
        uint256 id = _id(idSeed);
        units = bound(units, 1, 1e9);
        vm.prank(payer);
        SL.payNative{value: units * SCALE}(id, ref);
        totalPaid += units;
        directOf[id] += units;
    }

    function pay(uint256 idSeed, uint256 units, bytes32 ref) external {
        uint256 id = _id(idSeed);
        units = bound(units, 1, 1e9);
        vm.prank(payer);
        SL.pay(id, units, ref);
        totalPaid += units;
        directOf[id] += units;
    }

    function nativeToDeposit(uint256 idSeed, uint256 w) external {
        uint256 id = _id(idSeed);
        w = (w % 4 == 0) ? bound(w, 1, 2 * SCALE) : bound(w, 1, 1e18);
        vm.prank(payer);
        (bool ok,) = _deps[id - 1].call{value: w}("");
        require(ok, "native to deposit failed");
        weiIn[id] += w;
        nativeIn[id] += w;
    }

    function erc20ToDeposit(uint256 idSeed, uint256 units) external {
        uint256 id = _id(idSeed);
        units = bound(units, 1, 1e9);
        vm.prank(payer);
        usdc.transfer(_deps[id - 1], units);
        weiIn[id] += units * SCALE;
    }

    function sweep(uint256 idSeed) external {
        uint256 id = _id(idSeed);
        vm.recordLogs();
        try SL.sweep(id) {
            _absorb();
        } catch {
            vm.getRecordedLogs(); // logs of a reverted call are rolled back on-chain: discard them
        }
    }

    function claim(uint256 idSeed, uint256 actorSeed) external {
        uint256 id = _id(idSeed);
        if (_eoas[id].length == 0) return;
        address actor = _eoas[id][actorSeed % _eoas[id].length];
        vm.recordLogs();
        vm.prank(actor);
        try SL.claim(id) {
            _absorb();
        } catch {
            vm.getRecordedLogs(); // logs of a reverted call are rolled back on-chain: discard them
        }
    }

    function claimTo(uint256 idSeed, uint256 actorSeed, uint256 destSeed) external {
        uint256 id = _id(idSeed);
        if (_eoas[id].length == 0) return;
        address actor = _eoas[id][actorSeed % _eoas[id].length];
        address dest = _dests[destSeed % _dests.length];
        vm.recordLogs();
        vm.prank(actor);
        try SL.claimTo(id, dest) {
            _absorb();
        } catch {
            vm.getRecordedLogs(); // logs of a reverted call are rolled back on-chain: discard them
        }
    }

    function release(uint256 idSeed, uint256 rcptSeed) external {
        uint256 id = _id(idSeed);
        address rcpt = _recipients[id][rcptSeed % _recipients[id].length];
        vm.recordLogs();
        try SL.release(id, rcpt) {
            _absorb();
        } catch {
            vm.getRecordedLogs(); // logs of a reverted call are rolled back on-chain: discard them
        }
    }
}

contract SplitlineNativeInvariantTest is SplitlineNativeBase {
    NativeHandler internal handler;
    uint256 internal constant N = 4;

    function setUp() public override {
        super.setUp();
        sl.createSplit("s1", _a3(alice, bob, carol), _b3(5000, 3000, 2000)); // 1
        (, address depL) = sl.createSplit("L", _a2(dave, eve), _b2(6000, 4000)); // 2 (leaf)
        (, address depM) = sl.createSplit("M", _a2(carol, depL), _b2(2500, 7500)); // 3 (mid)
        sl.createSplit("T", _a2(alice, depM), _b2(4000, 6000)); // 4 (top)

        handler = new NativeHandler(sl, payer, N);
        bytes4[] memory sel = new bytes4[](8);
        sel[0] = NativeHandler.payNative.selector;
        sel[1] = NativeHandler.pay.selector;
        sel[2] = NativeHandler.nativeToDeposit.selector;
        sel[3] = NativeHandler.erc20ToDeposit.selector;
        sel[4] = NativeHandler.sweep.selector;
        sel[5] = NativeHandler.claim.selector;
        sel[6] = NativeHandler.claimTo.selector;
        sel[7] = NativeHandler.release.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: sel}));
    }

    function _held() internal view returns (uint256) {
        return handler.totalPaid() + handler.totalSwept() - handler.totalClaimed();
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 100
    function invariant_UnifiedBalanceEqualsPaidPlusSweptMinusClaimed() public view {
        assertEq(usdc.balanceOf(address(sl)), _held());
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 100
    function invariant_NativeBalanceEqualsUnifiedTimesScale() public view {
        assertEq(address(sl).balance, _held() * SCALE);
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 100
    function invariant_EntitlementsAndReleasedAreConsistent() public view {
        uint256 held;
        for (uint256 id = 1; id <= N; ++id) {
            (, address[] memory rs, uint16[] memory bps,, uint256 total) = sl.getSplit(id);
            assertEq(total, handler.directOf(id) + handler.sweptOf(id), "credited == paid + swept");
            uint256 sumReleased;
            uint256 sumEntitled;
            for (uint256 i; i < rs.length; ++i) {
                uint256 ent = total * bps[i] / 10_000;
                uint256 rel = sl.released(id, rs[i]);
                assertEq(sl.owed(id, rs[i]) + rel, ent, "owed + released == floor(total*bps/1e4)");
                assertLe(rel, ent, "released <= entitlement");
                assertEq(rel, handler.claimedBy(id, rs[i]), "released == sum of Claimed amounts");
                sumReleased += rel;
                sumEntitled += ent;
            }
            assertLe(sumReleased, total, "sum released <= totalReceived");
            assertLt(total - sumEntitled, rs.length, "dust < recipient count");
            held += total - sumReleased;
        }
        assertEq(held, usdc.balanceOf(address(sl)), "sum(credited - released) == Splitline balance");
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 100
    function invariant_CloneNativeNothingLostAndRemainderOnlyFromNativeSends() public view {
        for (uint256 id = 1; id <= N; ++id) {
            address dep = handler.depositOf(id);
            assertEq(dep.balance, handler.weiIn(id) - handler.sweptOf(id) * SCALE, "clone == in - swept");
            assertEq(dep.balance % SCALE, handler.nativeIn(id) % SCALE, "remainder only from native sends");
            assertEq(usdc.balanceOf(dep), dep.balance / SCALE, "ERC-20 view == native / 1e12");
        }
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 100
    function invariant_NativeValueIsConserved() public view {
        assertEq(handler.trackedNative(), handler.initialNative());
    }
}
