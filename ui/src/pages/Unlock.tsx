/**
 * Unlock asks for the file password and, if the keystore says so, the BIP-39
 * passphrase. The password is handed to scrypt and then dropped. A wrong
 * password and a damaged file produce the same sentence, which is what the
 * CLI does too.
 */
import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { useApp } from '../state';
import { LearnDrawer } from '../components/LearnDrawer';
import { Banner, Button, Card, Field, Note, Spinner, TextInput } from '../components/ui';
import { friendlyError } from '../lib/errors';

export function Unlock() {
  const app = useApp();
  const usesPassphrase = app.wallet.status === 'locked' && app.wallet.usesPassphrase;
  const [password, setPassword] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [learnOpen, setLearnOpen] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await app.unlock(password, passphrase);
      setPassword('');
      setPassphrase('');
    } catch (caught) {
      setError(friendlyError(caught));
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <Banner />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-10">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-moss">Learning wallet</p>
            <h1 className="font-serif text-4xl">Unlock</h1>
          </div>
          <Button tone="quiet" onClick={() => setLearnOpen(true)}>
            <BookOpen size={16} /> Learn
          </Button>
        </div>
        <Card className="space-y-4">
          <Note>
            The file password decrypts the words on this computer. It is not sent to the network. A short pause is the
            password stretching doing its job.
          </Note>
          {error ? <Note tone="bad">{error}</Note> : null}
          <Field label="File password">
            <TextInput
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit();
              }}
            />
          </Field>
          {usesPassphrase ? (
            <Field label="BIP-39 passphrase" hint="This keystore was created with one. The words alone open a different wallet.">
              <TextInput type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="off" />
            </Field>
          ) : null}
          {busy ? <Spinner label="Checking the password…" /> : null}
          <Button onClick={() => void submit()} disabled={busy || password.length === 0}>
            Unlock
          </Button>
        </Card>
      </main>
      <LearnDrawer topic="welcome" open={learnOpen} onClose={() => setLearnOpen(false)} />
    </div>
  );
}
