/**
 * The addresses one phrase can grow.
 *
 * Switching accounts changes which key the next signature uses. It does not
 * move ETH. The path under each address is part of the backup, even though
 * most wallets hide it.
 */
import { useState } from 'react';
import { accountAt } from '../lib/session';
import { loadKeystore } from '../lib/storage';
import { useApp } from '../state';
import { QrAddress } from '../components/QrAddress';
import { Button, Card, Field, Note, TextInput } from '../components/ui';
import type { KeystoreFile } from '@wallet/keystoreCrypto';

export function AccountsPage() {
  const app = useApp();
  if (app.wallet.status !== 'unlocked') return null;
  const { index, accountCount, usesPassphrase } = app.wallet;
  const accounts = Array.from({ length: accountCount }, (_, item) => accountAt(item));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-4xl">Accounts</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          Same 12 words, different last number in the path, different address. The selected one is what Send, the
          vault, and the property page will sign with.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          {accounts.map((account) => {
            const selected = account.path.endsWith(`/${index}`);
            return (
              <Card key={account.path} className={selected ? 'ring-2 ring-moss' : ''}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {selected ? 'Selected' : 'Not selected'} · index {account.path.split('/').pop()}
                    </p>
                    <p className="mt-1 break-all font-mono text-sm">{account.address}</p>
                    <p className="mt-1 font-mono text-xs text-muted">{account.path}</p>
                  </div>
                  <div className="flex gap-2">
                    <CopyButton value={account.address} label="Copy address" />
                    {selected ? null : (
                      <Button tone="quiet" onClick={() => app.selectAccount(Number(account.path.split('/').pop()))}>
                        Use this one
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
          <Button tone="quiet" onClick={app.addAccount} disabled={accountCount >= 10}>
            {accountCount >= 10 ? 'Ten addresses is enough for the lesson' : 'Derive the next address'}
          </Button>
        </div>
        <Card className="space-y-3">
          <h2 className="font-serif text-2xl">Address code</h2>
          <p className="text-sm text-muted">This code is the address. It is not the key.</p>
          <QrAddress address={accounts[index]?.address ?? app.wallet.address} />
          <p className="break-all font-mono text-xs">{accounts[index]?.path}</p>
        </Card>
      </div>
      <KeystoreCard usesPassphrase={usesPassphrase} onForget={() => void app.forget()} />
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      tone="quiet"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
}

function KeystoreCard({ usesPassphrase, onForget }: { usesPassphrase: boolean; onForget: () => void }) {
  const [file, setFile] = useState<KeystoreFile | null>(null);
  const [confirm, setConfirm] = useState('');
  const [shown, setShown] = useState(false);

  async function load() {
    const saved = await loadKeystore();
    setFile(saved ?? null);
    setShown(true);
  }

  function download() {
    if (!file) return;
    const blob = new Blob([`${JSON.stringify(file, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'keystore.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-serif text-2xl">The locked file</h2>
      <p className="text-sm leading-relaxed text-muted">
        This is the browser’s copy of the CLI’s <span className="font-mono">keystore.json</span>. You should see
        scrypt, aes-256-gcm, a salt, an iv, a tag, and a ciphertext. You should not see the 12 words.
        {usesPassphrase ? ' usesPassphrase is yes. That flag is not the passphrase itself.' : ''}
      </p>
      <Button tone="quiet" onClick={() => void load()}>Show the locked fields</Button>
      {shown && file ? (
        <>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">kdf</dt><dd className="font-mono">{file.kdf} N={file.kdfparams.n}</dd></div>
            <div><dt className="text-muted">cipher</dt><dd className="font-mono">{file.cipher}</dd></div>
            <div><dt className="text-muted">usesPassphrase</dt><dd>{file.usesPassphrase ? 'yes' : 'no'}</dd></div>
            <div><dt className="text-muted">created</dt><dd>{file.createdAt}</dd></div>
          </dl>
          <p className="break-all font-mono text-xs text-muted">ciphertext {file.ciphertext.slice(0, 24)}…</p>
          <Button tone="quiet" onClick={download}>Download keystore.json</Button>
        </>
      ) : null}
      <Note tone="bad">
        Forgetting the wallet here deletes the encrypted copy in this browser. If the words are on paper, you can
        import them again. If they are not, the keys are gone. Type FORGET to confirm.
      </Note>
      <Field label="Type FORGET">
        <TextInput value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" />
      </Field>
      <Button tone="danger" disabled={confirm !== 'FORGET'} onClick={onForget}>
        Forget this browser wallet
      </Button>
    </Card>
  );
}
