/**
 * Shared controls: buttons, fields, cards, tables, and the testnet badge.
 */
import { CircleHelp } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export function TestnetBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-[11px] font-medium text-muted"
      title="Anvil and Sepolia only. Do not import a key that controls real funds."
    >
      <span className="h-1.5 w-1.5 rounded-full bg-warn" />
      Testnet
    </span>
  );
}

/** Kept so older call sites stay quiet. The badge lives in the app shell. */
export function Banner() {
  return null;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'quiet' | 'ghost' | 'danger';
};

export function Button({ tone = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'primary' && 'bg-moss text-moss-ink hover:brightness-110',
        tone === 'quiet' && 'border border-line bg-card text-ink hover:bg-card-2',
        tone === 'ghost' && 'text-ink hover:bg-card-2',
        tone === 'danger' && 'bg-danger text-white hover:brightness-110',
        className,
      )}
      {...props}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-line bg-card p-5 shadow-card', className)}>{children}</section>
  );
}

export function PageHeader({
  kicker,
  title,
  children,
}: {
  kicker?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker ? <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{kicker}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function Kpi({ label, value, detail }: { label: string; value: string; detail?: ReactNode }) {
  return (
    <Card>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="num mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {detail ? <div className="mt-2 text-xs leading-relaxed text-muted">{detail}</div> : null}
    </Card>
  );
}

export function HelpTip({ text }: { text: string }) {
  return (
    <button type="button" className="inline-flex align-middle text-muted" title={text} aria-label={text}>
      <CircleHelp size={14} />
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs leading-relaxed text-muted">{hint}</span> : null}
    </label>
  );
}

const control =
  'w-full rounded-lg border border-line bg-card px-3 py-2 text-ink outline-none placeholder:text-muted focus:border-moss';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(control, props.className)} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(control, 'min-h-28 resize-y', props.className)} />;
}

export function Note({ tone = 'neutral', children }: { tone?: 'neutral' | 'bad' | 'good'; children: ReactNode }) {
  return (
    <p
      className={cn(
        'rounded-lg px-3 py-2 text-sm leading-relaxed',
        tone === 'neutral' && 'bg-card-2 text-ink',
        tone === 'bad' && 'bg-danger-bg text-danger',
        tone === 'good' && 'bg-moss/10 text-ink',
      )}
      role={tone === 'bad' ? 'alert' : undefined}
    >
      {children}
    </p>
  );
}

export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-card-2/70 px-4 py-8 text-center">
      <p className="text-base font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted" role="status">
      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-moss border-t-transparent" />
      {label}
    </p>
  );
}
