// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SplitlineTestBase} from "./Splitline.Base.t.sol";
import {Splitline} from "../Splitline.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

contract SplitlineFuzzTest is SplitlineTestBase {
    // scenario state (kept in storage to avoid stack-too-deep)
    uint256 internal sid;
    address[] internal rs;
    uint16[] internal bs;
    uint256 internal totalPaid;

    // ------------------------------------------------------------ (a) bps validation is exact
    function testFuzz_BpsValidationExactForRawArrays(uint16[] memory bps) public {
        address[] memory r = _recipients(bps.length, 0x1000);
        bool expected = _isValidBps(bps);
        try sl.createSplit("f", r, bps) returns (uint256, address) {
            assertTrue(expected, "created an invalid split");
        } catch {
            assertFalse(expected, "rejected a valid split");
        }
    }

    function testFuzz_BpsValidationExactForMutatedPartitions(uint256 seed, uint8 nRaw, uint8 mode) public {
        uint256 n = bound(nRaw, 1, 20);
        uint16[] memory bps = _partition(seed, n);
        assertTrue(_isValidBps(bps), "partition helper produced invalid split");
        uint256 idx = uint256(keccak256(abi.encode(seed, "idx"))) % n;
        mode = mode % 4;
        if (mode == 1) {
            bps[idx] += 1; // sum 10001
        } else if (mode == 2) {
            if (bps[idx] > 0) bps[idx] -= 1; // sum 9999 (and maybe a zero weight)
        } else if (mode == 3) {
            // zero one weight, keep the sum at 10000
            uint16 w = bps[idx];
            bps[idx] = 0;
            bps[(idx + 1) % n] += w;
            if (n == 1) bps[0] = 10_000; // single recipient: zeroing then re-adding to itself
        }
        bool expected = _isValidBps(bps);
        address[] memory r = _recipients(n, 0x2000);
        try sl.createSplit("m", r, bps) returns (uint256, address) {
            assertTrue(expected);
        } catch {
            assertFalse(expected);
        }
    }

    function testFuzz_ValidRandomPartitionAlwaysSucceeds(uint256 seed, uint8 nRaw, string memory name) public {
        uint256 n = bound(nRaw, 1, 20);
        uint16[] memory bps = _partition(seed, n);
        address[] memory r = _recipients(n, 0x3000);
        vm.assume(bytes(name).length <= 64);
        (uint256 id,) = sl.createSplit(name, r, bps);
        for (uint256 i; i < n; ++i) {
            assertEq(sl.bpsOf(id, r[i]), bps[i]);
        }
    }

    // ------------------------------------------------------------ scenario runner
    function _setupScenario(uint256 seed, uint256 nRaw) internal returns (uint256 n) {
        n = bound(nRaw, 1, 20);
        bs = _partition(seed, n);
        rs = _recipients(n, 0xA000);
        (sid,) = sl.createSplit("scn", rs, bs);
        totalPaid = 0;
    }

    function _entitlement(uint256 total, uint16 w) internal pure returns (uint256) {
        return (total * w) / 10_000;
    }

    function _checkBounds(uint256 n) internal view {
        (,,,, uint256 total) = sl.getSplit(sid);
        assertEq(total, totalPaid, "totalReceived tracks payments");
        for (uint256 i; i < n; ++i) {
            uint256 got = usdc.balanceOf(rs[i]);
            assertLe(got, _entitlement(total, bs[i]), "claimed more than entitlement");
            assertEq(sl.released(sid, rs[i]), got, "released == paid out");
        }
    }

    function _step(uint256 h, uint256 n) internal {
        uint256 kind = h % 3;
        if (kind == 0) {
            uint256 mag = 10 ** ((h >> 40) % 10);
            uint256 amt = ((h >> 64) % mag) + 1;
            _pay(sid, amt);
            totalPaid += amt;
        } else {
            address rec = rs[(h >> 16) % n];
            if (kind == 1) {
                vm.prank(rec);
                try sl.claim(sid) {} catch {}
            } else {
                vm.prank(eve);
                try sl.release(sid, rec) {} catch {}
            }
        }
    }

    function _runScenario(uint256 seed, uint256 nRaw, uint256 stepsRaw) internal returns (uint256 n) {
        n = _setupScenario(seed, nRaw);
        uint256 steps = bound(stepsRaw, 1, 40);
        for (uint256 i; i < steps; ++i) {
            _step(uint256(keccak256(abi.encode(seed, "step", i))), n);
            _checkBounds(n);
        }
    }

    function _releaseEveryone(uint256 n) internal {
        // random-ish order: start from a seed-derived offset is unnecessary; reverse order is a distinct ordering
        for (uint256 i = n; i > 0; --i) {
            vm.prank(eve);
            try sl.release(sid, rs[i - 1]) {} catch {}
        }
    }

    // ------------------------------------------------------------ (b) never over-claims, exact after full release
    function testFuzz_ClaimsNeverExceedEntitlementAndAreExactAfterFullRelease(
        uint256 seed,
        uint8 nRaw,
        uint8 stepsRaw
    ) public {
        uint256 n = _runScenario(seed, nRaw, stepsRaw);
        _releaseEveryone(n);
        _checkBounds(n);
        for (uint256 i; i < n; ++i) {
            assertEq(usdc.balanceOf(rs[i]), _entitlement(totalPaid, bs[i]), "exact after full release");
            assertEq(sl.owed(sid, rs[i]), 0);
        }
    }

    // ------------------------------------------------------------ (c) rounding dust
    function testFuzz_RoundingDustLessThanRecipientCountAndStaysInSplitline(
        uint256 seed,
        uint8 nRaw,
        uint8 stepsRaw
    ) public {
        uint256 n = _runScenario(seed, nRaw, stepsRaw);
        _releaseEveryone(n);

        uint256 sumEntitlements;
        for (uint256 i; i < n; ++i) {
            sumEntitlements += _entitlement(totalPaid, bs[i]);
        }
        uint256 dust = totalPaid - sumEntitlements;
        assertLt(dust, n, "dust < recipient count");
        assertEq(usdc.balanceOf(address(sl)), dust, "residual balance == dust");
    }

    function testFuzz_DustForSinglePaymentOfAnySize(uint256 seed, uint8 nRaw, uint96 amountRaw) public {
        uint256 n = _setupScenario(seed, nRaw);
        uint256 amt = bound(amountRaw, 1, 1e15);
        _pay(sid, amt);
        totalPaid = amt;
        _releaseEveryone(n);
        uint256 sum;
        for (uint256 i; i < n; ++i) {
            sum += usdc.balanceOf(rs[i]);
        }
        assertLt(amt - sum, n);
        assertEq(usdc.balanceOf(address(sl)), amt - sum);
    }

    // ------------------------------------------------------------ (d) deposit address prediction
    function testFuzz_PredictEqualsDepositAddressEqualsIndependentClones(
        uint256 seed,
        uint8 nRaw,
        uint8 fillers,
        address creator
    ) public {
        vm.assume(creator != address(0));
        uint256 n = bound(nRaw, 1, 20);
        uint16[] memory bps = _partition(seed, n);
        address[] memory r = _recipients(n, 0xB000);
        uint256 k = bound(fillers, 0, 4);
        for (uint256 i; i < k; ++i) {
            sl.createSplit(string.concat("filler", vm.toString(i)), _a1(alice), _b1(10_000));
        }

        uint256 expectedId = sl.nextId();
        address viaContract = sl.predictDepositAddress(creator, "p", r, bps);
        address independent = _independentPredict(creator, "p", r, bps);
        assertEq(viaContract, independent, "predict == independent Clones");

        vm.prank(creator);
        (uint256 id, address dep) = sl.createSplit("p", r, bps);
        assertEq(id, expectedId);
        assertEq(dep, viaContract, "created address == predicted");
        assertEq(sl.depositAddressOf(id), independent, "stored address == independent");
    }

    /// @dev Random creators / names / configs: Splitline's prediction equals OZ Clones with the documented salt.
    function testFuzz_PredictMatchesIndependentForArbitraryCreatorNameAndConfig(
        address creator,
        string memory name,
        uint256 seed,
        uint8 nRaw
    ) public view {
        uint256 n = bound(nRaw, 1, 20);
        uint16[] memory bps = _partition(seed, n);
        address[] memory r = _recipients(n, 0xC000);
        bytes32 salt = keccak256(abi.encode(creator, name, r, bps));
        address oz = Clones.predictDeterministicAddress(sl.DEPOSIT_IMPLEMENTATION(), salt, address(sl));
        assertEq(sl.predictDepositAddress(creator, name, r, bps), oz);
        assertEq(_independentPredict(creator, name, r, bps), oz);
    }

    function testFuzz_CreatedAddressMatchesIndependentForRandomCreatorAndName(
        address creator,
        string memory name,
        uint256 seed,
        uint8 nRaw
    ) public {
        vm.assume(creator != address(0) && bytes(name).length <= 64);
        uint256 n = bound(nRaw, 1, 20);
        uint16[] memory bps = _partition(seed, n);
        address[] memory r = _recipients(n, 0xC000);
        address oz = _independentPredict(creator, name, r, bps);
        vm.prank(creator);
        (uint256 id, address dep) = sl.createSplit(name, r, bps);
        assertEq(dep, oz);
        assertEq(sl.depositAddressOf(id), oz);
    }

    function testFuzz_FundingPredictedAddressBeforeCreationIsSweepable(uint256 seed, uint8 nRaw, uint64 amountRaw)
        public
    {
        uint256 n = bound(nRaw, 1, 20);
        uint16[] memory bps = _partition(seed, n);
        address[] memory r = _recipients(n, 0xD000);
        uint256 amt = bound(amountRaw, 1, 1e12);
        address predicted = _independentPredict(address(this), "early", r, bps);
        usdc.mint(predicted, amt);

        (uint256 id,) = sl.createSplit("early", r, bps);
        assertEq(sl.sweep(id), amt);
        (,,,, uint256 total) = sl.getSplit(id);
        assertEq(total, amt);
    }
}
