// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// @title LearningVault
/// @notice A piggy bank. Each address can deposit ETH and later withdraw only what it deposited.
/// @dev Teaching contract. Do not put real money in it. The TypeScript wallet talks to these
///      functions from `src/vault.ts`. If you rename a function here, update that ABI too.
///
/// What a contract is: a program whose code and storage live at an address on Ethereum.
/// People talk to it by sending a transaction whose `to` is this address and whose `data`
/// names a function. ETH attached to the transaction shows up as `msg.value`. The account
/// that signed the transaction shows up as `msg.sender`.
///
/// Two different "balances" show up in this file on purpose:
///   - `balanceOf[addr]` is our ledger. It is an ordinary storage variable we update ourselves.
///   - `address(this).balance` is the ETH the chain itself says this contract holds.
/// They stay equal only if every wei arrives through `deposit` and leaves through `withdraw`.
contract LearningVault {
    /// @notice How many wei `who` is allowed to withdraw.
    /// @dev `mapping` is a key-value table. The key is a 20-byte address. The value is a
    ///      `uint256` (an unsigned 256-bit integer) counted in wei. 1 ETH = 10^18 wei.
    ///      `public` tells the compiler to write a getter named `balanceOf(address)`.
    ///      That getter is a free read. It does not need a transaction.
    mapping(address => uint256) public balanceOf;

    /// @notice A log line written when a deposit succeeds.
    /// @dev Events do not move ETH and they are not storage. They are a record in the
    ///      transaction receipt. `indexed` lets a node search logs by that address.
    ///      The wallet in this repo reads `balanceOf` rather than the logs. The event
    ///      is here so you can see one with `cast logs` later.
    event Deposited(address indexed who, uint256 amount);

    /// @notice A log line written when a withdrawal succeeds.
    event Withdrawn(address indexed who, uint256 amount);

    /// @notice Save the ETH attached to this call under `msg.sender`.
    /// @dev `payable` is what allows the call to carry ETH. Without it the node rejects
    ///      any transaction whose value is not zero. `external` means "only callable
    ///      from outside this contract", which is the normal shape of a public action.
    function deposit() external payable {
        // A zero deposit would be a transaction that only burns a fee. Reject it so the
        // failure is visible. `require` reverts the whole transaction when the check fails.
        require(msg.value > 0, "send some ETH");

        // Solidity 0.8 and later reverts if this addition overflows a uint256.
        // Older contracts needed a SafeMath library for the same check. We do not.
        balanceOf[msg.sender] += msg.value;

        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Withdraw `amount` wei, and only from the balance you deposited.
    /// @dev Checks, then effects, then interactions.
    ///      The effect (the ledger write) happens before the interaction (sending ETH).
    ///      If we sent the ETH first, the receiver's `receive()` could call `withdraw`
    ///      again while the ledger still showed the old balance and drain other people.
    ///      That bug is called reentrancy. The test `test_reentrancy_cannot_steal` tries it.
    function withdraw(uint256 amount) external {
        uint256 saved = balanceOf[msg.sender];

        require(amount > 0, "amount is zero");
        require(saved >= amount, "not enough saved");

        // Effect. If the ETH send below fails, Solidity undoes this write too.
        // A reverted transaction is atomic: every storage change in it is discarded.
        balanceOf[msg.sender] = saved - amount;

        // Interaction. `{value: amount}` attaches ETH. The empty string is the calldata:
        // we are not calling a function, we are just transferring.
        // `call` forwards all remaining gas and returns `false` on failure instead of
        // reverting by itself, so we have to check `ok`. `transfer` and `send` only
        // forward 2300 gas, which breaks a receiver that does any real work. `call`
        // plus a require is the pattern to copy.
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "ETH transfer failed");

        emit Withdrawn(msg.sender, amount);
    }

    /// @notice The ETH this contract actually holds, in wei.
    /// @dev `view` means the function promises not to write storage. A node can answer
    ///      it without a transaction. `address(this).balance` is the chain's number,
    ///      not our mapping. The wallet prints both so you can see they are different
    ///      ideas that happen to agree when the contract is used as intended.
    ///
    /// There is deliberately no `receive()` function. A plain transfer (someone sends
    /// ETH without calling `deposit`) would increase `address(this).balance` without
    /// increasing `balanceOf`, and that ETH would be stuck. Reverting keeps the books
    /// honest. Forcing ETH in via selfdestruct is a separate historical edge case and
    /// not something this lesson tries to handle.
    function totalEth() external view returns (uint256 amount) {
        return address(this).balance;
    }
}
