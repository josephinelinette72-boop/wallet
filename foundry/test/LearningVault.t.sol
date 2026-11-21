// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {LearningVault} from "../src/LearningVault.sol";

/// @title LearningVaultTest
/// @notice Foundry runs every function whose name starts with `test`.
///         `setUp` runs before each one, so every test gets a fresh vault.
///         `require` stops the test when the condition is false.
///
/// Foundry gives this test contract a large pretend ETH balance, which is why
/// `deposit{value: 1 ether}` can attach ETH without us minting any. `1 ether`
/// is Solidity syntax for 10**18 wei, not a special coin.
///
/// These tests do not use forge-std. A second contract stands in for "someone
/// else", which keeps every step visible in this file.
contract LearningVaultTest {
    LearningVault internal vault;

    function setUp() public {
        vault = new LearningVault();
    }

    /// The test contract needs to accept the ETH that `withdraw` sends back.
    receive() external payable {}

    function test_deposit_increases_the_ledger_and_the_real_balance() public {
        vault.deposit{value: 1 ether}();

        require(vault.balanceOf(address(this)) == 1 ether, "ledger");
        require(vault.totalEth() == 1 ether, "totalEth view");
        require(address(vault).balance == 1 ether, "chain balance");
    }

    function test_partial_withdraw_leaves_the_rest() public {
        vault.deposit{value: 1 ether}();
        vault.withdraw(0.25 ether);

        require(vault.balanceOf(address(this)) == 0.75 ether, "ledger after partial withdraw");
        require(vault.totalEth() == 0.75 ether, "ETH left in the vault");
    }

    function test_full_withdraw_returns_the_eth() public {
        uint256 beforeBalance = address(this).balance;
        vault.deposit{value: 1 ether}();
        vault.withdraw(1 ether);

        require(vault.balanceOf(address(this)) == 0, "ledger cleared");
        require(vault.totalEth() == 0, "vault empty");
        // Foundry does not charge the test contract for gas the way mainnet
        // would, so the ETH we attached comes all the way back.
        require(address(this).balance == beforeBalance, "ETH returned");
    }

    function test_zero_deposit_reverts() public {
        (bool ok, ) = address(vault).call(abi.encodeWithSignature("deposit()"));
        require(ok == false, "a zero deposit must revert");
        require(vault.totalEth() == 0, "vault still empty");
    }

    function test_zero_withdraw_reverts() public {
        vault.deposit{value: 1 ether}();
        (bool ok, ) = address(vault).call(abi.encodeWithSignature("withdraw(uint256)", 0));
        require(ok == false, "a zero withdraw must revert");
        require(vault.balanceOf(address(this)) == 1 ether, "ledger unchanged");
    }

    function test_cannot_withdraw_more_than_saved() public {
        vault.deposit{value: 1 ether}();
        (bool ok, ) = address(vault).call(
            abi.encodeWithSignature("withdraw(uint256)", 1 ether + 1)
        );
        require(ok == false, "over-withdraw must revert");
        require(vault.balanceOf(address(this)) == 1 ether, "failed withdraw does not change the ledger");
        require(vault.totalEth() == 1 ether, "failed withdraw does not move ETH");
    }

    function test_plain_transfer_does_not_stick() public {
        // No calldata, just ETH. There is no receive(), so the vault rejects it.
        (bool ok, ) = address(vault).call{value: 1 ether}("");
        require(ok == false, "plain ETH transfer must revert");
        require(vault.totalEth() == 0, "rejected ETH is not in the vault");
    }

    function test_two_people_do_not_share_a_balance() public {
        vault.deposit{value: 1 ether}();
        OtherPerson bob = new OtherPerson{value: 2 ether}(vault);

        require(vault.balanceOf(address(this)) == 1 ether, "alice");
        require(vault.balanceOf(address(bob)) == 2 ether, "bob");
        require(vault.totalEth() == 3 ether, "both deposits are in the contract");

        bob.withdrawAll();

        require(vault.balanceOf(address(bob)) == 0, "bob cleared his own ledger");
        require(vault.balanceOf(address(this)) == 1 ether, "alice is untouched");
        require(address(bob).balance == 2 ether, "bob received his own ETH");
        require(vault.totalEth() == 1 ether, "only alice remains");
    }

    function test_withdraw_reverts_if_the_receiver_rejects_eth() public {
        NoReceive stubborn = new NoReceive{value: 1 ether}(vault);
        require(vault.balanceOf(address(stubborn)) == 1 ether, "deposited");

        // Call stubborn from the outside so its revert does not revert this test.
        (bool ok, ) = address(stubborn).call(abi.encodeWithSignature("tryWithdraw()"));
        require(ok == false, "withdraw must fail when the receiver rejects ETH");

        // The ledger write inside withdraw was undone because the whole call reverted.
        require(vault.balanceOf(address(stubborn)) == 1 ether, "ledger restored");
        require(vault.totalEth() == 1 ether, "ETH still in the vault");
    }

    function test_reentrancy_cannot_steal() public {
        // Other people's savings are already in the vault. A reentrancy bug would
        // let the attacker withdraw twice and take this ETH.
        vault.deposit{value: 5 ether}();

        ReenteringReceiver attacker = new ReenteringReceiver(vault);
        attacker.attack{value: 1 ether}();

        require(attacker.stolen() == 0, "second withdraw must not succeed");
        require(vault.balanceOf(address(this)) == 5 ether, "alice still has her savings");
        require(vault.balanceOf(address(attacker)) == 0, "attacker was withdrawn once");
        require(vault.totalEth() == 5 ether, "only alice's ETH remains");
        require(address(attacker).balance == 1 ether, "attacker got their own deposit back, once");
    }
}

/// A second person. Their deposits are keyed by this contract's address,
/// because `msg.sender` inside the vault is whoever called it.
contract OtherPerson {
    LearningVault internal immutable vault;

    constructor(LearningVault _vault) payable {
        vault = _vault;
        vault.deposit{value: msg.value}();
    }

    function withdrawAll() external {
        vault.withdraw(vault.balanceOf(address(this)));
    }

    receive() external payable {}
}

/// Deposits, then tries to withdraw into a contract that cannot receive ETH.
contract NoReceive {
    LearningVault internal immutable vault;

    constructor(LearningVault _vault) payable {
        vault = _vault;
        vault.deposit{value: msg.value}();
    }

    function tryWithdraw() external {
        vault.withdraw(vault.balanceOf(address(this)));
    }
}

/// Deposits 1 ether and, while receiving the withdrawal, tries to withdraw again.
contract ReenteringReceiver {
    LearningVault internal immutable vault;
    bool internal triedAgain;
    uint256 public stolen;

    constructor(LearningVault _vault) {
        vault = _vault;
    }

    function attack() external payable {
        vault.deposit{value: msg.value}();
        vault.withdraw(msg.value);
    }

    receive() external payable {
        if (triedAgain) return;
        triedAgain = true;
        // The ledger was already reduced, so this second withdraw reverts and
        // we swallow that revert. If the vault had sent the ETH *before*
        // updating the ledger, this call could succeed and `stolen` would be 1.
        try vault.withdraw(1 ether) {
            stolen += 1;
        } catch {}
    }
}
