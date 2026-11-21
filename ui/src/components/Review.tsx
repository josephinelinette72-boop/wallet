/**
 * The screen between "I filled in the form" and "the signature exists".
 *
 * The paragraph is `describeTransaction` from the CLI, so the explanation of
 * nonce, gas, the EIP-1559 fees, and the chain id is the same text the
 * terminal prints before it asks you to type YES. Nothing is broadcast until
 * the confirm button.
 */
import { Button, Card, Note } from './ui';

export function Review({
  preview,
  busy,
  onBack,
  onConfirm,
}: {
  preview: string;
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <Card className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Review before you sign</p>
        <h2 className="font-serif text-3xl">Read the fields</h2>
      </div>
      <Note>
        The signature covers every line below. Chain id, nonce, gas, and fees are part of the transaction, not a
        footnote. Nothing has been broadcast yet.
      </Note>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl bg-card-2 p-4 text-sm leading-relaxed">{preview}</pre>
      <div className="flex flex-wrap gap-2">
        <Button tone="quiet" onClick={onBack} disabled={busy}>
          Go back
        </Button>
        <Button onClick={onConfirm} disabled={busy}>
          {busy ? 'Signing…' : 'Sign and send'}
        </Button>
      </div>
    </Card>
  );
}

export function TxResult({
  status,
  hash,
  note,
  onDone,
}: {
  status: 'pending' | 'confirmed' | 'reverted';
  hash?: string;
  note?: string;
  onDone: () => void;
}) {
  const title =
    status === 'pending' ? 'Pending' : status === 'confirmed' ? 'Confirmed' : 'Reverted';
  return (
    <Card className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Transaction</p>
      <h2 className="font-serif text-3xl">{title}</h2>
      <p className="text-sm leading-relaxed text-muted">
        {status === 'pending'
          ? 'The node has the signed transaction, or it is on its way. A hash identifies it. A hash is not a key.'
          : status === 'confirmed'
            ? 'The transaction was mined and succeeded. The hash is public. It identifies the transaction. It is not a key.'
            : 'The transaction was mined and then reverted. The state changes were discarded. The fee may still have been paid.'}
      </p>
      {hash ? (
        <p className="break-all rounded-2xl bg-card-2 p-3 font-mono text-xs">{hash}</p>
      ) : (
        <p className="text-sm text-muted">Waiting for the hash…</p>
      )}
      {note ? <Note>{note}</Note> : null}
      {status !== 'pending' ? (
        <Button tone="quiet" onClick={onDone}>
          Back to the form
        </Button>
      ) : null}
    </Card>
  );
}
