// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SplitlineTestBase} from "./Splitline.Base.t.sol";

/// @dev Direct transfers to the deposit clone interleaved with pays, claims and releases (all auto-sweep).
contract SplitlineAutoSweepFuzzTest is SplitlineTestBase {
    uint256 internal sid;
    address internal sdep;
    address[] internal rs;
    uint16[] internal bs;
    uint256 internal totalIn; // pays + direct transfers so far (credited or not)

    function _setup(uint256 seed, uint256 nRaw) internal returns (uint256 n) {
        n = bound(nRaw, 1, 20);
        bs = _partition(seed, n);
        rs = _recipients(n, 0xE000);
        (sid, sdep) = sl.createSplit("autosweep", rs, bs);
        totalIn = 0;
    }

    function _ent(uint256 total, uint16 w) internal pure returns (uint256) {
        return (total * w) / 10_000;
    }

    function _check(uint256 n) internal view {
        // everything is conserved between Splitline, the clone and the recipients
        uint256 held = usdc.balanceOf(address(sl)) + usdc.balanceOf(sdep);
        uint256 out;
        for (uint256 i; i < n; ++i) {
            uint256 got = usdc.balanceOf(rs[i]);
            out += got;
            assertLe(got, _ent(totalIn, bs[i]), "received more than floor(total*bps/10000)");
            assertLe(got, _ent(_total(sid), bs[i]), "received more than credited entitlement");
            assertEq(sl.released(sid, rs[i]), got, "released == paid out");
        }
        assertEq(held + out, totalIn, "conservation");
        assertLe(_total(sid), totalIn);
    }

    function _step(uint256 h, uint256 n) internal {
        uint256 kind = h % 4;
        uint256 mag = 10 ** ((h >> 40) % 10);
        uint256 amt = ((h >> 64) % mag) + 1;
        address rec = rs[(h >> 16) % n];
        if (kind == 0) {
            _pay(sid, amt);
            totalIn += amt;
        } else if (kind == 1) {
            _direct(sdep, amt);
            totalIn += amt;
        } else if (kind == 2) {
            vm.prank(rec);
            try sl.claim(sid) {} catch {}
        } else {
            vm.prank(eve);
            try sl.release(sid, rec) {} catch {}
        }
    }

    function testFuzz_AutoSweep_InterleavedDirectTransfersNeverOverpayAndDustBounded(
        uint256 seed,
        uint8 nRaw,
        uint8 stepsRaw
    ) public {
        uint256 n = _setup(seed, nRaw);
        uint256 steps = bound(stepsRaw, 1, 40);
        for (uint256 i; i < steps; ++i) {
            _step(uint256(keccak256(abi.encode(seed, "step", i))), n);
            _check(n);
        }

        // release everyone (each release sweeps the clone first)
        for (uint256 i = n; i > 0; --i) {
            vm.prank(eve);
            try sl.release(sid, rs[i - 1]) {} catch {}
        }
        // a second pass covers recipients whose release reverted earlier only because nothing was credited yet
        for (uint256 i; i < n; ++i) {
            try sl.release(sid, rs[i]) {} catch {}
        }
        _check(n);

        uint256 sumEnt;
        uint256 sumGot;
        for (uint256 i; i < n; ++i) {
            sumEnt += _ent(totalIn, bs[i]);
            sumGot += usdc.balanceOf(rs[i]);
        }
        // Every recipient with a non-zero floor entitlement is fully paid. If all floors are zero the sweep
        // can be rolled back by NothingOwed, leaving the funds in the clone, so compare against what was credited.
        uint256 credited = _total(sid);
        uint256 dust = totalIn - sumEnt;
        assertLt(dust, n, "dust < recipient count");
        if (sumEnt > 0) {
            assertEq(credited, totalIn, "all revenue credited once a payout succeeded");
            assertEq(sumGot, sumEnt, "exact floor entitlement");
            assertEq(usdc.balanceOf(address(sl)), dust, "residual == dust");
            assertEq(usdc.balanceOf(sdep), 0, "clone drained");
        }
    }

    function testFuzz_AutoSweep_SingleDirectTransferPaidExactlyWithoutExplicitSweep(
        uint256 seed,
        uint8 nRaw,
        uint64 amountRaw
    ) public {
        uint256 n = _setup(seed, nRaw);
        uint256 amt = bound(amountRaw, 1, 1e13);
        _direct(sdep, amt);
        totalIn = amt;
        for (uint256 i; i < n; ++i) {
            try sl.release(sid, rs[i]) {} catch {}
        }
        uint256 sumEnt;
        for (uint256 i; i < n; ++i) {
            uint256 e = _ent(amt, bs[i]);
            sumEnt += e;
            assertEq(usdc.balanceOf(rs[i]), e, "exact share");
        }
        assertLt(amt - sumEnt, n);
        if (sumEnt > 0) {
            assertEq(usdc.balanceOf(sdep), 0);
            assertEq(_total(sid), amt);
        }
    }
}
