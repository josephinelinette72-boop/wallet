// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockStablecoin
/// @notice Play dollars for the rent lesson. They are not dollars, and they are not USDC.
/// @dev A stablecoin is an ERC-20 token that tries to stay worth about one unit of a
///      national currency. Real USDC is issued by a company, can be frozen, and is backed
///      by a reserve that the company reports on. None of that exists here.
///
///      We still copy two habits of USDC so the numbers look familiar:
///        - the symbol is a dollar-like name, "mUSD"
///        - `decimals` is 6, so 1 mock dollar is 1_000_000 base units, not 10^18
///
///      ETH uses 18 decimals (1 ETH = 10^18 wei). The property shares use 0 decimals
///      (1 token = 1 share). This file is the third system. When a number looks "too big",
///      check which of the three you are holding.
///
///      `mint` is the important lie. Whoever deployed this contract can print more play
///      dollars whenever they want. A public mint on a token people treat as money is a
///      critical bug. It is here because the token is a prop: tests and the deploy script
///      need a way to create balances. Do not rename this token to USDC. Do not tell
///      anyone it can be redeemed for a bank dollar.
contract MockStablecoin is ERC20, Ownable {
    /// @param initialOwner The only address allowed to call `mint`. The deploy script
    ///        passes the deployer. OpenZeppelin's Ownable stores that address and
    ///        writes `onlyOwner` for us.
    constructor(address initialOwner) ERC20("Mock Dollar", "mUSD") Ownable(initialOwner) {}

    /// @notice 6 decimals, the same count USDC uses.
    /// @dev ERC-20's default is 18. Wallets multiply the raw balance by 10^-decimals
    ///      before they display it. We override the default so 1_000_000 raw units
    ///      display as "1" mock dollar, not as a tiny fraction.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Print `amount` base units (not "dollars") for `to`.
    /// @dev 1 mock dollar is 1_000_000 because `decimals` is 6.
    ///      So `mint(manager, 1_000_000e6)` in the deploy script is one million mock dollars.
    ///      The `e6` is Solidity for "times 10^6", which cancels the decimals.
    ///
    ///      onlyOwner means a stranger's transaction reverts. The owner key is still
    ///      just a practice key on Anvil or Sepolia. Being careful inside a toy is
    ///      how the restriction becomes visible in the tests.
    function mint(address to, uint256 amount) external onlyOwner {
        // `_mint` rejects the zero address itself. We leave that check to OpenZeppelin
        // so there is one implementation of "you cannot mint into a black hole".
        _mint(to, amount);
    }
}
