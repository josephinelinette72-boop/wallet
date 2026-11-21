/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Broadcast a transaction the shared prepare functions already checked.
 *
 * `prepareEthTransfer`, `prepareVaultWrite`, `prepareCall`, and `deployVault`
 * fill in the nonce, the gas limit, and the EIP-1559 fees, and they build
 * the preview paragraph. The CLI then calls `send()`, which waits for the
 * receipt before it returns the hash.
 *
 * The page wants the hash on screen while the transaction is still pending,
 * so it sends with those same fields and waits afterwards. The signature
 * covers the same list either way. The private key is inside the viem
 * account object for this one call, then the caller drops it.
 */
import type { WalletConfig } from '@wallet/config';
import { makePublicClient, makeWalletClient, toFriendlyError } from '@wallet/client';
import type { FeeFields } from '@wallet/preview';
import type { Address, Hex, TransactionReceipt } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';

export type ReadyTransaction = {
  preview: string;
  fields: FeeFields;
  to?: Address;
  data?: Hex;
  valueWei: bigint;
};

export async function broadcastTransaction(input: {
  config: WalletConfig;
  account: PrivateKeyAccount;
  ready: ReadyTransaction;
  onHash?: (hash: Hex) => void;
}): Promise<TransactionReceipt> {
  const wallet = makeWalletClient(input.config, input.account);
  const client = makePublicClient(input.config);
  try {
    const hash = await wallet.sendTransaction({
      account: input.account,
      chain: input.config.chain,
      value: input.ready.valueWei,
      nonce: input.ready.fields.nonce,
      gas: input.ready.fields.gas,
      maxFeePerGas: input.ready.fields.maxFeePerGas,
      maxPriorityFeePerGas: input.ready.fields.maxPriorityFeePerGas,
      type: 'eip1559',
      ...(input.ready.to ? { to: input.ready.to } : {}),
      ...(input.ready.data ? { data: input.ready.data } : {}),
    });
    input.onHash?.(hash);
    return await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
  } catch (error) {
    throw toFriendlyError(error, input.config);
  }
}
