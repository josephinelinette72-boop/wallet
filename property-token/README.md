# Property shares (a classroom model)

**This is not an offering.** There is no building, no LLC, and no investor behind these tokens. Do not sell them. Do not tell anyone they are buying a house. The deploy script refuses every chain except Anvil (chain id 31337) and Sepolia (chain id 11155111).

This folder is a second Foundry project, next to the piggy-bank vault in `../foundry`. The vault has no libraries, so it can be read first. This lesson uses OpenZeppelin, so it lives on its own. The numbered walkthrough in the repository README (section 14) is the same session written as part of the wallet tutorial. This file is the one to keep open while you read the Solidity.

You need Ubuntu under WSL, and Foundry (`forge`, `cast`, `anvil`) on your PATH. The wallet in the repository root is optional. `cast` is enough.

## The picture

One pretend house, rented out. The contract mints **1,000,000 shares** and never mints again. Holding 250,000 of them is a 25% claim on the rent that arrives while you hold them. Decimals are 0. The integer you read with `cast` is the share count.

| Thing | Decimals | What "1" means |
| --- | --- | --- |
| ETH | 18 | 1 ETH = 10^18 wei |
| Property shares (`MAIN`) | 0 | 1 token = 1 share |
| Play dollar (`mUSD`) | 6 | 1 mock dollar = 10^6 base units |

Three scales. When a number looks enormous, check which one you are holding.

## What a token does not do

Storing the text "123 Main Street, Springfield" does not put this contract on a deed. A blockchain cannot call the county recorder.

A real project that connects tokens to a building uses a legal wrapper:

1. Someone forms a company, usually a limited liability company (an LLC), under ordinary law.
2. The **deed names the LLC**, not the token contract.
3. The LLC's operating agreement says that token holders are the members, in proportion to their balances, and that rent (after the bills the agreement names) is distributed that way.
4. The PDF of that agreement sits on a website or on IPFS. This contract stores `documentUri` (where to download it) and `documentHash` (keccak256 of the exact file).
5. Change one byte of the file and the hash changes. Holders can see the swap. The contract still cannot force a court to treat the new file as the agreement. The agreement and the deed do that.

The hash in this lesson is keccak256 of a sentence that says no such file exists. Compare it yourself:

```bash
cast keccak "PLACEHOLDER ONLY. This is not a deed or an LLC agreement. There is no building and no company behind these tokens."
```

## Why tokens like these are usually securities

Buyers would pay money for the shares because they expect rent, and they expect that rent because a manager finds the tenant and deposits the money. That is an investment in a common enterprise with an expectation of profit from someone else's work. In the United States that is the heart of the Howey test, and an arrangement that fits it is an investment contract, which is a security.

Selling a security to the public generally requires registration or a specific exemption, plus disclosures and rules about who may buy and resell. This folder is not a registration, not an exemption, and not legal advice.

`setAllowed` is a classroom stand-in for those transfer rules. A real list is fed by KYC: a regulated party has checked an identity and a sanctions list. Here the manager types an address. There is no identity system in the code. Both the sender and the recipient of a transfer must be allowed. Revoking an address that still holds shares freezes them. There is no function that seizes shares. Freezing is still a power. Do not freeze yourself while you hold shares, or you will not be able to move them.

## How the rent stays fair

The manager calls `depositEth` (the rent is `msg.value`) or `depositStable` (a play-dollar amount, after `approve`). The contract does not loop over holders. Looping would cost gas that grows with the number of holders, and one holder who rejects ETH could make the whole deposit fail.

It adds one number instead: how much rent **one share** has earned since the beginning, scaled by `10^18` so the division does not collapse to zero. With 1,000,000 shares, that scale divides evenly, and a holder's slice of a deposit is ordinary integer division:

```text
your shares * deposit / 1_000_000
```

rounded down to the nearest wei. The leftover wei, at most one per holder, stays in the contract. It is not given to the last caller.

When shares move, `_update` snapshots the sender and the recipient **before** the balances change. The seller keeps rent already earned. The buyer starts earning from the next deposit. Buying in the middle of the month does not collect the earlier months.

`claimEth` and `claimStable` pay you and set the stored claim to zero **before** the money moves. A reentrancy lock covers deposit and claim together, so a contract that receives the ETH cannot call back in and be paid twice. The tests in `test/PropertyShare.t.sol` try.

ETH and the play dollar have separate books. Depositing one does not increase what you can claim of the other.

