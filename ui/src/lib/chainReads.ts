/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Reads. A read asks the node a question and does not sign anything, so it
 * costs no fee and does not move the nonce. The writes live in the CLI
 * modules the buttons call (`prepareEthTransfer`, `prepareVaultWrite`,
 * `prepareCall`). This file only collects what the dashboard and the
 * property page display.
 */
import { makePublicClient, toFriendlyError } from '@wallet/client';
import type { WalletConfig } from '@wallet/config';
import { mockStablecoinAbi, propertyShareAbi } from '@wallet/property';
import type { Address, Hash, Hex } from 'viem';
import { formatEther, formatUnits, getAddress, parseAbiItem, zeroAddress } from 'viem';

const depositedEvent = parseAbiItem('event Deposited(address indexed who, uint256 amount)');
const withdrawnEvent = parseAbiItem('event Withdrawn(address indexed who, uint256 amount)');
const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const rentDepositedEvent = parseAbiItem(
  'event RentDeposited(address indexed payer, address indexed asset, uint256 amount, uint256 rewardPerShareStored)',
);
const rentClaimedEvent = parseAbiItem('event RentClaimed(address indexed holder, address indexed asset, uint256 amount)');
const allowedSetEvent = parseAbiItem('event AllowedSet(address indexed account, bool allowed)');
import type { ActivityItem } from './storage';

export type DashboardNumbers = {
  ethWei: bigint;
  stableBase: bigint | null;
  stableSymbol: string;
  shares: bigint | null;
};

async function hasCode(config: WalletConfig, address: Address): Promise<boolean> {
  const code = await makePublicClient(config).getBytecode({ address });
  return Boolean(code && code !== '0x');
}

export async function readDashboard(
  config: WalletConfig,
  who: Address,
  contracts: { stablecoin?: Address; property?: Address },
): Promise<DashboardNumbers> {
  const client = makePublicClient(config);
  try {
    const ethWei = await client.getBalance({ address: who });
    let stableBase: bigint | null = null;
    let stableSymbol = 'mUSD';
    let shares: bigint | null = null;

    if (contracts.stablecoin && (await hasCode(config, contracts.stablecoin))) {
      stableBase = await client.readContract({
        address: contracts.stablecoin,
        abi: mockStablecoinAbi,
        functionName: 'balanceOf',
        args: [who],
      });
      stableSymbol = await client.readContract({
        address: contracts.stablecoin,
        abi: mockStablecoinAbi,
        functionName: 'symbol',
      });
    }

    if (contracts.property && (await hasCode(config, contracts.property))) {
      shares = await client.readContract({
        address: contracts.property,
        abi: propertyShareAbi,
        functionName: 'balanceOf',
        args: [who],
      });
    }

    return { ethWei, stableBase, stableSymbol, shares };
  } catch (error) {
    throw toFriendlyError(error, config);
  }
}

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Recent rows for the home page.
 *
 * The notebook is every send this page made. The logs are the contract
 * events (vault deposits, share transfers, rent). The last few blocks add
 * plain ETH transfers, which do not write a log. Anvil's chain is short.
 * On Sepolia we only look back a little way, so older history can be missing.
 * The hash is still the way to find a transaction.
 */
export async function readHistory(input: {
  config: WalletConfig;
  who: Address;
  vault?: Address;
  property?: Address;
  local: ActivityItem[];
}): Promise<ActivityItem[]> {
  const client = makePublicClient(input.config);
  const chainId = input.config.chain.id;
  const local = input.local.filter((item) => item.chainId === chainId);
  const byHash = new Map<string, ActivityItem>();
  for (const item of local) byHash.set(item.hash.toLowerCase(), item);

  try {
    const latest = await client.getBlockNumber();
    const span = input.config.chainChoice === 'anvil' ? 40n : 2_000n;
    const fromBlock = latest > span ? latest - span : 0n;

    const push = (item: ActivityItem) => {
      const key = item.hash.toLowerCase();
      if (!byHash.has(key)) byHash.set(key, item);
    };

    if (input.vault && (await hasCode(input.config, input.vault))) {
      const [deposits, withdrawals] = await Promise.all([
        client.getLogs({ address: input.vault, event: depositedEvent, fromBlock, toBlock: 'latest' }),
        client.getLogs({ address: input.vault, event: withdrawnEvent, fromBlock, toBlock: 'latest' }),
      ]);
      for (const log of deposits) {
        const who = log.args.who;
        if (!who || !same(who, input.who)) continue;
        push({
          hash: log.transactionHash ?? '0x',
          chainId,
          from: who,
          to: input.vault,
          kind: 'vault-deposit',
          summary: 'Deposited into the vault',
          amount: `${formatEther(log.args.amount ?? 0n)} ETH`,
          status: 'confirmed',
          createdAt: new Date().toISOString(),
        });
      }
      for (const log of withdrawals) {
        const who = log.args.who;
        if (!who || !same(who, input.who)) continue;
        push({
          hash: log.transactionHash ?? '0x',
          chainId,
          from: who,
          to: input.vault,
          kind: 'vault-withdraw',
          summary: 'Withdrew from the vault',
          amount: `${formatEther(log.args.amount ?? 0n)} ETH`,
          status: 'confirmed',
          createdAt: new Date().toISOString(),
        });
      }
    }

    if (input.property && (await hasCode(input.config, input.property))) {
      const [transfers, deposited, claimed] = await Promise.all([
        client.getLogs({ address: input.property, event: transferEvent, fromBlock, toBlock: 'latest' }),
        client.getLogs({ address: input.property, event: rentDepositedEvent, fromBlock, toBlock: 'latest' }),
        client.getLogs({ address: input.property, event: rentClaimedEvent, fromBlock, toBlock: 'latest' }),
      ]);
      for (const log of transfers) {
        if (!log.transactionHash) continue;
        const from = log.args.from;
        const to = log.args.to;
        if (!from || !to) continue;
        if (!same(from, input.who) && !same(to, input.who)) continue;
        push({
          hash: log.transactionHash,
          chainId,
          from,
          to,
          kind: 'shares',
          summary: same(from, zeroAddress) ? 'Minted property shares' : 'Property shares moved',
          amount: `${(log.args.value ?? 0n).toString()} shares`,
          status: 'confirmed',
          createdAt: new Date().toISOString(),
        });
      }
      for (const log of deposited) {
        const person = log.args.payer;
        if (!person || !log.transactionHash || !same(person, input.who)) continue;
        push({
          hash: log.transactionHash,
          chainId,
          from: person,
          to: input.property,
          kind: 'rent-in',
          summary: 'Deposited rent',
          status: 'confirmed',
          createdAt: new Date().toISOString(),
        });
      }
      for (const log of claimed) {
        const person = log.args.holder;
        if (!person || !log.transactionHash || !same(person, input.who)) continue;
        push({
          hash: log.transactionHash,
          chainId,
          from: person,
          to: input.property,
          kind: 'rent-out',
          summary: 'Claimed rent',
          status: 'confirmed',
          createdAt: new Date().toISOString(),
        });
      }
    }

    const start = latest > 20n ? latest - 20n : 0n;
    const blocks = await Promise.all(
      Array.from({ length: Number(latest - start + 1n) }, (_, index) =>
        client.getBlock({ blockNumber: start + BigInt(index), includeTransactions: true }),
      ),
    );
    for (const block of blocks) {
      for (const tx of block.transactions) {
        if (typeof tx === 'string') continue;
        const from = tx.from;
        const to = tx.to ?? undefined;
        if (!same(from, input.who) && !(to && same(to, input.who))) continue;
        if (tx.value === 0n) continue;
        push({
          hash: tx.hash,
          chainId,
          from,
          to,
          kind: same(from, input.who) ? 'send' : 'receive',
          summary: same(from, input.who) ? 'Sent ETH' : 'Received ETH',
          amount: `${formatEther(tx.value)} ETH`,
          status: 'confirmed',
          createdAt: new Date(Number(block.timestamp) * 1000).toISOString(),
        });
      }
    }
  } catch (error) {
    // A missing node should not hide the notebook of sends we already stored.
    if (local.length === 0) throw toFriendlyError(error, input.config);
  }

  return [...byHash.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 12);
}

