/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Shared page state: which screen, light or dark, which network, which
 * account index, and which contract addresses this browser has deployed.
 *
 * The 12 words are not in this context. They live in `lib/session.ts`.
 * This context only keeps the public address and the path, which are safe
 * to show.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getAddress, type Address, type Hex } from 'viem';
import type { WalletConfig } from '@wallet/config';
import { assertExpectedChain } from '@wallet/safety';
import { makePublicClient, toFriendlyError } from '@wallet/client';
import { decryptMnemonicAsync, encryptMnemonicAsync, parseKeystore, type KeystoreFile } from '@wallet/keystoreCrypto';
import type { LearnTopic } from './learn';
import { friendlyError } from './lib/errors';
import { browserConfig, installBrowserRpcProxy, rpcProblem } from './lib/network';
import { accountAt, closeSession, openSession } from './lib/session';
import {
  clearWalletStorage,
  loadAccounts,
  loadActivity,
  loadContracts,
  loadKeystore,
  loadNetwork,
  loadTheme,
  saveAccounts,
  saveActivity,
  saveContracts,
  saveKeystoreRecord,
  saveNetwork,
  saveTheme,
  type ActivityItem,
  type ContractBook,
  type NetworkSettings,
  type ThemeName,
} from './lib/storage';

export type PageId = 'investor' | 'admin' | 'dashboard' | 'accounts' | 'send' | 'sign' | 'vault';

export type WalletView =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'locked'; usesPassphrase: boolean }
  | {
      status: 'unlocked';
      index: number;
      accountCount: number;
      address: Address;
      path: string;
      usesPassphrase: boolean;
    };

type LiveNetwork = {
  connected: boolean;
  chainId: number | null;
  error: string | null;
};

type AppValue = {
  page: PageId;
  setPage: (page: PageId) => void;
  theme: ThemeName;
  toggleTheme: () => void;
  learnOpen: boolean;
  setLearnOpen: (open: boolean) => void;
  learnTopic: LearnTopic;
  wallet: WalletView;
  notice: string | null;
  clearNotice: () => void;
  network: NetworkSettings;
  live: LiveNetwork;
  setNetwork: (next: NetworkSettings) => void;
  getConfig: () => WalletConfig;
  contractsFor: (chainId: number) => { vault?: Address; property?: Address; stablecoin?: Address };
  rememberContracts: (chainId: number, patch: { vault?: Address; property?: Address; stablecoin?: Address }) => void;
  activity: ActivityItem[];
  rememberActivity: (item: ActivityItem) => void;
  revision: number;
  bump: () => void;
  unlock: (password: string, passphrase: string) => Promise<void>;
  lock: () => void;
  saveNewWallet: (mnemonic: string, password: string, passphrase: string, onProgress?: (n: number) => void) => Promise<void>;
  replaceKeystore: (file: KeystoreFile) => Promise<void>;
  forget: () => Promise<void>;
  selectAccount: (index: number) => void;
  addAccount: () => void;
};

const AppContext = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('The page is missing its app state.');
  return value;
}

function topicFor(page: PageId): LearnTopic {
  if (page === 'admin') return 'property';
  if (page === 'dashboard') return 'dashboard';
  return page;
}