The play dollar's `mint` works only for the address that deployed it. That is still not how a real dollar works. It exists so the tests and the script can create balances. Anyone who can sign as that owner can print more. Do not rename the token to USDC.

## What is in this folder

| Path | What it is |
| --- | --- |
| `src/PropertyShare.sol` | The share token, the rent math, the allowlist, the document hash. Read this first. |
| `src/MockStablecoin.sol` | Play dollars, 6 decimals, mintable by the deployer. |
| `script/Deploy.s.sol` | Deploys both. Refuses mainnet. Refuses Anvil's published key on any public chain. |
| `test/PropertyShare.t.sol` | Several holders, a sale between deposits, claims, roles, reentrancy, fuzz. |
| `lib/` | Vendored OpenZeppelin Contracts **v5.4.0** (MIT) and forge-std **v1.11.0** (MIT and Apache-2.0). Do not edit `lib/`. The copies are here so `git clone` builds without a second download. The `LICENSE` files next to them are the upstream licenses. |

OpenZeppelin supplies the ERC-20 balances, the role table, the reentrancy lock, the safe token calls, and `mulDiv` (so a large deposit cannot overflow the scaling multiply). The rent formula itself is in `PropertyShare.sol`, with comments on each step.

Roles, which are not balances:

- **Admin** (`DEFAULT_ADMIN_ROLE`) receives the 1,000,000 shares, can appoint or remove the manager, and can replace the document hash.
- **Manager** (`MANAGER_ROLE`) can deposit rent and edit the allowlist. The manager cannot rewrite the document hash and cannot grant roles.

One practice key can hold both roles. That is how the Anvil walkthrough starts. Holding a role does not earn rent. Holding shares does.

## Run the tests

From this folder, or from the repository root:

```bash
forge test -vv
# or, from the repository root:
npm run property:test
```

Anvil does not have to be running. Foundry runs the tests in memory. The first run downloads the Solidity 0.8.28 compiler. Fuzz tests draw 256 inputs each. A failure prints the input that broke the rule.

## Anvil

Terminal A, in Ubuntu (not PowerShell):

```bash
anvil
```

Terminal B:

```bash
cd property-token
forge script script/Deploy.s.sol
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

The first command is a rehearsal. It sends nothing. The second one sends three transactions from Anvil's published first account, which starts with 10,000 play ETH:

1. Deploy the play dollar. That account is the only minter.
2. Deploy the property. That account receives 1,000,000 shares, the admin role, and the manager role.
3. Mint 1,000,000 mock dollars to the manager.

Copy the two addresses from the log.

```bash
export RPC=http://127.0.0.1:8545
export PROPERTY=0xPASTE_PropertyShare
export STABLE=0xPASTE_MockStablecoin
export ALICE=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
export ALICE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export BOB=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
export BOB_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

Those two keys are published with Anvil. They are not secrets. Do not use them on Sepolia, and do not send them anything you care about. The script refuses `ALICE_KEY` when the chain id is not 31337.

Reads are free:

```bash
cast call $PROPERTY "totalSupply()(uint256)" --rpc-url $RPC
cast call $PROPERTY "balanceOf(address)(uint256)" $ALICE --rpc-url $RPC
cast call $PROPERTY "streetAddress()(string)" --rpc-url $RPC
cast call $PROPERTY "documentHash()(bytes32)" --rpc-url $RPC
```

`totalSupply` and Alice's balance are both `1000000`.

Allow Bob, then move 250,000 shares (25%):

```bash
cast send $PROPERTY "setAllowed(address,bool)" $BOB true --private-key $ALICE_KEY --rpc-url $RPC
cast send $PROPERTY "transfer(address,uint256)" $BOB 250000 --private-key $ALICE_KEY --rpc-url $RPC
```

Deposit 1 ETH of rent. `--value` is the rent. Then see each claim:

```bash
cast send $PROPERTY "depositEth()" --value 1ether --private-key $ALICE_KEY --rpc-url $RPC
cast call $PROPERTY "claimableEth(address)(uint256)" $ALICE --rpc-url $RPC
cast call $PROPERTY "claimableEth(address)(uint256)" $BOB --rpc-url $RPC
```

Expect `750000000000000000` wei for Alice (0.75 ETH) and `250000000000000000` for Bob (0.25 ETH). Bob takes his:

```bash
cast send $PROPERTY "claimEth()" --private-key $BOB_KEY --rpc-url $RPC
```

