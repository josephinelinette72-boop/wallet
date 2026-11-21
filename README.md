# Learning wallet

**Never use a seed phrase that holds real money with this program.**

This is a textbook you can run. It has not been audited. A bug, a screenshot, or a leaked file could lose funds. Use Anvil play money, or Sepolia test ETH only. The same 12 words work on every Ethereum network, including mainnet, so do not reuse a practice phrase anywhere a real asset might arrive later.

You will build a small self-custody wallet and a small Solidity contract, and you will be able to say what each step is doing. Self-custody means the words on your paper are the wallet. No company is holding them for you.

## What you will have at the end

- A command-line wallet that creates a 12-word phrase, encrypts it with a password, and can send ETH and sign messages.
- A pretend Ethereum node (Anvil) full of play money.
- A tiny Solidity piggy-bank contract, with tests, that your wallet can deposit into and withdraw from.
- A second contract that splits a pretend rental into 1,000,000 shares, pays rent to whoever held the shares when the rent arrived, and refuses to deploy anywhere except a test network.
- A web page for the same wallet, in `ui/`. The words stay in your browser. The page is a textbook you can click. The command line below is the same wallet, written out so you can read every step.

## The picture to keep in your head

```
16 random bytes
    -> 12 words          (BIP-39, with a checksum so typos get caught)
    -> 64-byte seed      (PBKDF2, optional extra passphrase mixed in)
    -> private key       (BIP-32 / BIP-44 path m/44'/60'/0'/0/i)
    -> public key        (secp256k1: private key times a fixed curve point)
    -> address           (last 20 bytes of keccak256 of the public key, plus EIP-55 capitals)

password --scrypt--> AES key --AES-GCM--> the encrypted file .wallet/keystore.json
```

The password protects the file on this computer. The 12 words *are* the wallet. Anyone with the words (and the extra passphrase, if you set one) can recreate the keys on any computer.

An Ethereum address is public. The private key is what spends. This program prints addresses and never prints private keys.

## Words this project uses

| Word | Meaning |
| --- | --- |
| Terminal | The window where you type commands. In this guide that window is Ubuntu inside WSL, not PowerShell. |
| Wei | The smallest unit. 1 ETH = 10^18 wei. Amounts inside Ethereum are integers of wei. |
| Node / RPC | A program that stores the chain and answers questions. The URL of that program is the RPC URL. |
| Anvil | A pretend Ethereum on your computer, from Foundry. Chain id **31337**. It forgets everything when you stop it. |
| Sepolia | A public test network. Chain id **11155111**. Play money, but the chain is shared and it remembers. |
| Transaction | A signed list of fields: nonce, fees, gas, destination, value, data, chain id. The node broadcasts it. |
| Contract | A program that lives at an address. Calling it is a transaction whose `data` field names a function. |

## 0. You are in Ubuntu, not in PowerShell

Open the Ubuntu app that WSL installed. The prompt ends with `$`. Commands below are typed after that `$`, then Enter.

Lines that start with `#` are notes. Do not type the `#` or the words after it.

Anvil and the wallet must both run inside Ubuntu. Windows and WSL have different ideas of "this computer", so an Anvil started in PowerShell is not the Anvil your Ubuntu wallet will find at `127.0.0.1`.

Check Foundry, which this guide assumes is already installed:

```bash
forge --version
cast --version
anvil --version
```

If one of those says "command not found", install Foundry from the official book and then open a new Ubuntu window: <https://book.getfoundry.sh/getting-started/installation>

## 1. Install Node with nvm

Node runs the wallet. nvm installs Node without mixing it into the rest of the system.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

Close the Ubuntu window, open it again, and then:

```bash
nvm install 22
nvm use 22
node -v
npm -v
```

`node -v` should print `v22` something. This project also has a file named `.nvmrc` containing `22`, so later you can run `nvm use` in the project folder and get the same Node.

**What this teaches:** a language runtime (Node) is separate from the project. `npm` is the tool that downloads the libraries the project lists.

## 2. Get the code and install the libraries

```bash
git clone https://github.com/josephinelinette72-boop/wallet.git
cd wallet
nvm use
npm install
```

`npm install` reads `package.json` and downloads viem, the BIP-39 / BIP-32 libraries, and the TypeScript runner into `node_modules/`. That folder is not committed. If you are ever missing it, run `npm install` again.

**What this teaches:** the wallet does not invent SHA-256, PBKDF2, or secp256k1. Those come from audited libraries. The code you read is the recipe around them: which inputs, which path, which file format, and which fields go into a transaction.

## 3. Start a pretend Ethereum

Open a **second** Ubuntu window, go to the same project folder, and leave this running:

```bash
anvil
```

