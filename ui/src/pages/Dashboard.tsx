/**
 * Investor overview: property, ownership, claimable rent, and payouts.
 * ETH funding stays available on local Anvil only.
 */
import { useEffect, useState } from 'react';
import { formatEther, type Address } from 'viem';
import { fundAddress, FAUCET_MAX_WEI } from '@wallet/anvilDev';
import { parseEthAmount } from '@wallet/amounts';
import { makePublicClient } from '@wallet/client';
import {
  encodeClaimEth,
  encodeClaimStable,
  prepareCall,
  propertyShareAbi,
  readPropertyOverview,
  type PropertyOverview,
} from '@wallet/property';
import { formatEthDisplay, formatSharePercent, formatStableDisplay, holderSlice } from '@wallet/payout';
import { useApp } from '../state';
import { RentChart } from '../components/RentChart';
import { Review, TxResult } from '../components/Review';
import { Button, Card, Empty, Field, HelpTip, Kpi, Note, PageHeader, Spinner, TextInput } from '../components/ui';
import { readDashboard, readPropertyChain, type ClaimRow, type HolderRow, type RentPoint } from '../lib/chainReads';
import { friendlyError } from '../lib/errors';
import { shortEth } from '../lib/format';
import { SEPOLIA_REFERENCE } from '../lib/reference';
import { accountAt } from '../lib/session';
import { parseUserAddress } from '@wallet/address';
import { useTx } from '../lib/useTx';

