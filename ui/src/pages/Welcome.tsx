/**
 * First visit: create a phrase, import one, or open a keystore file the CLI
 * already wrote.
 *
 * The words exist in React state only during this visit, because the person
 * has to write them down and type them back. They are cleared after the
 * encrypted JSON is saved. They are never written to localStorage.
 */
import { useRef, useState } from 'react';
import { accountFromPrivateKey } from '@wallet/account';
import { parsePrivateKey } from '@wallet/address';
import { assertValidMnemonic, createMnemonic, normalizeMnemonic } from '@wallet/hd';
import { parseKeystore } from '@wallet/keystoreCrypto';
import { assertFilePassword, assertKeyPassword, assertPasswordsMatch } from '@wallet/passwordRules';
import { useApp } from '../state';
import { Button, Card, Field, Note, PageHeader, Spinner, TestnetBadge, TextArea, TextInput } from '../components/ui';
import { friendlyError } from '../lib/errors';

type Mode = 'choose' | 'create' | 'import' | 'key' | 'file';
type CreateStep = 'words' | 'confirm' | 'password';

export function Welcome() {
  const app = useApp();
  const [mode, setMode] = useState<Mode>('choose');
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <div className="flex items-start justify-between gap-3">
          <PageHeader kicker="PropertyShare" title="Wallet" />
          <TestnetBadge />
        </div>
        <p className="max-w-xl text-sm leading-relaxed text-muted">
          Create a recovery phrase, import a phrase, or import a private key. The secret is encrypted in this browser
          and is not sent to a server.
        </p>
        {app.notice ? <Note>{app.notice}</Note> : null}
        {error ? <Note tone="bad">{error}</Note> : null}
        {mode === 'choose' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Choice title="Create" body="Make 12 new words from random bits, write them down, then lock them." onClick={() => { setError(null); setMode('create'); }} />
            <Choice title="Import words" body="Type a phrase you already wrote down. This is how a forgotten file password is fixed." onClick={() => { setError(null); setMode('import'); }} />
            <Choice title="Import a private key" body="Paste a 0x key, such as one from cast wallet new. The address is shown before it is saved." onClick={() => { setError(null); setMode('key'); }} />
            <Choice title="Open a keystore file" body="Use the JSON from the command line. It does not contain the secret in a form you can read." onClick={() => { setError(null); setMode('file'); }} />
          </div>
        ) : null}
        {mode === 'create' ? <CreateFlow onBack={() => setMode('choose')} onError={setError} /> : null}
        {mode === 'import' ? <ImportFlow onBack={() => setMode('choose')} onError={setError} /> : null}
        {mode === 'key' ? <KeyFlow onBack={() => setMode('choose')} onError={setError} /> : null}
        {mode === 'file' ? <FileFlow onBack={() => setMode('choose')} onError={setError} /> : null}
      </main>
    </div>
  );
}

function Choice({ title, body, onClick }: { title: string; body: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl border border-line bg-card p-4 text-left shadow-card hover:bg-card-2">
      <span className="text-lg font-semibold">{title}</span>
      <span className="mt-2 block text-sm leading-relaxed text-muted">{body}</span>
    </button>
  );
}

