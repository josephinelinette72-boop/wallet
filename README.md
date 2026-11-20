# Learning wallet

**Never use a seed phrase that holds real money with this program.**

This is a textbook you can run. It has not been audited. A bug, a screenshot, or a leaked file could lose funds. Use Anvil play money, or Sepolia test ETH only. The same 12 words work on every Ethereum network, including mainnet, so do not reuse a practice phrase anywhere a real asset might arrive later.

You will build a small self-custody wallet and a small Solidity contract, and you will be able to say what each step is doing. Self-custody means the words on your paper are the wallet. No company is holding them for you.

## What you will have at the end

- A command-line wallet that creates a 12-word phrase, encrypts it with a password, and can send ETH and sign messages.
- A pretend Ethereum node (Anvil) full of play money.
- A tiny Solidity piggy-bank contract, with tests, that your wallet can deposit into and withdraw from.

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

## Map of the project

| Path | What it is |
| --- | --- |
| `src/cli.ts` | Reads the command and calls the rest. Start here. |
| `src/hd.ts` | Words, seed, and the path `m/44'/60'/0'/0/i`. |
| `src/address.ts` | secp256k1 public key, keccak256, EIP-55. |
| `src/keystore.ts` | scrypt + AES-GCM file format. |
| `src/transfer.ts` | Builds the transaction fields and broadcasts. |
| `src/vault.ts` | Talks to the Solidity contract. |
| `src/commands/` | One file per command. |
| `foundry/src/LearningVault.sol` | The piggy-bank contract. |
| `foundry/test/LearningVault.t.sol` | Contract tests. |
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
npm test
npm run contracts:test
```

`--yes` prints the same preview and then broadcasts without asking you to type YES. Use it only when you already read the fields.

## What this wallet will not do

- It will not talk to mainnet. `CHAIN` may only be `anvil` or `sepolia`.
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
Run `npm run contracts:build`, then `contract deploy` again.

**`SEPOLIA_RPC_URL is empty`**
Copy `.env.example` to `.env` and set the URL, or switch `CHAIN` back to `anvil`.

**Anvil says the port is already in use**
Another Anvil is running, or something else has port 8545. Either stop it, or start `anvil --port 8546` and set `ANVIL_RPC_URL=http://127.0.0.1:8546` in `.env`.

**I restarted Anvil and my balance is gone**
That is Anvil. The chain lived in memory. Fund and deploy again. The 12 words are still the same keys.

**`forge: command not found`**
Install Foundry, then open a new Ubuntu window: <https://book.getfoundry.sh/getting-started/installation>
