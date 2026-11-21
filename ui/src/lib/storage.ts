/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * What this browser remembers.
 *
 * The encrypted keystore (the same JSON the CLI writes to disk) goes in
 * IndexedDB. The decrypted words never do. Activity (hashes, addresses,
 * summaries) also goes in IndexedDB. Addresses and hashes are public.
 *
 * Theme, the selected network, and contract addresses go in localStorage.
 * A Sepolia URL can contain an API key. It stays in this browser. Nothing
 * in this file sends it anywhere, and the dev server is told not to log it.
 * Do not print these records.
 */
import type { KeystoreFile } from '@wallet/keystoreCrypto';

const THEME_KEY = 'learning-wallet.theme';
const NETWORK_KEY = 'learning-wallet.network';
const CONTRACTS_KEY = 'learning-wallet.contracts';
const ACCOUNTS_KEY = 'learning-wallet.accounts';

export type ThemeName = 'light' | 'dark';

export type NetworkSettings = {
  choice: 'anvil' | 'sepolia';
  anvilUrl: string;
  sepoliaUrl: string;
};

export type ContractBook = Record<string, { vault?: string; property?: string; stablecoin?: string }>;

export type AccountSettings = {
  index: number;
  count: number;
};

export type ActivityItem = {
  hash: string;
  chainId: number;
  from: string;
  to?: string;
  kind: string;
  summary: string;
  amount?: string;
  status: 'pending' | 'confirmed' | 'reverted';
  createdAt: string;
};

const DEFAULT_NETWORK: NetworkSettings = {
  choice: 'anvil',
  anvilUrl: 'http://127.0.0.1:8545',
  sepoliaUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

export function loadTheme(): ThemeName {
  return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
}

export function saveTheme(theme: ThemeName): void {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function loadNetwork(): NetworkSettings {
  const saved = readJson(NETWORK_KEY, DEFAULT_NETWORK);
  if (!saved.sepoliaUrl.trim()) saved.sepoliaUrl = DEFAULT_NETWORK.sepoliaUrl;
  return saved;
}

export function saveNetwork(settings: NetworkSettings): void {
  localStorage.setItem(NETWORK_KEY, JSON.stringify(settings));
}

export function loadContracts(): ContractBook {
  try {
    const raw = localStorage.getItem(CONTRACTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ContractBook;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveContracts(book: ContractBook): void {
  localStorage.setItem(CONTRACTS_KEY, JSON.stringify(book));
}

export function loadAccounts(): AccountSettings {
  const saved = readJson(ACCOUNTS_KEY, { index: 0, count: 1 });
  const count = Number.isInteger(saved.count) && saved.count >= 1 && saved.count <= 10 ? saved.count : 1;
  const index = Number.isInteger(saved.index) && saved.index >= 0 && saved.index < count ? saved.index : 0;
  return { index, count };
}

export function saveAccounts(settings: AccountSettings): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(settings));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('learning-wallet', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('secrets')) db.createObjectStore('secrets');
      if (!db.objectStoreNames.contains('activity')) db.createObjectStore('activity');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the browser database.'));
  });
}

function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const request = tx.objectStore(store).get(key);
        request.onsuccess = () => resolve(request.result as T | undefined);
        request.onerror = () => reject(request.error ?? new Error('Could not read the browser database.'));
      }),
  );
}

function idbSet(store: string, key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Could not write the browser database.'));
      }),
  );
}

export function loadKeystore(): Promise<KeystoreFile | undefined> {
  return idbGet<KeystoreFile>('secrets', 'keystore');
}

export function saveKeystoreRecord(file: KeystoreFile): Promise<void> {
  return idbSet('secrets', 'keystore', file);
}

export function loadActivity(): Promise<ActivityItem[]> {
  return idbGet<ActivityItem[]>('activity', 'items').then((items) => items ?? []);
}

export async function saveActivity(items: ActivityItem[]): Promise<void> {
  // Keep the list short. The chain is the long-term record. This is a local notebook.
  await idbSet('activity', 'items', items.slice(0, 80));
}

export async function clearWalletStorage(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['secrets', 'activity'], 'readwrite');
    tx.objectStore('secrets').delete('keystore');
    tx.objectStore('activity').delete('items');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not forget the wallet in this browser.'));
  });
  localStorage.removeItem(CONTRACTS_KEY);
  localStorage.removeItem(ACCOUNTS_KEY);
}
