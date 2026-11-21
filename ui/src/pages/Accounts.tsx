/**
 * The addresses one phrase can grow.
 *
 * Switching accounts changes which key the next signature uses. It does not
 * move ETH. The path under each address is part of the backup, even though
 * most wallets hide it.
 */
import { useState } from 'react';
import { RAW_KEY_PATH } from '@wallet/account';
import { accountAt } from '../lib/session';
import { loadKeystore } from '../lib/storage';
import { useApp } from '../state';
import { QrAddress } from '../components/QrAddress';
import { Button, Card, Field, Note, TextInput } from '../components/ui';
import type { KeystoreFile } from '@wallet/keystoreCrypto';

export function AccountsPage() {
  const app = useApp();
  if (app.wallet.status !== 'unlocked') return null;
  const { index, accountCount, usesPassphrase, kind } = app.wallet;
  const accounts = Array.from({ length: kind === 'private-key' ? 1 : accountCount }, (_, item) => accountAt(item));
  const keyOnly = kind === 'private-key';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          {keyOnly
            ? 'This wallet is one imported private key. There is no recovery phrase, and further accounts cannot be derived from it. Send, the vault, and property sign with this address.'
            : 'Same recovery phrase, different last number in the path, different address. The selected one is what Send, the vault, and the property page will sign with.'}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          {accounts.map((account) => {
            const accountIndex = account.path === RAW_KEY_PATH ? 0 : Number(account.path.split('/').pop());
            const selected = accountIndex === index;
            return (
              <Card key={account.path} className={selected ? 'ring-2 ring-moss' : ''}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {selected ? 'Selected' : 'Not selected'}
                      {keyOnly ? ' · imported key' : ` · index ${accountIndex}`}
                    </p>
                    <p className="mt-1 break-all font-mono text-sm">{account.address}</p>
                    {keyOnly ? null : <p className="mt-1 font-mono text-xs text-muted">{account.path}</p>}
                  </div>
                  <div className="flex gap-2">
                    <CopyButton value={account.address} label="Copy address" />
                    {selected || keyOnly ? null : (
                      <Button tone="quiet" onClick={() => app.selectAccount(accountIndex)}>
                        Use this one
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
          {keyOnly ? (
            <Note>Additional accounts are available only for a recovery phrase.</Note>
          ) : (
            <Button tone="quiet" onClick={app.addAccount} disabled={accountCount >= 10}>
              {accountCount >= 10 ? 'Ten addresses is the limit' : 'Derive the next address'}
            </Button>
          )}
        </div>
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Receive</h2>
          <p className="text-sm text-muted">This code is the address. It is not the key.</p>
          <QrAddress address={accounts[index]?.address ?? app.wallet.address} />
          {keyOnly ? null : <p className="break-all font-mono text-xs">{accounts[index]?.path}</p>}
        </Card>
      </div>
      <KeystoreCard usesPassphrase={usesPassphrase} keyOnly={keyOnly} onForget={() => void app.forget()} />
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

function KeystoreCard({
  usesPassphrase,
  keyOnly,
  onForget,
}: {
  usesPassphrase: boolean;
  keyOnly: boolean;
  onForget: () => void;
}) {
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
      <h2 className="text-lg font-semibold">Keystore</h2>
      <p className="text-sm leading-relaxed text-muted">
        This is the browser’s copy of the CLI’s <span className="font-mono">keystore.json</span>. You should see
        scrypt, aes-256-gcm, a salt, an iv, a tag, and a ciphertext. You should not see the{' '}
        {keyOnly ? 'private key' : 'recovery phrase'}.
        {usesPassphrase ? ' usesPassphrase is yes. That flag is not the passphrase itself.' : ''}
      </p>
      <Button tone="quiet" onClick={() => void load()}>Show the locked fields</Button>
      {shown && file ? (
        <>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">kdf</dt><dd className="font-mono">{file.kdf} N={file.kdfparams.n}</dd></div>
            <div><dt className="text-muted">cipher</dt><dd className="font-mono">{file.cipher}</dd></div>
            <div><dt className="text-muted">secret</dt><dd>{file.secret === 'private-key' ? 'private key' : 'recovery phrase'}</dd></div>
            <div><dt className="text-muted">usesPassphrase</dt><dd>{file.usesPassphrase ? 'yes' : 'no'}</dd></div>
            <div><dt className="text-muted">created</dt><dd>{file.createdAt}</dd></div>
          </dl>
          <p className="break-all font-mono text-xs text-muted">ciphertext {file.ciphertext.slice(0, 24)}…</p>
          <Button tone="quiet" onClick={download}>Download keystore.json</Button>
        </>
      ) : null}
      <Note tone="bad">
        Forgetting the wallet here deletes the encrypted copy in this browser.
        {keyOnly
          ? ' Without the private key saved somewhere else, this account cannot be restored.'
          : ' If the recovery phrase is written down, you can import it again. If it is not, the keys are gone.'}{' '}
        Type FORGET to confirm.
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
