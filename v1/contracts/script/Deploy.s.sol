// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Splitline} from "../src/Splitline.sol";

/// @notice Deploys Splitline. Reads the deployer's private key from the PRIVATE_KEY
///         environment variable — never hardcode it, never pass it as a CLI argument where
///         it could end up in shell history.
///
///         Usage (testnet first, always):
///           forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast --verify
///         Then, only once you're ready to spend real mainnet gas:
///           forge script script/Deploy.s.sol --rpc-url arc_mainnet --broadcast --verify
contract Deploy is Script {
    function run() external returns (Splitline splitline) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        console.log("Deploying Splitline from:", deployer);

        vm.startBroadcast(deployerKey);
        splitline = new Splitline();
        vm.stopBroadcast();

        console.log("Splitline deployed at:", address(splitline));
    }
}
