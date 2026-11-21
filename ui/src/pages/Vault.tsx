/**
 * The LearningVault piggy bank.
 *
 * Deploy, deposit, and withdraw call the functions in `src/vault.ts`. The
 * bytecode comes from the dev server, which read the same Foundry artifact
 * the CLI reads from disk. Status is a free read: your ledger entry, the
 * contract’s totalEth, and the chain’s ETH balance of the contract.
 */
import { useEffect, useState } from 'react';
import { formatEther } from 'viem';
import { parseUserAddress } from '@wallet/address';
import { parseEthAmount } from '@wallet/amounts';
import { deployVault, prepareVaultWrite, readVaultStatus, type VaultStatus } from '@wallet/vault';
import { useApp } from '../state';
import { fetchBytecode } from '../lib/bytecode';
import { friendlyError } from '../lib/errors';
import { accountAt } from '../lib/session';
import { useTx } from '../lib/useTx';
import { Review, TxResult } from '../components/Review';
import { Button, Card, Empty, Field, Note, Spinner, TextInput } from '../components/ui';

export function VaultPage() {
  const app = useApp();
  const tx = useTx();
  const unlocked = app.wallet.status === 'unlocked' ? app.wallet : null;
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deposit, setDeposit] = useState('0.2');
  const [withdraw, setWithdraw] = useState('0.05');
  const [paste, setPaste] = useState('');

  const chainId = app.live.chainId;
  const vault = chainId ? app.contractsFor(chainId).vault : undefined;

  // A deployment's new address arrives with the receipt. Save it for this chain
  // so the ledger can be read without asking the person to paste it.
  useEffect(() => {
    if (tx.phase.step !== 'done' || tx.phase.status !== 'confirmed' || !tx.phase.contractAddress) return;
    try {
      const id = app.getConfig().chain.id;
      const known = app.contractsFor(id).vault;
      if (known?.toLowerCase() === tx.phase.contractAddress.toLowerCase()) return;
      app.rememberContracts(id, { vault: tx.phase.contractAddress });
    } catch {
      // The hash is already on screen. A wrong network setting can be fixed and the address pasted.
    }
  }, [tx.phase, app]);

  useEffect(() => {
    if (!unlocked || !vault) {
      setStatus(null);
      setMissing(!vault);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const config = app.getConfig();
        const next = await readVaultStatus({
          config,
          vault: { address: vault, source: 'this browser' },
          who: unlocked.address,
        });
        if (!cancelled) {
          setStatus(next);
          setMissing(false);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setStatus(null);
          setError(friendlyError(caught));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app, unlocked, vault]);

  async function deploy() {
    if (!unlocked) return;
    setError(null);
    await tx.review(async () => {
      const config = app.getConfig();
      const signer = accountAt(unlocked.index);
      const bytecode = await fetchBytecode('LearningVault');
      const prepared = await deployVault({ config, account: signer.account, path: signer.path, bytecode });
      return prepared;
    }, 'Deployed a LearningVault');
  }

  async function write(kind: 'deposit' | 'withdraw', raw: string) {
    if (!unlocked || !vault) return;
    await tx.review(async () => {
      const config = app.getConfig();
      const signer = accountAt(unlocked.index);
      return prepareVaultWrite({
        config,
        account: signer.account,
        path: signer.path,
        vault,
        functionName: kind,
        amountWei: parseEthAmount(raw),
      });
    }, kind === 'deposit' ? 'Deposited into the vault' : 'Withdrew from the vault', `${raw} ETH`);
  }

  function rememberPasted() {
    if (!chainId) return;
    try {
      app.rememberContracts(chainId, { vault: parseUserAddress(paste) });
      setPaste('');
      setError(null);
    } catch (caught) {
      setError(friendlyError(caught));
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-4xl">Vault</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          A piggy bank. Each address can withdraw only what it deposited. Stopping Anvil deletes the contract. Deploy
          it again. The words stay.
        </p>
      </div>
      {error ? <Note tone="bad">{error}</Note> : null}
      {tx.phase.step === 'review' ? (
        <Review
          preview={tx.phase.ready.preview}
          busy={false}
          onBack={tx.reset}
          onConfirm={() => {
            tx.confirm();
          }}
        />
      ) : null}
      {tx.phase.step === 'pending' ? <TxResult status="pending" hash={tx.phase.hash} onDone={tx.reset} /> : null}
      {tx.phase.step === 'done' ? (
        <TxResult
          status={tx.phase.status}
          hash={tx.phase.hash}
          onDone={tx.reset}
          note={tx.phase.status === 'confirmed' ? 'If this created a contract, its address is saved in this browser for this chain.' : undefined}
        />
      ) : null}
      {loading ? <Spinner label="Reading the vault…" /> : null}
      {!vault || missing ? (
        <Card className="space-y-3">
          <Empty title="No piggy bank on this chain yet">
            The manager deploys the vault from Admin. You can paste an address here if it was already deployed.
          </Empty>
          {tx.phase.step === 'form' || tx.phase.step === 'error' || tx.phase.step === 'preparing' ? (
            <>
              {tx.phase.step === 'error' ? <Note tone="bad">{tx.phase.message}</Note> : null}
              {tx.phase.step === 'preparing' ? <Spinner label="Estimating the deployment…" /> : null}
              <Button onClick={() => void deploy()}>Review deployment</Button>
              <Field label="Or paste a vault address">
                <TextInput value={paste} onChange={(event) => setPaste(event.target.value)} className="font-mono" spellCheck={false} />
              </Field>
              <Button tone="quiet" onClick={rememberPasted}>Use this address</Button>
            </>
          ) : null}
        </Card>
      ) : null}
      {status ? (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your ledger</p>
              <p className="num mt-2 font-serif text-3xl">{formatEther(status.yourSavedWei)} ETH</p>
              <p className="mt-2 text-xs text-muted">balanceOf. What this address may withdraw.</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Contract ledger</p>
              <p className="num mt-2 font-serif text-3xl">{formatEther(status.ledgerTotalWei)} ETH</p>
              <p className="mt-2 text-xs text-muted">totalEth(). The contract’s own sum.</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Chain balance</p>
              <p className="num mt-2 font-serif text-3xl">{formatEther(status.nodeBalanceWei)} ETH</p>
              <p className="mt-2 text-xs text-muted">What the node says the contract holds.</p>
            </Card>
          </div>
          <p className="break-all font-mono text-xs text-muted">{status.address}</p>
          {(tx.phase.step === 'form' || tx.phase.step === 'error' || tx.phase.step === 'preparing') && (
            <div className="grid gap-3 md:grid-cols-2">
              <Card className="space-y-3">
                <h2 className="font-serif text-2xl">Deposit</h2>
                <p className="text-sm text-muted">The ETH is the transaction’s value. deposit() is payable.</p>
                <Field label="ETH">
                  <TextInput value={deposit} onChange={(event) => setDeposit(event.target.value)} inputMode="decimal" />
                </Field>
                <Button onClick={() => void write('deposit', deposit)}>Review deposit</Button>
              </Card>
              <Card className="space-y-3">
                <h2 className="font-serif text-2xl">Withdraw</h2>
                <p className="text-sm text-muted">The transaction value will be 0. The amount sits in the call data. You still pay the fee.</p>
                <Field label="ETH">
                  <TextInput value={withdraw} onChange={(event) => setWithdraw(event.target.value)} inputMode="decimal" />
                </Field>
                <Button onClick={() => void write('withdraw', withdraw)}>Review withdrawal</Button>
              </Card>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

