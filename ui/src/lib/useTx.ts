/**
 * The shared "ask the node, show the preview, then sign" steps.
 *
 * Each screen prepares a transaction with the CLI function for that action.
 * This hook only runs the part that is the same everywhere: show the preview,
 * broadcast the fields, wait, and write a line in the local notebook.
 */
import { useRef, useState } from 'react';
import { getContractAddress, type Address, type Hex, type TransactionReceipt } from 'viem';
import { useApp } from '../state';
import { broadcastTransaction, type ReadyTransaction } from './broadcast';
import { friendlyError } from './errors';
import { accountAt } from './session';
import type { ActivityItem } from './storage';

export type TxPhase =
  | { step: 'form' }
  | { step: 'preparing' }
  | { step: 'review'; ready: ReadyTransaction; summary: string; amount?: string }
  | { step: 'pending'; hash?: Hex; summary: string; amount?: string }
  | { step: 'done'; hash: Hex; status: 'confirmed' | 'reverted'; summary: string; contractAddress?: Address }
  | { step: 'error'; message: string };

export function useTx(onConfirmed?: (receipt: TransactionReceipt) => void) {
  const app = useApp();
  const onConfirmedRef = useRef(onConfirmed);
  onConfirmedRef.current = onConfirmed;
  const sending = useRef(false);
  const [phase, setPhase] = useState<TxPhase>({ step: 'form' });

  async function review(prepare: () => Promise<ReadyTransaction>, summary: string, amount?: string) {
    setPhase({ step: 'preparing' });
    try {
      const ready = await prepare();
      setPhase({ step: 'review', ready, summary, amount });
    } catch (error) {
      setPhase({ step: 'error', message: friendlyError(error) });
    }
  }

  async function confirm() {
    if (sending.current) return;
    if (phase.step !== 'review') return;
    if (app.wallet.status !== 'unlocked') return;
    sending.current = true;
    const { ready, summary, amount } = phase;
    const unlocked = app.wallet;
    const signer = accountAt(unlocked.index);
    let config;
    try {
      config = app.getConfig();
    } catch (error) {
      setPhase({ step: 'error', message: friendlyError(error) });
      return;
    }
    setPhase({ step: 'pending', summary, amount });
    const base: Omit<ActivityItem, 'status' | 'hash'> = {
      chainId: config.chain.id,
      from: unlocked.address,
      to: ready.to,
      kind: summary,
      summary,
      amount,
      createdAt: new Date().toISOString(),
    };
    let seenHash: Hex | undefined;
    try {
      const receipt = await broadcastTransaction({
        config,
        account: signer.account,
        ready,
        onHash: (hash) => {
          seenHash = hash;
          setPhase({ step: 'pending', hash, summary, amount });
          app.rememberActivity({ ...base, hash, status: 'pending' });
        },
      });
      const status = receipt.status === 'success' ? 'confirmed' : 'reverted';
      // A creation has no `to`. The receipt usually names the new address. If the
      // node omits it, the address is still determined by the sender and the nonce
      // we put in the signature, which is the same rule Ethereum uses.
      const contractAddress = receipt.contractAddress
        ?? (!ready.to
          ? getContractAddress({ from: unlocked.address, nonce: BigInt(ready.fields.nonce) })
          : undefined);
      setPhase({ step: 'done', hash: receipt.transactionHash, status, summary, contractAddress });
      app.rememberActivity({ ...base, hash: receipt.transactionHash, status });
      if (status === 'confirmed') onConfirmedRef.current?.({ ...receipt, contractAddress: contractAddress ?? receipt.contractAddress });
      app.bump();
    } catch (error) {
      const message = friendlyError(error);
      setPhase({
        step: 'error',
        message: seenHash ? `${message} The hash so far is ${seenHash}.` : message,
      });
    } finally {
      sending.current = false;
    }
  }

  return {
    phase,
    review,
    confirm: () => void confirm(),
    reset: () => setPhase({ step: 'form' }),
  };
}