Anvil prints accounts and private keys. Those keys are published with Anvil. They are textbook keys, not secrets, and they only have money inside this pretend chain. Leave that window alone. Stopping it (Ctrl+C) erases the pretend chain: balances go back to the start, and any contract you deployed is gone. Your keystore file is not part of the chain, so it stays on disk.

**What this teaches:** a wallet and a node are two programs. The wallet signs. The node stores balances and accepts transactions. Anvil is the node.

## 4. Create a wallet

Back in the first window:

```bash
npm run wallet -- create
```

The `--` is required. It tells npm "everything after this belongs to the wallet, not to npm". Without it, npm tries to find a script named `create` and fails.

The command will:

1. Show 12 words. Write them on paper, in order. Do not screenshot them.
2. Ask you to type them back, so a skipped word is caught before anything is saved.
3. Ask about an optional BIP-39 passphrase. Press Enter to skip it the first time. If you set one and forget it, the 12 words alone open a **different, empty** wallet.
4. Ask for a file password, twice, at least 8 characters. The letters show up as `*`. This password is not the 12 words. It only encrypts the file on this computer.

There is a short pause while scrypt runs. That pause is the password being stretched so guessing it is slow. It is supposed to happen.

When it finishes, the screen clears and you see an address like `0x` plus 40 hex characters. That address is safe to copy. The words will not be shown again.

**What this teaches:** randomness becomes words, words become a key, a key becomes an address. The file on disk is a locked copy, not the backup. The paper is the backup.

## 5. Look at the locked file

```bash
cat .wallet/keystore.json
```

You will see `scrypt`, `aes-256-gcm`, a `salt`, an `iv`, a `tag`, and a `ciphertext`. You will not see your 12 words. The ciphertext is the words encrypted. The salt makes the same password produce a different file every time. The tag is how the program later notices a wrong password or an edited file, without storing a copy of the password.

`usesPassphrase` is a yes/no flag, not the passphrase itself. It is covered by the same tag, so flipping it by hand makes the file refuse to open.

Other wallets do not import this JSON. They import the 12 words. This file is only for this program.

**What this teaches:** encryption at rest. "Encrypted on disk" means a person who copies the file still needs the password.

## 6. List addresses

```bash
npm run wallet -- addresses --count 3
```

It asks for the file password, then prints three addresses. The paths are:

```
m/44'/60'/0'/0/0
m/44'/60'/0'/0/1
m/44'/60'/0'/0/2
```

`44'` means BIP-44. `60'` means Ethereum (Bitcoin is `0'`). `0'` is the first account. The next `0` is the receiving chain. The last number is which address. Same words, different last number, different address. None of the lines is a private key.

**What this teaches:** one backup can produce many addresses, and the path is part of the backup even though most wallets hide it. This wallet uses the same path MetaMask uses. Some hardware wallets number accounts differently, which is why a restored phrase can look empty if the path is wrong.

## 7. Get play ETH and read a balance

Anvil's first account already has play ETH. The faucet command sends some of it to you. It refuses to run unless the node is on this computer and reports chain id 31337, because the key it signs with is the public Anvil key.

```bash
npm run wallet -- fund --eth 1
npm run wallet -- balance
```

`fund` asks for your file password only to learn your address. `balance` prints two lines: ETH, and the same amount in wei.

You can also look up any address with no password, because balances are public:

