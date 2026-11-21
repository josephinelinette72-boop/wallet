/**
 * The investor view.
 *
 * One question: what do I own, and what rent can I take? The manager's tools
 * (deploy, allowlist, deposits) are not on this page. They live under Admin,
 * and the contract only accepts them from the manager address.
 *
 * Claim is the one write. It uses the same `claimEth` call as the CLI.
 */
import { useEffect, useState } from 'react';
import { encodeClaimEth, encodeClaimStable, prepareCall, propertyShareAbi, readPropertyOverview, type PropertyOverview } from '@wallet/property';
import { makePublicClient } from '@wallet/client';
import {
  capTableSummary,
  formatEthDisplay,
  formatStableDisplay,
  holderSlice,
  rentEarnedToDate,
  sumAmounts,
} from '@wallet/payout';
import { useApp } from '../state';
import { LearnTip } from '../components/LearnTip';
import { RentChart } from '../components/RentChart';
import { Review, TxResult } from '../components/Review';
import { Button, Card, Empty, Note, Spinner } from '../components/ui';
import { readPropertyChain, type ClaimPoint, type HolderRow, type RentPoint } from '../lib/chainReads';
import { friendlyError } from '../lib/errors';
import { accountAt } from '../lib/session';
import { useTx } from '../lib/useTx';

