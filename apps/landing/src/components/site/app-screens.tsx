import {
  Bell,
  CheckCheck,
  ChevronRight,
  FileCheck,
  FileSignature,
  FolderKanban,
  Home,
  IndianRupee,
  Megaphone,
  MessageSquare,
  Search,
  Send,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/role';

// The mobile app's Home screen, redrawn for the landing page from the app's own
// design tokens (packages/tokens) and layout (apps/mobile/app/(tabs)/home.tsx):
// grey page, flat white cards, hairlines, the headline's second line in the
// role accent, the review card, "Your move", the money card and the floating
// tab bar. The people and numbers are sample data, not real accounts.

const T = {
  surface: '#f2f4f8',
  card: '#ffffff',
  hairline: '#eef0f4',
  content: '#0f172a',
  soft: '#475569',
  muted: '#94a3b8',
  ok: '#16a34a',
  okSoft: '#f0fdf4',
  warn: '#d97706',
  warnSoft: '#fffbeb',
};

// accentForRole in @influnet/tokens: purple for creators, pink for brands.
export const ACCENT: Record<Role, { brand: string; soft: string; ring: string }> = {
  creator: { brand: '#7c3aed', soft: '#f5f3ff', ring: 'rgba(124,58,237,.32)' },
  business: { brand: '#ee3e96', soft: '#fdf2f8', ring: 'rgba(238,62,150,.32)' },
};

type Chip = { label: string; count: number; tone: 'brand' | 'warn' | 'ok'; icon: LucideIcon };
type Move = { title: string; sub: string; stage: string; at: number };

const DATA: Record<
  Role,
  { name: string; hero: [string, string]; chips: Chip[]; moves: Move[]; money: [string, string, string] }
> = {
  creator: {
    name: 'Ananya',
    hero: ['3 things need', 'your attention'],
    chips: [
      { label: 'Requests', count: 2, tone: 'brand', icon: Send },
      { label: 'Terms', count: 1, tone: 'warn', icon: FileSignature },
      { label: 'Payments', count: 1, tone: 'ok', icon: IndianRupee },
    ],
    moves: [
      { title: 'Monsoon Edit Reel', sub: 'Saffron & Co. · Upload your draft', stage: 'Content production', at: 6 },
      { title: 'Café Bloom launch', sub: 'Café Bloom · Sign off the terms', stage: 'Terms', at: 2 },
    ],
    money: ['Earnings', '₹48,500', '+18% vs last month'],
  },
  business: {
    name: 'Saffron & Co.',
    hero: ['4 things need', 'your attention'],
    chips: [
      { label: 'Applications', count: 5, tone: 'brand', icon: Users },
      { label: 'Drafts', count: 2, tone: 'warn', icon: FileCheck },
      { label: 'Sign-offs', count: 1, tone: 'ok', icon: CheckCheck },
    ],
    moves: [
      { title: 'Diwali Drop', sub: 'Ananya R. · Review the draft', stage: 'Draft review', at: 8 },
      { title: 'Store opening', sub: 'Kabir M. · Pay the advance', stage: 'Advance payment', at: 3 },
    ],
    money: ['Spend', '₹1,24,000', '6 active projects'],
  },
};

const TABS: [string, LucideIcon][] = [
  ['Home', Home],
  ['Campaigns', Megaphone],
  ['Requests', Send],
  ['Messages', MessageSquare],
  ['Projects', FolderKanban],
];

const TOTAL_STAGES = 12;

export default function AppHomeScreen({ role }: { role: Role }) {
  const a = ACCENT[role];
  const d = DATA[role];
  const tone = { brand: { fg: a.brand, bg: a.soft }, warn: { fg: T.warn, bg: T.warnSoft }, ok: { fg: T.ok, bg: T.okSoft } };

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: T.surface, color: T.content }}>
      <div className="px-5 pt-[62px]">
        {/* Header: greeting, search, bell, avatar */}
        <div className="flex items-center gap-4">
          <p className="min-w-0 flex-1 truncate text-[16px]" style={{ color: T.soft }}>
            Good evening, <b style={{ color: T.content }}>{d.name}</b>
          </p>
          <Search size={22} color={T.soft} />
          <span className="relative">
            <Bell size={22} color={a.brand} />
            <span
              className="absolute -right-2 -top-1.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
              style={{ background: a.brand }}
            >
              3
            </span>
          </span>
          <span
            className="flex size-10 items-center justify-center rounded-full text-[15px] font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${a.brand}, #f26e59)` }}
          >
            {d.name[0]}
          </span>
        </div>

        {/* Headline, second line in the role accent */}
        <h3 className="mt-5 text-[30px] font-extrabold leading-[36px] tracking-[-0.8px]">
          {d.hero[0]}
          <br />
          <span style={{ color: a.brand }}>{d.hero[1]}</span>
        </h3>

        {/* Review card */}
        <div className="mt-5 rounded-[20px] border px-4 py-4 shadow-[0_6px_18px_-8px_rgba(15,23,42,.14)]" style={{ background: T.card, borderColor: T.hairline }}>
          <p className="text-[19px] font-bold tracking-[-0.3px]">
            Things to review <span style={{ color: a.brand }}>· {d.chips.reduce((n, c) => n + c.count, 0)}</span>
          </p>
          <div className="mt-3 flex items-center">
            <div className="flex flex-1 gap-3">
              {d.chips.map((c) => {
                const k = tone[c.tone];
                const Icon = c.icon;
                return (
                  <div key={c.label} className="flex w-[62px] flex-col items-center gap-1.5">
                    <span className="relative flex size-12 items-center justify-center rounded-2xl" style={{ background: k.bg }}>
                      <Icon size={21} color={k.fg} />
                      <span
                        className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white px-1 text-[10px] font-bold text-white"
                        style={{ background: k.fg }}
                      >
                        {c.count}
                      </span>
                    </span>
                    <span className="text-[11px] font-semibold leading-[13px]">{c.label}</span>
                    <span className="h-[3px] w-[22px] rounded-sm" style={{ background: k.fg }} />
                  </div>
                );
              })}
            </div>
            <div className="flex w-[112px] flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/app/review.png" alt="" className="h-[75px] w-[112px] object-contain" />
              <span className="rounded-full px-4 py-[7px] text-[13px] font-bold text-white" style={{ background: a.brand }}>
                Review now
              </span>
            </div>
          </div>
        </div>

        {/* Your move */}
        <p className="mb-2.5 mt-6 text-[13px] font-semibold uppercase tracking-[0.6px]" style={{ color: T.muted }}>
          Your move · {d.moves.length}
        </p>
        <div className="space-y-2.5">
          {d.moves.map((m) => (
            <div
              key={m.title}
              className="flex items-center gap-4 rounded-[20px] border px-4 py-3.5 shadow-[0_6px_18px_-8px_rgba(15,23,42,.14)]"
              style={{ background: T.card, borderColor: a.ring }}
            >
              <Ring progress={m.at / TOTAL_STAGES} label={`${m.at}/${TOTAL_STAGES}`} color={a.brand} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-semibold leading-[22px]">{m.title}</p>
                <p className="truncate text-[13.5px]" style={{ color: T.soft }}>
                  {m.sub}
                </p>
                <p className="truncate text-[12px]" style={{ color: T.muted }}>
                  {m.stage}
                </p>
              </div>
              <ChevronRight size={18} color={a.brand} />
            </div>
          ))}
        </div>

        {/* Money card, partly under the tab bar as it would be mid-scroll */}
        <p className="mb-2.5 mt-6 text-[13px] font-semibold uppercase tracking-[0.6px]" style={{ color: T.muted }}>
          {d.money[0]}
        </p>
        <div className="rounded-[20px] border px-4 py-4" style={{ background: T.card, borderColor: T.hairline }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[28px] font-extrabold tracking-[-0.6px]">{d.money[1]}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: role === 'creator' ? T.ok : T.soft }}>
                {role === 'creator' && <TrendingUp size={14} />} {d.money[2]}
              </p>
            </div>
            <div className="flex rounded-full p-[3px] text-[12px] font-semibold" style={{ background: T.surface, color: T.soft }}>
              {['Week', 'Month', 'Year'].map((w) => (
                <span key={w} className="rounded-full px-2.5 py-1" style={w === 'Month' ? { background: T.card, color: T.content } : undefined}>
                  {w}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-4 flex h-[70px] items-end gap-2">
            {[38, 52, 30, 64, 48, 80, 100].map((h, i) => (
              <span key={i} className="flex-1 rounded-md" style={{ height: `${h}%`, background: i === 6 ? a.brand : a.soft }} />
            ))}
          </div>
        </div>
      </div>

      {/* Floating tab bar */}
      <div
        className="absolute inset-x-4 bottom-[34px] flex h-[60px] items-center justify-around rounded-[24px] border shadow-[0_8px_24px_-6px_rgba(15,23,42,.18)]"
        style={{ background: T.card, borderColor: T.hairline }}
      >
        {TABS.map(([label, Icon], i) => (
          <span key={label} className="flex flex-col items-center gap-1 text-[10.5px] font-semibold" style={{ color: i === 0 ? a.brand : T.muted }}>
            <Icon size={22} />
            {label}
          </span>
        ))}
      </div>
      {/* Home indicator */}
      <span className="absolute bottom-2 left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-black" />
    </div>
  );
}

function Ring({ progress, label, color }: { progress: number; label: string; color: string }) {
  const r = 23;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative flex size-[54px] shrink-0 items-center justify-center">
      <svg width="54" height="54" viewBox="0 0 54 54" className="absolute inset-0 -rotate-90">
        <circle cx="27" cy="27" r={r} fill="none" stroke={T.hairline} strokeWidth="5" />
        <circle cx="27" cy="27" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c * progress} ${c}`} />
      </svg>
      <span className="text-[12px] font-bold">{label}</span>
    </span>
  );
}
