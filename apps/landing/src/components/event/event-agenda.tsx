import { AGENDA, EVENT } from './event';

// The day's schedule, on the pass (/join) and the survey's thank-you screen.
export default function EventAgenda({ className = '' }: { className?: string }) {
  return (
    <section className={`rounded-[22px] border border-line bg-card p-5 text-left sm:p-6 ${className}`}>
      <p className="eyebrow">[ Agenda · {EVENT.dateShort} ]</p>
      <ol className="mt-4">
        {AGENDA.map((item, i) => (
          <li key={item.time} className="relative flex gap-4 pb-5 last:pb-0">
            {i < AGENDA.length - 1 && (
              <span aria-hidden className="absolute left-[5px] top-4 h-full w-px bg-line" />
            )}
            <span aria-hidden className="relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-brand bg-card" />
            <div className="min-w-0">
              <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-brand-deep">{item.time}</p>
              <p className="mt-0.5 text-[17px] font-bold leading-snug">{item.title}</p>
              {'detail' in item && <p className="mt-0.5 text-[14px] leading-snug text-ink-soft">{item.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
