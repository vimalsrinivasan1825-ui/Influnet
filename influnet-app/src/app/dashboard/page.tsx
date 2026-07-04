'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface DashboardData {
  profile: { company_name: string; industry: string; logo_url: string | null; };
}

const HEATMAP: number[][] = [
  [0, 1, 2, 3, 1, 0, 0],
  [1, 2, 3, 4, 2, 1, 0],
  [0, 0, 2, 3, 4, 2, 1],
  [2, 3, 4, 4, 3, 0, 0],
  [1, 2, 3, 2, 4, 3, 1],
  [0, 1, 2, 3, 2, 1, 0],
  [2, 4, 3, 4, 3, 2, 1],
];
const DAYS = ['M','T','W','T','F','S','S'];

const heatColor = (v: number) =>
  ['bg-gray-100','bg-pink-100','bg-pink-300','bg-pink-500','bg-pink-700'][v] ?? 'bg-gray-100';

export default function BusinessDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  useEffect(() => {
    fetch('/api/business/dashboard').then(r => r.ok ? r.json() : null).then(j => j && setData(j)).catch(() => {});
  }, []);

  const company = data?.profile?.company_name || 'Your Company';

  return (
    <div style={{
      height: 'calc(100vh - 56px)',
      padding: '14px 18px',
      background: '#f8fafc',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      overflow: 'hidden',
      fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif',
      color: '#020617',
    }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg,#ee3e96,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 16, flexShrink: 0 }}>
            {company.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#ee3e96' }}>Portal · Dashboard</div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#020617', letterSpacing: '-0.02em', lineHeight: 1 }}>Good morning, {company}</h1>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 10, fontWeight: 700, color: '#64748b' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            18–22 Nov 2025
          </div>
          <Link href="/dashboard/discover" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: 'linear-gradient(105deg,#ee3e96,#f26e59)', color: '#fff', fontWeight: 700, borderRadius: 12, fontSize: 11, textDecoration: 'none', boxShadow: '0 4px 14px rgba(238,62,150,0.25)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            Discover Creators
          </Link>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 11, fontWeight: 700, color: '#374151', cursor: 'pointer' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </button>
        </div>
      </div>

      {/* ── BENTO GRID ── */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: '1.15fr 1fr 0.85fr',
        gridTemplateRows: '1.1fr 0.9fr 0.9fr',
        gridTemplateAreas: `
          "chart   collabs sidebar"
          "heatmap niche   sidebar"
          "heatmap recruits spends"
        `,
        gap: 10,
      }}>

        {/* ──── CHART (wide, row 1 col 1-2) ──── */}
        <div style={{ gridArea: 'chart', background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', boxShadow: '0 2px 16px rgba(0,0,0,0.03)', padding: '16px 18px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 4 }}>Campaign Reach · Weekly</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 28, fontWeight: 900, color: '#020617', letterSpacing: '-0.03em', lineHeight: 1 }}>46.5K</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 7px', borderRadius: 8 }}>+8.5%</span>
                <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, marginLeft: 8 }}>Peak: Fri 35.2K</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              {[{c:'#ee3e96',l:'Instagram'},{c:'#a855f7',l:'YouTube'}].map(x => (
                <span key={x.l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: '#64748b' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: x.c, display: 'inline-block' }}/>
                  {x.l}
                </span>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>
            <svg width="100%" height="100%" viewBox="0 0 340 90" preserveAspectRatio="none">
              <defs>
                <linearGradient id="areaG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ee3e96" stopOpacity="0.12"/>
                  <stop offset="100%" stopColor="#ee3e96" stopOpacity="0"/>
                </linearGradient>
              </defs>
              {[18,40,62].map(y => <line key={y} x1="0" y1={y} x2="340" y2={y} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4"/>)}
              <path d="M 0 78 L 49 80 L 97 65 L 146 70 L 194 42 L 243 50 L 291 28 L 340 14 L 340 90 L 0 90 Z" fill="url(#areaG)"/>
              <path d="M 0 78 L 49 80 L 97 65 L 146 70 L 194 42 L 243 50 L 291 28 L 340 14" fill="none" stroke="#ee3e96" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="194" y1="10" x2="194" y2="80" stroke="#ee3e96" strokeWidth="1" strokeDasharray="3 3" opacity="0.5"/>
              {[[0,78],[49,80],[97,65],[146,70],[194,42],[243,50],[291,28],[340,14]].map(([x,y],i) => (
                <circle key={i} cx={x} cy={y} r="3.5" fill="#ee3e96" stroke="white" strokeWidth="1.5"/>
              ))}
              <rect x="165" y="3" width="58" height="16" rx="5" fill="#0f172a"/>
              <text x="194" y="13.5" fill="white" fontSize="8" fontWeight="bold" textAnchor="middle">Fri: 35.2K ↑</text>
            </svg>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.08em', flexShrink: 0, marginTop: 4, padding: '0 2px' }}>
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <span key={d}>{d}</span>)}
          </div>
        </div>

        {/* ──── ACTIVE COLLABS (tall, rows 1-2 col 2) ──── */}
        <div style={{ gridArea: 'collabs', background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', boxShadow: '0 2px 16px rgba(0,0,0,0.03)', padding: '16px 18px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 12, flexShrink: 0 }}>Active Collabs</div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly' }}>
            {[
              { name: 'Syafanah san', amount: '₹12,500', status: 'In Progress', sc: { bg: '#fffbeb', color: '#d97706' }, av: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=60&h=60&q=80', platform: 'Instagram', reach: '45K' },
              { name: 'Devon Lane', amount: '₹8,000', status: 'Completed', sc: { bg: '#f0fdf4', color: '#16a34a' }, av: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=60&h=60&q=80', platform: 'YouTube', reach: '28K' },
              { name: 'Marvin McKinney', amount: '₹15,000', status: 'Completed', sc: { bg: '#f0fdf4', color: '#16a34a' }, av: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=60&h=60&q=80', platform: 'Instagram', reach: '62K' },
              { name: 'Eleanor Pena', amount: '₹22,500', status: 'Negotiation', sc: { bg: '#fdf2f8', color: '#ee3e96' }, av: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=60&h=60&q=80', platform: 'TikTok', reach: '91K' },
            ].map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: '1px solid #f8fafc' }}>
                <img src={c.av} alt={c.name} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: '#020617', marginBottom: 2 }}>{c.name}</div>
                  <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700 }}>{c.platform} · {c.reach} reach</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: '#020617', marginBottom: 3 }}>{c.amount}</div>
                  <span style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 6, background: c.sc.bg, color: c.sc.color }}>{c.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ──── SIDEBAR (tall, rows 1-3 col 3) ──── */}
        <div style={{ gridArea: 'sidebar', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Collab Breakdown */}
          <div style={{ flex: 1, background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', boxShadow: '0 2px 16px rgba(0,0,0,0.03)', padding: '16px 18px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 10, flexShrink: 0 }}>Collab Breakdown</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minHeight: 0 }}>
              {/* Mini gauge */}
              <div style={{ position: 'relative', flexShrink: 0, width: 72, height: 72 }}>
                <svg width="72" height="72" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="38" fill="none" stroke="#f1f5f9" strokeWidth="11"/>
                  <circle cx="50" cy="50" r="38" fill="none" stroke="#ee3e96" strokeWidth="11" strokeDasharray="162 239" strokeDashoffset="60" strokeLinecap="round"/>
                  <circle cx="50" cy="50" r="38" fill="none" stroke="#a855f7" strokeWidth="11" strokeDasharray="62 239" strokeDashoffset="-102" strokeLinecap="round"/>
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1, color: '#020617' }}>120</div>
                  <div style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8' }}>Total</div>
                </div>
              </div>
              {/* Breakdown list */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Completed', val: 82, color: '#ee3e96', pct: '68%' },
                  { label: 'In Progress', val: 38, color: '#a855f7', pct: '32%' },
                  { label: 'Negotiation', val: 12, color: '#f59e0b', pct: '10%' },
                ].map((r, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: '#475569', marginBottom: 3 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: r.color, display: 'inline-block' }}/>
                        {r.label}
                      </span>
                      <span style={{ fontWeight: 900, color: '#020617' }}>{r.val}</span>
                    </div>
                    <div style={{ height: 4, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: r.pct, background: r.color, borderRadius: 4 }}/>
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 10, fontWeight: 800, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '3px 8px', borderRadius: 8, marginTop: 2, display: 'inline-block', alignSelf: 'flex-start' }}>
                  14.2% conversion ↑
                </div>
              </div>
            </div>
          </div>

          {/* Engagement Index */}
          <div style={{ flex: 1, background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', boxShadow: '0 2px 16px rgba(0,0,0,0.03)', padding: '16px 18px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 10, flexShrink: 0 }}>Engagement Index</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexShrink: 0 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg,#ee3e96,#a855f7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, boxShadow: '0 4px 12px rgba(238,62,150,0.2)' }}>
                <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1 }}>8.5</div>
                <div style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', opacity: 0.8 }}>Score</div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: '#020617' }}>Excellent Quality</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a' }}>Top 5% of fashion brands</div>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', borderTop: '1px solid #f8fafc', paddingTop: 8 }}>
              {[
                { l: 'Audience Overlap', v: '1.4%', note: 'Low' },
                { l: 'ROAS', v: '2.8×', note: 'Excellent' },
                { l: 'Brand Safety', v: '99.8%', note: 'Verified' },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: '#475569' }}>
                  <span>{r.l}</span>
                  <span style={{ fontWeight: 900, color: '#020617' }}>{r.v} <span style={{ fontSize: 8, color: '#94a3b8', fontWeight: 600 }}>({r.note})</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ──── HEATMAP (tall, rows 2-3 col 1) ──── */}
        <div style={{ gridArea: 'heatmap', background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', boxShadow: '0 2px 16px rgba(0,0,0,0.03)', padding: '16px 18px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8' }}>Activity Heatmap</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {['#f1f5f9','#fce7f3','#f9a8d4','#ec4899','#be185d'].map((c,i) => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: 3, background: c }}/>
              ))}
              <span style={{ fontSize: 8, fontWeight: 700, color: '#94a3b8', marginLeft: 4 }}>More</span>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            {/* Week labels */}
            <div style={{ display: 'flex', gap: 6, paddingLeft: 22, marginBottom: 4 }}>
              {['W1','W2','W3','W4','W5','W6','W7'].map(w => (
                <div key={w} style={{ flex: 1, fontSize: 7, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', textAlign: 'center' }}>{w}</div>
              ))}
            </div>

            {/* Day rows */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', gap: 4 }}>
              {DAYS.map((day, di) => (
                <div key={di} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 16, fontSize: 8, fontWeight: 900, color: '#94a3b8', textAlign: 'right', flexShrink: 0 }}>{day}</span>
                  {HEATMAP.map((week, wi) => (
                    <div
                      key={wi}
                      title={`W${wi+1} ${day}: ${week[di]} activities`}
                      style={{
                        flex: 1,
                        height: 14,
                        borderRadius: 4,
                        background: ['#f1f5f9','#fce7f3','#f9a8d4','#ec4899','#be185d'][week[di]] ?? '#f1f5f9',
                        cursor: 'pointer',
                        transition: 'opacity 0.15s',
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>

            {/* Bottom stats */}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid #f8fafc', flexShrink: 0 }}>
              {[{ l: 'Total', v: '148', c: '#020617' }, { l: 'This Week', v: '22', c: '#16a34a' }, { l: 'Avg / Day', v: '4.8', c: '#ee3e96' }].map((s,i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: s.c, lineHeight: 1 }}>{s.v}</div>
                  <div style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', marginTop: 2 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ──── NICHE ROI (row 2 col 2) ──── */}
        <div style={{ gridArea: 'niche', background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', boxShadow: '0 2px 16px rgba(0,0,0,0.03)', padding: '16px 18px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8' }}>Niche ROI</div>
            <span style={{ fontSize: 9, fontWeight: 900, color: '#ee3e96', background: '#fdf2f8', border: '1px solid #fce7f3', padding: '2px 8px', borderRadius: 8 }}>Fashion ↑</span>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly' }}>
            {[
              { name: 'Fashion & Beauty', pct: 85, color: 'linear-gradient(90deg,#ee3e96,#f26e59)', count: '52' },
              { name: 'Tech & Gadgets',   pct: 64, color: 'linear-gradient(90deg,#a855f7,#7c3aed)', count: '28' },
              { name: 'Fitness & Health', pct: 40, color: 'linear-gradient(90deg,#6366f1,#4f46e5)', count: '15' },
              { name: 'Lifestyle & Food', pct: 55, color: 'linear-gradient(90deg,#f59e0b,#ef4444)', count: '21' },
            ].map((n, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  <span>{n.name} <span style={{ color: '#94a3b8', fontWeight: 600 }}>· {n.count}</span></span>
                  <span style={{ fontWeight: 900, color: '#020617' }}>{n.pct}%</span>
                </div>
                <div style={{ height: 6, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${n.pct}%`, background: n.color, borderRadius: 6 }}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ──── CREATOR RECRUITS (row 3 col 2) ──── */}
        <div style={{ gridArea: 'recruits', background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', boxShadow: '0 2px 16px rgba(0,0,0,0.03)', padding: '16px 18px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, marginBottom: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8' }}>Creator Recruits</div>
            <span style={{ fontSize: 9, fontWeight: 900, color: '#a855f7', background: '#faf5ff', border: '1px solid #e9d5ff', padding: '2px 8px', borderRadius: 8 }}>+7 this week</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0, marginBottom: 10 }}>
            <span style={{ fontSize: 26, fontWeight: 900, color: '#020617', letterSpacing: '-0.03em', lineHeight: 1 }}>45</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>active creators</span>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 5, paddingBottom: 4, borderBottom: '1px solid #f1f5f9' }}>
              {[
                { h: 30, c: '#fce7f3' }, { h: 50, c: '#fbcfe8' }, { h: 42, c: '#e9d5ff' },
                { h: 72, c: '#f9a8d4' }, { h: 90, c: '#ee3e96' }, { h: 60, c: '#c084fc' }, { h: 82, c: '#a855f7' },
              ].map((b, i) => (
                <div key={i} style={{ flex: 1, background: b.c, borderRadius: '4px 4px 0 0', height: `${b.h}%` }}/>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8', marginTop: 4, letterSpacing: '0.06em' }}>
              {['M','T','W','T','F','S','S'].map((d,i) => <span key={i}>{d}</span>)}
            </div>
          </div>
        </div>

        {/* ──── SPENDS (tall, rows 2-3 col 3) ──── */}
        <div style={{ gridArea: 'spends', background: '#0f172a', borderRadius: 18, border: '1px solid #1e293b', boxShadow: '0 12px 40px rgba(15,23,42,0.25)', padding: '16px 18px', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', color: '#fff' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, width: 160, height: 120, background: 'radial-gradient(circle at 100% 0%,rgba(238,62,150,0.18),transparent 70%)', pointerEvents: 'none' }}/>
          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', marginBottom: 10, flexShrink: 0 }}>Spends Tracker</div>

          <div style={{ flexShrink: 0, marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#475569', fontWeight: 700, marginBottom: 4 }}>Monthly Budget</div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1 }}>₹50,000</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 10, borderTop: '1px solid #1e293b', marginBottom: 12, flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 9, color: '#475569', fontWeight: 700 }}>Disbursed</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#e2e8f0' }}>₹35,000</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: '#475569', fontWeight: 700 }}>Remaining</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#f472b6' }}>₹15,000</div>
            </div>
          </div>

          <div style={{ flexShrink: 0, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#475569', fontWeight: 700, marginBottom: 6 }}>
              <span>Usage Progress</span><span>70% Spent</span>
            </div>
            <div style={{ height: 6, background: '#1e293b', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: '70%', background: 'linear-gradient(90deg,#ee3e96,#a855f7)', borderRadius: 6 }}/>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, paddingTop: 10, borderTop: '1px solid #1e293b' }}>
            {[
              { l: 'ROAS', v: '2.8×', up: true },
              { l: 'CPE', v: '₹28', up: false },
              { l: 'CTR', v: '4.2%', up: true },
            ].map((m, i) => (
              <div key={i} style={{ textAlign: 'center', padding: '8px 4px', background: '#1e293b', borderRadius: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: m.up ? '#4ade80' : '#f87171', lineHeight: 1, marginBottom: 3 }}>{m.v}</div>
                <div style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.08em' }}>{m.l}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