function CreateFlow({ onBack, onError }: { onBack: () => void; onError: (message: string | null) => void }) {
  const app = useApp();
  const [step, setStep] = useState<CreateStep>('words');
  // Created once for this visit. React state would be a tempting place to
  // keep the words, and a strict-mode remount would mint a second phrase.
  // The ref is the phrase the person is looking at. It is cleared by leaving
  // the page after save, not by writing it down anywhere else.
  const mnemonicRef = useRef<string | null>(null);
  if (!mnemonicRef.current) mnemonicRef.current = createMnemonic();
  const mnemonic = mnemonicRef.current;
  const [wrote, setWrote] = useState(false);
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [wantPassphrase, setWantPassphrase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const words = mnemonic.split(' ');

  async function save() {
    onError(null);
    try {
      assertFilePassword(password, mnemonic);
      assertPasswordsMatch(password, again);
      if (wantPassphrase && passphrase.length === 0) {
        throw new Error('The BIP-39 passphrase box is empty. Uncheck it to skip, or type the passphrase. Nothing was saved.');
      }
      setBusy(true);
      await app.saveNewWallet(mnemonic, password, wantPassphrase ? passphrase : '', (value) => setProgress(Math.round(value * 100)));
      mnemonicRef.current = null;
      setTyped('');
      setPassword('');
      setAgain('');
      setPassphrase('');
    } catch (error) {
      onError(friendlyError(error));
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">New wallet</h2>
        <Button tone="ghost" onClick={onBack}>Back</Button>
      </div>
      {step === 'words' ? (
        <>
          <Note>
            Write these 12 words on paper, in order. Do not screenshot them. If you leave this page before the locked
            copy is saved, these words are gone and a new set will be made.
          </Note>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {words.map((word, index) => (
              <li key={`${word}-${index}`} className="rounded-2xl bg-card-2 px-3 py-2">
                <span className="text-xs text-muted">{index + 1}</span>
                <span className="block text-base font-medium">{word}</span>
              </li>
            ))}
          </ol>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={wrote} onChange={(event) => setWrote(event.target.checked)} className="mt-1" />
            I wrote the 12 words on paper, in order.
          </label>
          <Button disabled={!wrote} onClick={() => setStep('confirm')}>
            I wrote them down
          </Button>
        </>
      ) : null}
      {step === 'confirm' ? (
        <>
          <Note>The words are hidden now. Type them back, separated by spaces. A mismatch means nothing is saved.</Note>
          <Field label="The 12 words">
            <TextArea value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button tone="quiet" onClick={() => setStep('words')}>Show the words again</Button>
            <Button
              onClick={() => {
                if (normalizeMnemonic(typed) !== normalizeMnemonic(mnemonic)) {
                  onError('That did not match. Nothing was saved. Show the words again and check the paper.');
                  return;
                }
                onError(null);
                setStep('password');
              }}
            >
              Check the words
            </Button>
          </div>
        </>
      ) : null}
      {step === 'password' ? (
        <>
          <Note>
            The file password encrypts the copy in this browser. It is a different secret from the 12 words. At least 8
            characters. The pause while saving is scrypt stretching the password on purpose.
          </Note>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={wantPassphrase} onChange={(event) => setWantPassphrase(event.target.checked)} className="mt-1" />
            Add an optional BIP-39 passphrase. If you set one and forget it, the 12 words alone open a different, empty wallet.
          </label>
          {wantPassphrase ? (
            <Field label="BIP-39 passphrase" hint="This is not the file password, and it is not one of the 12 words.">
              <TextInput type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="off" />
            </Field>
          ) : null}
          <Field label="File password">
            <TextInput type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Type the file password again">
            <TextInput type="password" value={again} onChange={(event) => setAgain(event.target.value)} autoComplete="new-password" />
          </Field>
          {busy ? <Spinner label={`Stretching the password${progress > 0 ? ` (${progress}%)` : ''}. This pause is on purpose.`} /> : null}
          <Button onClick={() => void save()} disabled={busy}>Encrypt and save in this browser</Button>
        </>
      ) : null}
    </Card>
  );
}

function ImportFlow({ onBack, onError }: { onBack: () => void; onError: (message: string | null) => void }) {
  const app = useApp();
  const [words, setWords] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [wantPassphrase, setWantPassphrase] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    onError(null);
    try {
      const mnemonic = assertValidMnemonic(words);
      assertFilePassword(password, mnemonic);
      assertPasswordsMatch(password, again);
      if (wantPassphrase && passphrase.length === 0) {
        throw new Error('The BIP-39 passphrase box is empty. Uncheck it to skip, or type the passphrase. Nothing was saved.');
      }
      setBusy(true);
      await app.saveNewWallet(mnemonic, password, wantPassphrase ? passphrase : '');
      setWords('');
      setPassword('');
      setAgain('');
      setPassphrase('');
    } catch (error) {
      onError(friendlyError(error));
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Import words</h2>
        <Button tone="ghost" onClick={onBack}>Back</Button>
      </div>
      <Note>
        The public test phrase that starts with “abandon” is printed in the README. It is not a secret. Never import a
        phrase that holds real funds.
      </Note>
      <Field label="12, 15, 18, 21, or 24 words">
        <TextArea value={words} onChange={(event) => setWords(event.target.value)} autoComplete="off" spellCheck={false} />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={wantPassphrase} onChange={(event) => setWantPassphrase(event.target.checked)} className="mt-1" />
        These words were created with a BIP-39 passphrase.
      </label>
      {wantPassphrase ? (
        <Field label="BIP-39 passphrase">
          <TextInput type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="off" />
        </Field>
      ) : null}
      <Field label="New file password for this browser">
        <TextInput type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
      </Field>
      <Field label="Type the file password again">
        <TextInput type="password" value={again} onChange={(event) => setAgain(event.target.value)} autoComplete="new-password" />
      </Field>
      {busy ? <Spinner label="Stretching the password. This pause is on purpose." /> : null}
      <Button onClick={() => void save()} disabled={busy}>Encrypt and save in this browser</Button>
    </Card>
  );
}

function KeyFlow({ onBack, onError }: { onBack: () => void; onError: (message: string | null) => void }) {
  const app = useApp();
  const [privateKey, setPrivateKey] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const trimmedKey = privateKey.trim();
  let address: string | null = null;
  let keyError: string | null = null;
  if (trimmedKey.length > 0 && !/^0x/i.test(trimmedKey)) {
    keyError = 'A private key must start with 0x.';
  } else if (trimmedKey.length >= 66) {
    try {
      address = accountFromPrivateKey(parsePrivateKey(trimmedKey)).address;
    } catch (error) {
      keyError = friendlyError(error);
    }
  }

  async function save() {
    onError(null);
    try {
      const key = parsePrivateKey(privateKey);
      assertKeyPassword(password, key);
      assertPasswordsMatch(password, again);
      setBusy(true);
      await app.savePrivateKey(key, password, (value) => setProgress(Math.round(value * 100)));
      setPrivateKey('');
      setPassword('');
      setAgain('');
    } catch (error) {
      onError(friendlyError(error));
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Import a private key</h2>
        <Button tone="ghost" onClick={onBack}>Back</Button>
      </div>
      <Note>
        Paste a 0x key. The address below is derived before anything is written. The key is then encrypted with the
        same password lock as a phrase wallet. It is not sent to a server, and this page will not show it again.
      </Note>
      <Field label="Private key" hint="0x followed by 64 hex characters.">
        <TextInput
          type="password"
          value={privateKey}
          onChange={(event) => setPrivateKey(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
      </Field>
      {address ? (
        <Note tone="good">
          This key controls <span className="break-all font-mono">{address}</span>. Check it before you save.
        </Note>
      ) : null}
      {keyError ? <Note tone="bad">{keyError}</Note> : null}
      <Field label="New file password for this browser">
        <TextInput type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
      </Field>
      <Field label="Type the file password again">
        <TextInput type="password" value={again} onChange={(event) => setAgain(event.target.value)} autoComplete="new-password" />
      </Field>
      {busy ? <Spinner label={`Stretching the password${progress > 0 ? ` (${progress}%)` : ''}. This pause is on purpose.`} /> : null}
      <Button onClick={() => void save()} disabled={busy || !address}>Encrypt and save in this browser</Button>
    </Card>
  );
}

function FileFlow({ onBack, onError }: { onBack: () => void; onError: (message: string | null) => void }) {
  const app = useApp();
  const [replace, setReplace] = useState(false);

  async function onFile(file: File | undefined) {
    onError(null);
    if (!file) return;
    if (!replace) {
      onError('Check the box first if you mean to replace any wallet already in this browser. Nothing was saved.');
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseKeystore(JSON.parse(text) as unknown);
      await app.replaceKeystore(parsed);
    } catch (error) {
      onError(friendlyError(error));
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Open a keystore file</h2>
        <Button tone="ghost" onClick={onBack}>Back</Button>
      </div>
      <Note>
        This is the JSON from <span className="font-mono">.wallet/keystore.json</span>. You will still need the file
        password. The words are not in the file.
      </Note>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} className="mt-1" />
        Replace the wallet in this browser with this file.
      </label>
      <input
        type="file"
        accept="application/json,.json"
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
    </Card>
  );
}