export function DashboardPage() {
  const app = useApp();
  const tx = useTx();
  const unlocked = app.wallet.status === 'unlocked' ? app.wallet : null;
  const chainId = app.live.chainId;
  const book = chainId ? app.contractsFor(chainId) : {};
  const [eth, setEth] = useState<string>('…');
  const [overview, setOverview] = useState<PropertyOverview | null>(null);
  const [holders, setHolders] = useState<HolderRow[]>([]);
  const [rent, setRent] = useState<RentPoint[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fundOpen, setFundOpen] = useState(false);
  const [fundAmount, setFundAmount] = useState('1');
  const [funding, setFunding] = useState(false);
  const [pasteProperty, setPasteProperty] = useState('');
  const [pasteStable, setPasteStable] = useState('');

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const config = app.getConfig();
        const liveBook = app.contractsFor(config.chain.id);
        const numbers = await readDashboard(config, unlocked.address, liveBook);
        if (cancelled) return;
        setEth(shortEth(numbers.ethWei));
        if (!liveBook.property) {
          setOverview(null);
          setHolders([]);
          setRent([]);
          setClaims([]);
          setError(null);
          return;
        }
        const next = await readPropertyOverview({
          config,
          property: { address: liveBook.property, source: 'this browser' },
          who: unlocked.address,
        });
        const chain = await readPropertyChain({
          config,
          property: liveBook.property,
          stablecoin: next.stablecoin,
          extraAddresses: [unlocked.address],
        });
        if (cancelled) return;
        setOverview(next);
        setHolders(chain.holders);
        setRent(chain.rent);
        setClaims(chain.claims);
        setError(chain.logError);
        if (!liveBook.stablecoin) app.rememberContracts(config.chain.id, { stablecoin: next.stablecoin });
      } catch (caught) {
        if (!cancelled) setError(friendlyError(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app, unlocked, book.property, book.stablecoin]);

  async function fund() {
    if (!unlocked) return;
    setFunding(true);
    setError(null);
    try {
      const config = app.getConfig();
      const value = parseEthAmount(fundAmount);
      if (value > FAUCET_MAX_WEI) throw new Error('The Anvil faucet sends at most 100 ETH per click. Nothing was sent.');
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

  function savePasted() {
    if (!chainId) return;
    try {
      app.rememberContracts(chainId, {
        property: parseUserAddress(pasteProperty),
        stablecoin: pasteStable.trim() ? parseUserAddress(pasteStable) : undefined,
      });
      setError(null);
    } catch (caught) {
      setError(friendlyError(caught));
    }
  }

  function useReference() {
    if (!chainId || chainId !== SEPOLIA_REFERENCE.chainId) return;
    app.rememberContracts(chainId, {
      property: SEPOLIA_REFERENCE.property,
      stablecoin: SEPOLIA_REFERENCE.stablecoin,
      vault: SEPOLIA_REFERENCE.vault,
    });
    setError(null);
  }

  const anvilReady = app.network.choice === 'anvil' && app.live.connected && app.live.chainId === 31337;
  const showForms = tx.phase.step === 'form' || tx.phase.step === 'error' || tx.phase.step === 'preparing';

  return (
    <div className="space-y-4">
      <PageHeader kicker="Portfolio" title={overview?.propertyName ?? 'Overview'} />
      {error ? <Note tone="bad">{error}</Note> : null}
      {loading ? <Spinner label="Reading the portfolio…" /> : null}

      {tx.phase.step === 'review' ? <Review preview={tx.phase.ready.preview} busy={false} onBack={tx.reset} onConfirm={tx.confirm} /> : null}
      {tx.phase.step === 'pending' ? <TxResult status="pending" hash={tx.phase.hash} onDone={tx.reset} /> : null}
      {tx.phase.step === 'done' ? <TxResult status={tx.phase.status} hash={tx.phase.hash} onDone={tx.reset} /> : null}

      {!overview && !loading ? (
        <Card className="space-y-3">
          <Empty title="No property on this network">
            Paste a PropertyShare address, or load the published Sepolia deployment. Anvil deployments stay on the Admin page.
          </Empty>
          {chainId === SEPOLIA_REFERENCE.chainId ? (
            <Button onClick={useReference}>Load Sepolia reference</Button>
          ) : null}
          <Field label="PropertyShare address">
            <TextInput value={pasteProperty} onChange={(event) => setPasteProperty(event.target.value)} className="font-mono" spellCheck={false} />
          </Field>
          <Field label="Stablecoin address" hint="Optional. Read from the property when left blank.">
            <TextInput value={pasteStable} onChange={(event) => setPasteStable(event.target.value)} className="font-mono" spellCheck={false} />
          </Field>
          <Button tone="quiet" onClick={savePasted}>Save addresses</Button>
        </Card>
      ) : null}

      {overview ? (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{overview.symbol}</p>
                <p className="mt-1 text-sm text-muted">{overview.streetAddress}</p>
                <p className="mt-2 break-all font-mono text-xs text-muted">{overview.address}</p>
              </div>
              <p className="text-sm text-muted">
                Supply <span className="num font-medium text-ink">{overview.totalSupply.toString()}</span> shares
              </p>
            </div>
          </Card>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Ownership"
              value={formatSharePercent(overview.yourShares, overview.totalSupply)}
              detail={`${overview.yourShares.toString()} shares`}
            />
            <Kpi label="Claimable ETH" value={formatEthDisplay(overview.claimableEthWei)} />
            <Kpi
              label={`Claimable ${overview.stableSymbol}`}
              value={formatStableDisplay(overview.claimableStableBase, overview.stableSymbol)}
            />
            <Kpi
              label="Wallet ETH"
              value={eth}
              detail={
                anvilReady ? (
                  <button type="button" className="font-medium text-moss" onClick={() => setFundOpen((open) => !open)}>
                    Fund from Anvil
                  </button>
                ) : (
                  'Available for fees'
                )
              }
            />
          </div>
          {fundOpen ? (
            <Card className="space-y-3">
              <h2 className="text-lg font-semibold">Anvil ETH</h2>
              <Field label="ETH" hint="Sent from Anvil’s published account. At most 100 ETH. Local chain 31337 only.">
                <TextInput value={fundAmount} onChange={(event) => setFundAmount(event.target.value)} inputMode="decimal" />
              </Field>
              <div className="flex gap-2">
                <Button onClick={() => void fund()} disabled={funding}>{funding ? 'Sending…' : `Send ${fundAmount || '0'} ETH`}</Button>
                <Button tone="quiet" onClick={() => setFundOpen(false)}>Cancel</Button>
              </div>
            </Card>
          ) : null}

          {showForms ? (
            <Card className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Claim rent</h2>
                <HelpTip text="A claim pays this account the rent its shares have earned. The transaction value is 0. The network fee is still paid in ETH." />
              </div>
              {tx.phase.step === 'error' ? <Note tone="bad">{tx.phase.message}</Note> : null}
              {tx.phase.step === 'preparing' ? <Spinner label="Preparing the transaction…" /> : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={overview.claimableEthWei === 0n || !unlocked}
                  onClick={() => void tx.review(async () => {
                    const config = app.getConfig();
                    const signer = accountAt(unlocked!.index);
                    return prepareCall({
                      config,
                      account: signer.account,
                      path: signer.path,
                      to: overview.address,
                      data: encodeClaimEth(),
                      valueWei: 0n,
                      action: 'Claim ETH rent',
                      note: 'Value is 0. The contract sends the ETH during the call.',
                      simulate: () => makePublicClient(config).simulateContract({
                        address: overview.address,
                        abi: propertyShareAbi,
                        functionName: 'claimEth',
                        account: signer.account,
                      }),
                    });
                  }, 'Claimed ETH rent', formatEthDisplay(overview.claimableEthWei))}
                >
                  Claim {formatEthDisplay(overview.claimableEthWei)}
                </Button>
                <Button
                  tone="quiet"
                  disabled={overview.claimableStableBase === 0n || !unlocked}
                  onClick={() => void tx.review(async () => {
                    const config = app.getConfig();
                    const signer = accountAt(unlocked!.index);
                    return prepareCall({
                      config,
                      account: signer.account,
                      path: signer.path,
                      to: overview.address,
                      data: encodeClaimStable(),
                      valueWei: 0n,
                      action: 'Claim stablecoin rent',
                      note: 'Value is 0. The stablecoin moves inside the call.',
                      simulate: () => makePublicClient(config).simulateContract({
                        address: overview.address,
                        abi: propertyShareAbi,
                        functionName: 'claimStable',
                        account: signer.account,
                      }),
                    });
                  }, 'Claimed stablecoin rent', formatStableDisplay(overview.claimableStableBase, overview.stableSymbol))}
                >
                  Claim {formatStableDisplay(overview.claimableStableBase, overview.stableSymbol)}
                </Button>
              </div>
            </Card>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-2">
            <Card>
              <h2 className="text-lg font-semibold">Rent deposits</h2>
              <div className="mt-3">
                <RentChart points={rent} />
              </div>
              <p className="mt-4 text-xs text-muted">
                Deposited {formatEthDisplay(overview.ethDepositedWei)} and {formatStableDisplay(overview.stableDepositedBase, overview.stableSymbol)}.
                Claimed {formatEthDisplay(overview.ethClaimedWei)} and {formatStableDisplay(overview.stableClaimedBase, overview.stableSymbol)}.
              </p>
            </Card>
            <Card>
              <h2 className="text-lg font-semibold">Payout history</h2>
              {claims.length === 0 ? (
                <div className="mt-3">
                  <Empty title="No payouts in recent blocks">Claims on this property show up here when the node still has the logs.</Empty>
                </div>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-[11px] uppercase tracking-wide text-muted">
                      <tr>
                        <th className="py-2 font-medium">When</th>
                        <th className="py-2 font-medium">Holder</th>
                        <th className="py-2 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {claims.map((row) => (
                        <tr key={`${row.hash}-${row.asset}`} className="border-t border-line">
                          <td className="py-2 pr-3 text-muted">{row.when || '—'}</td>
                          <td className="py-2 pr-3 font-mono text-xs">
                            {row.holder.slice(0, 6)}…{row.holder.slice(-4)}
                            {unlocked && row.holder.toLowerCase() === unlocked.address.toLowerCase() ? ' · You' : ''}
                          </td>
                          <td className="num py-2 text-right">{row.label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <Card>
            <h2 className="text-lg font-semibold">Ownership</h2>
            {holders.length === 0 ? (
              <div className="mt-3">
                <Empty title="No holders in recent logs">Your share balance above is still a direct read.</Empty>
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-muted">
                    <tr>
                      <th className="py-2 font-medium">Address</th>
                      <th className="py-2 text-right font-medium">Shares</th>
                      <th className="py-2 text-right font-medium">Ownership</th>
                      <th className="py-2 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holders.map((row) => {
                      const slice = holderSlice(row.address, row.shares, overview.totalSupply);
                      return (
                        <tr key={row.address} className="border-t border-line">
                          <td className="py-2 pr-3 font-mono text-xs">
                            {row.address.slice(0, 6)}…{row.address.slice(-4)}
                            {unlocked && row.address.toLowerCase() === unlocked.address.toLowerCase() ? ' · You' : ''}
                          </td>
                          <td className="num py-2 text-right">{row.shares.toString()}</td>
                          <td className="num py-2 text-right">{slice.percent}</td>
                          <td className="py-2 text-right text-muted">{row.allowed ? 'Allowed' : 'Frozen'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
