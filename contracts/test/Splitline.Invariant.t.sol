// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Vm} from "forge-std/Vm.sol";
import {Splitline} from "../Splitline.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @dev Drives Splitline with bounded random actions and tracks ghost totals.
/// Splits (ids 1..5): leaf L -> mid M (lists dep(L)) -> top T (lists dep(M)); plain P; single Q.
contract SplitlineHandler is Test {
    Splitline public sl;
    MockUSDC public usdc;

    address[] public actors;
    address[] public recipientsAll; // everything that can be a release target
    address[] public destinations; // claimTo targets (incl. nested deposits)
    uint256[] public splitIds;

    uint256 public totalPaid;
    uint256 public totalSwept;
    uint256 public totalClaimed; // every USDC payout out of Splitline, incl. releases into deposit addresses
    uint256 public implicitSweeps; // Swept events emitted inside claim/claimTo/release (coverage ghost)

    constructor(Splitline _sl, MockUSDC _usdc) {
        sl = _sl;
        usdc = _usdc;

        address a1 = makeAddr("actor1");
        address a2 = makeAddr("actor2");
        address a3 = makeAddr("actor3");
        address a4 = makeAddr("actor4");
        actors.push(a1);
        actors.push(a2);
        actors.push(a3);
        actors.push(a4);

        address[] memory r;
        uint16[] memory b;

        // 1: leaf L [a3 50%, a4 50%]
        r = new address[](2);
        b = new uint16[](2);
        (r[0], r[1]) = (a3, a4);
        (b[0], b[1]) = (5000, 5000);
        (uint256 idL, address depL) = sl.createSplit("L", r, b);

        // 2: mid M [a2 70%, dep(L) 30%]
        (r[0], r[1]) = (a2, depL);
        (b[0], b[1]) = (7000, 3000);
        (uint256 idM, address depM) = sl.createSplit("M", r, b);

        // 3: top T [a1 20%, dep(M) 80%]
        (r[0], r[1]) = (a1, depM);
        (b[0], b[1]) = (2000, 8000);
        (uint256 idT,) = sl.createSplit("T", r, b);

        // 4: plain P [a1 33.33%, a2 33.33%, a3 33.34%]
        r = new address[](3);
        b = new uint16[](3);
        (r[0], r[1], r[2]) = (a1, a2, a3);
        (b[0], b[1], b[2]) = (3333, 3333, 3334);
        (uint256 idP,) = sl.createSplit("P", r, b);

        // 5: single Q [a4 100%]
        r = new address[](1);
        b = new uint16[](1);
        r[0] = a4;
        b[0] = 10_000;
        (uint256 idQ,) = sl.createSplit("Q", r, b);

        splitIds.push(idL);
        splitIds.push(idM);
        splitIds.push(idT);
        splitIds.push(idP);
        splitIds.push(idQ);

        recipientsAll.push(a1);
        recipientsAll.push(a2);
        recipientsAll.push(a3);
        recipientsAll.push(a4);
        recipientsAll.push(depL);
        recipientsAll.push(depM);

        destinations.push(a1);
        destinations.push(a2);
        destinations.push(a3);
        destinations.push(a4);
        destinations.push(depL);
        destinations.push(depM);
        destinations.push(makeAddr("sink"));
    }

    function splitCount() external view returns (uint256) {
        return splitIds.length;
    }

    function _id(uint256 seed) internal view returns (uint256) {
        return splitIds[seed % splitIds.length];
    }

    function _slBal() internal view returns (uint256) {
        return usdc.balanceOf(address(sl));
    }

    // ---------------------------------------------------------------- actions
    function pay(uint256 sSeed, uint256 amount) external {
        uint256 id = _id(sSeed);
        amount = bound(amount, 1, 1e12);
        usdc.mint(address(this), amount);
        usdc.approve(address(sl), amount);
        sl.pay(id, amount, bytes32(sSeed));
        totalPaid += amount;
    }

    function transferToDeposit(uint256 sSeed, uint256 amount) external {
        uint256 id = _id(sSeed);
        amount = bound(amount, 1, 1e12);
        address dep = sl.depositAddressOf(id);
        if (usdc.blocked(dep)) return; // a blocklisted clone cannot receive
        usdc.mint(address(this), amount);
        usdc.transfer(dep, amount);
    }

    /// @dev Blocklist / unblock a split's deposit clone, making its (auto-)sweep fail or recover.
    function blockDeposit(uint256 sSeed, bool isBlocked) external {
        usdc.setBlocked(sl.depositAddressOf(_id(sSeed)), isBlocked);
    }

    /// @dev Ghost accounting from the emitted logs of a SUCCESSFUL call: every Swept (explicit sweep or the
    /// implicit one inside claim/claimTo/release) adds to totalSwept and every Claimed amount to totalClaimed.
    /// The invariant then checks these log-derived ghosts against the real token balance.
    function _account(bool ok, bool implicit_) internal {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        if (!ok) return;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != address(sl)) continue;
            if (logs[i].topics[0] == Splitline.Swept.selector) {
                uint256 amount = abi.decode(logs[i].data, (uint256));
                totalSwept += amount;
                if (implicit_) ++implicitSweeps;
            } else if (logs[i].topics[0] == Splitline.Claimed.selector) {
                (, uint256 paid) = abi.decode(logs[i].data, (address, uint256));
                totalClaimed += paid;
            }
        }
    }

    function sweep(uint256 sSeed) external {
        vm.recordLogs();
        bool ok;
        try sl.sweep(_id(sSeed)) {
            ok = true;
        } catch {}
        _account(ok, false);
    }

    function claim(uint256 sSeed, uint256 aSeed) external {
        address who = actors[aSeed % actors.length];
        vm.recordLogs();
        bool ok;
        vm.prank(who);
        try sl.claim(_id(sSeed)) {
            ok = true;
        } catch {}
        _account(ok, true);
    }

    function claimTo(uint256 sSeed, uint256 aSeed, uint256 dSeed) external {
        address who = actors[aSeed % actors.length];
        address to = destinations[dSeed % destinations.length];
        vm.recordLogs();
        bool ok;
        vm.prank(who);
        try sl.claimTo(_id(sSeed), to) {
            ok = true;
        } catch {}
        _account(ok, true);
    }

    /// @dev Targets every recipient including nested deposit addresses.
    function release(uint256 sSeed, uint256 rSeed) external {
        address rec = recipientsAll[rSeed % recipientsAll.length];
        vm.recordLogs();
        bool ok;
        try sl.release(_id(sSeed), rec) {
            ok = true;
        } catch {}
        _account(ok, true);
    }
}

