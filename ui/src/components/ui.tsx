/**
 * Small pieces used on every screen: buttons, fields, cards, and the
 * test-network banner. They are styled like a quiet textbook, not a trading
 * app. The banner does not dismiss. The warning is the point.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export function Banner() {
  return (
    <div className="bg-warn-bg text-warn border-b border-line px-4 py-2 text-sm leading-snug">
      <strong className="font-semibold">Test network only.</strong> Anvil play money and Sepolia test ETH are not
      real. Never type a seed phrase that holds real funds into this page. This project will not talk to mainnet.
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'quiet' | 'ghost' | 'danger';
};

export function Button({ tone = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
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
    <section className={cn('rounded-3xl border border-line bg-card p-5 shadow-card', className)}>{children}</section>
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
      <span className="font-semibold">{label}</span>
      {children}
      {hint ? <span className="block text-muted">{hint}</span> : null}
    </label>
  );
}

const control =
  'w-full rounded-2xl border border-line bg-card-2 px-3 py-2 text-ink outline-none placeholder:text-muted';

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
        'rounded-2xl px-3 py-2 text-sm leading-relaxed',
        tone === 'neutral' && 'bg-card-2 text-ink',
        tone === 'bad' && 'bg-danger-bg text-danger',
        tone === 'good' && 'bg-moss/15 text-ink',
      )}
      role={tone === 'bad' ? 'alert' : undefined}
    >
      {children}
    </p>
  );
}

export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-card-2/60 px-4 py-8 text-center">
      <p className="font-serif text-xl">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted" role="status">
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-moss border-t-transparent" />
      {label}
    </p>
  );
}
