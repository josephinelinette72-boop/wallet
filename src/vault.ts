/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Talk to the LearningVault contract in `foundry/src/LearningVault.sol`.
 *
 * A contract call is still a transaction. The `to` field is the contract
 * address. The `data` field is the function selector (4 bytes of keccak256
 * of the function's name and argument types) followed by the arguments.
 * viem builds that data from the ABI below. The ABI is the contract's table
 * of contents: names, argument types, and whether a function reads or writes.
 *
 * `view` functions (`balanceOf`, `totalEth`) are free reads. The node answers
 * them with `eth_call`. No signature, no fee, no nonce. They cannot change
 * the chain.
 *
 * `deposit` and `withdraw` write storage, so they are real transactions.
 * `deposit` is `payable`: the ETH moves in the transaction's value field.
 * `withdraw` sends ETH *from the contract during the call*. The transaction
 * value is 0. The fee is still paid by the signer.
 *
 * If you change the Solidity, change this ABI too. `test/vault-abi.test.ts`
 * compares the two after `forge build`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { encodeFunctionData, type Address, type Hex, type PublicClient } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import type { WalletConfig } from './config.js';
import { parseUserAddress } from './address.js';
import { assertNodeIsExpectedChain, makePublicClient, makeWalletClient, toFriendlyError } from './client.js';
import { vaultArtifactPath, vaultRecordPath } from './paths.js';
import { describeTransaction, type FeeFields, type TransactionPreview } from './preview.js';

export const learningVaultAbi = [
  // Solidity writes an empty constructor for us. Foundry leaves that empty
  // constructor out of the ABI, so it is not listed here either.
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'who', type: 'address' }],
    outputs: [{ name: 'saved', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalEth',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'amount', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Deposited',
    anonymous: false,
    inputs: [
      { name: 'who', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Withdrawn',
    anonymous: false,
    inputs: [
      { name: 'who', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;

export type VaultRecord = {
  address: Hex;
  chainId: number;
  deployedAt: string;
};

export function loadVaultBytecode(projectRoot = process.cwd()): Hex {
  const artifactPath = vaultArtifactPath(projectRoot);
  let text: string;
  try {
    text = readFileSync(artifactPath, 'utf8');
  } catch {
    throw new Error(
      `Could not find the compiled contract at ${artifactPath}.\n` +
        'Compile it first with: npm run contracts:build',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The Foundry artifact is not valid JSON. Run npm run contracts:build again.');
  }

  const bytecode =
    typeof parsed === 'object' && parsed !== null && 'bytecode' in parsed
      ? (parsed as { bytecode?: { object?: unknown } }).bytecode?.object
      : undefined;

  if (typeof bytecode !== 'string' || !/^0x[0-9a-fA-F]+$/.test(bytecode) || bytecode.length < 10) {
    throw new Error('The compiled bytecode does not look usable. Run npm run contracts:build again.');
  }
  return bytecode as Hex;
}

export function saveVaultRecord(record: VaultRecord, cwd = process.cwd()): string {
  const filePath = vaultRecordPath(cwd);
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const json = `${JSON.stringify(record, null, 2)}\n`;
  writeFileSync(filePath, json, { mode: 0o600 });
  return filePath;
}

export function readVaultRecord(cwd = process.cwd()): VaultRecord | undefined {
  try {
    const parsed = JSON.parse(readFileSync(vaultRecordPath(cwd), 'utf8')) as Partial<VaultRecord>;
    if (typeof parsed.address !== 'string' || typeof parsed.chainId !== 'number') return undefined;
    return {
      address: parseUserAddress(parsed.address),
      chainId: parsed.chainId,
      deployedAt: typeof parsed.deployedAt === 'string' ? parsed.deployedAt : '',
    };
  } catch {
    return undefined;
  }
}

export type ResolvedVault = { address: Hex; source: string };

export function resolveVaultAddress(input: {
  config: WalletConfig;
  flag?: string;
  cwd?: string;
}): ResolvedVault {
  if (input.flag) {
    return { address: parseUserAddress(input.flag), source: '--vault' };
  }
  if (input.config.vaultAddressFromEnv) {
    return { address: parseUserAddress(input.config.vaultAddressFromEnv), source: '.env VAULT_ADDRESS' };
  }
  const saved = readVaultRecord(input.cwd);
  if (!saved) {
    throw new Error(
      'No LearningVault address yet. Deploy one with: npm run wallet -- contract deploy\n' +
        'Or set VAULT_ADDRESS in .env, or pass --vault 0x...',
    );
  }
  if (saved.chainId !== input.config.chain.id) {
    throw new Error(
      `The saved vault is on chain id ${saved.chainId}, but this command is aimed at ${input.config.chain.name} ` +
        `(chain id ${input.config.chain.id}). Deploy again on this chain, or pass --vault with an address that lives here.`,
    );
  }
  return { address: saved.address, source: '.wallet/vault.json' };
}

async function assertContractDeployed(publicClient: PublicClient, address: Address, config: WalletConfig): Promise<void> {
  const code = await publicClient.getBytecode({ address });
  // An empty account and a missing account both come back as no code.
  // `0x` means "this address is not a contract on this chain".
  if (!code || code === '0x') {
    throw new Error(
      `There is no contract code at ${address} on ${config.chain.name}. ` +
        'An address can be an ordinary account with no code. Deploy the vault on this chain, or point at the right address.',
    );
  }
}

async function feeFieldsFor(
  publicClient: PublicClient,
  from: Address,
  chainId: number,
  gas: bigint,
): Promise<FeeFields> {
  const nonce = await publicClient.getTransactionCount({ address: from, blockTag: 'pending' });
  const fees = await publicClient.estimateFeesPerGas();
  if (fees.maxFeePerGas === undefined || fees.maxPriorityFeePerGas === undefined) {
    throw new Error('The node did not offer EIP-1559 fees. Nothing was sent.');
  }
  return {
    nonce,
    gas,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    chainId,
  };
}

export async function deployVault(input: {
  config: WalletConfig;
  account: PrivateKeyAccount;
  path?: string;
  projectRoot?: string;
}): Promise<{ preview: string; send: () => Promise<{ hash: Hex; address: Hex }> }> {
  const { config, account } = input;
  const bytecode = loadVaultBytecode(input.projectRoot);
  const publicClient = makePublicClient(config);
  const walletClient = makeWalletClient(config, account);

  try {
    await assertNodeIsExpectedChain(publicClient, config);
    const gas = await publicClient.estimateGas({ account: account.address, data: bytecode });
    const fields = await feeFieldsFor(publicClient, account.address, config.chain.id, gas);
    const preview = describeTransaction({
      action: 'Deploy a new LearningVault contract',
      chainName: config.chain.name,
      from: account.address,
      path: input.path,
      valueWei: 0n,
      fields,
      note: 'The contract address is computed from your address and this nonce. It does not exist until the transaction is mined.',
    });

    return {
      preview,
      send: async () => {
        const hash = await walletClient.deployContract({
          abi: learningVaultAbi,
          bytecode,
          account,
          chain: config.chain,
          nonce: fields.nonce,
          gas: fields.gas,
          maxFeePerGas: fields.maxFeePerGas,
          maxPriorityFeePerGas: fields.maxPriorityFeePerGas,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success' || !receipt.contractAddress) {
          throw new Error(`Deployment did not leave a contract address. Hash: ${hash}`);
        }
        return { hash, address: receipt.contractAddress };
      },
    };
  } catch (error) {
    throw toFriendlyError(error, config);
  }
}

export type VaultStatus = {
  yourSavedWei: bigint;
  ledgerTotalWei: bigint;
  nodeBalanceWei: bigint;
  address: Hex;
  source: string;
};

export async function readVaultStatus(input: {
  config: WalletConfig;
  vault: ResolvedVault;
  who: Address;
}): Promise<VaultStatus> {
  const publicClient = makePublicClient(input.config);
  try {
    await assertNodeIsExpectedChain(publicClient, input.config);
    await assertContractDeployed(publicClient, input.vault.address, input.config);
    const yourSavedWei = await publicClient.readContract({
      address: input.vault.address,
      abi: learningVaultAbi,
      functionName: 'balanceOf',
      args: [input.who],
    });
    const ledgerTotalWei = await publicClient.readContract({
      address: input.vault.address,
      abi: learningVaultAbi,
      functionName: 'totalEth',
    });
    const nodeBalanceWei = await publicClient.getBalance({ address: input.vault.address });
    return {
      yourSavedWei,
      ledgerTotalWei,
      nodeBalanceWei,
      address: input.vault.address,
      source: input.vault.source,
    };
  } catch (error) {
    throw toFriendlyError(error, input.config);
  }
}

async function waitForSuccess(publicClient: PublicClient, hash: Hex): Promise<Hex> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    throw new Error(`The transaction was mined and then reverted. Hash: ${hash}`);
  }
  return hash;
}

export async function prepareVaultWrite(input: {
  config: WalletConfig;
  account: PrivateKeyAccount;
  path?: string;
  vault: Address;
  functionName: 'deposit' | 'withdraw';
  amountWei: bigint;
}): Promise<{ preview: string; send: () => Promise<Hex> }> {
  const { config, account } = input;
  const publicClient = makePublicClient(config);
  const walletClient = makeWalletClient(config, account);

  try {
    await assertNodeIsExpectedChain(publicClient, config);
    await assertContractDeployed(publicClient, input.vault, config);

    // Simulation asks the node what would happen and does not broadcast.
    // "not enough saved" shows up here, before YES.
    //
    // The broadcast itself is an ordinary transaction. `data` is the bytes of
    // the call: 4 bytes of keccak256("functionName(types)") plus the arguments.
    // encodeFunctionData builds that. Deposit puts the ETH in `value`.
    // Withdraw leaves `value` at 0 and puts the amount in `data`.
    const isDeposit = input.functionName === 'deposit';
    const data = isDeposit
      ? encodeFunctionData({ abi: learningVaultAbi, functionName: 'deposit' })
      : encodeFunctionData({
          abi: learningVaultAbi,
          functionName: 'withdraw',
          args: [input.amountWei],
        });
    const valueWei = isDeposit ? input.amountWei : 0n;

    if (isDeposit) {
      await publicClient.simulateContract({
        address: input.vault,
        abi: learningVaultAbi,
        functionName: 'deposit',
        value: input.amountWei,
        account,
      });
    } else {
      await publicClient.simulateContract({
        address: input.vault,
        abi: learningVaultAbi,
        functionName: 'withdraw',
        args: [input.amountWei],
        account,
      });
    }

    const gas = await publicClient.estimateGas({
      account: account.address,
      to: input.vault,
      value: valueWei,
      data,
    });
    const fields = await feeFieldsFor(publicClient, account.address, config.chain.id, gas);
    const preview = describeTransaction({
      action: isDeposit
        ? 'Call LearningVault.deposit and attach ETH in the value field'
        : 'Call LearningVault.withdraw. The transaction value is 0; the contract sends the ETH.',
      chainName: config.chain.name,
      from: account.address,
      path: input.path,
      to: input.vault,
      valueWei,
      fields,
      note: isDeposit
        ? `deposit() is payable. Call data: ${data}. The first 4 bytes are the function selector.`
        : 'The amount sits in the call data, not in the value field. The fee is paid from your account, not from the vault.',
    });

    return {
      preview,
      send: async () => {
        const hash = await walletClient.sendTransaction({
          account,
          chain: config.chain,
          to: input.vault,
          data,
          value: valueWei,
          nonce: fields.nonce,
          gas: fields.gas,
          maxFeePerGas: fields.maxFeePerGas,
          maxPriorityFeePerGas: fields.maxPriorityFeePerGas,
          type: 'eip1559',
        });
        return waitForSuccess(publicClient, hash);
      },
    };
  } catch (error) {
    throw toFriendlyError(error, config);
  }
}
