/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Talk to the property-share contracts in `property-token/`.
 *
 * PropertyShare is an ERC-20 whose 1,000,000 tokens are shares of a pretend
 * rental. MockStablecoin is the play dollar the manager can deposit as rent.
 * The Solidity header explains the legal picture (an LLC on the deed, a hash
 * of the operating agreement, and why a rent token is usually a security).
 * This file only builds the transactions. It does not decide any of that.
 *
 * A contract call is still a transaction. `to` is the contract. `data` is the
 * function selector plus the arguments. viem builds `data` from the ABI below.
 * The ABI is a table of contents: names, argument types, and whether a function
 * reads or writes. It has to match the compiled contract. `test/property-abi.test.ts`
 * checks that, once you have run `npm run property:build`.
 *
 * Reads (`claimableEth`, `balanceOf`, the document hash) are free. The node
 * answers them with eth_call. No signature, no fee.
 *
 * Writes are real transactions. `depositEth` is payable: the rent moves in the
 * transaction's value field. `depositStable` pulls mock dollars that you
 * approved first. `claimEth` and `claimStable` send the rent out of the
 * contract during the call. Their transaction value is 0. The fee is still
 * paid by the signer.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  encodeDeployData,
  encodeFunctionData,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import { parseUserAddress } from './address.js';
import { assertNodeIsExpectedChain, makePublicClient, makeWalletClient, toFriendlyError } from './client.js';
import type { WalletConfig } from './config.js';
import { propertyArtifactPath, propertyRecordPath, stablecoinArtifactPath } from './paths.js';
import { describeTransaction, type FeeFields, type TransactionPreview } from './preview.js';

/**
 * The sentence the deploy script hashes. keccak256 of these exact bytes is
 * the document hash stored on the contract. There is no PDF behind it.
 * `test/property-cli.test.ts` locks this string to the hash in the Solidity tests.
 */
export const PLACEHOLDER_DOCUMENT =
  'PLACEHOLDER ONLY. This is not a deed or an LLC agreement. There is no building and no company behind these tokens.';

export const PLACEHOLDER_DOCUMENT_HASH = keccak256(stringToHex(PLACEHOLDER_DOCUMENT));

export const PLACEHOLDER_DOCUMENT_URI = 'https://example.com/not-a-real-deed';

/** One million mock dollars, in base units. The token has 6 decimals, so this is 1_000_000 * 10^6. */
export const PLAY_DOLLARS_BASE_UNITS = 1_000_000n * 10n ** 6n;

