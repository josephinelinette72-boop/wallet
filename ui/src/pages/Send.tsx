/**
 * Send ETH.
 *
 * The preview comes from `prepareEthTransfer`, the same function the CLI
 * uses, so the nonce, the gas, and the EIP-1559 fees are filled in before
 * you sign. The page then broadcasts those fields itself so the hash can
 * show while the transaction is pending.
 */
import { useState } from 'react';
import { parseUserAddress } from '@wallet/address';
import { parseEthAmount } from '@wallet/amounts';
import { prepareEthTransfer } from '@wallet/transfer';
import { useApp } from '../state';
import { accountAt } from '../lib/session';
import { useTx } from '../lib/useTx';
import { Review, TxResult } from '../components/Review';
import { Button, Card, Field, Note, Spinner, TextInput } from '../components/ui';

export function SendPage() {
  const app = useApp();
  const tx = useTx();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('0.1');
  const unlocked = app.wallet.status === 'unlocked' ? app.wallet : null;

  async function prepare() {
    if (!unlocked) return;
    await tx.review(async () => {
      const config = app.getConfig();
      const signer = accountAt(unlocked.index);
      return prepareEthTransfer({
        config,
        account: signer.account,
        path: signer.path,
        to: parseUserAddress(to),
        valueWei: parseEthAmount(amount),
      });
    }, 'Sent ETH', `${amount} ETH`);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-4xl">Send ETH</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          {unlocked?.kind === 'private-key' ? 'From the imported key.' : `From ${unlocked?.path ?? ''}.`} A plain transfer also pays a fee, so sending the entire balance fails.
        </p>
      </div>
      {tx.phase.step === 'review' ? (
        <Review preview={tx.phase.ready.preview} busy={false} onBack={tx.reset} onConfirm={tx.confirm} />
      ) : null}
      {tx.phase.step === 'pending' ? <TxResult status="pending" hash={tx.phase.hash} onDone={tx.reset} /> : null}
      {tx.phase.step === 'done' ? <TxResult status={tx.phase.status} hash={tx.phase.hash} onDone={tx.reset} /> : null}
      {tx.phase.step === 'form' || tx.phase.step === 'preparing' || tx.phase.step === 'error' ? (
        <Card className="space-y-4">
          {tx.phase.step === 'error' ? <Note tone="bad">{tx.phase.message}</Note> : null}
          <Field label="To" hint="Mixed-case addresses must match the EIP-55 checksum. A typo is rejected, not corrected.">
            <TextInput value={to} onChange={(event) => setTo(event.target.value)} spellCheck={false} placeholder="0x…" className="font-mono" />
          </Field>
          <Field label="ETH" hint="Write a decimal such as 0.1. Scientific notation is refused so the unit stays obvious.">
            <TextInput value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
          </Field>
          {tx.phase.step === 'preparing' ? <Spinner label="Asking the node for the nonce and the fee…" /> : null}
          <Button onClick={() => void prepare()} disabled={tx.phase.step === 'preparing' || !unlocked}>
            Review transaction
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
