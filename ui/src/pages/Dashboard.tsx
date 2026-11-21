/**
 * Home. ETH is a read of the chain. Mock dollars and shares are reads of
 * contracts, once this browser knows their addresses. The fund button exists
 * only for local Anvil, and the shared `fundAddress` refuses anything else.
 */
import { useEffect, useState } from 'react';
import { formatEther, type Address } from 'viem';
import { fundAddress, FAUCET_MAX_WEI } from '@wallet/anvilDev';
import { parseEthAmount } from '@wallet/amounts';
import { formatStableDisplay } from '@wallet/payout';
import { useApp } from '../state';
import { readDashboard, readHistory } from '../lib/chainReads';
import { friendlyError } from '../lib/errors';
import { shortEth, whenLabel } from '../lib/format';
import type { ActivityItem } from '../lib/storage';
import { Button, Card, Empty, Field, Note, Spinner, TextInput } from '../components/ui';

export function DashboardPage() {
  const app = useApp();
  const unlocked = app.wallet.status === 'unlocked' ? app.wallet : null;
  const [eth, setEth] = useState<string>('…');
  const [stable, setStable] = useState<string>('…');
  const [shares, setShares] = useState<string>('…');
  const [rows, setRows] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fundOpen, setFundOpen] = useState(false);
  const [fundAmount, setFundAmount] = useState('1');
  const [funding, setFunding] = useState(false);

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const config = app.getConfig();
        const book = app.contractsFor(config.chain.id);
        const numbers = await readDashboard(config, unlocked.address, book);
        const history = await readHistory({
          config,
          who: unlocked.address,
          vault: book.vault,
          property: book.property,
          local: app.activity,
        });
        if (cancelled) return;
        setEth(shortEth(numbers.ethWei));
        setStable(numbers.stableBase === null ? 'No token on this chain yet' : formatStableDisplay(numbers.stableBase, numbers.stableSymbol));
        setShares(numbers.shares === null ? 'No property on this chain yet' : `${numbers.shares.toString()} shares`);
        setRows(history);
        setError(null);
      } catch (caught) {
        if (!cancelled) setError(friendlyError(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app, unlocked]);

  async function fund() {
    if (!unlocked) return;
    setFunding(true);
    setError(null);
    try {
      const config = app.getConfig();
      const value = parseEthAmount(fundAmount);
      if (value > FAUCET_MAX_WEI) throw new Error('The learning faucet sends at most 100 ETH per click. Nothing was sent.');
      const hash = await fundAddress(config, unlocked.address as Address, value);
      app.rememberActivity({
        hash,
        chainId: config.chain.id,
        from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        to: unlocked.address,
        kind: 'fund',
        summary: 'Funded from Anvil’s published account',
        amount: `${formatEther(value)} ETH`,
        status: 'confirmed',
        createdAt: new Date().toISOString(),
      });
      app.bump();
      setFundOpen(false);
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setFunding(false);
    }
  }

  const anvilReady = app.network.choice === 'anvil' && app.live.connected && app.live.chainId === 31337;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-4xl">Home</h1>
        <p className="text-sm text-muted">These numbers are answers from the node. Refreshing the page asks again.</p>
      </div>
      {error ? <Note tone="bad">{error}</Note> : null}
      {loading ? <Spinner label="Asking the node…" /> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">ETH</p>
          <p className="num mt-2 font-serif text-3xl">{eth}</p>
          {anvilReady ? (
            <Button className="mt-4" tone="quiet" onClick={() => setFundOpen((open) => !open)}>
              Fund from Anvil
            </Button>
          ) : (
            <p className="mt-3 text-xs text-muted">Fund from Anvil appears only when this page is talking to local chain id 31337.</p>
          )}
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Mock stablecoin</p>
          <p className="num mt-2 font-serif text-3xl">{stable}</p>
          <button type="button" className="mt-3 text-sm text-moss" onClick={() => app.setPage('investor')}>
            Investor view
          </button>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Property shares</p>
          <p className="num mt-2 font-serif text-3xl">{shares}</p>
          <p className="mt-3 text-xs text-muted">1,000,000 shares means 100% inside the lesson. It is not a deed.</p>
        </Card>
      </div>
      {fundOpen ? (
        <Card className="space-y-3">
          <h2 className="font-serif text-2xl">Play ETH from Anvil</h2>
          <Note>
            This spends from Anvil’s published textbook key, the one printed in the Anvil window. It refuses to run
            unless the node is on this computer and reports chain id 31337. The most it will send is 100 ETH.
          </Note>
          <Field label="ETH to send this address" hint="1 is a good first amount. Leave room for fees later.">
            <TextInput value={fundAmount} onChange={(event) => setFundAmount(event.target.value)} inputMode="decimal" />
          </Field>
          <div className="flex gap-2">
            <Button onClick={() => void fund()} disabled={funding}>{funding ? 'Sending…' : `Send ${fundAmount || '0'} ETH`}</Button>
            <Button tone="quiet" onClick={() => setFundOpen(false)}>Cancel</Button>
          </div>
        </Card>
      ) : null}
      <Card>
        <h2 className="font-serif text-2xl">Recent activity</h2>
        {rows.length === 0 ? (
          <div className="mt-3">
            <Empty title="No transactions yet">
              A send, a vault deposit, a share transfer, or a fund from Anvil will show up here. The list is this
              page’s notebook plus logs the node still has.
            </Empty>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {rows.map((row) => (
              <li key={`${row.hash}-${row.kind}`} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-semibold">{row.summary}</p>
                  <p className="font-mono text-xs text-muted">{row.hash}</p>
                </div>
                <div className="text-right">
                  <p className="num">{row.amount}</p>
                  <p className="text-xs text-muted">{row.status} · {whenLabel(row.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
