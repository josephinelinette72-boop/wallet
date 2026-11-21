/**
 * Sign a personal message, then check one.
 *
 * Signing uses the unlocked account. Checking uses only the address, the
 * text, and the signature. Change one letter of the message and the check
 * fails. The signature cannot be replayed as a transaction because of the
 * EIP-191 prefix.
 */
import { useState } from 'react';
import { hashMessage } from 'viem';
import { signPersonalMessage, verifyPersonalMessage } from '@wallet/messages';
import { useApp } from '../state';
import { accountAt } from '../lib/session';
import { friendlyError } from '../lib/errors';
import { Button, Card, Field, Note, TextArea, TextInput } from '../components/ui';

export function SignPage() {
  const app = useApp();
  const unlocked = app.wallet.status === 'unlocked' ? app.wallet : null;
  const [message, setMessage] = useState('hello from my learning wallet');
  const [previewHash, setPreviewHash] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [signedHash, setSignedHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [checkMessage, setCheckMessage] = useState('hello from my learning wallet');
  const [checkSignature, setCheckSignature] = useState('');
  const [checkAddress, setCheckAddress] = useState(unlocked?.address ?? '');
  const [verdict, setVerdict] = useState<string | null>(null);

  function preview() {
    setError(null);
    setSignature(null);
    try {
      if (message.length === 0) throw new Error('Type a message to sign. An empty message is too easy to confuse with a blank line.');
      setPreviewHash(hashMessage(message));
    } catch (caught) {
      setError(friendlyError(caught));
    }
  }

  async function sign() {
    if (!unlocked) return;
    setError(null);
    try {
      const signer = accountAt(unlocked.index);
      const result = await signPersonalMessage(signer.account, message);
      setSignature(result.signature);
      setSignedHash(result.hash);
      setCheckMessage(message);
      setCheckSignature(result.signature);
      setCheckAddress(unlocked.address);
      setVerdict(null);
    } catch (caught) {
      setError(friendlyError(caught));
    }
  }

  async function verify() {
    setVerdict(null);
    setError(null);
    try {
      const ok = await verifyPersonalMessage({
        address: checkAddress,
        message: checkMessage,
        signature: checkSignature,
      });
      setVerdict(ok
        ? 'The signature matches that address and that exact text.'
        : 'The signature does not match. The text, the address, or the signature is different.');
    } catch (caught) {
      setError(friendlyError(caught));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <h1 className="font-serif text-4xl">Sign</h1>
        <Card className="space-y-4">
          {error ? <Note tone="bad">{error}</Note> : null}
          <Field label="Message" hint="This is text, not a transaction. The prefix “Ethereum Signed Message” keeps the two apart.">
            <TextArea value={message} onChange={(event) => { setMessage(event.target.value); setPreviewHash(null); setSignature(null); }} />
          </Field>
          <Button tone="quiet" onClick={preview}>Show what will be signed</Button>
          {previewHash ? (
            <Note>
              EIP-191 hash: <span className="break-all font-mono text-xs">{previewHash}</span>. That is keccak256 of the
              prefix plus this text. Signing covers the hash, not the raw letters.
            </Note>
          ) : null}
          <Button onClick={() => void sign()} disabled={!previewHash}>Sign with the selected account</Button>
          {signature ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Signature</p>
              <p className="break-all rounded-2xl bg-card-2 p-3 font-mono text-xs">{signature}</p>
              <p className="text-xs text-muted">Hash {signedHash}. Address {unlocked?.address}. Neither value is a private key.</p>
            </div>
          ) : null}
        </Card>
      </div>
      <Card className="space-y-4">
        <h2 className="font-serif text-3xl">Check a signature</h2>
        <p className="text-sm leading-relaxed text-muted">
          This does not ask for the password again and does not use the network. Anyone with these three values can run it.
        </p>
        <Field label="Message">
          <TextArea value={checkMessage} onChange={(event) => setCheckMessage(event.target.value)} />
        </Field>
        <Field label="Signature">
          <TextArea value={checkSignature} onChange={(event) => setCheckSignature(event.target.value)} className="font-mono text-xs" />
        </Field>
        <Field label="Address">
          <TextInput value={checkAddress} onChange={(event) => setCheckAddress(event.target.value)} className="font-mono" spellCheck={false} />
        </Field>
        <Button tone="quiet" onClick={() => void verify()}>Check</Button>
        {verdict ? <Note tone={verdict.startsWith('The signature matches') ? 'good' : 'bad'}>{verdict}</Note> : null}
      </Card>
    </div>
  );
}
