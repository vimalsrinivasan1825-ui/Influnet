'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, MessageSquareText, Send, X } from 'lucide-react';
import LogoMark from '@/components/brand/logo-mark';
import { answer, byId, STARTERS, type BotAction, type BotEntry, type BotReply } from '@/lib/help-bot';
import type { Role } from '@/lib/role';
import { SUPPORT_EMAIL } from './links';

type Msg =
  | { id: number; from: 'user'; text: string }
  | { id: number; from: 'bot'; text: string; actions?: BotAction[]; chips?: BotEntry[] };

let seq = 0;
const nextId = () => ++seq;

const GREETING = (role: Role) =>
  role === 'creator'
    ? 'Hi! I can answer the common questions creators ask about Influnet. Pick one below or type your own.'
    : 'Hi! I can answer the common questions brands ask about Influnet. Pick one below or type your own.';

// A rule-based help desk: answers come from the written knowledge base in
// lib/help-bot.ts, never from a model. Anything it can't match goes to a person.
export default function HelpBot({ role, open, onOpenChange }: { role: Role; open: boolean; onOpenChange: (o: boolean) => void }) {
  const starters = STARTERS[role].map(byId).filter(Boolean) as BotEntry[];
  const [msgs, setMsgs] = useState<Msg[]>(() => [
    { id: nextId(), from: 'bot', text: GREETING(role), chips: starters },
  ]);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, typing]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  function ask(text: string, entry?: BotEntry) {
    const q = text.trim();
    if (!q || typing) return;
    setMsgs((m) => [...m, { id: nextId(), from: 'user', text: q }]);
    setDraft('');
    setTyping(true);

    // A chip is an exact pick; typed text goes through the matcher.
    const reply: BotReply = entry ? { kind: 'answer', entry, related: [] } : answer(q, role);
    let bot: Msg;
    if (reply.kind === 'answer') {
      bot = { id: nextId(), from: 'bot', text: reply.entry.a, actions: reply.entry.actions, chips: reply.related };
    } else if (reply.kind === 'greeting') {
      bot = { id: nextId(), from: 'bot', text: 'Hello! What would you like to know?', chips: reply.related };
    } else if (reply.kind === 'thanks') {
      bot = { id: nextId(), from: 'bot', text: 'Happy to help. Anything else?' };
    } else {
      bot = {
        id: nextId(),
        from: 'bot',
        text: "I don't have an answer for that one yet. Try one of these, or ask the team directly.",
        actions: [{ label: `Email ${SUPPORT_EMAIL}`, href: `mailto:${SUPPORT_EMAIL}`, external: true }],
        chips: reply.related,
      };
    }
    window.setTimeout(() => {
      setTyping(false);
      setMsgs((m) => [...m, bot]);
    }, 450);
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(draft);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-controls="influnet-help"
        aria-label={open ? 'Close help' : 'Questions? Chat with us'}
        className="fixed bottom-4 right-4 z-[60] flex size-14 items-center justify-center rounded-full bg-brand text-white shadow-[0_16px_40px_-12px_rgba(255,7,142,.8)] transition-transform hover:scale-105 sm:bottom-6 sm:right-6"
      >
        {open ? <X className="size-6" /> : <MessageSquareText className="size-6" />}
      </button>

      {open && (
        <div
          id="influnet-help"
          role="dialog"
          aria-label="Influnet help"
          className="fixed inset-x-3 bottom-[5.25rem] z-[60] flex max-h-[min(640px,calc(100dvh-7rem))] flex-col overflow-hidden rounded-[26px] bg-card text-ink shadow-[0_30px_80px_-20px_rgba(23,20,29,.45)] ring-1 ring-black/5 sm:inset-x-auto sm:bottom-24 sm:right-6 sm:w-[380px]"
        >
          <div className="flex items-center gap-3 bg-night px-5 py-4 text-white">
            <span className="flex size-10 items-center justify-center rounded-full bg-white/10">
              <LogoMark size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[17px] font-bold leading-tight">Influnet help</p>
              <p className="text-xs text-night-soft">Instant answers from our help guide</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close help"
              className="flex size-9 items-center justify-center rounded-full text-night-soft transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-5" />
            </button>
          </div>

          <div ref={log} data-lenis-prevent aria-live="polite" className="flex-1 space-y-3 overflow-y-auto overscroll-contain bg-paper px-4 py-5">
            {msgs.map((m) =>
              m.from === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[14.5px] leading-snug text-white">
                    {m.text}
                  </p>
                </div>
              ) : (
                <div key={m.id} className="space-y-2.5">
                  <p className="max-w-[92%] rounded-2xl rounded-bl-md bg-card px-4 py-3 text-[14.5px] leading-relaxed ring-1 ring-line">
                    {m.text}
                  </p>
                  {m.actions?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {m.actions.map((a) => (
                        <a
                          key={a.label}
                          href={a.href}
                          {...(a.external && !a.href.startsWith('mailto:') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                          className="inline-flex items-center gap-1 rounded-full bg-brand px-3.5 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep"
                        >
                          {a.label} <ArrowUpRight className="size-3.5" />
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {m.chips?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {m.chips.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => ask(c.q, c)}
                          className="rounded-full border border-line-strong bg-card px-3.5 py-1.5 text-left text-[13px] font-medium text-ink-soft transition-colors hover:border-brand hover:text-ink"
                        >
                          {c.q}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ),
            )}
            {typing && (
              <div className="flex w-16 items-center justify-center gap-1 rounded-2xl rounded-bl-md bg-card py-3.5 ring-1 ring-line" aria-label="Typing">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </div>
            )}
          </div>

          <form onSubmit={submit} className="flex items-center gap-2 border-t border-line bg-card p-3">
            <input
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={200}
              placeholder="Ask about payments, verification, the app…"
              aria-label="Your question"
              className="h-11 min-w-0 flex-1 rounded-full bg-paper-deep px-4 text-[14.5px] outline-none placeholder:text-muted focus:ring-[1.5px] focus:ring-brand"
            />
            <button
              type="submit"
              disabled={!draft.trim() || typing}
              aria-label="Send"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-colors hover:bg-brand disabled:opacity-40"
            >
              <Send className="size-[18px]" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