```bash
npm run wallet -- balance --address 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

That address is Anvil account 0. You should see a very large play balance.

**What this teaches:** the chain, not the wallet file, stores the balance. Asking for it is a read. No signature, no fee.

## 8. Send play ETH to your second address

Copy the `index 1` address from step 6, then:

```bash
npm run wallet -- send --to 0xPASTE_THE_INDEX_1_ADDRESS --eth 0.1
```

Read the preview before you type `YES`. It is the transaction:

- **chain id** — inside the signature, so an Anvil signature is rejected on Sepolia.
- **nonce** — how many transactions this address has already sent. The next one must use the next number.
- **gas** — the most work the transaction may do. A plain transfer is 21000. Unused gas is not charged.
- **max fee and tip** — EIP-1559. The max fee is the ceiling on base fee plus tip. The tip goes to the block producer. The base fee is burned. You pay the ceiling or less.
- **value** — the ETH that moves, shown in ETH and in wei.

Nothing is broadcast until you type `YES`. Then you get a transaction hash. A hash identifies the transaction. It is not a key.

Check both balances:

```bash
npm run wallet -- balance --index 0
npm run wallet -- balance --index 1
```

Index 1 should show 0.1 ETH. Index 0 should show a little less than 0.9 ETH, because it also paid the fee. Leave room for the fee: sending your entire balance fails.

**What this teaches:** spending is a signed bundle of fields, not a chat message that says "send 0.1".

## 9. Sign a message, then check it

```bash
npm run wallet -- sign --message "hello from my learning wallet"
```

Copy the signature and your address, then:

```bash
npm run wallet -- verify --message "hello from my learning wallet" --signature 0xPASTE --address 0xPASTE
```

`verify` does not ask for a password and does not use the network. Change one letter of the message and it will say the signature is not valid.

The line labeled `EIP-191 hash` is what the signature actually covers: keccak256 of a prefix (`Ethereum Signed Message`) plus your text. That prefix is why this signature cannot be reused as a transaction.

**What this teaches:** signing a message and signing a transaction are the same kind of math over different bytes. Verification needs the address, not the private key.

## 10. The Solidity contract

Open `foundry/src/LearningVault.sol`. It is a piggy bank:

- `deposit()` records `msg.value` under `msg.sender`.
- `withdraw(amount)` sends back only what that address deposited.
- `balanceOf` is the contract's own ledger.
- `totalEth()` is the ETH the chain says the contract holds.
- There is no `receive()`, so a plain transfer that skips `deposit` is rejected. Otherwise ETH could arrive without a ledger entry and get stuck.
- `withdraw` updates the ledger *before* sending ETH, so a receiver cannot call `withdraw` again mid-payment and take someone else's deposit. That bug is called reentrancy. A test tries it.

Run the contract tests. They do not need Anvil. Foundry runs them in memory:

```bash
npm run contracts:test
```

**What this teaches:** a test is another contract that calls yours and `require`s the result. `1 ether` in Solidity means `10**18` wei.

The property-share lesson in section 14 is a second Foundry project. Finish the vault first. The vault has no libraries, so you can read every line. The property lesson brings in OpenZeppelin on purpose.

Compile, so the wallet can read the bytecode:

```bash
npm run contracts:build
```

That writes `foundry/out/`, which git ignores. You can rebuild it any time.

## 11. Deploy the contract and use it

Anvil is still running in the other window. Your address still has play ETH from step 7.

```bash
npm run wallet -- contract deploy
```

The preview is a transaction with no destination, because a deployment *creates* an address. Type `YES`. The address is saved in `.wallet/vault.json`. That address is not a secret.

```bash
npm run wallet -- contract status
npm run wallet -- contract deposit --eth 0.2
npm run wallet -- contract status
npm run wallet -- contract withdraw --eth 0.05
npm run wallet -- contract status
```

`status` is a free read. After the deposit, `balanceOf` and `totalEth()` should both show 0.2 ETH. After the withdrawal, both should show 0.15 ETH.

On the withdraw preview, notice **value is 0**. The ETH comes out of the contract during the call. The amount is in the call data, not in the value field. You still pay a fee from your own account.

The same read, using Foundry's `cast`, against the address deploy printed:

```bash
cast call VAULT_ADDRESS "balanceOf(address)(uint256)" YOUR_ADDRESS --rpc-url http://127.0.0.1:8545
```

`cast call` is a read. No key, no fee. The wallet's deposit command is the matching write, signed with your keystore so the private key never has to sit in the shell command.

**What this teaches:** a contract call is a transaction. Reads are free. Writes are signed. The contract's ledger and the chain's ETH balance are two numbers that you want to be able to explain separately.

Stopping Anvil deletes the contract. The keystore remains. Start Anvil again, `fund` yourself again, and `contract deploy` again.

## 12. Optional: a phrase the whole internet already knows

This phrase is a public test vector. It is printed in the BIP-39 specification and in this repository's tests. **It is not a secret. Never send anything you care about to it.**

```
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
```

With no extra passphrase, address 0 on `m/44'/60'/0'/0/0` is:

```
0x9858EfFD232B4033E47d90003D41EC34EcaEda94
```

Importing it replaces the keystore only if you pass `--force` and then type `REPLACE`:

```bash
npm run wallet -- import --force
```

Your paper copy of the first phrase still works: import it again later. Anvil balances are play money either way. The automated test `npm test` already checks this phrase, so you do not need to import it to trust the derivation.

**What this teaches:** a published phrase is a burned wallet. The math is real. The secrecy is the only thing that was never there.

## 13. Optional: Sepolia

Sepolia ETH is play money on a public network. The phrase is still real cryptography.

1. Create a **new** phrase for this. Do not reuse words you have used anywhere else.
2. Copy `.env.example` to `.env`:

   ```bash
   cp .env.example .env
   ```

3. Put a Sepolia RPC URL in `SEPOLIA_RPC_URL`. Alchemy and Infura give free ones. The URL usually contains an API key. `.env` is gitignored. Do not commit it, and do not paste it into chat.
4. Set `CHAIN=sepolia`.
5. Run `npm run wallet -- balance` and read the error if the URL is empty or wrong. The wallet prints the host and hides the key.
6. Copy your address into a Sepolia faucet (search for a current one; they come and go).
7. Send a little test ETH to your second address the same way as step 8.

