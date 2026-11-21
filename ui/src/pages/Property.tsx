/**
 * The pretend rental.
 *
 * Reads and writes go through `src/property.ts`, the same ABI and the same
 * transaction builder the CLI uses. Deploy is three transactions, each with
 * its own review: the play dollar, the share token, then a mint of play
 * dollars so a stablecoin rent deposit can be practiced.
 *
 * Shares are a classroom model of a security. There is no building.
 */
import { useEffect, useState } from 'react';
import { getContractAddress, keccak256, stringToHex, type Address, type Hex } from 'viem';
import { parseUserAddress } from '@wallet/address';
import { parseEthAmount, parseMockDollars, parseShareCount } from '@wallet/amounts';
import { makePublicClient } from '@wallet/client';
import {
  PLACEHOLDER_DOCUMENT,
  PLACEHOLDER_DOCUMENT_HASH,
  PLAY_DOLLARS_BASE_UNITS,
  encodeApproveStable,
  encodeClaimEth,
  encodeClaimStable,
  encodeDepositEth,
  encodeDepositStable,
  encodeMintStable,
  encodePropertyDeploy,
  encodeSetAllowed,
  encodeStablecoinDeploy,
  encodeTransferShares,
  mockStablecoinAbi,
  prepareCall,
  prepareDeploy,
  propertyShareAbi,
  readPropertyOverview,
  type PropertyOverview,
} from '@wallet/property';
import { formatEthDisplay, formatSharePercent, formatStableDisplay, holderSlice } from '@wallet/payout';
import { useApp } from '../state';
import { RentChart } from '../components/RentChart';
import { Review, TxResult } from '../components/Review';
import { Button, Card, Empty, Field, Note, Spinner, TextInput } from '../components/ui';
import { fetchBytecode } from '../lib/bytecode';
import { readPropertyChain, type HolderRow, type RentPoint } from '../lib/chainReads';
import { broadcastTransaction, type ReadyTransaction } from '../lib/broadcast';
import { friendlyError } from '../lib/errors';
import { accountAt } from '../lib/session';
import { useTx } from '../lib/useTx';

type DeployWhich = 'stable' | 'property' | 'mint';

type DeployPhase =
  | { step: 'idle' }
  | { step: 'busy'; label: string }
  | { step: 'review'; which: DeployWhich; ready: ReadyTransaction; stable?: Address; property?: Address }
  | { step: 'pending'; which: DeployWhich; hash?: Hex; stable?: Address; property?: Address }
  | { step: 'error'; message: string };