export function InvestorPage() {
  const app = useApp();
  const tx = useTx();
  const unlocked = app.wallet.status === 'unlocked' ? app.wallet : null;
  const chainId = app.live.chainId;
  const property = chainId ? app.contractsFor(chainId).property : undefined;
  const [overview, setOverview] = useState<PropertyOverview | null>(null);
  const [holders, setHolders] = useState<HolderRow[]>([]);
  const [rent, setRent] = useState<RentPoint[]>([]);
  const [claims, setClaims] = useState<ClaimPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!unlocked || !property) {
      setOverview(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const config = app.getConfig();
        const next = await readPropertyOverview({
          config,
          property: { address: property, source: 'this browser' },
          who: unlocked.address,
        });
        const chain = await readPropertyChain({
          config,
          property,
          stablecoin: next.stablecoin,
          extraAddresses: [unlocked.address],
        });
        if (cancelled) return;
        setOverview(next);
        setHolders(chain.holders);
        setRent(chain.rent);
        setClaims(chain.claims.filter((claim) => claim.holder.toLowerCase() === unlocked.address.toLowerCase()));
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
  }, [app, unlocked, property]);

  const showForm = tx.phase.step === 'form' || tx.phase.step === 'error' || tx.phase.step === 'preparing';
  const myClaimsEth = sumAmounts(claims.filter((claim) => claim.asset === 'eth').map((claim) => claim.amount));
  const earned = overview ? rentEarnedToDate(myClaimsEth, overview.claimableEthWei) : 0n;
  const summary = overview ? capTableSummary(holders, overview.totalSupply) : null;
  const mine = overview ? holderSlice(overview.you, overview.yourShares, overview.totalSupply) : null;

  async function claimEth() {
    if (!unlocked || !overview) return;
    await tx.review(async () => {
      const config = app.getConfig();
      const signer = accountAt(unlocked.index);
      return prepareCall({
        config,
        account: signer.account,
        path: signer.path,
        to: overview.address,
        data: encodeClaimEth(),
        valueWei: 0n,
        action: 'Claim the ETH rent your shares have earned',
        note: 'The transaction value is 0. The contract sends the rent during the call. You still pay the fee.',
        simulate: () =>
          makePublicClient(config).simulateContract({
            address: overview.address,
            abi: propertyShareAbi,
            functionName: 'claimEth',
            account: signer.account,
          }),
      });
    }, 'Claimed ETH rent', overview ? formatEthDisplay(overview.claimableEthWei) : undefined);
  }

  async function claimStable() {
    if (!unlocked || !overview || overview.claimableStableBase === 0n) return;
    await tx.review(async () => {
      const config = app.getConfig();
      const signer = accountAt(unlocked.index);
      return prepareCall({
        config,
        account: signer.account,
        path: signer.path,
        to: overview.address,
        data: encodeClaimStable(),
        valueWei: 0n,
        action: 'Claim the mock-dollar rent your shares have earned',
        note: 'The transaction value is 0. The dollars move inside the call.',
        simulate: () =>
          makePublicClient(config).simulateContract({
            address: overview.address,
            abi: propertyShareAbi,
            functionName: 'claimStable',
            account: signer.account,
          }),
      });
    }, 'Claimed mock-dollar rent');
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-4xl">Your rental</h1>
        <p className="text-sm text-muted">What you own, and the rent you can take.</p>
      </div>
      <LearnTip topic="investor" />
      {error ? <Note tone="bad">{error}</Note> : null}
      {loading ? <Spinner label="Reading the property…" /> : null}

      {tx.phase.step === 'review' ? (
        <Review preview={tx.phase.ready.preview} busy={false} onBack={tx.reset} onConfirm={tx.confirm} />
      ) : null}
      {tx.phase.step === 'pending' ? <TxResult status="pending" hash={tx.phase.hash} onDone={tx.reset} /> : null}
      {tx.phase.step === 'done' ? <TxResult status={tx.phase.status} hash={tx.phase.hash} onDone={tx.reset} /> : null}

      {!property && !loading ? (
        <Empty title="No rental on this chain yet">
          When a manager deploys the property, it will show up here. If you are the manager, open Admin and deploy it.
        </Empty>
      ) : null}

      {overview && mine && summary ? (
        <>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{overview.symbol}</p>
            <h2 className="font-serif text-3xl">{overview.propertyName}</h2>
            <p className="mt-1 text-sm text-muted">{overview.streetAddress}</p>
            <p className="mt-3 text-sm">{overview.totalSupply.toString()} shares in total. Together they mean 100%.</p>
          </Card>

          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">My shares</p>
              <p className="num mt-2 font-serif text-4xl">{mine.percent}</p>
              <p className="text-sm text-muted">{overview.yourShares.toString()} of {overview.totalSupply.toString()}</p>
            </Card>
            <Card className="md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Rent I can claim</p>
              <p className="num mt-2 font-serif text-4xl">{formatEthDisplay(overview.claimableEthWei)}</p>
              <p className="text-sm text-muted">
                Earned to date {formatEthDisplay(earned)}. That is rent already paid plus rent still waiting.
              </p>
              {showForm ? (
                <Button className="mt-4" onClick={() => void claimEth()} disabled={overview.claimableEthWei === 0n}>
                  {overview.claimableEthWei === 0n ? 'Nothing to claim' : `Claim ${formatEthDisplay(overview.claimableEthWei)}`}
                </Button>
              ) : null}
              {overview.claimableStableBase > 0n && showForm ? (
                <Button className="mt-2" tone="quiet" onClick={() => void claimStable()}>
                  Claim {formatStableDisplay(overview.claimableStableBase, overview.stableSymbol)}
                </Button>
              ) : null}
            </Card>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Rent deposited</p>
              <p className="num mt-2 font-serif text-2xl">{formatEthDisplay(overview.ethDepositedWei)}</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Investors</p>
              <p className="num mt-2 font-serif text-2xl">{summary.investors}</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Largest slice</p>
              <p className="num mt-2 font-serif text-2xl">{summary.largestPercent}</p>
            </Card>
          </div>

          <Card>
            <h2 className="font-serif text-2xl">Who holds shares</h2>
            <ul className="mt-3 space-y-2">
              {holders.map((row) => {
                const slice = holderSlice(row.address, row.shares, overview.totalSupply);
                const mineRow = row.address.toLowerCase() === overview.you.toLowerCase();
                return (
                  <li key={row.address} className="flex flex-wrap justify-between gap-2 text-sm">
                    <span className="break-all font-mono text-xs">{mineRow ? 'You' : row.address}</span>
                    <span className="num">{slice.percent}</span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <h2 className="font-serif text-2xl">Rent paid into the property</h2>
            <div className="mt-3">
              <RentChart points={rent} />
            </div>
            <h3 className="mt-6 font-semibold">My payouts</h3>
            {claims.length === 0 ? (
              <p className="mt-2 text-sm text-muted">You have not claimed rent yet.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {claims.map((claim) => (
                  <li key={claim.hash} className="flex justify-between gap-3">
                    <span>{claim.label}</span>
                    <span className="truncate font-mono text-xs text-muted">{claim.hash}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
