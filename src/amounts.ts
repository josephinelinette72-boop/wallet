/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * ETH amounts in and out of the commands.
 *
 * Internally every amount is an integer number of wei. 1 ETH is 10^18 wei.
 * Floating-point numbers (`0.1` in ordinary JavaScript math) cannot represent
 * that exactly, so we never add money with `Number`. viem's `parseEther`
 * turns the decimal text "0.1" into the bigint 100000000000000000n.
 */
import { parseEther, parseUnits } from 'viem';

export function parseEthAmount(input: string): bigint {
  const trimmed = input.trim();

  // The regex is the lesson: digits, an optional dot, and more digits.
  // Scientific notation ("1e18") would hide whether the user meant wei or ETH.
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(
      'Write the amount of ETH as a decimal such as 0.1 or 1. ' +
        'This wallet does not accept scientific notation, so the unit stays obvious. Nothing was sent.',
    );
  }

  if (/^0+(\.0+)?$/.test(trimmed)) {
    throw new Error('The amount has to be greater than zero. Nothing was sent.');
  }

  try {
    return parseEther(trimmed);
  } catch {
    throw new Error(
      'Could not read that ETH amount. Wei only goes to 18 decimal places (1 ETH = 10^18 wei). ' +
        'Try a value such as 0.1. Nothing was sent.',
    );
  }
}

/**
 * Property shares have 0 decimals. The number you type is the number of shares.
 * 250000 is two hundred fifty thousand shares, which is 25% of the 1,000,000
 * supply. It is not 250000 * 10^18. A decimal point is rejected so that mix-up
 * cannot happen quietly.
 */
export function parseShareCount(input: string): bigint {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(
      'Write the share count as a whole number such as 250000. Property shares have 0 decimals, ' +
        'so there is no fractional share. Nothing was sent.',
    );
  }
  const shares = BigInt(trimmed);
  if (shares === 0n) {
    throw new Error('The share count has to be greater than zero. Nothing was sent.');
  }
  return shares;
}

/**
 * Mock dollars copy USDC's 6 decimals. "1" means 1_000_000 base units.
 * "250.5" means 250 dollars and 500_000 base units. More than 6 decimal
 * places does not fit in the token, so we refuse it instead of rounding.
 */
export function parseMockDollars(input: string): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(
      'Write mock dollars as a decimal such as 1000 or 250.5. Nothing was sent.',
    );
  }
  if (/^0+(\.0+)?$/.test(trimmed)) {
    throw new Error('The dollar amount has to be greater than zero. Nothing was sent.');
  }
  const fraction = trimmed.split('.')[1];
  if (fraction !== undefined && fraction.length > 6) {
    throw new Error(
      'Mock dollars have 6 decimal places, the same count USDC uses. 250.5 is fine. ' +
        '250.1234567 has 7 decimal places and does not fit. Nothing was sent.',
    );
  }
  try {
    return parseUnits(trimmed, 6);
  } catch {
    throw new Error('Could not read that mock-dollar amount. Nothing was sent.');
  }
}
