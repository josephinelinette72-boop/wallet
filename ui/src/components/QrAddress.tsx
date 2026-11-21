/**
 * A QR code of the address only.
 *
 * The address is public. The code is a convenient way to copy it to another
 * screen. It must never contain the 12 words, the password, or a private key.
 * Scanning it should produce the same 0x string the copy button copies.
 */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrAddress({ address }: { address: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    void QRCode.toDataURL(address, {
      margin: 1,
      width: 220,
      color: { dark: '#1c1914', light: '#ffffff' },
    })
      .then((next) => {
        if (!cancelled) setUrl(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (failed) return <p className="text-sm text-muted">The QR code could not be drawn. The address above is still the one to copy.</p>;
  if (!url) return <p className="text-sm text-muted">Drawing the address code…</p>;
  return (
    <img
      src={url}
      alt={`QR code for address ${address}`}
      width={220}
      height={220}
      className="rounded-2xl border border-line bg-white p-2"
    />
  );
}
