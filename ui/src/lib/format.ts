/**
 * Short displays for addresses, hashes, and ETH.
 * An address is public. Shortening it is only so it fits on a phone.
 * The full value is what the copy button puts on the clipboard.
 * ETH on the home card keeps four decimal places. The review screen still
 * shows the exact wei, because that is what the signature covers.
 */
import { formatEther } from 'viem';

export function shortEth(wei: bigint): string {
  const [whole, fraction = ''] = formatEther(wei).split('.');
  const trimmed = fraction.slice(0, 4).replace(/0+$/, '');
  return trimmed.length > 0 ? `${whole}.${trimmed} ETH` : `${whole} ETH`;
}

export function shorten(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function whenLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