`npm run wallet -- fund` on Sepolia stops before it sends. The faucet key is the public Anvil key, and the command requires localhost plus chain id 31337. Try it once and read the refusal. That is the guard working.

To go back to Anvil, set `CHAIN=anvil` or delete `.env`. You can also override one command:

```bash
npm run wallet -- balance --chain anvil
```

**What this teaches:** the wallet does not contain the network. The RPC URL is where the bytes go. Chain id is how a signature is tied to one network.

## 14. Optional: shares in a pretend rental

This lesson is a model of fractional ownership. It is not an offer to sell anything. There is no building, no company, and no investor. The deploy script refuses every chain except Anvil (31337) and Sepolia (11155111). Do not point it at mainnet, and do not take anyone's money with it.

Open `property-token/src/PropertyShare.sol` and read the header before the functions. The short version of that header:

**The shares.** The contract mints exactly 1,000,000 tokens and never mints again. Together they mean "100% of the property". 250,000 tokens is 25%. Decimals are 0, so the number `cast` prints is the number of shares. (ETH uses 18 decimals. The play dollar uses 6. Three different scales show up on purpose. Read the unit before you trust the number.)

**The legal wrapper, in the real world.** A token balance is not a signature on a deed. A county recorder does not read Ethereum. A project that actually connects tokens to a house puts the house in a company, usually a limited liability company (an LLC). The deed names the LLC. The LLC's operating agreement, which is an ordinary legal contract, says that the people holding the tokens are the members, in proportion to their balances, and that rent is paid that way. This contract stores the street as text, a URI where that agreement would be downloaded, and `documentHash`, which is keccak256 of the file. Change one byte of the file and the hash changes, so holders can see the document was swapped. The hash does not enforce the agreement. A court and the operating agreement do that. The sentence this lesson hashes says, in the hash's own input, that no such file exists.

**Why this is usually a security.** People would buy the shares because they expect rent, and they expect that rent because a manager does the work. Under the US Howey test, that pattern is an investment contract, which is a security. Selling securities to the public means registration or a specific exemption, disclosures, and rules about who may buy and resell. Other countries have their own versions. This repository is not a registration, not an exemption, and not legal advice.

**The allowlist.** `setAllowed` is the classroom stand-in for those transfer rules. A real security token's list is fed by an identity check (KYC: a regulated party has looked at a passport and a sanctions list). Here the manager writes down an address. Both the sender and the recipient must be on the list or the transfer reverts. Revoking an address that still holds shares freezes them. There is no function that seizes shares. Freezing is still a real power. Do not freeze your own address while you hold shares.

**The rent math.** The manager deposits ETH, or the play dollar in `MockStablecoin.sol`. The contract does not loop over holders. It adds one number, "rent earned by a single share since the beginning". Your claim is your balance times that number. The moment shares move, both parties are snapshotted first, so the seller keeps rent from before the sale and the buyer does not collect it. You call `claimEth` or `claimStable` to take what you are owed. The books update before the money moves, and a reentrancy lock covers claim and deposit together. Tests try to get paid twice. They fail, which is the point.

The code and a longer walkthrough live in [`property-token/README.md`](property-token/README.md). The commands below are enough to run it.

### Tests, then a local deploy

From the repository folder, in Ubuntu:

```bash
npm run property:test
```

Foundry runs the tests in memory. Anvil does not have to be running. The first run downloads the Solidity compiler.

Start Anvil in a second Ubuntu terminal if it is not already running from step 3. In the first terminal:

```bash
cd property-token
forge script script/Deploy.s.sol
```

That rehearsal prints the plan and sends nothing. The key it names is Anvil's published first account. Foundry prints that key in the Anvil banner. It is not a secret, and the script refuses to use it on any chain except 31337.

```bash
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

Copy the two addresses out of the log. They are not secrets.

```bash
export RPC=http://127.0.0.1:8545
export PROPERTY=0xPASTE_THE_PropertyShare_ADDRESS
export STABLE=0xPASTE_THE_MockStablecoin_ADDRESS
export ALICE=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
export ALICE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export BOB=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
export BOB_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

`ALICE` is Anvil account 0, the deployer. `BOB` is Anvil account 1. Both keys are published textbook keys. Do not send them anything you care about. Do not use them on Sepolia.

```bash
cast call $PROPERTY "balanceOf(address)(uint256)" $ALICE --rpc-url $RPC
cast call $PROPERTY "documentHash()(bytes32)" --rpc-url $RPC
cast keccak "PLACEHOLDER ONLY. This is not a deed or an LLC agreement. There is no building and no company behind these tokens."
```