Move another 250,000 shares to Bob **before** the next deposit. Alice's unclaimed 0.75 ETH stays hers. Bob's claimable stays 0. The shares moved. The old rent did not.

```bash
cast send $PROPERTY "transfer(address,uint256)" $BOB 250000 --private-key $ALICE_KEY --rpc-url $RPC
cast call $PROPERTY "claimableEth(address)(uint256)" $ALICE --rpc-url $RPC
cast call $PROPERTY "claimableEth(address)(uint256)" $BOB --rpc-url $RPC
cast send $PROPERTY "depositEth()" --value 1ether --private-key $ALICE_KEY --rpc-url $RPC
cast call $PROPERTY "claimableEth(address)(uint256)" $ALICE --rpc-url $RPC
cast call $PROPERTY "claimableEth(address)(uint256)" $BOB --rpc-url $RPC
```

After the second deposit the balances are 50/50, so the new 1 ETH splits in half. Alice shows 1.25 ETH (`1250000000000000000` wei): the old 0.75 plus half of the new ether. Bob shows 0.5 ETH.

Play-dollar rent needs an approval first. 1000 mock dollars is `1000000000` base units (`1000 * 10^6`). The property pulls them with `transferFrom`. After the second sale the split is 50/50:

```bash
cast send $STABLE "approve(address,uint256)" $PROPERTY 1000000000 --private-key $ALICE_KEY --rpc-url $RPC
cast send $PROPERTY "depositStable(uint256)" 1000000000 --private-key $ALICE_KEY --rpc-url $RPC
cast call $PROPERTY "claimableStable(address)(uint256)" $ALICE --rpc-url $RPC
cast call $PROPERTY "claimableStable(address)(uint256)" $BOB --rpc-url $RPC
cast send $PROPERTY "claimStable()" --private-key $BOB_KEY --rpc-url $RPC
```

`claimStable` has no `--value`. The dollars move inside the call. Bob still pays the fee in ETH.

A transfer to an address you have not allowed reverts with `NotAllowed`. That is the allowlist working.

Stopping Anvil deletes the contracts. Start Anvil and run the script again.

## Sepolia

Use a **new** practice key. Never `ALICE_KEY`. Never a phrase that has held real ETH. Sepolia coins are play money, and the habit still matters. The script reverts if the key is Anvil's published key, and it reverts if the chain id is anything except 31337 or 11155111.

From the repository root, with `SEPOLIA_RPC_URL` set in `.env` (see the wallet README, section 13). Do not commit `.env`. The URL usually contains an API key.

```bash
read -s DEPLOYER_PRIVATE_KEY
export DEPLOYER_PRIVATE_KEY
cd property-token
source ../.env
forge script script/Deploy.s.sol --rpc-url "$SEPOLIA_RPC_URL" --broadcast
unset DEPLOYER_PRIVATE_KEY
```

`read -s` does not echo the key. Do not pass `--private-key 0x...` on the command line. That form is stored in shell history.

Fund the practice address from a Sepolia faucet before the script, or the deploy transaction has no ETH for the fee. After it is mined, the same `cast` lines work with `RPC` set to the Sepolia URL and with your practice key in place of `ALICE_KEY`. A second address that claims needs a little Sepolia ETH of its own, to pay its fee.

Optional: set `PROPERTY_MANAGER` to a different address before the script if you want the manager role and the admin role on two keys. Shares are still minted to the deployer. The manager does not earn rent until someone allowlists them and transfers shares.

## The wallet commands

If you created a keystore with `npm run wallet -- create`, it can sign the same calls without putting a private key in the command. From the repository root, Anvil running, and the account funded with `npm run wallet -- fund --eth 2`:

```bash
npm run property:build
npm run wallet -- property deploy
npm run wallet -- property info
npm run wallet -- property allow --address 0xTHE_OTHER_ADDRESS
npm run wallet -- property transfer --to 0xTHE_OTHER_ADDRESS --shares 250000
npm run wallet -- property deposit-eth --eth 1
npm run wallet -- property approve-stable --amount 1000
npm run wallet -- property deposit-stable --amount 1000
npm run wallet -- property claimable
npm run wallet -- property claim-eth
npm run wallet -- property claim-stable
```

Each write prints the transaction fields and waits for you to type `YES`. `--yes` skips the question after printing the same fields. `property deploy` saves the addresses to `.wallet/property.json`. Stopping Anvil forgets the contracts. The keystore remains.

`property freeze --address 0x...` revokes the allowlist entry. Read the warning it prints before you freeze an address that still holds shares.
