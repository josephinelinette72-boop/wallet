/**
 * The page picks one of three doors.
 *
 * No keystore yet: create, import, or open a file.
 * Keystore, locked: password.
 * Unlocked: the rest of the wallet. Locking returns to the password door
 * without deleting the encrypted copy.
 */
import { AppProvider, useApp } from './state';
import { Shell } from './components/Shell';
import { Unlock } from './pages/Unlock';
import { Welcome } from './pages/Welcome';

function Gate() {
  const app = useApp();
  if (app.wallet.status === 'loading') {
    return (
      <p className="px-6 py-16 text-sm text-muted" role="status">
        Opening the wallet stored in this browser…
      </p>
    );
  }
  if (app.wallet.status === 'empty') return <Welcome />;
  if (app.wallet.status === 'locked') return <Unlock />;
  return <Shell />;
}

export function App() {
  return (
    <AppProvider>
      <Gate />
    </AppProvider>
  );
}
