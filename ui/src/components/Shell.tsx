/**
 * App shell: sidebar on desktop, bottom nav on a phone, network and account
 * controls in the top bar. Lock drops the secret from memory.
 */
import {
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
import { Button, Note, TestnetBadge, TextInput } from './ui';
import { DashboardPage } from '../pages/Dashboard';
import { AccountsPage } from '../pages/Accounts';
import { SendPage } from '../pages/Send';
import { SignPage } from '../pages/Sign';
import { VaultPage } from '../pages/Vault';
import { PropertyPage } from '../pages/Property';

const GROUPS: { label: string; items: { id: PageId; label: string; icon: typeof Wallet }[] }[] = [
  { label: 'Portfolio', items: [{ id: 'dashboard', label: 'Overview', icon: LayoutDashboard }] },
  {
    label: 'Wallet',
    items: [
      { id: 'accounts', label: 'Accounts', icon: Wallet },
      { id: 'send', label: 'Send', icon: Send },
      { id: 'sign', label: 'Sign', icon: PenLine },
    ],
  },
  {
    label: 'Operator',
    items: [
      { id: 'property', label: 'Admin', icon: Building2 },
      { id: 'vault', label: 'Vault', icon: PiggyBank },
    ],
  },
];

const FLAT = GROUPS.flatMap((group) => group.items);

export function Shell() {
  const app = useApp();
  const [networkOpen, setNetworkOpen] = useState(false);
  const unlocked = app.wallet.status === 'unlocked' ? app.wallet : null;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="hidden border-r border-line bg-card lg:flex lg:flex-col">
        <div className="flex items-center justify-between px-5 py-5">
          <div>
            <p className="text-sm font-semibold tracking-tight">PropertyShare</p>
            <p className="text-xs text-muted">Real estate tokens</p>
          </div>
        </div>
        <nav className="flex-1 space-y-6 px-3">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{group.label}</p>
              <div className="mt-1 space-y-0.5">
                {group.items.map((item) => (
                  <NavButton key={item.id} id={item.id} label={item.label} icon={item.icon} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <p className="text-sm font-semibold tracking-tight lg:hidden">PropertyShare</p>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <TestnetBadge />
              <button
                type="button"
                className="rounded-full border border-line bg-card px-3 py-1.5 text-left text-xs"
                onClick={() => setNetworkOpen((open) => !open)}
              >
                <span className={app.live.connected ? 'text-moss' : 'text-danger'}>● </span>
                <span className="font-medium">{app.network.choice === 'anvil' ? 'Anvil' : 'Sepolia'}</span>
                <span className="text-muted"> · {app.live.connected ? app.live.chainId : 'offline'}</span>
              </button>
              {unlocked ? (
                <button
                  type="button"
                  className="max-w-[9.5rem] truncate rounded-full border border-line bg-card px-3 py-1.5 font-mono text-xs"
                  onClick={() => app.setPage('accounts')}
                  title={unlocked.address}
                >
                  {unlocked.address.slice(0, 6)}…{unlocked.address.slice(-4)}
                </button>
              ) : null}
              <Button tone="ghost" onClick={app.toggleTheme} aria-label="Toggle color theme">
                {app.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </Button>
              <Button tone="quiet" onClick={app.lock}>
                <Lock size={16} /> Lock
              </Button>
            </div>
          </div>
          {networkOpen ? <NetworkPanel onClose={() => setNetworkOpen(false)} /> : null}
        </header>
        <main className="mx-auto max-w-6xl space-y-4 px-4 py-6 pb-24 lg:pb-8">
          {app.notice ? (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3 text-sm">
              <p>{app.notice}</p>
              <button type="button" className="text-muted" onClick={app.clearNotice}>
                Close
              </button>
            </div>
          ) : null}
          {app.live.error ? <Note tone="bad">{app.live.error}</Note> : null}
          <Page />
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-20 flex gap-1 overflow-x-auto border-t border-line bg-card px-2 py-2 lg:hidden">
          {FLAT.map((item) => (
            <NavButton key={item.id} id={item.id} label={item.label} icon={item.icon} compact />
          ))}
        </nav>
      </div>
    </div>
  );
}

function NavButton({
  id,
  label,
  icon: Icon,
  compact = false,
}: {
  id: PageId;
  label: string;
  icon: typeof Wallet;
  compact?: boolean;
}) {
  const app = useApp();
  const active = app.page === id;
  return (
    <button
      type="button"
      onClick={() => app.setPage(id)}
      className={
        compact
          ? active
            ? 'inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-moss px-2.5 py-1.5 text-xs font-medium text-moss-ink'
            : 'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted'
          : active
            ? 'flex w-full items-center gap-2 rounded-lg bg-moss px-3 py-2 text-sm font-medium text-moss-ink'
            : 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-card-2'
      }
    >
      <Icon size={16} /> {label}
    </button>
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
    <div className="px-4 pb-4">
      <div className="space-y-3 rounded-xl border border-line bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <Button
            tone={app.network.choice === 'anvil' ? 'primary' : 'quiet'}
            onClick={() => app.setNetwork({ ...app.network, choice: 'anvil', anvilUrl })}
          >
            Anvil
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
          <span className="font-medium">Anvil URL</span>
          <TextInput
            className="mt-1"
            value={anvilUrl}
            onChange={(event) => setAnvilUrl(event.target.value)}
            onBlur={() => app.setNetwork({ ...app.network, anvilUrl })}
            spellCheck={false}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Sepolia RPC URL</span>
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
          <span className="mt-1 block text-xs text-muted">Stored in this browser. Hidden so it is not copied by a glance.</span>
        </label>
        <p className="text-xs text-muted">
          {app.live.connected ? 'Connected' : 'Not connected'}. Chain {app.live.chainId ?? 'unknown'}. {shown || 'No URL yet'}.
        </p>
      </div>
    </div>
  );
}