contract SplitlineInvariantTest is StdInvariant, Test {
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    MockUSDC internal usdc;
    Splitline internal sl;
    SplitlineHandler internal handler;

    function setUp() public {
        MockUSDC mock = new MockUSDC();
        vm.etch(USDC_ADDR, address(mock).code);
        usdc = MockUSDC(USDC_ADDR);
        sl = new Splitline();
        handler = new SplitlineHandler(sl, usdc);

        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](7);
        selectors[0] = SplitlineHandler.pay.selector;
        selectors[1] = SplitlineHandler.transferToDeposit.selector;
        selectors[2] = SplitlineHandler.sweep.selector;
        selectors[3] = SplitlineHandler.claim.selector;
        selectors[4] = SplitlineHandler.claimTo.selector;
        selectors[5] = SplitlineHandler.release.selector;
        selectors[6] = SplitlineHandler.blockDeposit.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 100
    function invariant_SplitlineBalanceEqualsPaidPlusSweptMinusClaimed() public view {
        assertEq(
            usdc.balanceOf(address(sl)),
            handler.totalPaid() + handler.totalSwept() - handler.totalClaimed(),
            "balance accounting"
        );
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 100
    function invariant_EntitlementsExactAndReleasedNeverExceed() public view {
        uint256 count = handler.splitCount();
        for (uint256 s; s < count; ++s) {
            uint256 id = handler.splitIds(s);
            (, address[] memory r, uint16[] memory b,, uint256 total) = sl.getSplit(id);
            for (uint256 i; i < r.length; ++i) {
                uint256 ent = (total * b[i]) / 10_000;
                uint256 rel = sl.released(id, r[i]);
                assertLe(rel, ent, "released <= entitlement");
                assertEq(sl.owed(id, r[i]) + rel, ent, "owed + released == floor entitlement");
            }
        }
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 100
    function invariant_SumReleasedNeverExceedsTotalReceived() public view {
        uint256 count = handler.splitCount();
        for (uint256 s; s < count; ++s) {
            uint256 id = handler.splitIds(s);
            (, address[] memory r,,, uint256 total) = sl.getSplit(id);
            uint256 sum;
            for (uint256 i; i < r.length; ++i) {
                sum += sl.released(id, r[i]);
            }
            assertLe(sum, total, "sum(released) <= totalReceived");
        }
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 100
    function invariant_CreditedRevenueEqualsPaidPlusSwept() public view {
        uint256 count = handler.splitCount();
        uint256 credited;
        for (uint256 s; s < count; ++s) {
            (,,,, uint256 total) = sl.getSplit(handler.splitIds(s));
            credited += total;
        }
        assertEq(credited, handler.totalPaid() + handler.totalSwept(), "sum(totalReceived) == paid + swept");
    }
}
