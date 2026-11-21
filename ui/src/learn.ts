/**
 * The plain-English lessons. Each screen has one. The drawer is the long
 * version. The small ? buttons open it. Nothing here is a secret, and none
 * of it is a procedure for using real funds.
 */
export type LearnTopic = 'welcome' | 'investor' | 'dashboard' | 'accounts' | 'send' | 'sign' | 'vault' | 'property' | 'network';

export type Lesson = {
  title: string;
  sections: { heading: string; body: string[] }[];
};

export const lessons: Record<LearnTopic, Lesson> = {
  welcome: {
    title: 'What a wallet is',
    sections: [
      {
        heading: 'The words are the wallet',
        body: [
          'Twelve words are a way to write down 128 random bits. From those bits, a recipe (BIP-39, then BIP-32) grows a private key. The private key grows a public key. The address is the last 20 bytes of a hash of that public key.',
          'Anyone with the words can recreate the keys on any computer, including one you do not own. The password on the next screen only locks the copy in this browser. It is not a second factor the chain knows about.',
        ],
      },
      {
        heading: 'Why this page will not talk to mainnet',
        body: [
          'The same words work on every Ethereum network. Anvil is a pretend chain on this computer. Sepolia is a public test network. Mainnet is where ETH has a price. This project refuses mainnet so a practice phrase cannot spend something valuable.',
          'Do not type a phrase that already holds real funds. Do not reuse a practice phrase later for real funds.',
        ],
      },
    ],
  },
  investor: {
    title: 'You own a slice of the rent',
    sections: [
      {
        heading: 'Shares and rent',
        body: [
          'The building is split into 1,000,000 shares. Your percent is your shares divided by that number. Rent is paid to whoever held the shares when the rent arrived.',
          'Claim sends you the rent you are owed. It does not sell your shares. You need a little ETH to pay the fee for that transaction.',
        ],
      },
    ],
  },
  dashboard: {
    title: 'Balances live on the chain',
    sections: [
      {
        heading: 'The page does not store your ETH',
        body: [
          'A balance is a number in the node’s database. Asking for it is a read. No signature, no fee, no nonce. Restarting Anvil erases the pretend chain. The encrypted words in this browser stay, and the balance goes back to zero until you fund the address again.',
        ],
      },
      {
        heading: 'Three different units',
        body: [
          'ETH has 18 decimals. 1 ETH is 10^18 wei. The mock dollar has 6 decimals, like USDC. Property shares have 0 decimals: the number you see is the number of shares.',
          'Fund from Anvil spends from a private key that Foundry publishes in the Anvil banner. That is safe only because the button refuses to run unless the node is on this computer and says its chain id is 31337.',
        ],
      },
    ],
  },
  accounts: {
    title: 'One phrase, many addresses',
    sections: [
      {
        heading: 'The path is part of the backup',
        body: [
          'This wallet uses m/44\'/60\'/0\'/0/i. 44 means BIP-44. 60 means Ethereum. The last number is which address. The same words and a different last number are a different address. None of those lines is a private key.',
          'MetaMask uses this path. Some hardware wallets number accounts differently, which is why a restored phrase can look empty if the path is wrong.',
        ],
      },
      {
        heading: 'The QR code is the address',
        body: [
          'The code is the public address, so someone can pay this practice account. It does not contain the words or the key. Copying the address is safe. Copying the words into a chat is not.',
        ],
      },
    ],
  },
  send: {
    title: 'A transaction is a signed list',
    sections: [
      {
        heading: 'What you are agreeing to',
        body: [
          'Chain id is inside the signature (EIP-155), so a signature made for Anvil is rejected on Sepolia. The nonce is how many transactions this address has already sent. The next one must use the next number.',
          'Gas is the most work the transaction may do. A plain ETH transfer is 21000. Unused gas is not charged. The max fee is the ceiling on base fee plus tip. The tip is offered to the block producer. The base fee is burned. You pay the ceiling or less.',
        ],
      },
      {
        heading: 'The hash is not a key',
        body: [
          'After you sign, the node returns a transaction hash. That hash identifies the transaction. It is public. Pending means the node has it and a block does not yet. Confirmed means it was mined and did not revert.',
        ],
      },
    ],
  },
  sign: {
    title: 'Signing a message',
    sections: [
      {
        heading: 'Same math, different bytes',
        body: [
          'A signature is made over a hash. For a personal message the hash is keccak256 of a prefix, “Ethereum Signed Message”, plus your text. That prefix is why this signature cannot be reused as a transaction.',
          'Checking a signature needs the address, the text, and the signature. It does not need the private key, and it does not use the network. Change one letter and the check fails.',
        ],
      },
    ],
  },
  vault: {
    title: 'A contract is a program at an address',
    sections: [
      {
        heading: 'Two balances, on purpose',
        body: [
          'balanceOf is the contract’s own ledger: how much this address is allowed to withdraw. totalEth is the ETH the chain says the contract holds. They stay equal only if every wei arrives through deposit and leaves through withdraw.',
          'deposit attaches ETH in the transaction’s value field. withdraw sends ETH out of the contract during the call, so the transaction value is 0. You still pay the fee from your account.',
        ],
      },
      {
        heading: 'There is no receive()',
        body: [
          'A plain transfer that skips deposit is rejected. Otherwise ETH could arrive without a ledger entry and get stuck. The withdrawal writes the ledger down before it sends the ETH, so a receiver cannot call withdraw again mid-payment. That bug is called reentrancy.',
        ],
      },
    ],
  },
  property: {
    title: 'Shares are not a deed',
    sections: [
      {
        heading: 'What the token is',
        body: [
          'The contract mints 1,000,000 shares and never mints again. Together they mean “100% of the property” inside this lesson. 250,000 is 25%. There is no building, no company, and no investor. A county recorder does not read Ethereum.',
          'In the real world, a project that connects tokens to a house puts the house in a company. The deed names the company. An operating agreement says the token holders are the members. This contract stores a street as text, a URI, and a hash of a sentence that says no such file exists. Change one byte of that sentence and the hash changes. The hash does not enforce an agreement.',
        ],
      },
      {
        heading: 'Rent does not loop over people',
        body: [
          'A deposit adds one number: rent earned by a single share since the beginning. Your claim is your balance times that number. When shares move, both people are snapshotted first, so the seller keeps rent from before the sale and the buyer does not collect it.',
          'ETH rent rides in the transaction value. Mock-dollar rent needs an approval first, because an ERC-20 does not let the property pull tokens until you say it may. Claims are signed transactions. The books update before the money moves.',
        ],
      },
      {
        heading: 'The allowlist is a stand-in',
        body: [
          'People would buy shares like these because they expect rent, and they expect that rent because a manager does the work. Under the US Howey test that pattern is usually a security. This repository is not a registration and not legal advice.',
          'setAllowed is the classroom stand-in for a transfer restriction. Both the sender and the recipient must be on the list. Revoking an address that still holds shares freezes them. There is no function that seizes shares. Do not freeze your own address while you hold shares.',
        ],
      },
    ],
  },
  network: {
    title: 'The wallet does not contain the network',
    sections: [
      {
        heading: 'Chain id and the URL',
        body: [
          'The RPC URL is where the bytes go. The chain id is how a signature is tied to one network. Before anything is signed, the page asks the node for its chain id and stops if it is not the one you picked.',
          'Anvil’s chain id is 31337. Sepolia’s is 11155111. A node that answers with 1 is mainnet, and this page will not sign for it.',
        ],
      },
      {
        heading: 'Why the browser does not call Anvil itself',
        body: [
          'You open this page from Windows. Anvil is running in Ubuntu. Those are two ideas of “this computer”. The page asks the dev server on port 5173, and the dev server, inside Ubuntu, asks Anvil. Your Sepolia URL stays in this browser. It is forwarded, not saved in the git repository.',
        ],
      },
    ],
  },
};