export const propertyShareAbi = [
  {
    type: 'constructor',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenName', type: 'string' },
      { name: 'tokenSymbol', type: 'string' },
      { name: 'propertyName', type: 'string' },
      { name: 'streetAddress', type: 'string' },
      { name: 'documentHash', type: 'bytes32' },
      { name: 'documentUri', type: 'string' },
      { name: 'stablecoin', type: 'address' },
      { name: 'admin', type: 'address' },
      { name: 'manager', type: 'address' },
    ],
  },
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'pure', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowed',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'isManager',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  { type: 'function', name: 'propertyName', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'streetAddress', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'documentHash', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'documentUri', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'stablecoin', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    type: 'function',
    name: 'claimableEth',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claimableStable',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  { type: 'function', name: 'ethDeposited', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'ethClaimed', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'ethAccounted', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'stableDeposited', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'stableClaimed', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'stableAccounted', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'setAllowed',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
  { type: 'function', name: 'depositEth', stateMutability: 'payable', inputs: [], outputs: [] },
  {
    type: 'function',
    name: 'depositStable',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  { type: 'function', name: 'claimEth', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'claimStable', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  // Events are logs in the receipt. The web app reads them for the cap table
  // and the rent chart. `indexed` is what a node can filter on. The amounts
  // are not indexed, so they sit in the data and still come back with the log.
  {
    type: 'event',
    name: 'Transfer',
    anonymous: false,
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RentDeposited',
    anonymous: false,
    inputs: [
      { name: 'payer', type: 'address', indexed: true },
      { name: 'asset', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'rewardPerShareStored', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RentClaimed',
    anonymous: false,
    inputs: [
      { name: 'holder', type: 'address', indexed: true },
      { name: 'asset', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AllowedSet',
    anonymous: false,
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'allowed', type: 'bool', indexed: false },
    ],
  },
] as const;

export const mockStablecoinAbi = [
  {
    type: 'constructor',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'initialOwner', type: 'address' }],
  },
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'pure', inputs: [], outputs: [{ type: 'uint8' }] },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

export type PropertyRecord = {
  property: Hex;
  stablecoin: Hex;
  chainId: number;
  deployedAt: string;
};

export function savePropertyRecord(record: PropertyRecord, cwd = process.cwd()): string {
  const filePath = propertyRecordPath(cwd);
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  // The addresses are public. The file mode matches the rest of `.wallet`.
  writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  return filePath;
}

export function readPropertyRecord(cwd = process.cwd()): PropertyRecord | undefined {
  try {
    const parsed = JSON.parse(readFileSync(propertyRecordPath(cwd), 'utf8')) as Partial<PropertyRecord>;
    if (typeof parsed.property !== 'string' || typeof parsed.stablecoin !== 'string') return undefined;
    if (typeof parsed.chainId !== 'number') return undefined;
    return {
      property: parseUserAddress(parsed.property),
      stablecoin: parseUserAddress(parsed.stablecoin),
      chainId: parsed.chainId,
      deployedAt: typeof parsed.deployedAt === 'string' ? parsed.deployedAt : '',
    };
  } catch {
    return undefined;
  }
}

export type ResolvedProperty = { address: Hex; source: string };

export function resolvePropertyAddress(input: {
  config: WalletConfig;
  flag?: string;
  cwd?: string;
}): ResolvedProperty {
  if (input.flag) {
    return { address: parseUserAddress(input.flag), source: '--property' };
  }
  if (input.config.propertyAddressFromEnv) {
    return { address: parseUserAddress(input.config.propertyAddressFromEnv), source: '.env PROPERTY_ADDRESS' };
  }
  const saved = readPropertyRecord(input.cwd);
  if (!saved) {
    throw new Error(
      'No PropertyShare address yet.\n' +
        'Deploy with the forge script in property-token/README.md, then set PROPERTY_ADDRESS,\n' +
        'or deploy from this wallet with: npm run wallet -- property deploy\n' +
        'Or pass --property 0x... for one command.',
    );
  }
  if (saved.chainId !== input.config.chain.id) {
    throw new Error(
      `The saved property is on chain id ${saved.chainId}, but this command is aimed at ${input.config.chain.name} ` +
        `(chain id ${input.config.chain.id}). Deploy again on this chain, or pass --property with an address that lives here.`,
    );
  }
  return { address: saved.property, source: '.wallet/property.json' };
}

type ArtifactAbiItem = {
  type?: string;
  name?: string;
  stateMutability?: string;
  inputs?: readonly { type?: string }[];
};

export function propertyAbiSignature(item: ArtifactAbiItem): string | undefined {
  const inputs = (item.inputs ?? []).map((input) => input.type ?? '').join(',');
  if (item.type === 'constructor') return `constructor(${inputs})`;
  if (item.type === 'event' && item.name) return `event ${item.name}(${inputs})`;
  if (!item.name || item.type !== 'function') return undefined;
  return `function ${item.name}(${inputs}) ${item.stateMutability ?? ''}`;
}

function loadBytecode(artifactPath: string, rebuildHint: string): Hex {
  let text: string;
  try {
    text = readFileSync(artifactPath, 'utf8');
  } catch {
    throw new Error(`Could not find the compiled contract at ${artifactPath}.\n${rebuildHint}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`The Foundry artifact at ${artifactPath} is not valid JSON. ${rebuildHint}`);
  }
  const bytecode =
    typeof parsed === 'object' && parsed !== null && 'bytecode' in parsed
      ? (parsed as { bytecode?: { object?: unknown } }).bytecode?.object
      : undefined;
  if (typeof bytecode !== 'string' || !/^0x[0-9a-fA-F]+$/.test(bytecode) || bytecode.length < 10) {
    throw new Error(`The compiled bytecode at ${artifactPath} does not look usable. ${rebuildHint}`);
  }
  return bytecode as Hex;
}

const REBUILD = 'Compile it first with: npm run property:build';

export function loadPropertyBytecode(projectRoot = process.cwd()): Hex {
  return loadBytecode(propertyArtifactPath(projectRoot), REBUILD);
}

export function loadStablecoinBytecode(projectRoot = process.cwd()): Hex {
  return loadBytecode(stablecoinArtifactPath(projectRoot), REBUILD);
}

async function assertContractDeployed(publicClient: PublicClient, address: Address, config: WalletConfig): Promise<void> {
  const code = await publicClient.getBytecode({ address });
  if (!code || code === '0x') {
    throw new Error(
      `There is no contract code at ${address} on ${config.chain.name}. ` +
        'Deploy the property lesson on this chain, or point --property at the right address.',
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

async function waitForSuccess(publicClient: PublicClient, hash: Hex): Promise<{ hash: Hex; contractAddress?: Hex }> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    throw new Error(`The transaction was mined and then reverted. Hash: ${hash}`);
  }
  return { hash, contractAddress: receipt.contractAddress ?? undefined };
}

export type PreparedCall = {
  preview: string;
  fields: FeeFields;
  /** Missing when this transaction creates a contract. */
  to?: Address;
  data: Hex;
  valueWei: bigint;
  send: () => Promise<{ hash: Hex; contractAddress?: Hex }>;
};

/**
 * Build a contract-creation transaction and stop before broadcasting.
 * The caller prints `preview` and asks for YES. `send` uses the nonce from
 * the preview, so prepare the next transaction only after this one is mined.
 */
export async function prepareDeploy(input: {
  config: WalletConfig;
  account: PrivateKeyAccount;
  path?: string;
  data: Hex;
  action: string;
  note: string;
}): Promise<PreparedCall> {
  const { config, account } = input;
  const publicClient = makePublicClient(config);
  const walletClient = makeWalletClient(config, account);
  try {
    await assertNodeIsExpectedChain(publicClient, config);
    const gas = await publicClient.estimateGas({ account: account.address, data: input.data });
    const fields = await feeFieldsFor(publicClient, account.address, config.chain.id, gas);
    const preview = describeTransaction({
      action: input.action,
      chainName: config.chain.name,
      from: account.address,
      path: input.path,
      valueWei: 0n,
      fields,
      note: input.note,
    });
    return {
      preview,
      fields,
      data: input.data,
      valueWei: 0n,
      send: async () => {
        const hash = await walletClient.sendTransaction({
          account,
          chain: config.chain,
          data: input.data,
          value: 0n,
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

export function encodeStablecoinDeploy(owner: Address, projectRoot?: string, bytecode?: Hex): Hex {
  return encodeDeployData({
    abi: mockStablecoinAbi,
    // The CLI reads the compiled file. The web app passes the bytecode it
    // already fetched, so this function does not touch the disk.
    bytecode: bytecode ?? loadStablecoinBytecode(projectRoot),
    args: [owner],
  });
}

export function encodePropertyDeploy(input: {
  stablecoin: Address;
  admin: Address;
  projectRoot?: string;
  bytecode?: Hex;
}): Hex {
  return encodeDeployData({
    abi: propertyShareAbi,
    bytecode: input.bytecode ?? loadPropertyBytecode(input.projectRoot),
    args: [
      '123 Main Street Shares',
      'MAIN',
      '123 Main Street (placeholder)',
      '123 Main Street, Springfield',
      PLACEHOLDER_DOCUMENT_HASH,
      PLACEHOLDER_DOCUMENT_URI,
      input.stablecoin,
      input.admin,
      input.admin,
    ],
  });
}

/**
 * Build a call to a contract that already exists. `valueWei` is the ETH in
 * the transaction's value field. For every function except `depositEth` that
 * number is zero: the rent comes out of the contract, or it is a token amount
 * sitting in `data`.
 */
export async function prepareCall(input: {
  config: WalletConfig;
  account: PrivateKeyAccount;
  path?: string;
  to: Address;
  data: Hex;
  valueWei: bigint;
  action: string;
  note: string;
  /** When set, the node simulates this exact call and refuses before YES if it would revert. */
  simulate?: () => Promise<unknown>;
}): Promise<PreparedCall> {
  const { config, account } = input;
  const publicClient = makePublicClient(config);
  const walletClient = makeWalletClient(config, account);
  try {
    await assertNodeIsExpectedChain(publicClient, config);
    await assertContractDeployed(publicClient, input.to, config);
    if (input.simulate) await input.simulate();
    const gas = await publicClient.estimateGas({
      account: account.address,
      to: input.to,
      data: input.data,
      value: input.valueWei,
    });
    const fields = await feeFieldsFor(publicClient, account.address, config.chain.id, gas);
    const preview: TransactionPreview = {
      action: input.action,
      chainName: config.chain.name,
      from: account.address,
      path: input.path,
      to: input.to,
      valueWei: input.valueWei,
      fields,
      note: input.note,
    };
    return {
      preview: describeTransaction(preview),
      fields,
      to: input.to,
      data: input.data,
      valueWei: input.valueWei,
      send: async () => {
        const hash = await walletClient.sendTransaction({
          account,
          chain: config.chain,
          to: input.to,
          data: input.data,
          value: input.valueWei,
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

export type PropertyOverview = {
  address: Hex;
  source: string;
  tokenName: string;
  symbol: string;
  propertyName: string;
  streetAddress: string;
  documentHash: Hex;
  documentUri: string;
  stablecoin: Hex;
  stableSymbol: string;
  totalSupply: bigint;
  you: Address;
  yourShares: bigint;
  youAllowed: boolean;
  youAreManager: boolean;
  claimableEthWei: bigint;
  claimableStableBase: bigint;
  ethDepositedWei: bigint;
  ethClaimedWei: bigint;
  ethAccountedWei: bigint;
  stableDepositedBase: bigint;
  stableClaimedBase: bigint;
  contractEthWei: bigint;
};

export async function readPropertyOverview(input: {
  config: WalletConfig;
  property: ResolvedProperty;
  who: Address;
}): Promise<PropertyOverview> {
  const publicClient = makePublicClient(input.config);
  const address = input.property.address;
  try {
    await assertNodeIsExpectedChain(publicClient, input.config);
    await assertContractDeployed(publicClient, address, input.config);
    const read = <T>(functionName: string, args?: readonly unknown[]): Promise<T> =>
      publicClient.readContract({
        address,
        abi: propertyShareAbi,
        functionName: functionName as never,
        args: args as never,
      }) as Promise<T>;

    const [
      tokenName,
      symbol,
      propertyName,
      streetAddress,
      documentHash,
      documentUri,
      stablecoin,
      totalSupply,
      yourShares,
      youAllowed,
      youAreManager,
      claimableEthWei,
      claimableStableBase,
      ethDepositedWei,
      ethClaimedWei,
      ethAccountedWei,
      stableDepositedBase,
      stableClaimedBase,
    ] = await Promise.all([
      read<string>('name'),
      read<string>('symbol'),
      read<string>('propertyName'),
      read<string>('streetAddress'),
      read<Hex>('documentHash'),
      read<string>('documentUri'),
      read<Address>('stablecoin'),
      read<bigint>('totalSupply'),
      read<bigint>('balanceOf', [input.who]),
      read<boolean>('allowed', [input.who]),
      read<boolean>('isManager', [input.who]),
      read<bigint>('claimableEth', [input.who]),
      read<bigint>('claimableStable', [input.who]),
      read<bigint>('ethDeposited'),
      read<bigint>('ethClaimed'),
      read<bigint>('ethAccounted'),
      read<bigint>('stableDeposited'),
      read<bigint>('stableClaimed'),
    ]);

    let stableSymbol = 'mUSD';
    const stableCode = await publicClient.getBytecode({ address: stablecoin });
    if (stableCode && stableCode !== '0x') {
      stableSymbol = await publicClient.readContract({
        address: stablecoin,
        abi: mockStablecoinAbi,
        functionName: 'symbol',
      });
    }
    const contractEthWei = await publicClient.getBalance({ address });

    return {
      address,
      source: input.property.source,
      tokenName,
      symbol,
      propertyName,
      streetAddress,
      documentHash,
      documentUri,
      stablecoin,
      stableSymbol,
      totalSupply,
      you: input.who,
      yourShares,
      youAllowed,
      youAreManager,
      claimableEthWei,
      claimableStableBase,
      ethDepositedWei,
      ethClaimedWei,
      ethAccountedWei,
      stableDepositedBase,
      stableClaimedBase,
      contractEthWei,
    };
  } catch (error) {
    throw toFriendlyError(error, input.config);
  }
}

export function encodeSetAllowed(account: Address, approved: boolean): Hex {
  return encodeFunctionData({ abi: propertyShareAbi, functionName: 'setAllowed', args: [account, approved] });
}

export function encodeTransferShares(to: Address, shares: bigint): Hex {
  return encodeFunctionData({ abi: propertyShareAbi, functionName: 'transfer', args: [to, shares] });
}

export function encodeDepositEth(): Hex {
  return encodeFunctionData({ abi: propertyShareAbi, functionName: 'depositEth' });
}

export function encodeDepositStable(amount: bigint): Hex {
  return encodeFunctionData({ abi: propertyShareAbi, functionName: 'depositStable', args: [amount] });
}

export function encodeClaimEth(): Hex {
  return encodeFunctionData({ abi: propertyShareAbi, functionName: 'claimEth' });
}

export function encodeClaimStable(): Hex {
  return encodeFunctionData({ abi: propertyShareAbi, functionName: 'claimStable' });
}

export function encodeApproveStable(spender: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: mockStablecoinAbi, functionName: 'approve', args: [spender, amount] });
}

export function encodeMintStable(to: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: mockStablecoinAbi, functionName: 'mint', args: [to, amount] });
}