export function PropertyPage() {
  const app = useApp();
  const tx = useTx();
  const unlocked = app.wallet.status === 'unlocked' ? app.wallet : null;
  const chainId = app.live.chainId;
  const book = chainId ? app.contractsFor(chainId) : {};
  const [overview, setOverview] = useState<PropertyOverview | null>(null);
  const [holders, setHolders] = useState<HolderRow[]>([]);
  const [rent, setRent] = useState<RentPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deploy, setDeploy] = useState<DeployPhase>({ step: 'idle' });
  const [pasteProperty, setPasteProperty] = useState('');
  const [pasteStable, setPasteStable] = useState('');
  const [allowAddress, setAllowAddress] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [shares, setShares] = useState('250000');
  const [ethRent, setEthRent] = useState('1');
  const [dollarRent, setDollarRent] = useState('1000');
  const [docText, setDocText] = useState(PLACEHOLDER_DOCUMENT);

  useEffect(() => {
    if (!unlocked || !book.property) {
      setOverview(null);
      return;
    }
    const property = book.property;
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
        const extras = unlocked.kind === 'private-key'
          ? [unlocked.address]
          : Array.from({ length: unlocked.accountCount }, (_, index) => accountAt(index).address);
        const chain = await readPropertyChain({
          config,
          property,
          stablecoin: next.stablecoin,
          extraAddresses: extras,
        });
        if (cancelled) return;
        setOverview(next);
        setHolders(chain.holders);
        setRent(chain.rent);
        setError(null);
        if (!book.stablecoin) app.rememberContracts(config.chain.id, { stablecoin: next.stablecoin });
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

  async function startDeploy() {
    if (!unlocked) return;
    setError(null);
    setDeploy({ step: 'busy', label: 'Loading bytecode and asking Anvil for the first fee…' });
    try {
      const config = app.getConfig();
      const signer = accountAt(unlocked.index);
      const bytecode = await fetchBytecode('MockStablecoin');
      const ready = await prepareDeploy({
        config,
        account: signer.account,
        path: signer.path,
        data: encodeStablecoinDeploy(signer.address, undefined, bytecode),
        action: 'Deploy MockStablecoin, the play dollar for the rent lesson',
        note: 'The deployer becomes the only address that can mint. A real dollar does not work this way. This token is a prop.',
      });
      setDeploy({ step: 'review', which: 'stable', ready });
    } catch (caught) {
      setDeploy({ step: 'error', message: friendlyError(caught) });
    }
  }

  async function confirmDeploy() {
    if (!unlocked || deploy.step !== 'review') return;
    const current = deploy;
    setDeploy({ step: 'pending', which: current.which, stable: current.stable, property: current.property });
    try {
      const config = app.getConfig();
      const signer = accountAt(unlocked.index);
      const receipt = await broadcastTransaction({
        config,
        account: signer.account,
        ready: current.ready,
        onHash: (hash) => setDeploy({
          step: 'pending',
          which: current.which,
          hash,
          stable: current.stable,
          property: current.property,
        }),
      });
      if (receipt.status !== 'success') {
        setDeploy({ step: 'error', message: `The transaction reverted. Hash: ${receipt.transactionHash}` });
        return;
      }
      app.rememberActivity({
        hash: receipt.transactionHash,
        chainId: config.chain.id,
        from: unlocked.address,
        kind: `deploy-${current.which}`,
        summary: current.which === 'mint' ? 'Minted mock dollars' : `Deployed ${current.which === 'stable' ? 'the play dollar' : 'the property shares'}`,
        status: 'confirmed',
        createdAt: new Date().toISOString(),
      });

      if (current.which === 'stable') {
        const stable = receipt.contractAddress
          ?? getContractAddress({ from: signer.address, nonce: BigInt(current.ready.fields.nonce) });
        if (!stable) throw new Error('The play dollar deployment did not leave an address.');
        const propertyCode = await fetchBytecode('PropertyShare');
        const ready = await prepareDeploy({
          config,
          account: signer.account,
          path: signer.path,
          data: encodePropertyDeploy({ stablecoin: stable, admin: signer.address, bytecode: propertyCode }),
          action: 'Deploy PropertyShare and mint 1,000,000 shares to you',
          note: `You are the admin, the manager, and the first shareholder.\nDocument hash: ${PLACEHOLDER_DOCUMENT_HASH}\nThat hash is keccak256 of a sentence that says there is no deed. It is not a deed.`,
        });
        setDeploy({ step: 'review', which: 'property', ready, stable });
        return;
      }

      if (current.which === 'property') {
        const property = receipt.contractAddress
          ?? getContractAddress({ from: signer.address, nonce: BigInt(current.ready.fields.nonce) });
        const stable = current.stable;
        if (!property || !stable) throw new Error('The property deployment did not leave an address.');
        app.rememberContracts(config.chain.id, { property, stablecoin: stable });
        const ready = await prepareCall({
          config,
          account: signer.account,
          path: signer.path,
          to: stable,
          data: encodeMintStable(signer.address, PLAY_DOLLARS_BASE_UNITS),
          valueWei: 0n,
          action: 'Mint 1,000,000 mock dollars to yourself, so you can practice a stablecoin rent deposit',
          note: 'Value is 0. The new tokens are created inside the call. 1,000,000 dollars with 6 decimals is 1,000,000,000,000 base units.',
          simulate: () =>
            makePublicClient(config).simulateContract({
              address: stable,
              abi: mockStablecoinAbi,
              functionName: 'mint',
              args: [signer.address, PLAY_DOLLARS_BASE_UNITS],
              account: signer.account,
            }),
        });
        setDeploy({ step: 'review', which: 'mint', ready, stable, property });
        return;
      }

      setDeploy({ step: 'idle' });
      app.bump();
    } catch (caught) {
      setDeploy({ step: 'error', message: friendlyError(caught) });
    }
  }

  async function runAction(summary: string, build: () => Promise<ReadyTransaction>, amount?: string) {
    if (!unlocked) return;
    await tx.review(build, summary, amount);
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

  const showForms = tx.phase.step === 'form' || tx.phase.step === 'error' || tx.phase.step === 'preparing';
  const docHash = keccak256(stringToHex(docText));
  const docMatches = overview ? docHash.toLowerCase() === overview.documentHash.toLowerCase() : false;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-4xl">Property</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          1,000,000 shares stand in for 100% of a pretend rental. This is a classroom model of a security. There is no
          building, and this page is not an offer to sell anything.
        </p>
      </div>
      {error ? <Note tone="bad">{error}</Note> : null}
      {loading ? <Spinner label="Reading the property…" /> : null}

      {deploy.step === 'review' ? (
        <Review preview={deploy.ready.preview} busy={false} onBack={() => setDeploy({ step: 'idle' })} onConfirm={() => void confirmDeploy()} />
      ) : null}
      {deploy.step === 'pending' ? (
        <TxResult status="pending" hash={deploy.hash} onDone={() => setDeploy({ step: 'idle' })} note={`Step: ${deploy.which}. Deployment is three signatures: play dollar, shares, then a mint.`} />
      ) : null}
      {deploy.step === 'error' ? <Note tone="bad">{deploy.message}</Note> : null}
      {deploy.step === 'busy' ? <Spinner label={deploy.label} /> : null}

      {tx.phase.step === 'review' ? <Review preview={tx.phase.ready.preview} busy={false} onBack={tx.reset} onConfirm={tx.confirm} /> : null}
      {tx.phase.step === 'pending' ? <TxResult status="pending" hash={tx.phase.hash} onDone={tx.reset} /> : null}
      {tx.phase.step === 'done' ? <TxResult status={tx.phase.status} hash={tx.phase.hash} onDone={tx.reset} /> : null}

      {!overview && deploy.step === 'idle' ? (
        <Card className="space-y-3">
          <Empty title="No property on this chain yet">
            Deploy the play dollar and the share token from this page, or paste addresses from the forge script. Compile
            first with npm run property:build. Anvil must be running, and this account needs play ETH for the fees.
          </Empty>
          <Button onClick={() => void startDeploy()}>Review the first deployment</Button>
          <Field label="PropertyShare address">
            <TextInput value={pasteProperty} onChange={(event) => setPasteProperty(event.target.value)} className="font-mono" spellCheck={false} />
          </Field>
          <Field label="Mock stablecoin address (optional)" hint="If you leave this blank, the page reads it from the property.">
            <TextInput value={pasteStable} onChange={(event) => setPasteStable(event.target.value)} className="font-mono" spellCheck={false} />
          </Field>
          <Button tone="quiet" onClick={savePasted}>Use these addresses</Button>
        </Card>
      ) : null}

      {overview ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{overview.symbol}</p>
              <h2 className="font-serif text-3xl">{overview.propertyName}</h2>
              <p className="mt-1 text-sm text-muted">{overview.streetAddress}</p>
              <p className="mt-3 text-sm">{overview.tokenName}. Supply {overview.totalSupply.toString()} shares, 0 decimals.</p>
              <p className="mt-2 break-all font-mono text-xs text-muted">{overview.address}</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your position</p>
              <p className="num mt-2 font-serif text-3xl">{formatSharePercent(overview.yourShares, overview.totalSupply)}</p>
              <p className="text-sm text-muted">{overview.yourShares.toString()} shares</p>
              <p className="mt-3 text-sm">Claimable ETH: {formatEthDisplay(overview.claimableEthWei)}</p>
              <p className="text-sm">Claimable {overview.stableSymbol}: {formatStableDisplay(overview.claimableStableBase, overview.stableSymbol)}</p>
              <p className="mt-2 text-xs text-muted">
                {overview.youAreManager ? 'This account is a manager, so it may deposit rent and edit the allowlist.' : 'This account is not a manager. Deposit and allowlist buttons will be rejected by the contract.'}
                {' '}
                {overview.youAllowed ? 'It is on the allowlist.' : 'It is not on the allowlist, so shares cannot move to or from it.'}
              </p>
            </Card>
          </div>

          <Card className="space-y-3">
            <h2 className="font-serif text-2xl">Document hash</h2>
            <p className="text-sm leading-relaxed text-muted">
              The contract stores keccak256 of a text, not a PDF. The stored URI is {overview.documentUri}. Edit one
              character below and the hash stops matching. That is the whole lesson of the hash. It does not check a deed.
            </p>
            <textarea
              className="min-h-24 w-full rounded-2xl border border-line bg-card-2 p-3 text-sm"
              value={docText}
              onChange={(event) => setDocText(event.target.value)}
            />
            <p className="break-all font-mono text-xs">{docHash}</p>
            <Note tone={docMatches ? 'good' : 'bad'}>
              {docMatches ? 'This text matches the hash stored on the contract.' : 'This text does not match the hash stored on the contract.'}
            </Note>
          </Card>

          <Card>
            <h2 className="font-serif text-2xl">Cap table</h2>
            <p className="mt-1 text-sm text-muted">
              Built from Transfer events, then a balance read for each address. The contract does not keep a list of holders.
            </p>
            {holders.length === 0 ? (
              <div className="mt-3">
                <Empty title="No holders found in the recent logs">Your balance above is still a direct read.</Empty>
              </div>
            ) : (
              <ul className="mt-3 space-y-3">
                {holders.map((row) => {
                  const slice = holderSlice(row.address, row.shares, overview.totalSupply);
                  const width = Number((row.shares * 100n) / (overview.totalSupply || 1n));
                  return (
                    <li key={row.address}>
                      <div className="flex flex-wrap justify-between gap-2 text-sm">
                        <span className="break-all font-mono text-xs">{row.address}</span>
                        <span className="num">{slice.percent} · {row.shares.toString()} · {row.allowed ? 'allowed' : 'frozen'}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-card-2">
                        <div className="h-2 rounded-full bg-moss" style={{ width: `${Math.max(width, 1)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {showForms ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <Card className="space-y-3">
                <h2 className="font-serif text-2xl">Allowlist</h2>
                <p className="text-sm text-muted">
                  Both sides of a transfer must be allowed. Freeze keeps the shares where they are. It does not seize them.
                  Do not freeze your own address while you hold shares.
                </p>
                {tx.phase.step === 'error' ? <Note tone="bad">{tx.phase.message}</Note> : null}
                <Field label="Address">
                  <TextInput value={allowAddress} onChange={(event) => setAllowAddress(event.target.value)} className="font-mono" spellCheck={false} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!overview.youAreManager}
                    onClick={() => void runAction('Updated the allowlist', async () => {
                      const config = app.getConfig();
                      const signer = accountAt(unlocked!.index);
                      const who = parseUserAddress(allowAddress);
                      return prepareCall({
                        config,
                        account: signer.account,
                        path: signer.path,
                        to: overview.address,
                        data: encodeSetAllowed(who, true),
                        valueWei: 0n,
                        action: 'Allow an address to hold shares',
                        note: 'This is the classroom stand-in for a transfer restriction. It is not an identity check.',
                        simulate: () => makePublicClient(config).simulateContract({
                          address: overview.address,
                          abi: propertyShareAbi,
                          functionName: 'setAllowed',
                          args: [who, true],
                          account: signer.account,
                        }),
                      });
                    })}
                  >
                    Allow
                  </Button>
                  <Button
                    tone="quiet"
                    disabled={!overview.youAreManager}
                    onClick={() => void runAction('Updated the allowlist', async () => {
                      const config = app.getConfig();
                      const signer = accountAt(unlocked!.index);
                      const who = parseUserAddress(allowAddress);
                      return prepareCall({
                        config,
                        account: signer.account,
                        path: signer.path,
                        to: overview.address,
                        data: encodeSetAllowed(who, false),
                        valueWei: 0n,
                        action: 'Freeze an address so its shares cannot move',
                        note: 'The shares stay with that address. There is no seize function. Freezing yourself while you hold shares sticks them.',
                        simulate: () => makePublicClient(config).simulateContract({
                          address: overview.address,
                          abi: propertyShareAbi,
                          functionName: 'setAllowed',
                          args: [who, false],
                          account: signer.account,
                        }),
                      });
                    })}
                  >
                    Freeze
                  </Button>
                </div>
              </Card>

              <Card className="space-y-3">
                <h2 className="font-serif text-2xl">Transfer shares</h2>
                <p className="text-sm text-muted">Whole shares only. 250000 is 25% of the supply. The recipient must already be allowed.</p>
                <Field label="To">
                  <TextInput value={transferTo} onChange={(event) => setTransferTo(event.target.value)} className="font-mono" spellCheck={false} />
                </Field>
                <Field label="Shares">
                  <TextInput value={shares} onChange={(event) => setShares(event.target.value)} inputMode="numeric" />
                </Field>
                <Button
                  onClick={() => void runAction('Transferred shares', async () => {
                    const config = app.getConfig();
                    const signer = accountAt(unlocked!.index);
                    const to = parseUserAddress(transferTo);
                    const count = parseShareCount(shares);
                    return prepareCall({
                      config,
                      account: signer.account,
                      path: signer.path,
                      to: overview.address,
                      data: encodeTransferShares(to, count),
                      valueWei: 0n,
                      action: 'Transfer property shares',
                      note: 'Value is 0. The share count is in the call data. Rent already earned stays with the seller. The buyer does not collect it.',
                      simulate: () => makePublicClient(config).simulateContract({
                        address: overview.address,
                        abi: propertyShareAbi,
                        functionName: 'transfer',
                        args: [to, count],
                        account: signer.account,
                      }),
                    });
                  }, `${shares} shares`)}
                >
                  Review transfer
                </Button>
              </Card>

              <Card className="space-y-3">
                <h2 className="font-serif text-2xl">Deposit rent</h2>
                <p className="text-sm text-muted">
                  ETH rides in the transaction value. Mock dollars need an approval first, because an ERC-20 will not
                  let this contract pull tokens until you say it may. Only a manager can deposit.
                </p>
                <Field label="ETH rent">
                  <TextInput value={ethRent} onChange={(event) => setEthRent(event.target.value)} inputMode="decimal" />
                </Field>
                <Button
                  disabled={!overview.youAreManager}
                  onClick={() => void runAction('Deposited ETH rent', async () => {
                    const config = app.getConfig();
                    const signer = accountAt(unlocked!.index);
                    const value = parseEthAmount(ethRent);
                    return prepareCall({
                      config,
                      account: signer.account,
                      path: signer.path,
                      to: overview.address,
                      data: encodeDepositEth(),
                      valueWei: value,
                      action: 'Deposit ETH rent. The amount is the transaction value.',
                      note: 'There is no loop over holders. The contract adds one number: rent earned by a single share since the beginning.',
                      simulate: () => makePublicClient(config).simulateContract({
                        address: overview.address,
                        abi: propertyShareAbi,
                        functionName: 'depositEth',
                        value,
                        account: signer.account,
                      }),
                    });
                  }, `${ethRent} ETH`)}
                >
                  Review ETH rent
                </Button>
                <Field label={`Mock dollars (${overview.stableSymbol})`}>
                  <TextInput value={dollarRent} onChange={(event) => setDollarRent(event.target.value)} inputMode="decimal" />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    tone="quiet"
                    disabled={!overview.youAreManager}
                    onClick={() => void runAction('Approved mock dollars', async () => {
                      const config = app.getConfig();
                      const signer = accountAt(unlocked!.index);
                      const amount = parseMockDollars(dollarRent);
                      return prepareCall({
                        config,
                        account: signer.account,
                        path: signer.path,
                        to: overview.stablecoin,
                        data: encodeApproveStable(overview.address, amount),
                        valueWei: 0n,
                        action: 'Let the property contract pull mock dollars',
                        note: 'This does not move the dollars yet. It records that the property may take up to this amount. The next transaction is the deposit.',
                        simulate: () => makePublicClient(config).simulateContract({
                          address: overview.stablecoin,
                          abi: mockStablecoinAbi,
                          functionName: 'approve',
                          args: [overview.address, amount],
                          account: signer.account,
                        }),
                      });
                    }, `${dollarRent} ${overview.stableSymbol}`)}
                  >
                    Review approval
                  </Button>
                  <Button
                    disabled={!overview.youAreManager}
                    onClick={() => void runAction('Deposited mock-dollar rent', async () => {
                      const config = app.getConfig();
                      const signer = accountAt(unlocked!.index);
                      const amount = parseMockDollars(dollarRent);
                      return prepareCall({
                        config,
                        account: signer.account,
                        path: signer.path,
                        to: overview.address,
                        data: encodeDepositStable(amount),
                        valueWei: 0n,
                        action: 'Deposit mock-dollar rent. The transaction value is 0.',
                        note: 'The dollars move inside the call, via transferFrom. You still pay the ETH fee.',
                        simulate: () => makePublicClient(config).simulateContract({
                          address: overview.address,
                          abi: propertyShareAbi,
                          functionName: 'depositStable',
                          args: [amount],
                          account: signer.account,
                        }),
                      });
                    }, `${dollarRent} ${overview.stableSymbol}`)}
                  >
                    Review dollar rent
                  </Button>
                </div>
              </Card>

              <Card className="space-y-3">
                <h2 className="font-serif text-2xl">Claim</h2>
                <p className="text-sm text-muted">
                  A claim pays this account what its shares have earned. The books update before the money moves. The
                  transaction value is 0. The fee is still yours to pay.
                </p>
                <Button
                  disabled={overview.claimableEthWei === 0n}
                  onClick={() => void runAction('Claimed ETH rent', async () => {
                    const config = app.getConfig();
                    const signer = accountAt(unlocked!.index);
                    return prepareCall({
                      config,
                      account: signer.account,
                      path: signer.path,
                      to: overview.address,
                      data: encodeClaimEth(),
                      valueWei: 0n,
                      action: 'Claim ETH rent your shares have earned',
                      note: 'Value is 0. The contract sends the ETH during the call.',
                      simulate: () => makePublicClient(config).simulateContract({
                        address: overview.address,
                        abi: propertyShareAbi,
                        functionName: 'claimEth',
                        account: signer.account,
                      }),
                    });
                  }, formatEthDisplay(overview.claimableEthWei))}
                >
                  Claim {formatEthDisplay(overview.claimableEthWei)}
                </Button>
                <Button
                  tone="quiet"
                  disabled={overview.claimableStableBase === 0n}
                  onClick={() => void runAction('Claimed mock-dollar rent', async () => {
                    const config = app.getConfig();
                    const signer = accountAt(unlocked!.index);
                    return prepareCall({
                      config,
                      account: signer.account,
                      path: signer.path,
                      to: overview.address,
                      data: encodeClaimStable(),
                      valueWei: 0n,
                      action: 'Claim mock-dollar rent your shares have earned',
                      note: 'Value is 0. The dollars move inside the call.',
                      simulate: () => makePublicClient(config).simulateContract({
                        address: overview.address,
                        abi: propertyShareAbi,
                        functionName: 'claimStable',
                        account: signer.account,
                      }),
                    });
                  }, formatStableDisplay(overview.claimableStableBase, overview.stableSymbol))}
                >
                  Claim {formatStableDisplay(overview.claimableStableBase, overview.stableSymbol)}
                </Button>
              </Card>
            </div>
          ) : null}

          <Card>
            <h2 className="font-serif text-2xl">Rent history</h2>
            <div className="mt-3">
              <RentChart points={rent} />
            </div>
            <p className="mt-4 text-xs text-muted">
              Deposited {formatEthDisplay(overview.ethDepositedWei)} ETH, claimed {formatEthDisplay(overview.ethClaimedWei)}.
              Mock dollars deposited {formatStableDisplay(overview.stableDepositedBase, overview.stableSymbol)}, claimed {formatStableDisplay(overview.stableClaimedBase, overview.stableSymbol)}.
              The contract holds {formatEthDisplay(overview.contractEthWei)} ETH right now.
            </p>
          </Card>
        </>
      ) : null}
    </div>
  );
}
