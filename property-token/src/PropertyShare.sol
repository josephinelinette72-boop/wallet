// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title PropertyShare
/// @notice A classroom model of fractional ownership in one rental property.
/// @dev Read this header before the functions. The code is short. The idea around
///      the code is the part that is easy to get wrong.
///
/// What the numbers mean
/// ---------------------
/// Imagine one house that is rented out. The rent belongs to the owners. If the
/// house is split into 1,000,000 equal shares, someone holding 250,000 shares
/// owns 25% of that claim and should receive 25% of the rent that arrives while
/// they hold the shares.
///
/// This contract is that split, and nothing more:
///   - `TOTAL_SHARES` is 1,000,000. Together, the shares mean "100% of the property".
///   - Your ERC-20 balance is how many of those shares you hold.
///   - The property manager deposits rent (ETH, or the mock dollar deployed with
///     this lesson).
///   - A holder calls `claimEth` or `claimStable` to take the slice their shares
///     have earned. They pay their own gas to do it.
///
/// Shares use 0 decimals on purpose. 1 token is 1 share, not 10^-18 of a share.
/// Real tokens often use 18 decimals. We do not, so the supply you read with
/// `cast` is the supply a person can say out loud.
///
/// What a token cannot do
/// ----------------------
/// Storing the text "123 Main Street" does not put this contract on a deed.
/// A blockchain cannot call the county recorder. A balance is not a signature
/// on a piece of paper, and a court is not required to treat it as one.
///
/// A real project that connects tokens to a building uses a legal wrapper,
/// usually a limited liability company (an LLC) or a similar entity:
///   - The LLC is created under ordinary law, with a registered agent and an
///     operating agreement. That agreement is a contract among the members.
///   - The deed names the LLC as the owner of the building. The token contract
///     is not the owner.
///   - The operating agreement says that the people who hold these tokens are
///     the members, in proportion to their balances, and that rent (after the
///     bills the agreement names) is distributed that way.
///   - The PDF of the agreement lives on a website or on IPFS. This contract
///     stores `documentHash`, which is keccak256 of that exact file, and
///     `documentUri`, which is where to download it.
///   - If someone replaces the PDF with a different file, even by one byte,
///     the hash will not match. Holders can see that the document moved.
///     The contract still cannot force the new file to be the legal one.
///     The agreement, the deed, and a court do that job.
///
/// The hash is a tamper-evident label. It is not the deed, and it is not the company.
///
/// Why tokens like these are usually securities
/// ---------------------------------------------
/// People would buy shares because they expect rent, and they expect that rent
/// because a manager finds the tenant, collects the money, and deposits it.
/// That is an investment of money in a common enterprise, with an expectation
/// of profit that comes from someone else's work. In the United States that
/// pattern is the heart of the Howey test, and an arrangement that fits it is
/// an "investment contract", which is a security.
///
/// Selling a security to the public generally requires registration with the
/// SEC or a specific exemption, plus disclosures and rules about who may buy
/// and who may resell. Other countries have their own versions of the same idea.
/// This file is not a registration, not an exemption, and not legal advice.
///
/// The allowlist (`allowed`, `setAllowed`) is a classroom stand-in for those
/// transfer restrictions. A real security token's list is fed by an identity
/// check, often called KYC ("know your customer"), done by a regulated party
/// who has looked at a passport and a sanctions list. Here the manager types
/// an address. There is no identity system in this contract. Freezing and
/// allowlisting are also powers. A bad manager can refuse to let you move
/// shares. Read `setAllowed` before you treat that power as a small detail.
///
/// Where this code is allowed to run
/// ----------------------------------
/// The deploy script accepts two chain ids only:
///   - 31337, Anvil, a private chain on your computer. It forgets everything
///     when you stop it.
///   - 11155111, Sepolia, a public Ethereum test network. The coins there are
///     play money, but the chain is shared and it remembers transactions.
///
/// It refuses mainnet. These shares are a lesson. There is no building, no LLC,
/// no investors, and no offer to sell anything. Do not take anyone's money
/// with this contract. Do not tell anyone they are buying a house.
///
/// How the rent stays fair when shares move
/// -----------------------------------------
/// A naive contract would, on every deposit, loop over every holder and add
/// to a balance owed. That costs gas that grows with the number of holders,
/// and one holder who rejects ETH can make the whole deposit fail.
///
/// This contract does not loop. It keeps one running total per asset:
///
///     rewardPerShareStored
///
/// meaning "how much rent one share has earned since the beginning", scaled
/// by `PRECISION` (10^18) so the division does not collapse to zero.
///
/// When the manager deposits `amount`:
///
///     rewardPerShareStored += amount * PRECISION / totalShares
///
/// No holder's storage is touched. A holder who has not moved their shares
/// is owed:
///
///     balance * rewardPerShareStored / PRECISION
///
/// which, with the constants in this file, is the ordinary pro-rata floor:
///
///     balance * amount / 1_000_000
///
/// (plus anything they had already earned and not claimed).
///
/// The moment shares move, that shortcut is no longer enough. If we only
/// multiplied the new balance by the historical total, a buyer would collect
/// rent from the months before they bought, and the seller would lose it.
/// So `_update` (OpenZeppelin's hook for every mint and transfer) snapshots
/// both parties BEFORE the balances change:
///
///   - The sender's rent so far is written into `unclaimed[sender]`.
///   - The sender's "I've been paid up through this rewardPerShare" marker
///     is set to the current `rewardPerShareStored`.
///   - The same snapshot is taken for the receiver, using the balance they
///     had before this transfer. The shares they are about to receive start
///     earning from today, not from the first deposit.
///
/// Claiming pays out `unclaimed` and sets it back to zero. The books are
/// updated before any ETH or tokens are sent (checks, effects, interactions).
/// A receiver who calls back into `claim` or `deposit` during the send hits
/// the reentrancy lock and also finds the books already show a zero payout.
///
/// Dust
/// ----
/// Each holder's slice is rounded down to the nearest wei (or the nearest
/// mock-dollar base unit). The leftover, at most one unit per holder per
/// deposit, stays in the contract. It is not swept to the manager and it is
/// not given to the last caller. With 1,000,000 shares and PRECISION 10^18,
/// a deposit divides across the full supply with no global leftover, because
/// 10^18 / 1_000_000 is the integer 10^12. The only leftovers are the
/// per-holder rounding. `ethDeposited` counts what the manager sent.
/// `ethAccounted` counts what holders can collectively claim. The gap is the dust.
///
/// Libraries
/// ---------
/// OpenZeppelin Contracts v5.4.0 is vendored in `lib/`. We use it instead of
/// rewriting the well-known parts:
///   - ERC20: balances, allowances, and the `_update` hook.
///   - AccessControl: the admin role and the manager role.
///   - ReentrancyGuard: the lock used by `nonReentrant`.
///   - SafeERC20: a token that returns `false` instead of reverting is still
///     treated as a failure.
///   - Math.mulDiv: multiplies in 512 bits so `amount * PRECISION` cannot
///     overflow a uint256 the way a plain `*` would.
///
/// Solidity 0.8 reverts on overflow. This file does not use `unchecked`.
contract PropertyShare is ERC20, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // The property, in words a person can read
    // -------------------------------------------------------------------------

    /// @notice Fixed supply. 1,000,000 shares represent 100% of the property.
    /// @dev This never changes. There is no mint function after the constructor
    ///      and no burn function at all. `totalSupply()` is the ERC-20 name for
    ///      the same number. A test checks they stay equal.
    uint256 public constant TOTAL_SHARES = 1_000_000;

    /// @notice Scale factor for the running "rent per share" total.
    /// @dev 10^18 is divisible by TOTAL_SHARES (the quotient is 10^12). That is
    ///      why a deposit of any whole amount of wei can be spread across the
    ///      full supply without a global rounding gap. See the header note "Dust".
    uint256 public constant PRECISION = 1e18;

    /// @notice Role id for the address that may deposit rent and edit the allowlist.
    /// @dev A role id is not a secret. `keccak256("MANAGER_ROLE")` is a label anyone
    ///      can recompute. The protection is that only the admin role may grant it.
    ///      OpenZeppelin stores the members in a mapping. `hasRole` reads that mapping.
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    /// @notice Display name of the property, for example "123 Main Street (placeholder)".
    /// @dev This is not the ERC-20 token name. The token name is what wallets show
    ///      ("123 Main Street Shares"). This one is the building's name in the lesson.
    string public propertyName;

    /// @notice Street address, stored as text. Ethereum does not check that this
    ///         street exists. It is a label for humans, which is why the lesson
    ///         calls it a placeholder.
    string public streetAddress;

    /// @notice keccak256 of the deed or the LLC operating agreement.
    /// @dev keccak256 is a hash: any change in the file produces a different
    ///      32-byte value, and you cannot reconstruct the file from the hash.
    ///      The contract does not store the PDF. Storing a PDF on-chain would
    ///      be extremely expensive and still would not make it a legal deed.
    bytes32 public documentHash;

    /// @notice Where to download the document the hash is supposed to match.
    ///         An https URL or an ipfs:// URI. The chain does not fetch it.
    string public documentUri;

    /// @notice The mock dollar (or, in a later experiment, another ERC-20) that
    ///         `depositStable` accepts. Set once, in the constructor.
    /// @dev `immutable` means the value is written into the bytecode at deploy
    ///      time. Nobody can later point the property at a different token and
    ///      change what "the rent" was paid in. ETH is not this address. ETH is
    ///      the chain's native coin and shows up as `msg.value`. In events we
    ///      use address(0) to mean "this payment was ETH".
    address public immutable stablecoin;

    /// @notice Classroom stand-in for a KYC allowlist.
    /// @dev `true` means "this address may hold shares". Both the sender and the
    ///      recipient must be allowed at the moment of a transfer. The zero
    ///      address is the mint/burn sentinel inside ERC-20 and is never a holder.
    ///      `public` makes Solidity write a free getter, `allowed(address)`, so
    ///      `cast call` can read it without a transaction.
    mapping(address => bool) public allowed;

    /// @dev One asset's books. ETH has one of these. The mock dollar has another.
    ///      They never share numbers. Depositing ETH does not increase what a
    ///      holder can claim in dollars, and the reverse is also true.
    ///
    ///      `rewardPerShareStored` only grows.
    ///      `userRewardPerSharePaid` is the value of `rewardPerShareStored` the
    ///      last time we snapshotted that holder. The gap between them is the
    ///      rent per share they have not been credited for yet.
    ///      `unclaimed` is rent that has been snapshotted but not paid out.
    ///      A holder's full claim is `unclaimed` plus the gap times their balance.
    ///
    ///      The mappings live inside the struct on purpose. `_sync` and `_earned`
    ///      take a storage reference to one ledger, so the ETH math and the
    ///      dollar math cannot drift apart into two copies of the formula.
    struct RentLedger {
        uint256 rewardPerShareStored;
        uint256 totalDeposited;
        uint256 totalAllocated;
        uint256 totalClaimed;
        mapping(address => uint256) userRewardPerSharePaid;
        mapping(address => uint256) unclaimed;
    }

    /// @dev Private because a public struct that contains mappings does not
    ///      make useful getters. The views at the bottom (`claimableEth`,
    ///      `ethDeposited`, and the rest) are the public face of these books.
    RentLedger private ethRent;
    RentLedger private stableRent;

    // -------------------------------------------------------------------------
    // Failures a caller can read
    // -------------------------------------------------------------------------
    //
    // A custom error is a named revert. Compared with `require(ok, "a sentence")`
    // it costs less gas and Foundry prints the name in a failed test. The
    // sentence that explains the name lives in the comment, which is where a
    // person reads it. `cast` prints the name too when a transaction reverts.

    /// @notice The caller is neither the manager nor the admin.
    error NotManager(address caller);

    /// @notice This address is not on the allowlist, so it cannot send or receive shares.
    error NotAllowed(address account);

    /// @notice A zero address was passed where a real account is required.
    error ZeroAddress();

    /// @notice The deposit or the mint amount was zero.
    error ZeroAmount();

    /// @notice The amount was so small that spreading it across the shares would
    ///         assign nothing. With the constants in this file, 1 wei is enough.
    ///         The check is here so a future edit to the supply cannot silently
    ///         accept rent that nobody can claim.
    error AmountTooSmall(uint256 amount);

    /// @notice `claimEth` or `claimStable` was called and the books show zero.
    error NothingToClaim();

    /// @notice A required string (name, street, document URI) was empty.
    error EmptyText();

    /// @notice documentHash was bytes32(0). That value is reserved for "not set"
    ///         so a forgotten argument cannot look like a real document.
    error EmptyDocumentHash();

    /// @notice The stablecoin address has no contract code. An ordinary account
    ///         cannot be the rent token, because we will call `transferFrom` on it.
    error StablecoinNotAContract(address token);

    /// @notice The ETH send to the claimer returned false. The whole claim reverts,
    ///         so the books are unchanged and the holder can try again.
    error EthTransferFailed();

    /// @notice ETH arrived without `depositEth`. It is not rent. We refuse it so
    ///         it cannot sit in the contract outside the books.
    /// @dev There is a historical trick (selfdestruct) that can force ETH in
    ///      anyway. This lesson does not try to handle that. Forced ETH would
    ///      be stuck dust, not claimable rent.
    error PlainEthNotRent();

    /// @notice The share supply was zero, so rent cannot be divided. The constructor
    ///         mints the full supply before anyone can deposit, and nothing can burn
    ///         it. This error is the guard in front of the division anyway.
    error NoShares();

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------
    //
    // An event is a log line in the transaction receipt. It does not move money
    // and it is not a balance. Indexers and `cast logs` read it later.
    // `indexed` arguments can be searched. At most three arguments may be indexed.

    /// @notice Rent was deposited and added to the per-share total.
    /// @param asset address(0) when the rent was ETH. The stablecoin address otherwise.
    /// @param rewardPerShareStored The running total AFTER this deposit was added.
    event RentDeposited(address indexed payer, address indexed asset, uint256 amount, uint256 rewardPerShareStored);

    /// @notice A holder withdrew the rent their shares had earned.
    /// @param asset address(0) when the payout was ETH. The stablecoin address otherwise.
    event RentClaimed(address indexed holder, address indexed asset, uint256 amount);

    /// @notice The allowlist changed for one address.
    event AllowedSet(address indexed account, bool allowed);

    /// @notice The admin replaced the street text, the document hash, or the URI.
    /// @dev This does not transfer the building. It changes the label holders can read.
    event DocumentsUpdated(string streetAddress, bytes32 documentHash, string documentUri);

    // -------------------------------------------------------------------------
    // Construction
    // -------------------------------------------------------------------------

    /// @notice Create the share token, record the property label, and mint 100% to `admin`.
    /// @param tokenName_   ERC-20 name wallets show, such as "123 Main Street Shares".
    /// @param tokenSymbol_ Short ticker, such as "MAIN".
    /// @param propertyName_ Human name of the property. Not the token name.
    /// @param streetAddress_ Placeholder street text. Not checked against any registry.
    /// @param documentHash_ keccak256 of the deed or the LLC agreement. Must not be zero.
    /// @param documentUri_ Where a person downloads the file that should hash to `documentHash_`.
    /// @param stablecoin_  The mock dollar. Must already be a deployed contract.
    /// @param admin_       Receives DEFAULT_ADMIN_ROLE and the entire share supply.
    ///                     The admin can grant and revoke the manager, and can replace
    ///                     the document hash. The admin does not earn rent unless they
    ///                     still hold shares. A role is not a balance.
    /// @param manager_     Receives MANAGER_ROLE. The manager deposits rent and edits
    ///                     the allowlist. The manager cannot change the document hash
    ///                     and cannot grant roles. Pass the same address as `admin_`
    ///                     when one practice key is playing both parts, which is how
    ///                     the Anvil walkthrough starts.
    /// @dev The admin is allowlisted before the mint. `_mint` calls `_update`, and
    ///      `_update` refuses to give shares to an address that is not allowed.
    ///      The manager is NOT allowlisted automatically. Holding the role and
    ///      holding shares are different facts. If the manager should also hold
    ///      shares, the admin calls `setAllowed` and then `transfer`.
    constructor(
        string memory tokenName_,
        string memory tokenSymbol_,
        string memory propertyName_,
        string memory streetAddress_,
        bytes32 documentHash_,
        string memory documentUri_,
        address stablecoin_,
        address admin_,
        address manager_
    ) ERC20(tokenName_, tokenSymbol_) {
        _requireText(tokenName_);
        _requireText(tokenSymbol_);
        _requireText(propertyName_);
        _requireText(streetAddress_);
        _requireText(documentUri_);
        if (documentHash_ == bytes32(0)) revert EmptyDocumentHash();
        if (admin_ == address(0) || manager_ == address(0) || stablecoin_ == address(0)) {
            revert ZeroAddress();
        }
        // `code.length` is zero for an empty account and non-zero for a contract
        // that has finished its constructor. The mock dollar must be deployed
        // before this contract, which is the order the script uses.
        if (stablecoin_.code.length == 0) revert StablecoinNotAContract(stablecoin_);

        propertyName = propertyName_;
        streetAddress = streetAddress_;
        documentHash = documentHash_;
        documentUri = documentUri_;
        stablecoin = stablecoin_;

        // DEFAULT_ADMIN_ROLE is OpenZeppelin's root role (the bytes32 value 0).
        // It is the admin of every role unless you change that, which we do not.
        // The admin can grant MANAGER_ROLE, revoke it, and call the manager-only
        // functions, because `onlyManager` accepts either role.
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(MANAGER_ROLE, manager_);

        allowed[admin_] = true;
        emit AllowedSet(admin_, true);

        // Mint is the only time shares are created. From here on, ownership
        // changes only by transfer, and only between allowlisted addresses.
        _mint(admin_, TOTAL_SHARES);
    }

    /// @notice 0 decimals: the raw balance IS the share count.
    /// @dev ERC-20's default of 18 would make the supply look like 1_000_000 * 10^18
    ///      in `cast` and like "1,000,000.0" only after a wallet divided it back.
    ///      Returning 0 keeps the lesson's numbers equal to what the chain stores.
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    // -------------------------------------------------------------------------
    // Allowlist and documents
    // -------------------------------------------------------------------------

    /// @notice Allow or revoke one address.
    /// @dev Both the sender and the recipient of a transfer must be allowed.
    ///      Revoking an address that still holds shares freezes those shares:
    ///      they cannot be sent, and nobody can send more to that address,
    ///      until someone with the manager role allows it again. There is no
    ///      "forced transfer" in this lesson. A real transfer agent sometimes
    ///      has that power so a court order or a sanctions match can move
    ///      tokens. We left it out so this file cannot quietly seize shares.
    ///      The freeze is still a real power. Do not revoke your own address
    ///      while you hold shares, or you will not be able to move them.
    ///
    ///      This is the sense in which a security token "restricts transfers".
    ///      The restriction is a list of approved holders, not a property of
    ///      the math. The rent math does not care who is approved. The transfer
    ///      hook does.
    function setAllowed(address account, bool approved) external onlyManager {
        if (account == address(0)) revert ZeroAddress();
        allowed[account] = approved;
        emit AllowedSet(account, approved);
    }

    /// @notice Replace the street text, the document hash, and the URI together.
    /// @dev Only the admin role. The manager, who handles rent, cannot rewrite
    ///      the hash. Those are different jobs, and the split is here so you
    ///      can see it in a test: a key that can deposit rent is not a key that
    ///      can point at a different PDF.
    ///
    ///      Changing the hash does not change who owns shares and does not
    ///      change rent already owed. It tells holders "the file you should
    ///      read is a different file now". Whether that new file has any legal
    ///      effect is a question for the operating agreement, not for Solidity.
    function updatePropertyRecord(
        string calldata newStreetAddress,
        bytes32 newDocumentHash,
        string calldata newDocumentUri
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _requireText(newStreetAddress);
        _requireText(newDocumentUri);
        if (newDocumentHash == bytes32(0)) revert EmptyDocumentHash();

        streetAddress = newStreetAddress;
        documentHash = newDocumentHash;
        documentUri = newDocumentUri;
        emit DocumentsUpdated(newStreetAddress, newDocumentHash, newDocumentUri);
    }

    /// @notice True when `account` may deposit rent and edit the allowlist.
    /// @dev True for the manager role and for the admin role. A free read.
    ///      `hasRole` is the OpenZeppelin check this function wraps so `cast`
    ///      has a name that matches the lesson.
    function isManager(address account) external view returns (bool) {
        return _isManager(account);
    }

    // -------------------------------------------------------------------------
    // Rent in
    // -------------------------------------------------------------------------

    /// @notice Deposit ETH rent. `msg.value` is the rent. It is divided across
    ///         the shares that exist right now.
    /// @dev `payable` is what allows the transaction to carry ETH. The ETH is
    ///      already on the contract by the time this body runs. If we revert,
    ///      the chain gives it back. We do not use `address(this).balance` as
    ///      the deposit amount: that balance includes unpaid earlier rent and
    ///      rounding dust, and counting it again would pay those twice.
    ///
    ///      There is no loop over holders. `_deposit` adds one number. Holders
    ///      pick up their slice later, when they claim or when they transfer.
    function depositEth() external payable onlyManager nonReentrant {
        _deposit(ethRent, msg.value);
        emit RentDeposited(msg.sender, address(0), msg.value, ethRent.rewardPerShareStored);
    }

    /// @notice Deposit mock-dollar rent.
    /// @dev Two steps, because ERC-20 is not ETH:
    ///        1. The manager calls `approve` on the dollar contract, naming this
    ///           property contract as the spender and `amount` as the allowance.
    ///        2. The manager calls `depositStable`. We pull the tokens with
    ///           `transferFrom`.
    ///      ETH needs no approval. It arrives as `msg.value`. The dollar needs
    ///      approval because an ERC-20 does not let a stranger move your tokens.
    ///      That pull is the "allowance" you can read with `allowance(you, property)`.
    ///
    ///      The books are updated BEFORE `transferFrom`. If the token calls back
    ///      into this contract during the transfer, the reentrancy lock is already
    ///      held, and the new rent is already in `rewardPerShareStored`. If the
    ///      transfer fails, the whole transaction reverts, books included.
    ///      A token that returns `false` instead of reverting is caught by
    ///      SafeERC20, which turns `false` into a revert.
    function depositStable(uint256 amount) external onlyManager nonReentrant {
        _deposit(stableRent, amount);
        IERC20(stablecoin).safeTransferFrom(msg.sender, address(this), amount);
        emit RentDeposited(msg.sender, stablecoin, amount, stableRent.rewardPerShareStored);
    }

    // -------------------------------------------------------------------------
    // Rent out
    // -------------------------------------------------------------------------

    /// @notice Pay the caller the ETH their shares have earned and not yet taken.
    /// @dev Checks, then effects, then the interaction.
    ///      The effect (zero `unclaimed`, add to `totalClaimed`) happens before
    ///      the ETH moves. The receiver may be a contract. Receiving ETH runs
    ///      their code. If we sent the ETH first, that code could call `claimEth`
    ///      again while `unclaimed` still showed the old amount and be paid twice.
    ///      That bug is reentrancy.
    ///
    ///      Two layers stop it:
    ///        1. Effects first. The second call sees `unclaimed == 0`.
    ///        2. `nonReentrant`. The second call reverts before it can do anything
    ///           else either, including a deposit or a share transfer in the middle
    ///           of the payout. One lock covers every `nonReentrant` function.
    ///           OpenZeppelin's guard is a storage flag: ENTERED at the start,
    ///           NOT_ENTERED at the end. A revert rolls the flag back with the
    ///           rest of the transaction, so a failed claim does not stick the lock.
    ///
    ///      `{value: amount}` attaches ETH. The empty string is the calldata:
    ///      we are not calling a function, we are transferring. `call` forwards
    ///      the remaining gas and returns `false` on failure instead of reverting
    ///      by itself, so we check `ok` and revert with a name. `transfer` and
    ///      `send` only forward 2300 gas, which breaks a receiver that does any
    ///      real work. `call` plus a check is the pattern to copy.
    ///
    ///      If the send fails, the whole claim reverts, including the bookkeeping.
    ///      The holder still has the claim and can try again from a receiver
    ///      that accepts ETH.
    function claimEth() external nonReentrant {
        _sync(ethRent, msg.sender);
        uint256 amount = ethRent.unclaimed[msg.sender];
        if (amount == 0) revert NothingToClaim();

        ethRent.unclaimed[msg.sender] = 0;
        ethRent.totalClaimed += amount;

        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert EthTransferFailed();

        emit RentClaimed(msg.sender, address(0), amount);
    }

    /// @notice Pay the caller the mock-dollar rent their shares have earned.
    /// @dev Same order as `claimEth`: snapshot, zero the claim, then send.
    ///      There is no partial claim. You take everything the books currently
    ///      owe you, which keeps "what is left" equal to one stored number.
    ///      A later deposit starts a new claim that you pick up with another call.
    function claimStable() external nonReentrant {
        _sync(stableRent, msg.sender);
        uint256 amount = stableRent.unclaimed[msg.sender];
        if (amount == 0) revert NothingToClaim();

        stableRent.unclaimed[msg.sender] = 0;
        stableRent.totalClaimed += amount;

        IERC20(stablecoin).safeTransfer(msg.sender, amount);
        emit RentClaimed(msg.sender, stablecoin, amount);
    }

    // -------------------------------------------------------------------------
    // Reads
    // -------------------------------------------------------------------------
    //
    // Every function below is `view`. A node answers it with eth_call. No
    // signature, no fee, no nonce, and it cannot change the books. `cast call`
    // is the command-line version of the same read.

    /// @notice ETH this holder could take with `claimEth` right now, in wei.
    function claimableEth(address account) external view returns (uint256) {
        return _earned(ethRent, account);
    }

    /// @notice Mock-dollar base units this holder could take with `claimStable` right now.
    /// @dev Divide by 10^6 if you want "mock dollars" rather than base units.
    function claimableStable(address account) external view returns (uint256) {
        return _earned(stableRent, account);
    }

    /// @notice Running "ETH rent earned by one share", scaled by PRECISION.
    /// @dev Divide a holder's balance times this number by PRECISION and you
    ///      have the ETH they earned since their last snapshot, not counting
    ///      anything already stored in `unclaimed`. `claimableEth` does that
    ///      addition for you. This getter exists so a test can show the single
    ///      number a deposit changes.
    function ethRewardPerShare() external view returns (uint256) {
        return ethRent.rewardPerShareStored;
    }

    /// @notice Running "dollar rent earned by one share", scaled by PRECISION.
    function stableRewardPerShare() external view returns (uint256) {
        return stableRent.rewardPerShareStored;
    }

    /// @notice All ETH the manager has deposited, including dust nobody can claim.
    function ethDeposited() external view returns (uint256) {
        return ethRent.totalDeposited;
    }

    /// @notice All ETH holders have actually been paid.
    function ethClaimed() external view returns (uint256) {
        return ethRent.totalClaimed;
    }

    /// @notice ETH that the per-share math assigned to holders.
    /// @dev `ethDeposited - ethAccounted` is rounding dust. With the constants
    ///      in this file that gap is zero for the deposit as a whole. Per-holder
    ///      rounding can still leave a wei in the contract after everyone claims.
    ///      That wei is `address(this).balance` after `ethClaimed` catches up
    ///      to `ethAccounted`. It is not paid to anyone.
    function ethAccounted() external view returns (uint256) {
        return ethRent.totalAllocated;
    }

    /// @notice All mock-dollar base units the manager has deposited.
    function stableDeposited() external view returns (uint256) {
        return stableRent.totalDeposited;
    }

    /// @notice All mock-dollar base units holders have been paid.
    function stableClaimed() external view returns (uint256) {
        return stableRent.totalClaimed;
    }

    /// @notice Mock-dollar base units the per-share math assigned to holders.
    function stableAccounted() external view returns (uint256) {
        return stableRent.totalAllocated;
    }

    // -------------------------------------------------------------------------
    // The hook that keeps a transfer fair
    // -------------------------------------------------------------------------

    /// @dev OpenZeppelin calls `_update` for every mint, transfer, and burn.
    ///      `from == address(0)` means mint. `to == address(0)` means burn.
    ///      We never burn, and ERC-20's `transfer` already rejects `to == address(0)`,
    ///      but the checks are written so a later edit cannot bypass them.
    ///
    ///      Order matters, and it is the whole fairness rule:
    ///        1. Reject a sender or a recipient who is not allowlisted.
    ///           The zero address is exempt because it is the mint/burn sentinel,
    ///           not a holder.
    ///        2. Snapshot BOTH parties while the balances are still the old ones.
    ///           Snapshotting the recipient first or second does not matter.
    ///           Snapshotting AFTER `super._update` would be wrong: the recipient's
    ///           new, larger balance would be multiplied by rent from before they
    ///           bought, and the sender's new, smaller balance would forget rent
    ///           they had already earned.
    ///        3. Let OpenZeppelin move the balances.
    ///
    ///      A snapshot of address(0) is skipped. Minting the initial supply in
    ///      the constructor happens while `rewardPerShareStored` is still zero,
    ///      so the admin starts with a clean marker of "paid up through zero".
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && !allowed[from]) revert NotAllowed(from);
        if (to != address(0) && !allowed[to]) revert NotAllowed(to);

        _sync(ethRent, from);
        _sync(ethRent, to);
        _sync(stableRent, from);
        _sync(stableRent, to);

        super._update(from, to, value);
    }

    /// @dev Reject ETH that was not sent through `depositEth`.
    ///      A plain transfer (no calldata) would otherwise increase the contract's
    ///      ETH balance without increasing `rewardPerShareStored`. Holders could
    ///      not claim it, and a later change that used `address(this).balance`
    ///      as "the rent" could pay it out twice or to the wrong math.
    ///      Reverting keeps the chain's balance and our books in the same story.
    ///      Unknown function calls do not hit this function. Solidity rejects
    ///      them on its own, because we did not write a `fallback`.
    receive() external payable {
        revert PlainEthNotRent();
    }

    // -------------------------------------------------------------------------
    // Internal accounting
    // -------------------------------------------------------------------------

    /// @dev Add `amount` to one ledger.
    ///      `credit` is the increase in "scaled rent per share".
    ///      `allocated` is how many base units that credit is worth once it is
    ///      multiplied back out by the whole supply. We store both so a reader
    ///      can compare "what arrived" (`totalDeposited`) with "what holders
    ///      can claim" (`totalAllocated`).
    function _deposit(RentLedger storage ledger, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        uint256 shares = totalSupply();
        if (shares == 0) revert NoShares();

        uint256 credit = Math.mulDiv(amount, PRECISION, shares);
        uint256 allocated = Math.mulDiv(credit, shares, PRECISION);
        if (credit == 0 || allocated == 0) revert AmountTooSmall(amount);

        ledger.rewardPerShareStored += credit;
        ledger.totalDeposited += amount;
        ledger.totalAllocated += allocated;
    }

    /// @dev Write down what `account` has earned up to this moment, then mark
    ///      them paid-up-to the current `rewardPerShareStored`.
    ///      After this, further rent requires the per-share total to grow.
    ///      Their balance can change immediately afterwards without taking or
    ///      losing the rent that was just written into `unclaimed`.
    function _sync(RentLedger storage ledger, address account) internal {
        if (account == address(0)) return;
        ledger.unclaimed[account] = _earned(ledger, account);
        ledger.userRewardPerSharePaid[account] = ledger.rewardPerShareStored;
    }

    /// @dev The claim a holder has right now, whether or not anyone has
    ///      snapshotted them recently.
    ///      `paid` is always a past or current value of `rewardPerShareStored`,
    ///      and that total only grows, so the subtraction cannot underflow.
    ///      `mulDiv` rounds down. Rounding down is the "you never get more than
    ///      your pro-rata share" rule. The wei that rounding drops stays in
    ///      the contract.
    function _earned(RentLedger storage ledger, address account) internal view returns (uint256) {
        uint256 delta = ledger.rewardPerShareStored - ledger.userRewardPerSharePaid[account];
        return ledger.unclaimed[account] + Math.mulDiv(balanceOf(account), delta, PRECISION);
    }

    function _isManager(address account) internal view returns (bool) {
        return hasRole(MANAGER_ROLE, account) || hasRole(DEFAULT_ADMIN_ROLE, account);
    }

    modifier onlyManager() {
        if (!_isManager(msg.sender)) revert NotManager(msg.sender);
        _;
    }

    function _requireText(string memory value) internal pure {
        if (bytes(value).length == 0) revert EmptyText();
    }
}
