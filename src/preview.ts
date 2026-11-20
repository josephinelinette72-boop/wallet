/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * The paragraph printed before a transaction is broadcast.
 *
 * A transaction is a signed list of fields. The node will reject it if any
 * field is wrong, and the signature covers all of them, so the signer has
 * to see them first. This text is that view. It has no place for a private
 * key: the preview is built only from public fields.
 */
import { formatEther, formatGwei, type Hex } from 'viem';

export type FeeFields = {
  nonce: number;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  chainId: number;
};

export type TransactionPreview = {
  action: string;
  chainName: string;
  from: Hex;
  path?: string;
  to?: Hex;
  /** Wei carried in the transaction's value field. Withdrawals from the vault are 0 here. */
  valueWei: bigint;
  fields: FeeFields;
  note?: string;
};

export function describeTransaction(preview: TransactionPreview): string {
  const { fields } = preview;
  const feeCeiling = fields.gas * fields.maxFeePerGas;
  const lines = [
    preview.action,
    '',
    `chain:    ${preview.chainName} (chain id ${fields.chainId})`,
    '          The chain id is inside the signature (EIP-155), so a signature made for Anvil is rejected on Sepolia.',
    `from:     ${preview.from}`,
  ];

  if (preview.path) {
    lines.push(`path:     ${preview.path}`);
  }

  lines.push(
    preview.to ? `to:       ${preview.to}` : 'to:       (none — this transaction creates a contract)',
    `value:    ${formatEther(preview.valueWei)} ETH`,
    `          ${preview.valueWei.toString()} wei. 1 ETH = 10^18 wei.`,
    `nonce:    ${fields.nonce}`,
    '          How many transactions this address has already sent. The next one must use the next number, or the node rejects it.',
    `gas:      ${fields.gas.toString()}`,
    '          The most work this transaction may do, in gas units. A plain ETH transfer is 21000. Unused gas is not charged.',
    `max fee:  ${formatGwei(fields.maxFeePerGas)} gwei per gas`,
    '          The ceiling on (base fee + tip). You will not pay more than this per unit of gas.',
    `tip:      ${formatGwei(fields.maxPriorityFeePerGas)} gwei per gas`,
    '          The priority fee, offered to the block producer. The base fee is burned; the tip is paid to them.',
    `ceiling:  ${formatEther(feeCeiling)} ETH`,
    '          gas times max fee. The real fee is this amount or less. Fees are priced in gwei (1 gwei = 10^9 wei).',
  );

  if (preview.note) {
    lines.push('', preview.note);
  }

  lines.push('', 'Nothing has been broadcast yet.');
  return lines.join('\n');
}
