// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PropertyShare} from "../src/PropertyShare.sol";
import {MockStablecoin} from "../src/MockStablecoin.sol";

/// @title PropertyShareTest
/// @notice The lesson's checks. Foundry runs every function whose name starts
///         with `test`. `setUp` runs before each one, so every test gets a fresh
///         property, a fresh play dollar, and the full 1,000,000 shares sitting
///         on this test contract.
///
///         This test contract is the admin. `manager` is a different address and
///         has only the manager role. That split is what lets a test prove that
///         "can deposit rent" is not the same role as "can rewrite the document hash".
///
///         Fuzz tests (`testFuzz_...`) do not use one hand-picked amount. Foundry
///         calls them many times with different inputs. `bound` pulls each input
///         into the range the comment next to it describes. A failure prints the
///         input that broke the rule, which you can replay.
///
///         The header in PropertyShare.sol explains why the math is fair. These
///         tests are the demonstration: they fail if a buyer collects rent from
///         before they bought, if a claim pays twice, or if a stranger deposits.
contract PropertyShareTest is Test {
    uint256 internal constant TOTAL = 1_000_000;
    uint256 internal constant PRECISION = 1e18;

    /// @dev The same sentence the deploy script hashes. Locking the hash here
    ///      means a quiet edit to that sentence changes a test, not just a comment.
    string internal constant DOCUMENT =
        "PLACEHOLDER ONLY. This is not a deed or an LLC agreement. There is no building and no company behind these tokens.";
    bytes32 internal constant DOCUMENT_HASH = 0xf7fd2b8b423d93b9721bcd7657baea1fd683727e3aedeecc0e7a5d1be0812310;

    MockStablecoin internal dollars;
    PropertyShare internal property;

    address internal manager;
    address internal alice;
    address internal bob;
    address internal carol;

    function setUp() public {
        manager = makeAddr("manager");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        carol = makeAddr("carol");

        // This test contract is the dollar's owner, so `dollars.mint` works
        // when the caller is the test and reverts when the caller is anyone else.
        dollars = new MockStablecoin(address(this));
        property = _newProperty(address(dollars), address(this), manager);
    }

    function _newProperty(address stable, address admin, address mgr) internal returns (PropertyShare) {
        return new PropertyShare(
            "123 Main Street Shares",
            "MAIN",
            "123 Main Street (placeholder)",
            "123 Main Street, Springfield",
            keccak256(bytes(DOCUMENT)),
            "https://example.com/not-a-real-deed",
            stable,
            admin,
            mgr
        );
    }

    /// @dev Allow `to`, then transfer `shares` from the admin (this contract).
    ///      Doing both in one helper matches the real sequence: you cannot
    ///      send shares to someone who is not on the list.
    function _give(address to, uint256 shares) internal {
        property.setAllowed(to, true);
        property.transfer(to, shares);
    }

    receive() external payable {}

    // -------------------------------------------------------------------------
    // The shape of the token
    // -------------------------------------------------------------------------

    function test_supply_is_one_million_shares_and_starts_with_the_admin() public view {
        assertEq(property.TOTAL_SHARES(), TOTAL);
        assertEq(property.totalSupply(), TOTAL);
        assertEq(property.balanceOf(address(this)), TOTAL);
        assertEq(property.decimals(), 0);
        assertEq(property.balanceOf(alice), 0);
        assertTrue(property.allowed(address(this)));
        assertFalse(property.allowed(alice));
        assertFalse(property.allowed(manager));
    }

    function test_metadata_is_the_placeholder_and_the_hash_matches_the_sentence() public view {
        assertEq(property.propertyName(), "123 Main Street (placeholder)");
        assertEq(property.streetAddress(), "123 Main Street, Springfield");
        assertEq(property.documentUri(), "https://example.com/not-a-real-deed");
        assertEq(property.documentHash(), keccak256(bytes(DOCUMENT)));
        assertEq(property.documentHash(), DOCUMENT_HASH);
        assertEq(property.stablecoin(), address(dollars));
        assertEq(dollars.decimals(), 6);
    }

    function test_roles_are_split() public view {
        assertTrue(property.hasRole(property.DEFAULT_ADMIN_ROLE(), address(this)));
        assertTrue(property.hasRole(property.MANAGER_ROLE(), manager));
        assertFalse(property.hasRole(property.MANAGER_ROLE(), address(this)));
        assertTrue(property.isManager(address(this)));
        assertTrue(property.isManager(manager));
        assertFalse(property.isManager(alice));
    }

    function test_constructor_rejects_bad_arguments() public {
        vm.expectRevert(PropertyShare.ZeroAddress.selector);
        _newProperty(address(dollars), address(0), manager);

        vm.expectRevert(PropertyShare.ZeroAddress.selector);
        _newProperty(address(dollars), address(this), address(0));

        // alice is an ordinary account. It has no contract code, so it cannot be the dollar.
        vm.expectRevert(abi.encodeWithSelector(PropertyShare.StablecoinNotAContract.selector, alice));
        _newProperty(alice, address(this), manager);

        vm.expectRevert(PropertyShare.EmptyDocumentHash.selector);
        new PropertyShare(
            "123 Main Street Shares",
            "MAIN",
            "123 Main Street (placeholder)",
            "123 Main Street, Springfield",
            bytes32(0),
            "https://example.com/not-a-real-deed",
            address(dollars),
            address(this),
            manager
        );

        vm.expectRevert(PropertyShare.EmptyText.selector);
        new PropertyShare(
            "123 Main Street Shares",
            "MAIN",
            "",
            "123 Main Street, Springfield",
            DOCUMENT_HASH,
            "https://example.com/not-a-real-deed",
            address(dollars),
            address(this),
            manager
        );
    }

    function test_stranger_cannot_mint_play_dollars() public {
        vm.prank(alice);
        vm.expectRevert();
        dollars.mint(alice, 1_000_000);
        assertEq(dollars.balanceOf(alice), 0);
    }

    // -------------------------------------------------------------------------
    // Allowlist: who may hold shares
    // -------------------------------------------------------------------------

    function test_transfer_to_an_unlisted_address_reverts_and_moves_nothing() public {
        vm.expectRevert(abi.encodeWithSelector(PropertyShare.NotAllowed.selector, alice));
        property.transfer(alice, 100);

        assertEq(property.balanceOf(address(this)), TOTAL);
        assertEq(property.balanceOf(alice), 0);
    }

    function test_allow_then_transfer_then_freeze() public {
        property.setAllowed(alice, true);
        property.transfer(alice, 250_000);
        assertEq(property.balanceOf(alice), 250_000);
        assertEq(property.balanceOf(address(this)), 750_000);

        // Freezing alice locks the shares she already has. She cannot send them,
        // and the admin cannot send her more, until she is allowed again.
        property.setAllowed(alice, false);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PropertyShare.NotAllowed.selector, alice));
        property.transfer(address(this), 1);
        assertEq(property.balanceOf(alice), 250_000);

        vm.expectRevert(abi.encodeWithSelector(PropertyShare.NotAllowed.selector, alice));
        property.transfer(alice, 1);

        property.setAllowed(alice, true);
        vm.prank(alice);
        property.transfer(address(this), 250_000);
        assertEq(property.balanceOf(alice), 0);
    }

    function test_a_broker_can_submit_the_transfer_without_being_allowlisted() public {
        // The allowlist is about who holds the shares, not who pays the gas.
        // carol is not allowed and holds nothing. alice approves carol to move
        // 10 shares to bob, who is allowed. `transferFrom` is the ERC-20 pull.
        _give(alice, 100);
        _give(bob, 1);

        vm.prank(alice);
        property.approve(carol, 10);

        vm.prank(carol);
        property.transferFrom(alice, bob, 10);

        assertEq(property.balanceOf(alice), 90);
        assertEq(property.balanceOf(bob), 11);
        assertEq(property.balanceOf(carol), 0);
        assertFalse(property.allowed(carol));
    }

    function test_zero_address_cannot_be_allowlisted() public {
        vm.expectRevert(PropertyShare.ZeroAddress.selector);
        property.setAllowed(address(0), true);
    }

    function test_stranger_cannot_edit_the_allowlist() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PropertyShare.NotManager.selector, alice));
        property.setAllowed(bob, true);
        assertFalse(property.allowed(bob));
    }

    function test_manager_can_allowlist_but_cannot_rewrite_the_document() public {
        vm.prank(manager);
        property.setAllowed(alice, true);
        assertTrue(property.allowed(alice));

        vm.prank(manager);
        vm.expectRevert();
        property.updatePropertyRecord("1 Other Street", keccak256("different"), "https://example.com/other");

        assertEq(property.streetAddress(), "123 Main Street, Springfield");
        assertEq(property.documentHash(), DOCUMENT_HASH);
    }

    function test_admin_can_replace_the_document_hash() public {
        bytes32 nextHash = keccak256("version-2-still-not-a-real-agreement");
        property.updatePropertyRecord("123 Main Street, Unit B", nextHash, "ipfs://bafy-placeholder");

        assertEq(property.streetAddress(), "123 Main Street, Unit B");
        assertEq(property.documentHash(), nextHash);
        assertEq(property.documentUri(), "ipfs://bafy-placeholder");
        // Ownership and rent math are not touched by a new label.
        assertEq(property.balanceOf(address(this)), TOTAL);
        assertEq(property.claimableEth(address(this)), 0);
    }

    // -------------------------------------------------------------------------
    // Who may deposit, and what a deposit counts
    // -------------------------------------------------------------------------

    function test_stranger_cannot_deposit_eth() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PropertyShare.NotManager.selector, alice));
        property.depositEth{value: 1 ether}();

        assertEq(property.ethDeposited(), 0);
        assertEq(address(property).balance, 0);
    }

    function test_plain_eth_transfer_is_rejected() public {
        uint256 before = address(this).balance;
        (bool ok, bytes memory reason) = address(property).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(bytes4(reason), PropertyShare.PlainEthNotRent.selector);
        assertEq(address(property).balance, 0);
        assertEq(property.ethDeposited(), 0);
        assertEq(address(this).balance, before);
    }

    function test_zero_deposits_revert() public {
        vm.expectRevert(PropertyShare.ZeroAmount.selector);
        property.depositEth{value: 0}();

        vm.expectRevert(PropertyShare.ZeroAmount.selector);
        property.depositStable(0);
    }

    function test_manager_deposits_eth_and_one_holder_of_all_shares_can_claim_it() public {
        vm.deal(manager, 10 ether);
        vm.prank(manager);
        property.depositEth{value: 10 ether}();

        // One share's scaled credit is amount * 1e18 / 1_000_000.
        assertEq(property.ethRewardPerShare(), (10 ether * PRECISION) / TOTAL);
        assertEq(property.ethDeposited(), 10 ether);
        assertEq(property.ethAccounted(), 10 ether);
        assertEq(property.claimableEth(address(this)), 10 ether);
        assertEq(property.claimableEth(alice), 0);

        uint256 before = address(this).balance;
        property.claimEth();
        assertEq(address(this).balance - before, 10 ether);
        assertEq(property.claimableEth(address(this)), 0);
        assertEq(property.ethClaimed(), 10 ether);
        assertEq(address(property).balance, 0);

        vm.expectRevert(PropertyShare.NothingToClaim.selector);
        property.claimEth();
    }

    function test_a_second_deposit_does_not_count_unclaimed_rent_again() public {
        // If deposit used address(this).balance instead of msg.value, the second
        // deposit would see the first 10 ETH still sitting here and would add
        // 14 ETH of new claims instead of 4.
        property.depositEth{value: 10 ether}();
        property.depositEth{value: 4 ether}();

        assertEq(property.claimableEth(address(this)), 14 ether);
        assertEq(property.ethDeposited(), 14 ether);
        assertEq(address(property).balance, 14 ether);
    }

    function test_three_holders_split_an_even_deposit() public {
        _give(alice, 600_000);
        _give(bob, 300_000);
        _give(carol, 100_000);
        assertEq(property.balanceOf(address(this)), 0);

        vm.deal(manager, 10 ether);
        vm.prank(manager);
        property.depositEth{value: 10 ether}();

        assertEq(property.claimableEth(alice), 6 ether);
        assertEq(property.claimableEth(bob), 3 ether);
        assertEq(property.claimableEth(carol), 1 ether);
        assertEq(property.claimableEth(address(this)), 0);
        assertEq(property.claimableEth(manager), 0);

        _claimEth(alice, 6 ether);
        _claimEth(bob, 3 ether);
        _claimEth(carol, 1 ether);
        assertEq(address(property).balance, 0);
    }

    function test_claim_takes_every_round_at_once_then_only_the_new_round() public {
        _give(alice, 500_000);
        _give(bob, 500_000);

        property.depositEth{value: 8 ether}();
        property.depositEth{value: 2 ether}();

        // Alice has not claimed between the deposits, so one call pays both rounds.
        assertEq(property.claimableEth(alice), 5 ether);
        _claimEth(alice, 5 ether);

        property.depositEth{value: 4 ether}();
        // The new round is 50% of 4 ETH. The old 5 ETH is not paid again.
        assertEq(property.claimableEth(alice), 2 ether);
        assertEq(property.claimableEth(bob), 5 ether + 2 ether);

        _claimEth(alice, 2 ether);
        _claimEth(bob, 7 ether);
        assertEq(address(property).balance, 0);
    }

    function test_transfer_between_deposits_keeps_past_rent_with_the_seller() public {
        _give(alice, 600_000);
        _give(bob, 400_000);

        property.depositEth{value: 10 ether}();
        assertEq(property.claimableEth(alice), 6 ether);
        assertEq(property.claimableEth(bob), 4 ether);

        // Alice sells 100,000 shares (10% of the building) to Bob.
        // She keeps the rent those shares already earned. Bob does not collect it.
        vm.prank(alice);
        property.transfer(bob, 100_000);

        assertEq(property.balanceOf(alice), 500_000);
        assertEq(property.balanceOf(bob), 500_000);
        assertEq(property.claimableEth(alice), 6 ether);
        assertEq(property.claimableEth(bob), 4 ether);

        property.depositEth{value: 10 ether}();

        // The second 10 ETH is split on the new balances: 50 / 50.
        assertEq(property.claimableEth(alice), 11 ether);
        assertEq(property.claimableEth(bob), 9 ether);

        _claimEth(alice, 11 ether);
        _claimEth(bob, 9 ether);
        assertEq(address(property).balance, 0);
        assertEq(property.ethClaimed(), 20 ether);
    }

    function test_a_buyer_of_all_the_shares_does_not_inherit_past_rent() public {
        property.depositEth{value: 10 ether}();
        assertEq(property.claimableEth(address(this)), 10 ether);

        _give(alice, TOTAL);

        assertEq(property.balanceOf(address(this)), 0);
        assertEq(property.balanceOf(alice), TOTAL);
        assertEq(property.claimableEth(address(this)), 10 ether);
        assertEq(property.claimableEth(alice), 0);

        uint256 adminBefore = address(this).balance;
        property.claimEth();
        assertEq(address(this).balance - adminBefore, 10 ether);

        property.depositEth{value: 5 ether}();
        assertEq(property.claimableEth(alice), 5 ether);
        assertEq(property.claimableEth(address(this)), 0);
        _claimEth(alice, 5 ether);
    }

    function test_self_transfer_does_not_change_a_claim() public {
        property.depositEth{value: 3 ether}();
        property.transfer(address(this), 1);
        assertEq(property.balanceOf(address(this)), TOTAL);
        assertEq(property.claimableEth(address(this)), 3 ether);
    }

    function test_per_holder_rounding_leaves_the_leftover_wei_in_the_contract() public {
        // 1_000_001 wei does not divide evenly across 1, 1, and 999_998 shares.
        // Each holder is rounded down. The missing wei stays here. Nobody is paid it.
        _give(alice, 1);
        _give(bob, 1);
        _give(carol, 999_998);

        uint256 amount = 1_000_001;
        property.depositEth{value: amount}();

        uint256 aliceDue = amount * 1 / TOTAL;
        uint256 bobDue = amount * 1 / TOTAL;
        uint256 carolDue = amount * 999_998 / TOTAL;
        assertEq(property.claimableEth(alice), aliceDue);
        assertEq(property.claimableEth(bob), bobDue);
        assertEq(property.claimableEth(carol), carolDue);

        uint256 paid = 0;
        if (aliceDue > 0) {
            _claimEth(alice, aliceDue);
            paid += aliceDue;
        }
        if (bobDue > 0) {
            _claimEth(bob, bobDue);
            paid += bobDue;
        }
        _claimEth(carol, carolDue);
        paid += carolDue;

        assertLt(paid, amount);
        assertEq(address(property).balance, amount - paid);
        assertEq(property.ethClaimed(), paid);
        // The global "accounted" number can still equal the deposit. The dust
        // appears when each holder's own division rounds down.
        assertEq(property.ethAccounted(), amount);
    }

    // -------------------------------------------------------------------------
    // The mock dollar uses the same math and does not touch the ETH books
    // -------------------------------------------------------------------------

    function test_stable_rent_is_pro_rata_and_needs_an_approval() public {
        _give(alice, 250_000);
        _give(bob, 750_000);

        dollars.mint(manager, 1_000e6);

        // No approval yet. The pull fails, and the books must not record the rent.
        uint256 perShareBefore = property.stableRewardPerShare();
        vm.prank(manager);
        vm.expectRevert();
        property.depositStable(1_000e6);
        assertEq(property.stableRewardPerShare(), perShareBefore);
        assertEq(dollars.balanceOf(address(property)), 0);
        assertEq(property.stableDeposited(), 0);

        vm.startPrank(manager);
        dollars.approve(address(property), 1_000e6);
        property.depositStable(1_000e6);
        vm.stopPrank();

        assertEq(dollars.balanceOf(address(property)), 1_000e6);
        assertEq(property.claimableStable(alice), 250e6);
        assertEq(property.claimableStable(bob), 750e6);
        // ETH books stayed at zero. The two assets do not share a total.
        assertEq(property.claimableEth(alice), 0);
        assertEq(property.ethDeposited(), 0);

        vm.prank(alice);
        property.claimStable();
        assertEq(dollars.balanceOf(alice), 250e6);
        assertEq(property.claimableStable(alice), 0);
        assertEq(dollars.balanceOf(address(property)), 750e6);

        vm.prank(alice);
        vm.expectRevert(PropertyShare.NothingToClaim.selector);
        property.claimStable();
    }

    function test_eth_deposit_does_not_increase_stable_claims() public {
        property.depositEth{value: 2 ether}();
        assertEq(property.claimableEth(address(this)), 2 ether);
        assertEq(property.claimableStable(address(this)), 0);
        assertEq(property.stableDeposited(), 0);
    }

    function test_failed_eth_claim_restores_the_books() public {
        RefusingHolder refusing = new RefusingHolder(property);
        _give(address(refusing), TOTAL);
        property.depositEth{value: 3 ether}();

        vm.expectRevert(PropertyShare.EthTransferFailed.selector);
        refusing.claim();

        // The zeroing of `unclaimed` was reverted with the failed send.
        // The holder can still claim the same 3 ETH from a contract that accepts it.
        assertEq(property.claimableEth(address(refusing)), 3 ether);
        assertEq(property.ethClaimed(), 0);
        assertEq(address(property).balance, 3 ether);
    }

    // -------------------------------------------------------------------------
    // Reentrancy
    // -------------------------------------------------------------------------

    function test_reentrancy_during_eth_claim_is_paid_once() public {
        GreedyHolder greedy = new GreedyHolder(property);
        _give(address(greedy), TOTAL);
        property.depositEth{value: 5 ether}();

        uint256 before = address(greedy).balance;
        greedy.claim();

        // The receiver's fallback ran (one payment) and the inner claim reverted.
        assertEq(greedy.payments(), 1);
        assertEq(greedy.innerResult(), 2);
        assertEq(address(greedy).balance - before, 5 ether);
        assertEq(property.claimableEth(address(greedy)), 0);
        assertEq(address(property).balance, 0);
        assertEq(property.ethClaimed(), 5 ether);

        // The lock does not get stuck. A later round can be claimed.
        property.depositEth{value: 2 ether}();
        greedy.claim();
        assertEq(address(greedy).balance - before, 7 ether);
        assertEq(greedy.payments(), 2);
        assertEq(property.ethClaimed(), 7 ether);
    }

    function test_reentrancy_that_is_not_caught_reverts_the_whole_claim() public {
        BoomHolder boom = new BoomHolder(property);
        _give(address(boom), TOTAL);
        property.depositEth{value: 3 ether}();

        vm.expectRevert(PropertyShare.EthTransferFailed.selector);
        boom.claim();

        assertEq(property.claimableEth(address(boom)), 3 ether);
        assertEq(address(property).balance, 3 ether);
        assertEq(address(boom).balance, 0);
        assertEq(property.ethClaimed(), 0);
    }

    function test_malicious_dollar_cannot_reenter_deposit_or_claim() public {
        // The test contract owns the evil dollar, so it can mint. The dollar
        // itself is also a shareholder: it holds 10% of the property, which
        // means a callback that reached `claimEth` would be paid real ETH.
        // msg.sender inside that callback is the dollar, and the ETH from the
        // earlier deposit is already sitting in the property. The reentrancy
        // lock is what stops that payment. Rounding dust is not the issue here:
        // 10% of 10 ETH is exactly 1 ETH.
        ReenteringDollar evil = new ReenteringDollar(address(this));
        PropertyShare laced = _newProperty(address(evil), address(this), address(this));
        evil.setProperty(laced);
        laced.setAllowed(address(evil), true);
        laced.transfer(address(evil), 100_000);

        laced.depositEth{value: 10 ether}();
        assertEq(laced.claimableEth(address(evil)), 1 ether);
        assertEq(laced.claimableEth(address(this)), 9 ether);

        evil.mint(address(this), 1_000e6);
        evil.approve(address(laced), 1_000e6);

        uint256 ethSitting = address(laced).balance;
        laced.depositStable(1_000e6);

        assertTrue(evil.sawRevert());
        assertFalse(evil.sawSuccess());
        assertEq(address(laced).balance, ethSitting);
        assertEq(laced.claimableEth(address(evil)), 1 ether);
        assertEq(laced.stableDeposited(), 1_000e6);
        // 90% of the dollar deposit. The evil token's 10% stays claimable by it.
        assertEq(laced.claimableStable(address(this)), 900e6);
        assertEq(laced.claimableStable(address(evil)), 100e6);
        assertEq(evil.balanceOf(address(laced)), 1_000e6);

        // Paying the admin's dollars out runs the token's transfer hook, which
        // tries the same callbacks. The ETH owed to the token is still there after.
        laced.claimStable();
        assertEq(evil.balanceOf(address(this)), 900e6);
        assertEq(laced.claimableStable(address(this)), 0);
        assertFalse(evil.sawSuccess());
        assertEq(laced.claimableEth(address(evil)), 1 ether);
        assertEq(laced.claimableEth(address(this)), 9 ether);

        laced.claimEth();
        assertEq(laced.claimableEth(address(this)), 0);
        assertEq(laced.claimableEth(address(evil)), 1 ether);
    }

    function test_admin_can_grant_and_revoke_the_manager() public {
        address next = makeAddr("next-manager");
        property.grantRole(property.MANAGER_ROLE(), next);

        vm.deal(next, 1 ether);
        vm.prank(next);
        property.depositEth{value: 1 ether}();
        assertEq(property.ethDeposited(), 1 ether);

        // The manager role cannot appoint anyone. Only the admin role can.
        // The role id is read BEFORE `prank`. `prank` changes the sender of the
        // next external call only, and `property.MANAGER_ROLE()` is itself a call.
        // If it sat inside the `grantRole` arguments, the prank would be spent
        // on the read and the admin (this contract) would be the one granting.
        bytes32 managerRole = property.MANAGER_ROLE();
        vm.prank(manager);
        vm.expectRevert();
        property.grantRole(managerRole, alice);

        property.revokeRole(property.MANAGER_ROLE(), manager);
        vm.deal(manager, 1 ether);
        vm.prank(manager);
        vm.expectRevert(abi.encodeWithSelector(PropertyShare.NotManager.selector, manager));
        property.depositEth{value: 1 ether}();
    }

    // -------------------------------------------------------------------------
    // Fuzz: the payout is floor(balance * deposit / total shares)
    // -------------------------------------------------------------------------
    //
    // PRECISION is 1e18 and the supply is 1_000_000, and 1e18 / 1_000_000 is the
    // integer 1e12. So the contract's scaled formula simplifies to ordinary
    // integer division. These tests use that simpler form as the expected value.
    // If the simplification ever stops being exact, the assertions fail.

    function testFuzz_two_holders_get_floor_pro_rata(uint256 amount, uint256 aliceShares) public {
        amount = bound(amount, 1, 1_000_000 ether);
        aliceShares = bound(aliceShares, 1, TOTAL - 1);
        uint256 bobShares = TOTAL - aliceShares;

        _give(alice, aliceShares);
        _give(bob, bobShares);

        property.depositEth{value: amount}();

        uint256 aliceDue = amount * aliceShares / TOTAL;
        uint256 bobDue = amount * bobShares / TOTAL;
        assertEq(property.claimableEth(alice), aliceDue);
        assertEq(property.claimableEth(bob), bobDue);
        assertEq(property.claimableEth(address(this)), 0);

        // Two floors of a partition of the supply add up to the deposit, or to
        // one wei less. They never add up to more.
        assertLe(aliceDue + bobDue, amount);
        assertLe(amount - (aliceDue + bobDue), 1);
        assertEq(property.ethRewardPerShare(), amount * PRECISION / TOTAL);

        _claimIfAny(alice, aliceDue);
        _claimIfAny(bob, bobDue);
        assertEq(address(property).balance, amount - aliceDue - bobDue);
        assertEq(property.ethClaimed(), aliceDue + bobDue);
    }

    function testFuzz_transfer_banks_old_rent_and_new_rent_uses_new_balances(
        uint256 first,
        uint256 second,
        uint256 aliceShares,
        uint256 moved
    ) public {
        first = bound(first, 1, 1_000 ether);
        second = bound(second, 1, 1_000 ether);
        aliceShares = bound(aliceShares, 1, TOTAL - 1);
        uint256 bobShares = TOTAL - aliceShares;

        _give(alice, aliceShares);
        _give(bob, bobShares);
        property.depositEth{value: first}();

        uint256 aliceOld = first * aliceShares / TOTAL;
        uint256 bobOld = first * bobShares / TOTAL;
        assertEq(property.claimableEth(alice), aliceOld);
        assertEq(property.claimableEth(bob), bobOld);

        moved = bound(moved, 1, aliceShares);
        vm.prank(alice);
        property.transfer(bob, moved);

        // The sale does not move rent that was already earned.
        assertEq(property.claimableEth(alice), aliceOld);
        assertEq(property.claimableEth(bob), bobOld);

        property.depositEth{value: second}();

        uint256 aliceNow = aliceShares - moved;
        uint256 bobNow = bobShares + moved;
        uint256 aliceDue = aliceOld + (second * aliceNow / TOTAL);
        uint256 bobDue = bobOld + (second * bobNow / TOTAL);
        assertEq(property.claimableEth(alice), aliceDue);
        assertEq(property.claimableEth(bob), bobDue);
        assertLe(aliceDue + bobDue, first + second);

        _claimIfAny(alice, aliceDue);
        _claimIfAny(bob, bobDue);
        assertLe(property.ethClaimed(), first + second);
        assertEq(address(property).balance, first + second - property.ethClaimed());
    }

    function testFuzz_stable_pro_rata(uint256 amount, uint256 aliceShares) public {
        // Base units, not "dollars". 1_000_000e6 would be one million mock dollars.
        // The cap keeps the approval and the mint inside a comfortable uint256.
        amount = bound(amount, 1, 1_000_000_000e6);
        aliceShares = bound(aliceShares, 1, TOTAL - 1);
        uint256 bobShares = TOTAL - aliceShares;
        _give(alice, aliceShares);
        _give(bob, bobShares);

        dollars.mint(manager, amount);
        vm.startPrank(manager);
        dollars.approve(address(property), amount);
        property.depositStable(amount);
        vm.stopPrank();

        uint256 aliceDue = amount * aliceShares / TOTAL;
        uint256 bobDue = amount * bobShares / TOTAL;
        assertEq(property.claimableStable(alice), aliceDue);
        assertEq(property.claimableStable(bob), bobDue);
        assertLe(aliceDue + bobDue, amount);
        assertLe(amount - (aliceDue + bobDue), 1);
        // The ETH ledger is still empty after a dollar deposit.
        assertEq(property.claimableEth(alice), 0);
        assertEq(property.ethDeposited(), 0);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _claimEth(address holder, uint256 expected) internal {
        uint256 before = holder.balance;
        vm.prank(holder);
        property.claimEth();
        assertEq(holder.balance - before, expected);
        assertEq(property.claimableEth(holder), 0);
    }

    function _claimIfAny(address holder, uint256 expected) internal {
        if (expected == 0) {
            vm.prank(holder);
            vm.expectRevert(PropertyShare.NothingToClaim.selector);
            property.claimEth();
            return;
        }
        _claimEth(holder, expected);
    }
}