function applyTheme(theme: ThemeName): void {
  saveTheme(theme);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<PageId>('investor');
  const [theme, setTheme] = useState<ThemeName>(() => loadTheme());
  const [learnOpen, setLearnOpen] = useState(false);
  const [wallet, setWallet] = useState<WalletView>({ status: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const [network, setNetworkState] = useState<NetworkSettings>(() => loadNetwork());
  const [live, setLive] = useState<LiveNetwork>({ connected: false, chainId: null, error: null });
  const [contracts, setContracts] = useState<ContractBook>(() => loadContracts());
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    installBrowserRpcProxy();
    applyTheme(loadTheme());
    let cancelled = false;
    void (async () => {
      try {
        const [file, items] = await Promise.all([loadKeystore(), loadActivity()]);
        if (cancelled) return;
        setActivity(items);
        if (!file) setWallet({ status: 'empty' });
        else setWallet({ status: 'locked', usesPassphrase: file.usesPassphrase });
      } catch (error) {
        if (!cancelled) {
          setWallet({ status: 'empty' });
          setNotice(friendlyError(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const getConfig = useCallback((): WalletConfig => {
    const config = browserConfig(network.choice, network.anvilUrl, network.sepoliaUrl);
    const problem = rpcProblem(config.rpcUrl);
    if (problem) throw new Error(problem);
    return config;
  }, [network]);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      let config: WalletConfig;
      try {
        config = getConfig();
      } catch (error) {
        if (!cancelled) setLive({ connected: false, chainId: null, error: friendlyError(error) });
        return;
      }
      try {
        const client = makePublicClient(config);
        const chainId = await client.getChainId();
        assertExpectedChain(config.chain.id, chainId, config.chain.name);
        if (!cancelled) setLive({ connected: true, chainId, error: null });
      } catch (error) {
        const friendly = error instanceof Error && error.message.includes('chain id')
          ? error.message
          : toFriendlyError(error, config).message;
        if (!cancelled) setLive({ connected: false, chainId: null, error: friendly });
      }
    }
    void tick();
    const timer = window.setInterval(() => void tick(), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [getConfig, revision]);

  const setNetwork = useCallback((next: NetworkSettings) => {
    setNetworkState(next);
    saveNetwork(next);
  }, []);

  const contractsFor = useCallback(
    (chainId: number) => {
      const row = contracts[String(chainId)] ?? {};
      const parse = (value?: string): Address | undefined => {
        if (!value) return undefined;
        try {
          return getAddress(value);
        } catch {
          return undefined;
        }
      };
      return { vault: parse(row.vault), property: parse(row.property), stablecoin: parse(row.stablecoin) };
    },
    [contracts],
  );

  const rememberContracts = useCallback(
    (chainId: number, patch: { vault?: Address; property?: Address; stablecoin?: Address }) => {
      setContracts((current) => {
        const key = String(chainId);
        const next: ContractBook = {
          ...current,
          [key]: { ...current[key], ...patch },
        };
        saveContracts(next);
        return next;
      });
    },
    [],
  );

  const rememberActivity = useCallback((item: ActivityItem) => {
    setActivity((current) => {
      const without = current.filter((row) => row.hash.toLowerCase() !== item.hash.toLowerCase());
      const next = [item, ...without].slice(0, 80);
      void saveActivity(next);
      return next;
    });
  }, []);

  const showUnlocked = useCallback((index: number, count: number, usesPassphrase: boolean) => {
    const account = accountAt(index);
    setWallet({
      status: 'unlocked',
      index,
      accountCount: count,
      address: account.address,
      path: account.path,
      usesPassphrase,
    });
  }, []);

  const unlock = useCallback(
    async (password: string, passphrase: string) => {
      const file = await loadKeystore();
      if (!file) throw new Error('There is no locked wallet in this browser yet.');
      const mnemonic = await decryptMnemonicAsync(file, password);
      openSession(mnemonic, file.usesPassphrase ? passphrase : '');
      const saved = loadAccounts();
      showUnlocked(saved.index, saved.count, file.usesPassphrase);
      setPage('investor');
    },
    [showUnlocked],
  );

  const lock = useCallback(() => {
    closeSession();
    setWallet((current) =>
      current.status === 'unlocked'
        ? { status: 'locked', usesPassphrase: current.usesPassphrase }
        : { status: 'locked', usesPassphrase: false },
    );
  }, []);

  const saveNewWallet = useCallback(
    async (mnemonic: string, password: string, passphrase: string, onProgress?: (n: number) => void) => {
      const file = await encryptMnemonicAsync(
        mnemonic,
        password,
        { usesPassphrase: passphrase.length > 0 },
        onProgress,
      );
      await saveKeystoreRecord(file);
      openSession(mnemonic, passphrase);
      saveAccounts({ index: 0, count: 1 });
      showUnlocked(0, 1, passphrase.length > 0);
      setPage('investor');
      setNotice('The 12 words are not stored as plaintext. This page will not show them again. The paper copy is the backup.');
    },
    [showUnlocked],
  );

  const replaceKeystore = useCallback(async (file: KeystoreFile) => {
    const parsed = parseKeystore(file);
    await saveKeystoreRecord(parsed);
    closeSession();
    saveAccounts({ index: 0, count: 1 });
    setWallet({ status: 'locked', usesPassphrase: parsed.usesPassphrase });
    setNotice('The locked file is in this browser. The words were not in it. Unlock with the file password.');
  }, []);

  const forget = useCallback(async () => {
    closeSession();
    await clearWalletStorage();
    setContracts({});
    setActivity([]);
    setWallet({ status: 'empty' });
    setPage('investor');
    setNotice('This browser forgot the locked file. The paper words still open the same keys. Anvil balances were never in the browser.');
  }, []);

  const selectAccount = useCallback(
    (index: number) => {
      if (wallet.status !== 'unlocked') return;
      const count = wallet.accountCount;
      if (index < 0 || index >= count) return;
      saveAccounts({ index, count });
      showUnlocked(index, count, wallet.usesPassphrase);
    },
    [showUnlocked, wallet],
  );

  const addAccount = useCallback(() => {
    if (wallet.status !== 'unlocked') return;
    if (wallet.accountCount >= 10) return;
    const count = wallet.accountCount + 1;
    saveAccounts({ index: wallet.index, count });
    showUnlocked(wallet.index, count, wallet.usesPassphrase);
  }, [showUnlocked, wallet]);

  const value = useMemo<AppValue>(
    () => ({
      page,
      setPage,
      theme,
      toggleTheme: () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        applyTheme(next);
      },
      learnOpen,
      setLearnOpen,
      learnTopic: wallet.status === 'unlocked' ? topicFor(page) : 'welcome',
      wallet,
      notice,
      clearNotice: () => setNotice(null),
      network,
      live,
      setNetwork,
      getConfig,
      contractsFor,
      rememberContracts,
      activity,
      rememberActivity,
      revision,
      bump: () => setRevision((n) => n + 1),
      unlock,
      lock,
      saveNewWallet,
      replaceKeystore,
      forget,
      selectAccount,
      addAccount,
    }),
    [
      page,
      theme,
      learnOpen,
      wallet,
      notice,
      network,
      live,
      setNetwork,
      getConfig,
      contractsFor,
      rememberContracts,
      activity,
      rememberActivity,
      revision,
      unlock,
      lock,
      saveNewWallet,
      replaceKeystore,
      forget,
      selectAccount,
      addAccount,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export type { Hex };
