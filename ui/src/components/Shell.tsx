/**
 * The frame around the unlocked wallet: the warning, the network, the
 * account, and the screen you picked.
 *
 * Lock drops the phrase from memory. It does not delete the encrypted copy.
 */
import {
  BookOpen,
  Building2,
  LayoutDashboard,
  Lock,
  Moon,
  PenLine,
  PiggyBank,
  Send,
  Sun,
  Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { redactRpcUrl } from '@wallet/safety';
import { useApp, type PageId } from '../state';
import { LearnDrawer } from './LearnDrawer';
import { Banner, Button, Note, TextInput } from './ui';
import { DashboardPage } from '../pages/Dashboard';
import { AccountsPage } from '../pages/Accounts';
import { SendPage } from '../pages/Send';
import { SignPage } from '../pages/Sign';
import { VaultPage } from '../pages/Vault';
import { PropertyPage } from '../pages/Property';

const NAV: { id: PageId; label: string; icon: typeof Wallet }[] = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'accounts', label: 'Accounts', icon: Wallet },
  { id: 'send', label: 'Send', icon: Send },
  { id: 'sign', label: 'Sign', icon: PenLine },
  { id: 'vault', label: 'Vault', icon: PiggyBank },
  { id: 'property', label: 'Property', icon: Building2 },
];

export function Shell() {
  const app = useApp();
  const [networkOpen, setNetworkOpen] = useState(false);
  const unlocked = app.wallet.status === 'unlocked' ? app.wallet : null;

  return (
    <div className="min-h-screen">
      <Banner />
      <header className="border-b border-line bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="mr-auto">
            <p className="font-serif text-xl leading-none">Learning wallet</p>
            <p className="text-xs text-muted">A textbook you can click</p>
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
            <button
              type="button"
              className="hidden rounded-full border border-line px-3 py-1.5 font-mono text-xs sm:inline"
              onClick={() => app.setPage('accounts')}
            >
              {unlocked.address.slice(0, 6)}…{unlocked.address.slice(-4)}
            </button>
          ) : null}
          <Button tone="ghost" onClick={() => app.setLearnOpen(true)} aria-label="Open the lesson">
            <BookOpen size={18} /> Learn
          </Button>
          <Button tone="ghost" onClick={app.toggleTheme} aria-label="Toggle color theme">
            {app.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </Button>
          <Button tone="quiet" onClick={app.lock}>
            <Lock size={16} /> Lock
          </Button>
        </div>
        {networkOpen ? <NetworkPanel onClose={() => setNetworkOpen(false)} /> : null}
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = app.page === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => app.setPage(item.id)}
                className={
                  active
                    ? 'inline-flex items-center gap-2 rounded-full bg-moss px-3 py-1.5 text-sm font-semibold text-moss-ink'
                    : 'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-muted hover:bg-card-2'
                }
              >
                <Icon size={16} /> {item.label}
              </button>
            );
          })}
        </nav>
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
        {app.live.error ? <Note tone="bad">{app.live.error}</Note> : null}
        <Page />
      </main>
      <LearnDrawer topic={app.learnTopic} open={app.learnOpen} onClose={() => app.setLearnOpen(false)} />
    </div>
  );
}

function Page(): ReactNode {
  const app = useApp();
  if (app.page === 'accounts') return <AccountsPage />;
  if (app.page === 'send') return <SendPage />;
  if (app.page === 'sign') return <SignPage />;
  if (app.page === 'vault') return <VaultPage />;
  if (app.page === 'property') return <PropertyPage />;
  return <DashboardPage />;
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
          <Button tone="ghost" onClick={() => app.setLearnOpen(true)}>
            Why two networks?
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
          <span className="mt-1 block text-muted">
            Default is http://127.0.0.1:8545. If you started Anvil with another port, change it here. The dev server,
            inside Ubuntu, is what actually calls this address.
          </span>
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
          <span className="mt-1 block text-muted">
            Often contains an API key. It stays in this browser. The box is hidden so a glance does not copy it. It is
            not written to git.
          </span>
        </label>
        <p className="text-sm text-muted">
          Status: {app.live.connected ? 'connected' : 'not connected'}. Chain id: {app.live.chainId ?? 'unknown'}.
          Showing {shown || 'no URL yet'}.
        </p>
      </div>
    </div>
  );
}
