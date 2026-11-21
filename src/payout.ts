/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Numbers the property page shows. This file does not talk to a node.
 * The contract (`property-token/src/PropertyShare.sol`) is the books.
 * These helpers repeat the display arithmetic so the page and the tests
 * agree with that contract:
 *
 *   percent = shares / total supply
 *   a fresh deposit's slice = floor(shares * floor(amount * 1e18 / supply) / 1e18)
 *
 * Solidity's Math.mulDiv rounds down. Bigint division rounds down the same
 * way. "Fresh" means the holder has not already been snapshotted: their
 * stored unclaimed is 0 and their paid-up-to marker is 0. After a transfer,
 * use `earnedRent`, which is the contract's `_earned` formula.
 *
 * Three units show up on purpose. ETH has 18 decimals. Mock dollars have 6,
 * like USDC. Shares have 0. 250000 shares is 25% of 1,000,000. It is not
 * 250000 * 10^18.
 */
import { formatEther, formatUnits } from 'viem';

/** The supply PropertyShare mints once, in the constructor, and never again. */
export const TOTAL_SHARES = 1_000_000n;

/** `PRECISION` in PropertyShare.sol. Rent-per-share is stored scaled by this. */
export const RENT_PRECISION = 10n ** 18n;

/**
 * "25%" for 250,000 of 1,000,000. One share is "0.0001%".
 * Trailing zeros are dropped so 25.0000% reads as 25%.
 */
export function formatSharePercent(shares: bigint, total: bigint = TOTAL_SHARES): string {
  if (shares <= 0n || total <= 0n) return '0%';
  if (shares > total) return 'more than 100%';
  // Four decimal places of a percent. 1 / 1,000,000 = 0.0001%.
  const scaled = (shares * 1_000_000n) / total;
  const whole = scaled / 10_000n;
  const frac = (scaled % 10_000n).toString().padStart(4, '0').replace(/0+$/, '');
  return frac.length === 0 ? `${whole.toString()}%` : `${whole.toString()}.${frac}%`;
}

/**
 * How much of one deposit a holder would be assigned if they held `shares`
 * at that moment and had no older unclaimed rent.
 * This is `_deposit`'s credit, then `_earned` with a zero snapshot.
 */
export function proRataRent(deposit: bigint, shares: bigint, total: bigint): bigint {
  if (total <= 0n) {
    throw new Error('There are no shares to split the rent across.');
  }
  if (deposit <= 0n || shares <= 0n) return 0n;
  const credit = (deposit * RENT_PRECISION) / total;
  return (shares * credit) / RENT_PRECISION;
}

/**
 * The claim a holder has right now.
 * `rewardPerShare` only grows. `paidPerShare` is the value it had the last
 * time this holder was snapshotted. `unclaimed` is rent already written down
 * and not paid out. The contract adds the gap on top of `unclaimed`.
 */
export function earnedRent(input: {
  shares: bigint;
  rewardPerShare: bigint;
  paidPerShare: bigint;
  unclaimed: bigint;
}): bigint {
  if (input.rewardPerShare < input.paidPerShare) {
    throw new Error('rewardPerShare only grows. A smaller value means the inputs are swapped.');
  }
  const delta = input.rewardPerShare - input.paidPerShare;
  return input.unclaimed + (input.shares * delta) / RENT_PRECISION;
}

/** "0.75 ETH". The page uses this for claimable ETH and for rent-chart labels. */
export function formatEthDisplay(wei: bigint): string {
  return `${formatEther(wei)} ETH`;
}

/**
 * "500 mUSD". Mock dollars have 6 decimals, so 500_000_000 base units
 * display as 500. The symbol comes from the token. The default is the one
 * MockStablecoin uses.
 */
export function formatStableDisplay(baseUnits: bigint, symbol = 'mUSD'): string {
  return `${formatUnits(baseUnits, 6)} ${symbol}`;
}

export type HolderSlice = {
  address: string;
  shares: bigint;
  percent: string;
};

/** One row of the cap table: an address, its shares, and the percent of the supply. */
export function holderSlice(address: string, shares: bigint, total: bigint): HolderSlice {
  return {
    address,
    shares,
    percent: formatSharePercent(shares, total),
  };
}

/**
 * How many people actually hold shares. A zero balance is not an investor.
 * The allowlist can be longer than this list: someone may be allowed and
 * still hold nothing.
 */
export function investorCount(holders: readonly { shares: bigint }[]): number {
  return holders.filter((holder) => holder.shares > 0n).length;
}

/**
 * Rent this person has been paid, plus rent they can still claim.
 * The contract stores those as two numbers. Together they are "earned to date".
 * Claiming moves the second number into the first. The total does not change.
 */
export function rentEarnedToDate(alreadyPaid: bigint, stillClaimable: bigint): bigint {
  if (alreadyPaid < 0n || stillClaimable < 0n) {
    throw new Error('Rent amounts cannot be negative.');
  }
  return alreadyPaid + stillClaimable;
}

/** Add a list of payout amounts. Used for "what the logs say I have been paid". */
export function sumAmounts(amounts: readonly bigint[]): bigint {
  return amounts.reduce((total, amount) => total + amount, 0n);
}

/**
 * A short picture of the whole building: how many investors, and how large
 * the biggest slice is. The investor page shows this instead of every tool.
 */
export function capTableSummary(
  holders: readonly { shares: bigint }[],
  total: bigint,
): { investors: number; largestPercent: string } {
  let largest = 0n;
  for (const holder of holders) {
    if (holder.shares > largest) largest = holder.shares;
  }
  return {
    investors: investorCount(holders),
    largestPercent: formatSharePercent(largest, total),
  };
}