The balance is `1000000`. The two hashes match. `cast call` is a free read. No key, no fee.

Bob is not on the allowlist yet, so a transfer to Bob reverts. Then allow him and move 25% of the shares:

```bash
cast send $PROPERTY "setAllowed(address,bool)" $BOB true --private-key $ALICE_KEY --rpc-url $RPC
cast send $PROPERTY "transfer(address,uint256)" $BOB 250000 --private-key $ALICE_KEY --rpc-url $RPC
cast call $PROPERTY "balanceOf(address)(uint256)" $ALICE --rpc-url $RPC
cast call $PROPERTY "balanceOf(address)(uint256)" $BOB --rpc-url $RPC
```

Alice has 750000. Bob has 250000.

Deposit 1 ETH of rent. The amount is the transaction's value, which `--value 1ether` sets. Then read what each address could claim:

```bash
cast send $PROPERTY "depositEth()" --value 1ether --private-key $ALICE_KEY --rpc-url $RPC
cast call $PROPERTY "claimableEth(address)(uint256)" $ALICE --rpc-url $RPC
cast call $PROPERTY "claimableEth(address)(uint256)" $BOB --rpc-url $RPC
```

Alice's number is `750000000000000000` wei, which is 0.75 ETH. Bob's is 0.25 ETH. 75% and 25%. Bob takes his:

```bash
cast send $PROPERTY "claimEth()" --private-key $BOB_KEY --rpc-url $RPC
cast call $PROPERTY "claimableEth(address)(uint256)" $BOB --rpc-url $RPC
```

Bob's claimable is now 0. Alice has not claimed, so she still shows 0.75 ETH.

Sell Bob another 250000 shares, and look again before any new rent:

```bash
cast send $PROPERTY "transfer(address,uint256)" $BOB 250000 --private-key $ALICE_KEY --rpc-url $RPC
cast call $PROPERTY "claimableEth(address)(uint256)" $ALICE --rpc-url $RPC
cast call $PROPERTY "claimableEth(address)(uint256)" $BOB --rpc-url $RPC
```

Alice still shows 0.75 ETH. Bob still shows 0. The sale did not move rent that was already earned. Deposit another 1 ETH. The balances are 50/50 now, so this new ether splits in half, and the old 0.75 stays with Alice:

```bash
cast send $PROPERTY "depositEth()" --value 1ether --private-key $ALICE_KEY --rpc-url $RPC
cast call $PROPERTY "claimableEth(address)(uint256)" $ALICE --rpc-url $RPC
cast call $PROPERTY "claimableEth(address)(uint256)" $BOB --rpc-url $RPC
```

Alice is `1250000000000000000` wei (1.25 ETH). Bob is 0.5 ETH.

The play dollar is the other rail. ERC-20 does not let the property pull tokens until Alice approves it. 1000 mock dollars is `1000000000` base units, because the token has 6 decimals (`1000 * 10^6`). After the second share sale the split is 50/50, so each claimable is 500 dollars (`500000000` base units):

```bash
cast send $STABLE "approve(address,uint256)" $PROPERTY 1000000000 --private-key $ALICE_KEY --rpc-url $RPC
cast send $PROPERTY "depositStable(uint256)" 1000000000 --private-key $ALICE_KEY --rpc-url $RPC
cast call $PROPERTY "claimableStable(address)(uint256)" $ALICE --rpc-url $RPC
cast call $PROPERTY "claimableStable(address)(uint256)" $BOB --rpc-url $RPC
cast send $PROPERTY "claimStable()" --private-key $BOB_KEY --rpc-url $RPC
```

`claimStable` has no `--value`. The dollars move inside the call. The transaction value stays 0. You still pay a fee from Bob's ETH.

**What this teaches:** a deposit updates one number, not a list of people. A transfer snapshots the two people involved, so buying in the middle of the month does not steal the earlier rent. ETH rides in `value`. An ERC-20 rides in an approval plus `transferFrom`. Reads are free. Claims are signed.

Stopping Anvil deletes the contracts. The rehearsal command works again after you start Anvil.

### Sepolia

Sepolia ETH is play money on a public network. The property shares are still not a real offering. Use a new practice key. Do not reuse words that have ever held real ETH. Do not use `ALICE_KEY`. The script checks for that key and stops.

1. Put a Sepolia RPC URL in `.env` as `SEPOLIA_RPC_URL`, the same way as section 13. Do not commit `.env`.
2. Fund the practice address from a Sepolia faucet.
3. Load the practice key into the shell without saving it in a file. In Ubuntu:

   ```bash
   read -s DEPLOYER_PRIVATE_KEY
   export DEPLOYER_PRIVATE_KEY
   ```

   `read -s` does not print the key as you type. It is still in the shell's memory until you close the terminal. Do not put the key after the command name (`forge script --private-key 0x...`), because that form lands in shell history.

