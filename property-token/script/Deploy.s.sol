// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockStablecoin} from "../src/MockStablecoin.sol";
import {PropertyShare} from "../src/PropertyShare.sol";

/// @title DeployProperty
/// @notice Deploys the play dollar and the property-share contract.
/// @dev A Foundry script is a Solidity program that Foundry runs and, if you
///      pass `--broadcast`, turns the calls inside `startBroadcast` / `stopBroadcast`
///      into real transactions. Outside that block, nothing is sent. The reads
///      and the `console2.log` lines are for you, in the terminal.
///
///      Run it from the `property-token` folder. The README walks the same
///      commands. Short form:
///
///        # Rehearsal. Prints the plan. Does not need Anvil, and sends nothing.
///        forge script script/Deploy.s.sol
///
///        # Local chain. Start `anvil` in another Ubuntu terminal first.
///        forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///
///        # Sepolia. A practice key only. Never the Anvil key. Never a key that
///        # has held real ETH. See the README for how to pass the key without
///        # leaving it in your shell history.
///        forge script script/Deploy.s.sol --rpc-url "$SEPOLIA_RPC_URL" --broadcast
///
///      The script refuses every chain id except Anvil (31337) and Sepolia
///      (11155111). Mainnet is not a missing feature. It is the wrong place
///      for a lesson that is not a real offering.
contract DeployProperty is Script {
    /// @dev Anvil's first account. Foundry prints this key in the Anvil banner
    ///      and in the Foundry book. The whole world already has it. It is a
    ///      textbook key, not a secret, and it is useful only because every
    ///      fresh Anvil process funds this address with 10,000 play ETH.
    ///
    ///      The script will use it on chain id 31337 when you do not set
    ///      DEPLOYER_PRIVATE_KEY. It will refuse it on any other chain, including
    ///      Sepolia. Publishing a key and then using it on a public network is
    ///      how play money and real money get confused. Sepolia ETH is play
    ///      money too, but the habit is the point.
    uint256 internal constant ANVIL_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    uint256 internal constant ANVIL_CHAIN = 31337;
    uint256 internal constant SEPOLIA_CHAIN = 11155111;

    /// @dev The file this hash stands in for. There is no PDF in the repository.
    ///      keccak256 of these exact bytes is what the contract stores as
    ///      `documentHash`. `cast keccak` of the same text prints the same hash.
    ///      A real deployment would hash the bytes of the operating agreement,
    ///      not a sentence that says the agreement does not exist.
    string internal constant DOCUMENT =
        "PLACEHOLDER ONLY. This is not a deed or an LLC agreement. There is no building and no company behind these tokens.";

    function run() external {
        uint256 key = _loadKey();
        address deployer = vm.addr(key);

        // PROPERTY_MANAGER is optional. When it is unset, the deployer is also
        // the manager: one practice key holds the admin role, the manager role,
        // and (after the mint below) the entire share supply. Set the variable
        // when you want a second address to be the only one who deposits rent.
        address manager = vm.envOr("PROPERTY_MANAGER", deployer);

        console2.log("Chain id", block.chainid);
        console2.log("Deployer (admin, and the first shareholder)", deployer);
        console2.log("Manager", manager);
        if (manager == deployer) {
            console2.log("One address is playing admin and manager. That is the Anvil walkthrough.");
        }

        // Everything between start and stop becomes a transaction signed by `key`.
        // Three transactions, in this order:
        //   1. Deploy the play dollar. The deployer is its owner, so only they can mint.
        //   2. Deploy the property. The constructor mints 1,000,000 shares to the deployer.
        //   3. Mint one million mock dollars to the manager, so they can try a
        //      stablecoin rent deposit without a separate mint command.
        // If any transaction reverts, Foundry stops. Earlier ones that were already
        // mined stay mined. On Anvil you can restart the process and the chain is blank.
        vm.startBroadcast(key);

        MockStablecoin dollars = new MockStablecoin(deployer);

        PropertyShare property = new PropertyShare(
            "123 Main Street Shares",
            "MAIN",
            "123 Main Street (placeholder)",
            "123 Main Street, Springfield",
            keccak256(bytes(DOCUMENT)),
            "https://example.com/not-a-real-deed",
            address(dollars),
            deployer,
            manager
        );

        // 1_000_000e6 is one million mock dollars. The token has 6 decimals,
        // so one dollar is 10^6 base units. `e6` means "times 10^6".
        dollars.mint(manager, 1_000_000e6);

        vm.stopBroadcast();

        console2.log("----- deployed (or simulated) -----");
        console2.log("MockStablecoin", address(dollars));
        console2.log("PropertyShare", address(property));
        console2.log("Document hash (compare with: cast keccak \"<the placeholder sentence>\")");
        console2.logBytes32(keccak256(bytes(DOCUMENT)));
        console2.log("Shares minted to the deployer", property.balanceOf(deployer));
        console2.log("Mock dollars minted to the manager (base units, 6 decimals)", dollars.balanceOf(manager));
        console2.log("These addresses are not secrets. The private key is. This script does not print the key.");
        console2.log("Stopping Anvil deletes the contracts. The key, if you set one, stays on your machine.");
    }

    /// @dev Pick the signing key and refuse the combinations that do not belong
    ///      in this lesson. Reverts here happen before `startBroadcast`, so a
    ///      refusal does not send a transaction.
    function _loadKey() internal view returns (uint256 key) {
        uint256 chainId = block.chainid;

        if (chainId != ANVIL_CHAIN && chainId != SEPOLIA_CHAIN) {
            revert(
                "Refusing to deploy. This lesson only runs on Anvil (chain id 31337) or Sepolia (chain id 11155111). It will not deploy to mainnet."
            );
        }

        // On a fresh Anvil you do not need to handle a key at all. The published
        // one is the default. The moment you set DEPLOYER_PRIVATE_KEY, that value
        // wins, including on Anvil, so you can deploy from a keystore address
        // you funded with `npm run wallet -- fund`.
        if (chainId == ANVIL_CHAIN && !vm.envExists("DEPLOYER_PRIVATE_KEY")) {
            console2.log(
                "Using Anvil's published first account. This key is not a secret. It is refused on every other chain."
            );
            return ANVIL_KEY;
        }

        key = vm.envUint("DEPLOYER_PRIVATE_KEY");

        if (key == ANVIL_KEY && chainId != ANVIL_CHAIN) {
            revert(
                "Refusing Anvil's published private key on a public network. Create a new practice key for Sepolia. Do not reuse a phrase that has ever held real ETH."
            );
        }

        if (key == 0) {
            revert("DEPLOYER_PRIVATE_KEY is empty. Nothing was deployed.");
        }
    }
}