export type RentPoint = {
  hash: Hash;
  asset: 'eth' | 'stable';
  amount: bigint;
  label: string;
  when: string;
};

export type HolderRow = {
  address: Address;
  shares: bigint;
  allowed: boolean;
};

export async function readPropertyChain(input: {
  config: WalletConfig;
  property: Address;
  stablecoin: Address;
  extraAddresses: Address[];
}): Promise<{ holders: HolderRow[]; rent: RentPoint[]; seen: Address[] }> {
  const client = makePublicClient(input.config);
  const latest = await client.getBlockNumber();
  const span = input.config.chainChoice === 'anvil' ? latest : latest > 50_000n ? 50_000n : latest;
  const fromBlock = latest - span;

  const [transfers, allowedLogs, rentLogs] = await Promise.all([
    client.getLogs({ address: input.property, event: transferEvent, fromBlock, toBlock: 'latest' }),
    client.getLogs({ address: input.property, event: allowedSetEvent, fromBlock, toBlock: 'latest' }),
    client.getLogs({ address: input.property, event: rentDepositedEvent, fromBlock, toBlock: 'latest' }),
  ]);

  const addresses = new Set<string>();
  for (const extra of input.extraAddresses) addresses.add(extra.toLowerCase());

  for (const log of transfers) {
    if (log.args.from && log.args.from !== zeroAddress) addresses.add(log.args.from.toLowerCase());
    if (log.args.to && log.args.to !== zeroAddress) addresses.add(log.args.to.toLowerCase());
  }
  for (const log of allowedLogs) {
    if (log.args.account) addresses.add(log.args.account.toLowerCase());
  }

  const rent: RentPoint[] = [];
  for (const log of rentLogs) {
    if (!log.transactionHash || log.args.amount === undefined || !log.args.asset) continue;
    const asset = log.args.asset.toLowerCase() === zeroAddress ? 'eth' : 'stable';
    rent.push({
      hash: log.transactionHash,
      asset,
      amount: log.args.amount,
      label: asset === 'eth' ? `${formatEther(log.args.amount)} ETH` : `${formatUnits(log.args.amount, 6)} mUSD`,
      when: '',
    });
  }

  // A handful of deposits. One block lookup each is enough for a chart.
  for (const point of rent) {
    const tx = await client.getTransaction({ hash: point.hash });
    const block = await client.getBlock({ blockNumber: tx.blockNumber ?? latest });
    point.when = new Date(Number(block.timestamp) * 1000).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  const holders: HolderRow[] = [];
  for (const lower of addresses) {
    const checksummed = getAddress(lower);
    const [shares, allowed] = await Promise.all([
      client.readContract({
        address: input.property,
        abi: propertyShareAbi,
        functionName: 'balanceOf',
        args: [checksummed],
      }),
      client.readContract({
        address: input.property,
        abi: propertyShareAbi,
        functionName: 'allowed',
        args: [checksummed],
      }),
    ]);
    if (shares > 0n) holders.push({ address: checksummed, shares, allowed });
  }
  holders.sort((a, b) => (a.shares > b.shares ? -1 : 1));

  return {
    holders,
    rent,
    seen: [...addresses] as Address[],
  };
}

export type { Hex };