4. From `property-token`:

   ```bash
   source ../.env
   forge script script/Deploy.s.sol --rpc-url "$SEPOLIA_RPC_URL" --broadcast
   unset DEPLOYER_PRIVATE_KEY
   ```

5. The same `cast call` and `cast send` lines work if you set `RPC` to `$SEPOLIA_RPC_URL` and use the practice key instead of `ALICE_KEY`. Bob has to be an address you control on Sepolia, and that address needs a little Sepolia ETH to pay the claim fee.

`forge script` against a mainnet RPC stops before it sends, with a revert that names chain id 1. Try it only against a URL you already know is a test URL. The refusal is the guard.

### The wallet, if you want it to sign instead of `cast`

`cast send --private-key` puts a key in the command. The wallet from the first half of this README signs with the encrypted keystore instead, and it prints the transaction fields before it broadcasts. From the repository folder, with Anvil running and the account funded (`npm run wallet -- fund --eth 2`):

```bash
npm run property:build
npm run wallet -- property deploy
npm run wallet -- property info
npm run wallet -- property allow --address 0xTHE_OTHER_ADDRESS
npm run wallet -- property transfer --to 0xTHE_OTHER_ADDRESS --shares 250000
npm run wallet -- property deposit-eth --eth 1
npm run wallet -- property claimable --address 0xTHE_OTHER_ADDRESS
npm run wallet -- property approve-stable --amount 1000
npm run wallet -- property deposit-stable --amount 1000
npm run wallet -- property claim-eth
```

`property deploy` makes your keystore address the admin, the manager, and the first shareholder, then mints you 1,000,000 play dollars. The addresses are saved in `.wallet/property.json`. That file is not a secret. It is gitignored because the whole `.wallet` folder is.

The other address has to be one you can sign for (a second index: `npm run wallet -- property claim-eth --index 1`) or you keep using `cast` for Bob. `--index 1` is the next address from the same 12 words. Fund it on Anvil with `npm run wallet -- fund --eth 1 --index 1` so it can pay a claim fee.

**What this teaches:** the wallet and `cast` send the same kind of transaction. The wallet's extra step is the preview and the keystore. Neither one turns the token into a deed.

## Using the web app

The page does the same jobs as the commands below: create or import a phrase, import a raw private key, unlock it, derive addresses, send ETH, sign a message, and talk to the vault and the property token. It adds a review screen before each signature and a rent chart. The shell is a portfolio view: Overview for an investor, Admin for the operator, and Wallet for the account itself.

The 12 words, a raw private key, and the file password stay in the browser. The encrypted copy is the same scrypt + AES-GCM JSON the command line writes to `.wallet/keystore.json`. A phrase file and a private-key file use that same lock. The private-key file adds a `secret` field so the page knows there is no phrase to derive from. It is stored in the browser's database (IndexedDB), not sent to a server, and not printed in the page's log. Do not type a phrase or a key that holds real funds.

You open the page from Windows. Anvil runs in Ubuntu. The page does not call Anvil's port itself. It asks the dev server on port 5173, and that server, inside Ubuntu, asks Anvil. That is why the Windows browser can use `http://localhost:5173` and still reach the pretend chain.

### Start Anvil

Open an Ubuntu window, go to the project folder, and leave this running:

```bash
anvil
```

Stopping it (Ctrl+C) erases the pretend chain. The encrypted words in the browser stay. Balances and contracts do not.

### Compile the contracts

In a second Ubuntu window, in the project folder:

```bash
nvm use
npm install
npm run contracts:build
npm run property:build
```

The first command is the vault. The second is the property token and the play dollar. The page reads the compiled bytecode from the dev server when you click Deploy. If you skip the build, Deploy says so and tells you which command to run.

`npm test`, `npm run contracts:test`, and `npm run property:test` do not need the page. Run them whenever you want the lessons checked.

### Start the page

Still in the project folder:

```bash
npm run ui
```

Leave that window open. Vite prints a local URL. In the Windows browser, open:

```text
http://localhost:5173
```

`localhost` here is the Windows name for the Ubuntu dev server. WSL forwards it. If the page does not load, the `npm run ui` window is not running, or Windows is not forwarding localhost. The command listens on every interface, port 5173, so the address Vite prints is the one to try.

A small Testnet badge stays in the header. Anvil and Sepolia are the only networks. That is intentional.

### A walk through the screens

