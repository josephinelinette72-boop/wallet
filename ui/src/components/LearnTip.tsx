/**
 * A lesson that stays closed until the reader asks for it.
 *
 * The long explanation used to cover the page. It now sits in a disclosure
 * at the top of the screen, so the buttons stay visible.
 */
import { lessons, type LearnTopic } from '../learn';

export function LearnTip({ topic }: { topic: LearnTopic }) {
  const lesson = lessons[topic];
  return (
    <details className="rounded-2xl border border-line bg-card px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold">Learn: {lesson.title}</summary>
      <div className="mt-3 space-y-3">
        {lesson.sections.map((section) => (
          <section key={section.heading}>
            <h3 className="text-sm font-semibold">{section.heading}</h3>
            {section.body.map((paragraph) => (
              <p key={paragraph.slice(0, 48)} className="mt-1 text-sm leading-relaxed text-muted">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
    </details>
  );
}
