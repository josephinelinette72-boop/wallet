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
import { parseEther } from 'viem';

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
