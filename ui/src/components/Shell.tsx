/**
 * The frame around the unlocked wallet.
 *
 * Three places, and only three, in the top bar:
 *   Investor  — what you own and the rent you can claim
 *   Admin     — manager tools, hidden from everyone else by the contract role
 *   Wallet    — accounts, send, sign, and the piggy bank
 *
 * The account menu switches which address signs. The badge next to it says
 * Admin or Investor once a property exists. Lock drops the phrase from memory.
 */
import { Lock, Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { redactRpcUrl } from '@wallet/safety';
import { propertyRole } from '@wallet/roles';
import { readPropertyOverview } from '@wallet/property';
import { useApp, type PageId } from '../state';
import { Banner, Button, TextInput } from './ui';
import { InvestorPage } from '../pages/Investor';
import { PropertyPage } from '../pages/Property';
import { DashboardPage } from '../pages/Dashboard';
import { AccountsPage } from '../pages/Accounts';
import { SendPage } from '../pages/Send';
import { SignPage } from '../pages/Sign';
import { VaultPage } from '../pages/Vault';
import { accountAt } from '../lib/session';

const AREAS: { id: PageId; label: string }[] = [
  { id: 'investor', label: 'Investor' },
  { id: 'admin', label: 'Admin' },
  { id: 'dashboard', label: 'Wallet' },
];

const WALLET_PAGES: { id: PageId; label: string }[] = [
  { id: 'dashboard', label: 'Balance' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'send', label: 'Send' },
  { id: 'sign', label: 'Sign' },
  { id: 'vault', label: 'Vault' },
];

function isWalletPage(page: PageId): boolean {
  return WALLET_PAGES.some((item) => item.id === page);
}

export function Shell() {
  const app = useApp();
  const [networkOpen, setNetworkOpen] = useState(false);
  const [roleLabel, setRoleLabel] = useState('No property yet');
  const unlocked = app.wallet.status === 'unlocked' ? app.wallet : null;
  const accounts = unlocked
    ? Array.from({ length: unlocked.accountCount }, (_, index) => accountAt(index))
    : [];

  useEffect(() => {
    if (!unlocked || !app.live.chainId) {
      setRoleLabel('No property yet');
      return;
    }
    const property = app.contractsFor(app.live.chainId).property;
    if (!property) {
      setRoleLabel('No property yet');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const overview = await readPropertyOverview({
          config: app.getConfig(),
          property: { address: property, source: 'this browser' },
          who: unlocked.address,
        });
        if (cancelled) return;
        const role = propertyRole({ propertyDeployed: true, youAreManager: overview.youAreManager });
        setRoleLabel(role === 'manager' ? 'Admin' : 'Investor');
      } catch {
        if (!cancelled) setRoleLabel('Role unknown');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app, unlocked]);

  return (
    <div className="min-h-screen">
      <Banner />
      <header className="border-b border-line bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="mr-auto">
            <p className="font-serif text-xl leading-none">Learning wallet</p>
            <p className="text-xs text-muted">Investor view and admin tools</p>
          </div>
          <button
            type="button"
            className="rounded-full border border-line bg-card-2 px-3 py-1.5 text-left text-xs"
            onClick={() => setNetworkOpen((open) => !open)}
          >
            <span className={app.live.connected ? 'text-moss' : 'text-danger'}>● </span>
            <span className="font-semibold">{app.network.choice === 'anvil' ? 'Anvil' : 'Sepolia'}</span>
            <span className="text-muted"> · {app.live.connected ? `chain ${app.live.chainId}` : 'offline'}</span>
          </button>
          {unlocked ? (
            <label className="flex items-center gap-2 text-xs">
              <span className="rounded-full bg-card-2 px-2 py-1 font-semibold">{roleLabel}</span>
              <select
                aria-label="Account"
                className="rounded-full border border-line bg-card px-2 py-1"
                value={unlocked.index}
                onChange={(event) => app.selectAccount(Number(event.target.value))}
              >
                {accounts.map((account) => (
                  <option key={account.path} value={account.path.split('/').pop()}>
                    Account {account.path.split('/').pop()} · {account.address.slice(0, 6)}…{account.address.slice(-4)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button tone="ghost" onClick={app.toggleTheme} aria-label="Toggle color theme">
            {app.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </Button>
          <Button tone="quiet" onClick={app.lock}>
            <Lock size={16} /> Lock
          </Button>
        </div>
        {networkOpen ? <NetworkPanel onClose={() => setNetworkOpen(false)} /> : null}
        <nav className="mx-auto flex max-w-6xl gap-2 px-4 pb-3">
          {AREAS.map((item) => {
            const active = item.id === 'dashboard' ? isWalletPage(app.page) : app.page === item.id;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => app.setPage(item.id)}
                className={
                  active
                    ? 'rounded-full bg-moss px-4 py-1.5 text-sm font-semibold text-moss-ink'
                    : 'rounded-full px-4 py-1.5 text-sm text-muted hover:bg-card-2'
                }
              >
                {item.label}
              </button>
            );
          })}
        </nav>
        {isWalletPage(app.page) ? (
          <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-3">
            {WALLET_PAGES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => app.setPage(item.id)}
                className={
                  app.page === item.id
                    ? 'rounded-full bg-card-2 px-3 py-1 text-sm font-semibold'
                    : 'rounded-full px-3 py-1 text-sm text-muted'
                }
              >
                {item.label}
              </button>
            ))}
          </nav>
        ) : null}
      </header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {app.notice ? (
          <div className="flex items-start justify-between gap-3 rounded-2xl bg-card-2 px-4 py-3 text-sm">
            <p>{app.notice}</p>
            <button type="button" className="text-muted" onClick={app.clearNotice}>
              Close
            </button>
          </div>
        ) : null}
        {app.live.error ? <p className="rounded-2xl bg-danger-bg px-3 py-2 text-sm text-danger">{app.live.error}</p> : null}
        <Page />
      </main>
    </div>
  );
}

function Page(): ReactNode {
  const app = useApp();
  if (app.page === 'admin') return <PropertyPage />;
  if (app.page === 'accounts') return <AccountsPage />;
  if (app.page === 'send') return <SendPage />;
  if (app.page === 'sign') return <SignPage />;
  if (app.page === 'vault') return <VaultPage />;
  if (app.page === 'dashboard') return <DashboardPage />;
  return <InvestorPage />;
}

function NetworkPanel({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [anvilUrl, setAnvilUrl] = useState(app.network.anvilUrl);
  const [sepoliaUrl, setSepoliaUrl] = useState(app.network.sepoliaUrl);
  let shown = app.network.choice === 'anvil' ? app.network.anvilUrl : app.network.sepoliaUrl;
  try {
    if (shown) shown = redactRpcUrl(shown);
  } catch {
    shown = 'That URL could not be read.';
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-4">
      <div className="space-y-3 rounded-3xl border border-line bg-card-2 p-4">
        <div className="flex flex-wrap gap-2">
          <Button
            tone={app.network.choice === 'anvil' ? 'primary' : 'quiet'}
            onClick={() => app.setNetwork({ ...app.network, choice: 'anvil', anvilUrl })}
          >
            Local Anvil
          </Button>
          <Button
            tone={app.network.choice === 'sepolia' ? 'primary' : 'quiet'}
            onClick={() => app.setNetwork({ ...app.network, choice: 'sepolia', anvilUrl, sepoliaUrl })}
          >
            Sepolia
          </Button>
          <Button tone="ghost" className="ml-auto" onClick={onClose}>
            Close
          </Button>
        </div>
        <label className="block text-sm">
          <span className="font-semibold">Anvil URL</span>
          <TextInput
            className="mt-1"
            value={anvilUrl}
            onChange={(event) => setAnvilUrl(event.target.value)}
            onBlur={() => app.setNetwork({ ...app.network, anvilUrl })}
            spellCheck={false}
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold">Sepolia RPC URL</span>
          <TextInput
            className="mt-1"
            type="password"
            value={sepoliaUrl}
            onChange={(event) => setSepoliaUrl(event.target.value)}
            onBlur={() => app.setNetwork({ ...app.network, sepoliaUrl })}
            placeholder="https://…"
            spellCheck={false}
            autoComplete="off"
          />
          <span className="mt-1 block text-muted">Hidden because it often contains an API key. It stays in this browser.</span>
        </label>
        <p className="text-sm text-muted">
          {app.live.connected ? 'Connected' : 'Not connected'}. Chain id {app.live.chainId ?? 'unknown'}. {shown || 'No URL yet'}.
        </p>
      </div>
    </div>
  );
}
