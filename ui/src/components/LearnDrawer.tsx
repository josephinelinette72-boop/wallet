/**
 * The lesson drawer. It explains the screen in the same voice as the README.
 * It does not hold keys, balances, or RPC URLs.
 */
import { X } from 'lucide-react';
import { lessons, type LearnTopic } from '../learn';
import { Button } from './ui';

export function LearnDrawer({
  topic,
  open,
  onClose,
}: {
  topic: LearnTopic;
  open: boolean;
  onClose: () => void;
}) {
  const lesson = lessons[topic];
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/30" role="presentation" onClick={onClose}>
      <aside
        className="rise flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-card p-6 shadow-card"
        role="dialog"
        aria-label={lesson.title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Learn</p>
            <h2 className="font-serif text-3xl leading-tight">{lesson.title}</h2>
          </div>
          <Button tone="ghost" onClick={onClose} aria-label="Close the lesson">
            <X size={18} />
          </Button>
        </div>
        <div className="mt-6 space-y-6">
          {lesson.sections.map((section) => (
            <section key={section.heading}>
              <h3 className="font-semibold">{section.heading}</h3>
              {section.body.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="mt-2 text-sm leading-relaxed text-muted">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}
