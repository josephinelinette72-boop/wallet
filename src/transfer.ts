/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Build a type-2 (EIP-1559) ETH transfer, show the fields, then broadcast it.
 *
 * The fields the signature covers:
 *
 *   chain id               which network (EIP-155). viem reads it from `chain`.
 *   nonce                  this account's outgoing transaction count.
 *   max priority fee       the tip, in wei per gas.
 *   max fee per gas        the ceiling on base fee + tip, in wei per gas.
 *   gas limit              the most gas the transaction may burn.
 *   to                     the destination address.
 *   value                  how much ETH moves, in wei.
 *   data                   empty for a plain transfer. Contract calls put bytes here.
 *
 * We fill every one of them ourselves and pass them to viem, instead of
 * letting them be invisible defaults, so the preview and the signed
 * transaction are the same numbers. viem RLP-encodes the list, hashes it
 * with keccak256, and signs that hash with secp256k1. The node checks the
 * signature and, if it matches, broadcasts the transaction.
 *
 * "pending" nonce counts transactions the node has already accepted but that
 * may not be in a block yet. Using "latest" would reuse a nonce if you sent
 * two transactions quickly.
 */
import { type Address, type Hex, type PublicClient } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import type { WalletConfig } from './config.js';
import { assertNodeIsExpectedChain, makePublicClient, makeWalletClient, toFriendlyError } from './client.js';
import { describeTransaction, type FeeFields, type TransactionPreview } from './preview.js';

export type PreparedTransfer = {
  preview: string;
  /** Public fields. The web app broadcasts these itself so it can show the hash while the transaction is pending. The CLI calls `send`, which waits for the receipt. */
  fields: FeeFields;
  to: Address;
  valueWei: bigint;
  send: () => Promise<Hex>;
};

async function loadFees(publicClient: PublicClient, from: Address): Promise<Omit<FeeFields, 'gas' | 'chainId'>> {
  const nonce = await publicClient.getTransactionCount({ address: from, blockTag: 'pending' });
  const fees = await publicClient.estimateFeesPerGas();
  if (fees.maxFeePerGas === undefined || fees.maxPriorityFeePerGas === undefined) {
    throw new Error(
      'The node did not offer EIP-1559 fees (max fee and priority fee). ' +
        'This wallet sends type-2 transactions, which Anvil and Sepolia support. Nothing was sent.',
    );
  }
  return {
    nonce,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
  };
}

export async function prepareEthTransfer(input: {
  config: WalletConfig;
  account: PrivateKeyAccount;
  path?: string;
  to: Address;
  valueWei: bigint;
}): Promise<PreparedTransfer> {
  const { config, account, to, valueWei } = input;
  if (to === '0x0000000000000000000000000000000000000000') {
    throw new Error('That is the zero address. ETH sent there is burned. Nothing was sent.');
  }

  const publicClient = makePublicClient(config);
  const walletClient = makeWalletClient(config, account);

  try {
    await assertNodeIsExpectedChain(publicClient, config);
    const fees = await loadFees(publicClient, account.address);
    const gas = await publicClient.estimateGas({ account: account.address, to, value: valueWei });
    const fields: FeeFields = { ...fees, gas, chainId: config.chain.id };

    const balance = await publicClient.getBalance({ address: account.address });
    const ceiling = gas * fields.maxFeePerGas;
    if (balance < valueWei + ceiling) {
      throw new Error(
        `This account has ${balance.toString()} wei. The transfer needs ${valueWei.toString()} wei plus up to ` +
          `${ceiling.toString()} wei for the fee. Nothing was sent.`,
      );
    }

    const previewInput: TransactionPreview = {
      action: 'Send ETH',
      chainName: config.chain.name,
      from: account.address,
      path: input.path,
      to,
      valueWei,
      fields,
      note:
        account.address.toLowerCase() === to.toLowerCase()
          ? 'The destination is this same address. The ETH stays here and you still pay a fee.'
          : undefined,
    };

    return {
      preview: describeTransaction(previewInput),
      fields,
      to,
      valueWei,
      send: async () => {
        const hash = await walletClient.sendTransaction({
          account,
          chain: config.chain,
          to,
          value: valueWei,
          nonce: fields.nonce,
          gas: fields.gas,
          maxFeePerGas: fields.maxFeePerGas,
          maxPriorityFeePerGas: fields.maxPriorityFeePerGas,
          type: 'eip1559',
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') {
          throw new Error(`The transaction was mined and then reverted. Hash: ${hash}`);
        }
        return hash;
      },
    };
  } catch (error) {
    throw toFriendlyError(error, config);
  }
}