**Welcome.** Four doors. Create makes 12 words and asks you to write them down, then type them back, before it encrypts them. Import words takes a phrase you already have. Import a private key takes a `0x` key (64 hex characters, the shape `cast wallet new` prints). The page checks the key and shows the address it controls before anything is saved, then encrypts it with a file password. There is no recovery phrase for that wallet, and Accounts will not offer extra derived addresses. Open a keystore file takes the JSON from the command line (`.wallet/keystore.json`) so the same locked phrase file works in both places. A private-key file opens in the page, not in the command line. The file password is at least 8 characters and must not be the 12 words or the private key. The pause while saving is scrypt. It is supposed to happen.

**Unlock and lock.** Unlock asks for that file password. If you set a BIP-39 passphrase on a phrase wallet, it asks for that too. A private-key wallet does not have one. They are different secrets. Lock drops the secret from memory. It does not delete the encrypted copy. Forget, on the Accounts screen, does delete the copy in this browser. The paper phrase, or the private key you saved elsewhere, is the backup.

**The header.** Anvil is the default. Sepolia asks for an https RPC URL, which often contains an API key. The box hides it. The URL stays in this browser. If you have not set one, the page starts with the public Sepolia endpoint. The dot is the connection, and the chain id is the number the node reported (31337 for Anvil, 11155111 for Sepolia). If those disagree, the page will not sign. The address chip is the unlocked account. Fund from Anvil is only on Overview, and only while the node is local Anvil.

**Overview.** The investor screen. It shows the property, your ownership percent, claimable ETH and stablecoin, wallet ETH, rent deposits, payout history, and the holder table. Claim pays this account. Empty until a PropertyShare address is saved for this chain. On Sepolia, Load Sepolia reference fills the published deployment. On Anvil, click Fund from Anvil to take ETH from the published Anvil account. The button refuses any other chain.

**Accounts.** For a phrase, each row is `m/44'/60'/0'/0/i`. Use one of them. For an imported private key there is one row and no path to derive. Copy copies the address. The QR code is the address, not the key. Show the locked fields and you can see scrypt and a ciphertext, and download `keystore.json`. The secret itself is not in that view.

**Send.** Type an address and an amount of ETH, then Review. The review is the transaction: chain id, nonce, gas, max fee, tip, and value, with the same explanation the command line prints. Sign and send broadcasts it. Pending means the node has it. Confirmed means it was mined. The hash is public. It is not a key.

**Sign.** Preview shows the EIP-191 hash, the one with the "Ethereum Signed Message" prefix. Sign produces a signature. Check, on the right, needs the text, the signature, and an address. It does not use the network. Change one letter and it fails.

**Vault.** Deploy creates the piggy bank. Deposit attaches ETH as the transaction value. Withdraw shows value 0, because the contract sends the ETH during the call. The three numbers are your ledger entry, the contract's own total, and the ETH the chain says the contract holds. Paste an address if you already deployed one with `npm run wallet -- contract deploy`.

**Admin.** The operator screen, separate from Overview. Deploy is three reviews: the stablecoin, the 1,000,000 shares, then a mint. The page shows the street and a document hash. Changing one letter of the placeholder sentence makes the hash stop matching. Allow and Freeze edit the manager's list. Transfer moves whole shares. Deposit rent is ETH (the value field) or stablecoin (an approval, then a deposit). Claim is also here, and on Overview. The rent chart is one bar per deposit, with ETH and stablecoin drawn separately because they are different units.

**Help.** Short explanations sit on a help icon next to a control. There is no lesson drawer.

**Light and dark.** The sun or moon in the top bar. The choice is remembered in this browser. It is not a secret.

When you are done, Ctrl+C in the `npm run ui` window, and Ctrl+C in the Anvil window. The encrypted words remain until you forget them on the Accounts screen or clear the site's data in the browser.

## Map of the project

| Path | What it is |
| --- | --- |
| `ui/` | The web app. `npm run ui` serves it on port 5173. It imports the wallet code instead of copying it. |
| `src/cli.ts` | Reads the command and calls the rest. Start here if you want the terminal. |
| `src/hd.ts` | Words, seed, and the path `m/44'/60'/0'/0/i`. |
| `src/address.ts` | secp256k1 public key, keccak256, EIP-55. |
| `src/keystore.ts` | scrypt + AES-GCM file format. |
| `src/transfer.ts` | Builds the transaction fields and broadcasts. |
| `src/vault.ts` | Talks to the Solidity contract. |
| `src/commands/` | One file per command. |
| `foundry/src/LearningVault.sol` | The piggy-bank contract. |
| `foundry/test/LearningVault.t.sol` | Contract tests. |
| `property-token/src/PropertyShare.sol` | The rental-share token, the rent math, and the allowlist. |
| `property-token/src/MockStablecoin.sol` | Play dollars with 6 decimals. The owner can mint. They are not dollars. |
| `property-token/script/Deploy.s.sol` | Deploys both contracts on Anvil or Sepolia, and refuses every other chain. |
| `property-token/test/PropertyShare.t.sol` | Distribution, transfers, access control, reentrancy, fuzz. |
| `property-token/README.md` | The long version of section 14, next to the code. |
| `src/property.ts` | The wallet's calls to those contracts. |
| `test/vectors.test.ts` | Known BIP-39 and address answers that must not change. |
| `.env.example` | Settings you may copy. The real `.env` stays local. |

