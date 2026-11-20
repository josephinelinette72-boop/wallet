/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Anvil's first development account.
 *
 * Every default Anvil process starts with this account funded with 10000 ETH.
 * Foundry prints the private key in the Anvil banner and in the documentation.
 * It is a textbook key. The whole world already has it.
 *
 * `fundAddress` is the only function allowed to sign with it, and only after
 * `assertAnvilFaucetAllowed` has checked that the RPC host is this computer
 * and the node reports chain id 31337.
 */
import { parseEther, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { WalletConfig } from './config.js';
import { assertNodeIsExpectedChain, makePublicClient, makeWalletClient, toFriendlyError } from './client.js';
import { assertAnvilFaucetAllowed } from './safety.js';

export const ANVIL_DEV_PRIVATE_KEY: Hex =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

export const ANVIL_DEV_ADDRESS: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

export const FAUCET_MAX_WEI = parseEther('100');

export async function fundAddress(config: WalletConfig, to: Address, valueWei: bigint): Promise<Hex> {
  if (valueWei <= 0n || valueWei > FAUCET_MAX_WEI) {
    throw new Error('The learning faucet sends more than 0 and at most 100 ETH per command. Nothing was sent.');
  }

  const faucet = privateKeyToAccount(ANVIL_DEV_PRIVATE_KEY);
  const publicClient = makePublicClient(config);
  const walletClient = makeWalletClient(config, faucet);

  try {
    await assertNodeIsExpectedChain(publicClient, config);
    const chainId = await publicClient.getChainId();
    assertAnvilFaucetAllowed(chainId, config.rpcUrl);

    const nonce = await publicClient.getTransactionCount({ address: faucet.address, blockTag: 'pending' });
    const fees = await publicClient.estimateFeesPerGas();
    if (fees.maxFeePerGas === undefined || fees.maxPriorityFeePerGas === undefined) {
      throw new Error('Anvil did not offer EIP-1559 fees. Nothing was sent.');
    }
    const gas = await publicClient.estimateGas({ account: faucet.address, to, value: valueWei });

    const hash = await walletClient.sendTransaction({
      account: faucet,
      chain: config.chain,
      to,
      value: valueWei,
      nonce,
      gas,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      type: 'eip1559',
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      throw new Error(`The faucet transaction was mined and then reverted. Hash: ${hash}`);
    }
    return hash;
  } catch (error) {
    throw toFriendlyError(error, config);
  }
}
