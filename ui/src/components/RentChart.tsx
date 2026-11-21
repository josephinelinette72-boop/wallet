/**
 * Rent deposits as bars.
 *
 * ETH and mock dollars are different units (18 decimals and 6). Drawing them
 * on one axis would lie about which deposit was larger, so each asset gets
 * its own row of bars. The height is that deposit divided by the largest
 * deposit of the same asset.
 */
import type { RentPoint } from '../lib/chainReads';

export function RentChart({ points }: { points: RentPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted">
        No rent deposits in the recent window.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <ChartRow title="ETH rent" points={points.filter((point) => point.asset === 'eth')} />
      <ChartRow title="Stablecoin rent" points={points.filter((point) => point.asset === 'stable')} />
    </div>
  );
}

function ChartRow({ title, points }: { title: string; points: RentPoint[] }) {
  if (points.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted">None yet.</p>
      </div>
    );
  }
  const max = points.reduce((highest, point) => (point.amount > highest ? point.amount : highest), 1n);
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 flex items-end gap-3 overflow-x-auto">
        {points.map((point) => {
          const ratio = Number((point.amount * 100n) / max);
          const height = Math.max(8, ratio);
          return (
            <div key={`${point.hash}-${point.asset}`} className="flex w-16 shrink-0 flex-col items-center gap-1">
              <div className="flex h-28 items-end">
                <div
                  className="w-8 rounded-t-lg bg-moss"
                  style={{ height: `${height}%` }}
                  title={point.label}
                />
              </div>
              <p className="text-center text-[11px] leading-tight text-muted">{point.label}</p>
              <p className="text-center text-[10px] text-muted">{point.when}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