/// @notice A holder whose fallback claims again, and catches the revert.
/// @dev `innerResult` is 2 when the second claim reverted, which is what the
///      guard and the "effects before the send" order both require. `payments`
///      counts how many times ETH actually arrived. A double payment would
///      show up as 2 during a single `claim` call.
contract GreedyHolder {
    PropertyShare public property;
    uint256 public innerResult;
    uint256 public payments;

    constructor(PropertyShare property_) {
        property = property_;
    }

    receive() external payable {
        payments += 1;
        try property.claimEth() {
            innerResult = 1;
        } catch {
            innerResult = 2;
        }
    }

    function claim() external {
        property.claimEth();
    }
}

/// @notice Same attack, but the inner revert is not caught, so the ETH transfer
///         itself fails and the outer claim reverts. The rent stays in the property.
contract BoomHolder {
    PropertyShare public property;

    constructor(PropertyShare property_) {
        property = property_;
    }

    receive() external payable {
        property.claimEth();
    }

    function claim() external {
        property.claimEth();
    }
}

/// @notice A contract with no `receive`. The ETH send returns false.
contract RefusingHolder {
    PropertyShare public property;

    constructor(PropertyShare property_) {
        property = property_;
    }

    function claim() external {
        property.claimEth();
    }
}

/// @notice A dollar whose transfers call back into the property.
/// @dev Real ERC-20 tokens do not do this. A token that does is the stand-in
///      for a malicious rent token, or for an ERC-777-style hook. `sawSuccess`
///      flips if any callback manages to deposit or claim. The test expects
///      that flag to stay false.
contract ReenteringDollar is MockStablecoin {
    PropertyShare public property;
    bool public sawRevert;
    bool public sawSuccess;
    bool internal busy;

    constructor(address owner) MockStablecoin(owner) {}

    function setProperty(PropertyShare property_) external {
        property = property_;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        _poke();
        return super.transfer(to, value);
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        _poke();
        return super.transferFrom(from, to, value);
    }

    function _poke() internal {
        if (busy || address(property) == address(0)) return;
        busy = true;
        _tryCall(address(property), abi.encodeCall(PropertyShare.claimStable, ()));
        _tryCall(address(property), abi.encodeCall(PropertyShare.claimEth, ()));
        _tryCall(address(property), abi.encodeCall(PropertyShare.depositStable, (1)));
        busy = false;
    }

    function _tryCall(address target, bytes memory data) internal {
        (bool ok,) = target.call(data);
        if (ok) sawSuccess = true;
        else sawRevert = true;
    }

    /// @dev Accepts ETH so a successful reentrant `claimEth` would not bounce.
    ///      Success is recorded from the call's return value, not from here,
    ///      so a later honest claim can pay this contract without looking like an attack.
    receive() external payable {}
}
