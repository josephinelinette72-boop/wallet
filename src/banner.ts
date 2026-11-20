/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * The sentence below is printed before any command that creates a wallet or
 * spends play ETH. It also lives in the README. Both places exist so the
 * warning is hard to miss: this program is a textbook, not a vault for savings.
 */

export const REAL_FUNDS_WARNING = [
  'NEVER use a seed phrase that holds real money with this learning wallet.',
  'It has not been audited. A bug, a screenshot, or a leaked file could lose funds.',
  'Use Anvil play money, or Sepolia test ETH only.',
  'The same 12 words work on every Ethereum network, including mainnet.',
  'Do not reuse a practice phrase anywhere a real asset might arrive later.',
].join('\n');

export function printRealFundsWarning(): void {
  const line = '='.repeat(78);
  console.log('');
  console.log(line);
  console.log(REAL_FUNDS_WARNING);
  console.log(line);
  console.log('');
}
