/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Ask a node how much ETH an address holds.
 *
 * Balances are public. If you pass --address, this command does not decrypt
 * the keystore at all. If you do not, it unlocks only to learn which address
 * is "yours", then throws the words away and asks the node.
 */
import { formatEther } from 'viem';
import { parseUserAddress } from '../address.js';
import { assertNodeIsExpectedChain, makePublicClient, toFriendlyError } from '../client.js';
import { loadConfig } from '../config.js';
import type { Flags } from '../flags.js';
import { redactRpcUrl } from '../safety.js';
import { unlockAccount } from '../unlock.js';

export async function balanceCommand(flags: Flags): Promise<void> {
  const config = loadConfig(process.env, flags.chain);
  const unlocked = flags.address ? undefined : await unlockAccount(flags.index);
  const address = flags.address ? parseUserAddress(flags.address) : unlocked!.address;
  const publicClient = makePublicClient(config);

  try {
    await assertNodeIsExpectedChain(publicClient, config);
    const wei = await publicClient.getBalance({ address });
    console.log(`Network: ${config.chain.name} (chain id ${config.chain.id})`);
    console.log(`RPC:     ${redactRpcUrl(config.rpcUrl)}`);
    if (unlocked) console.log(`Path:    ${unlocked.path}`);
    console.log(`Address: ${address}`);
    console.log(`Balance: ${formatEther(wei)} ETH`);
    console.log(`         ${wei.toString()} wei`);
    console.log('1 ETH = 1000000000000000000 wei. Anyone who knows the address can look this number up.');
  } catch (error) {
    throw toFriendlyError(error, config);
  }
}