## Commands

```bash
npm run wallet -- help
npm run wallet -- create
npm run wallet -- import [--force]
npm run wallet -- addresses [--count 5]
npm run wallet -- balance [--index 0] [--address 0x...]
npm run wallet -- fund --eth 1 [--index 0] [--address 0x...]
npm run wallet -- send --to 0x... --eth 0.1 [--index 0] [--yes]
npm run wallet -- sign --message "hello" [--index 0]
npm run wallet -- verify --message "hello" --signature 0x... --address 0x...
npm run wallet -- contract deploy
npm run wallet -- contract status
npm run wallet -- contract deposit --eth 0.1
npm run wallet -- contract withdraw --eth 0.05
npm run wallet -- property deploy
npm run wallet -- property info
npm run wallet -- property allow --address 0x...
npm run wallet -- property transfer --to 0x... --shares 250000
npm run wallet -- property deposit-eth --eth 1
npm run wallet -- property claimable
npm run wallet -- property claim-eth
npm run ui
npm run ui:build
npm test
npm run lint
npm run contracts:test
npm run property:test
```

`--yes` prints the same preview and then broadcasts without asking you to type YES. Use it only when you already read the fields.

## What this wallet will not do

- It will not talk to mainnet. `CHAIN` may only be `anvil` or `sepolia`. The property deploy script refuses mainnet a second time, by chain id, even if you point `forge script` at a mainnet URL.
- It will not turn a token balance into ownership of a building. The property lesson is a classroom model of a security. It is not an offering.
- It will not print a private key, and it has no flag for putting a password on the command line. Passwords typed on the command line end up in shell history.
- It will not show the 12 words again after creation. The paper copy is the recovery path. A forgotten file password is fixed by importing the words. Forgotten words are not fixable.
- It will not import this keystore into MetaMask. MetaMask wants the words.
- It is not a hardware wallet. The key exists in memory while a command runs. That is acceptable for Anvil practice and a bad place to keep life savings.
- It does not remember a transaction if you need to speed it up or cancel it. If a practice transaction gets stuck, restart Anvil. You will lose the pretend chain and keep the keystore.

## Troubleshooting

**`npm: command not found` or `node: command not found`**
Open a new Ubuntu window so nvm loads, then `nvm use 22`.

**`Missing script: create` or the wallet ignores `create`**
You left out the `--`. The command is `npm run wallet -- create`.

**`Could not reach Anvil`**
The other window is not running `anvil`, or it is running in PowerShell instead of Ubuntu. Start `anvil` in Ubuntu and try again.

**`Wrong password, or the keystore file was changed`**
Retype the file password. If you edited `keystore.json`, the tag no longer matches and the file will not open. Import the words into a new file.

**`bad EIP-55 checksum`**
You mistyped the address. The capitals are a checksum. The wallet will not offer a "fixed" address, because it cannot know which character you meant.

**`does not have enough ETH`**
On Anvil, run `npm run wallet -- fund --eth 1`. Remember the fee. Sending the entire balance fails.

**`No keystore at ...`**
You are in the wrong folder, or you have not run `create` yet. `cd` to the project and look for `.wallet/keystore.json`.

**`Could not find the compiled contract`**
Run `npm run contracts:build`, then `contract deploy` again. For the property lesson the command is `npm run property:build`.

**`NotAllowed(...)` when you transfer shares**
The recipient is not on the allowlist. `setAllowed` that address, then transfer. If you froze your own address, allow it again before the shares can move.

**`Refusing to deploy` from the property script**
The RPC is not Anvil or Sepolia, or you tried to use Anvil's published key on a public network. Point `--rpc-url` at Anvil or Sepolia, and use a new practice key on Sepolia.

**`SEPOLIA_RPC_URL is empty`**
Copy `.env.example` to `.env` and set the URL, or switch `CHAIN` back to `anvil`.

**Anvil says the port is already in use**
Another Anvil is running, or something else has port 8545. Either stop it, or start `anvil --port 8546` and set `ANVIL_RPC_URL=http://127.0.0.1:8546` in `.env`.

**I restarted Anvil and my balance is gone**
That is Anvil. The chain lived in memory. Fund and deploy again. The 12 words are still the same keys.

**`forge: command not found`**
Install Foundry, then open a new Ubuntu window: <https://book.getfoundry.sh/getting-started/installation>
