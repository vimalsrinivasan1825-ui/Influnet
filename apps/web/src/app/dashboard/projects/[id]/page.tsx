'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/api-client';
import {
  DndContext, DragOverlay, useSensor, useSensors,
  PointerSensor, useDraggable, useDroppable,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import {
  ArrowLeft, MessageSquare, Plus, X, Calendar,
  GripVertical, Circle, CheckCircle2, Clock,
  Trash2, Save, Zap, Wallet, FileText, Camera, Scissors, Eye,
  RefreshCw, ThumbsUp, CreditCard, Award,
} from 'lucide-react';
import type { ProjectCard } from '@/types';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';

const ROW_HEIGHT = 64;
const HEADER_HEIGHT = 44;

const STAGE_ICONS: Record<string, React.ComponentType<any>> = {
  collaboration_started: Zap, project_discussion: MessageSquare,
  advance_payment: Wallet, content_planning: FileText,
  content_confirmation: CheckCircle2, shooting_in_progress: Camera,
  editing_in_progress: Scissors, sent_for_review: Eye,
  revisions: RefreshCw, final_approval: ThumbsUp,
  final_payment: CreditCard, project_completed: Award,
};

const STAGE_CONFIG: { key: string; label: string; color: string }[] = [
  { key: 'collaboration_started', label: 'Started', color: '#3b82f6' },
  { key: 'project_discussion', label: 'Discussion', color: '#6366f1' },
  { key: 'advance_payment', label: 'Deposit', color: '#10b981' },
  { key: 'content_planning', label: 'Planning', color: '#f59e0b' },
  { key: 'content_confirmation', label: 'Approved', color: '#06b6d4' },
  { key: 'shooting_in_progress', label: 'Shooting', color: '#a855f7' },
  { key: 'editing_in_progress', label: 'Editing', color: '#ec4899' },
  { key: 'sent_for_review', label: 'Review', color: '#eab308' },
  { key: 'revisions', label: 'Revisions', color: '#f43f5e' },
  { key: 'final_approval', label: 'Final OK', color: '#14b8a6' },
  { key: 'final_payment', label: 'Payment', color: '#10b981' },
  { key: 'project_completed', label: 'Completed', color: '#16a34a' },
];

const CARD_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#64748b',
];

function getDateRangeFromStart(startDate: Date, days = 18): Date[] {
  const dates: Date[] = [];
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function dateToKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function isToday(date: Date): boolean {
  const t = new Date();
  return date.getFullYear() === t.getFullYear() && date.getMonth() === t.getMonth() && date.getDate() === t.getDate();
}

function getCardDateKey(card: ProjectCard): string {
  if (card.start_date) return dateToKey(new Date(card.start_date));
  if (card.due_date) return dateToKey(new Date(card.due_date));
  return '';
}

function getDateRowIndex(card: ProjectCard, dates: Date[]): number {
  if (card.start_date) {
    const cd = new Date(card.start_date);
    cd.setHours(0, 0, 0, 0);
    const ds = new Date(dates[0]);
    ds.setHours(0, 0, 0, 0);
    const diffDays = Math.round((cd.getTime() - ds.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays < dates.length) return diffDays;
  }
  return 0;
}

function getCardSpanInRows(card: ProjectCard, dates: Date[]): number {
  const startRow = getDateRowIndex(card, dates);
  if (card.due_date) {
    const dd = new Date(card.due_date);
    dd.setHours(0, 0, 0, 0);
    const endRow = getDateRowIndex({ ...card, start_date: card.due_date }, dates);
    if (endRow >= startRow) return Math.min(endRow - startRow + 1, dates.length - startRow);
  }
  return 1;
}

function getCardHeight(card: ProjectCard, dates: Date[]): number {
  const span = getCardSpanInRows(card, dates);
  return span * ROW_HEIGHT - 4;
}

function isCellCoveredBySpan(card: ProjectCard, datesList: Date[], cellDate: string | null): boolean {
  if (!cellDate) return false;
  const cell = new Date(cellDate);
  cell.setHours(0, 0, 0, 0);
  const startRow = getDateRowIndex(card, datesList);
  const span = getCardSpanInRows(card, datesList);
  for (let i = startRow; i < startRow + span; i++) {
    if (datesList[i] && cell.getTime() === datesList[i].getTime()) return true;
  }
  return false;
}

// ─── Hex color → light tint for card backgrounds ───
function hexToLightBg(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  // Mix 85% white + 15% original → very pale tint
  const lighten = (c: number) => Math.round(c + (255 - c) * 0.85);
  return `rgb(${lighten(r)}, ${lighten(g)}, ${lighten(b)})`;
}

// ─── Draggable Card with resize handle ───
function DraggableCard({ card, onOpen, isDragging, top, dates, onResizeEnd }: {
  card: ProjectCard; onOpen: (c: ProjectCard) => void; isDragging: boolean;
  top: number; dates: Date[]; onResizeEnd: (cardId: string, newSpan: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: card.id, data: { type: 'card', card },
  });

  const cardRef = useRef<HTMLDivElement | null>(null);
  const resizeState = useRef<{ startY: number; startSpan: number } | null>(null);

  const statusColor = card.status === 'completed' ? '#16a34a' : card.status === 'in_progress' ? '#d97706' : '#94a3b8';
  const borderColor = card.card_color || statusColor;
  const span = getCardSpanInRows(card, dates);
  const cardHeight = span * ROW_HEIGHT - 8;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    const currentSpan = getCardSpanInRows(card, dates);
    resizeState.current = { startY: e.clientY, startSpan: currentSpan };

    const handleMove = (ev: PointerEvent) => {
      if (!resizeState.current) return;
      const dy = ev.clientY - resizeState.current.startY;
      const newSpan = Math.max(1, resizeState.current.startSpan + Math.round(dy / ROW_HEIGHT));
      const el = cardRef.current;
      if (el) {
        el.style.height = `${newSpan * ROW_HEIGHT - 8}px`;
      }
    };

    const handleUp = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      if (resizeState.current) {
        const dy = ev.clientY - resizeState.current.startY;
        const newSpan = Math.max(1, resizeState.current.startSpan + Math.round(dy / ROW_HEIGHT));
        resizeState.current = null;
        onResizeEnd(card.id, newSpan);
      }
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  }, [card, dates, onResizeEnd]);

  const mergedRef = useCallback((el: HTMLDivElement | null) => {
    cardRef.current = el;
    setNodeRef(el);
  }, [setNodeRef]);

  return (
    <div
      ref={mergedRef}
      {...listeners}
      {...attributes}
      onClick={(e) => { e.stopPropagation(); onOpen(card); }}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0 : 1,
        background: card.card_color ? hexToLightBg(card.card_color) : '#fff', borderRadius: 5,
        border: `1px solid ${card.card_color ? borderColor : '#e2e8f0'}`, borderLeft: `3px solid ${borderColor}`,
        padding: '5px 7px', cursor: 'grab',
        boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.1)' : '0 1px 2px rgba(0,0,0,0.04)',
        display: 'flex', flexDirection: 'column', gap: 2, userSelect: 'none',
        height: cardHeight, boxSizing: 'border-box', overflow: 'hidden',
        minWidth: 100, width: 'calc(100% - 8px)',
        position: 'absolute', top: top, left: 4, zIndex: 2,
        fontSize: 12,
      }}
    >
      {/* Card top row: icon + title + grip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <div style={{ color: borderColor, display: 'flex', flexShrink: 0 }}>
          {card.status === 'completed' ? <CheckCircle2 size={12} /> : card.status === 'in_progress' ? <Clock size={12} /> : <Circle size={12} />}
        </div>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', lineHeight: 1.3, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {card.title}
        </span>
        <div style={{ color: '#cbd5e1', flexShrink: 0 }}><GripVertical size={9} /></div>
      </div>

      {/* Card info row: date badge + meeting badge */}
      <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
        {card.start_date && (
          <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', background: '#f8fafc', padding: '1px 4px', borderRadius: 3, whiteSpace: 'nowrap' }}>
            {new Date(card.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            {card.due_date && (
              <> – {new Date(card.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>
            )}
          </div>
        )}
        {card.meeting_link && (
          <div style={{ fontSize: 9, fontWeight: 700, color: '#6366f1', background: '#eef2ff', padding: '1px 4px', borderRadius: 3, whiteSpace: 'nowrap' }}>
            Meet
          </div>
        )}
      </div>

      {/* Resize handle at bottom */}
      <div
        onPointerDown={onPointerDown}
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 10, cursor: 'ns-resize', zIndex: 5,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div style={{ width: 28, height: 2.5, background: '#cbd5e1', borderRadius: 2, opacity: 0.6 }} />
      </div>
    </div>
  );
}

// ─── Column ───
function Column({ stage, cards, dates, onOpenCard, onAddCard, onClearColumn, activeCardId, onResizeEnd }: {
  stage: typeof STAGE_CONFIG[number];
  cards: ProjectCard[];
  dates: Date[];
  onOpenCard: (c: ProjectCard) => void;
  onAddCard: (stageKey: string, date?: Date) => void;
  onClearColumn: (stageKey: string) => void;
  activeCardId: string | null;
  onResizeEnd: (cardId: string, newSpan: number) => void;
}) {
  const { setNodeRef: droppableRef, isOver } = useDroppable({
    id: `column-${stage.key}`, data: { type: 'column', stage: stage.key },
  });

  const cardsByDate = useMemo(() => {
    const map: Record<string, ProjectCard[]> = {};
    for (const card of cards) {
      const key = getCardDateKey(card);
      if (!map[key]) map[key] = [];
      map[key].push(card);
    }
    return map;
  }, [cards]);

  return (
    <div
      ref={droppableRef}
      data-column={stage.key}
      style={{
        display: 'flex', flexDirection: 'column',
        minWidth: 280, maxWidth: 300, flexShrink: 0,
        background: isOver ? '#e2e8f0' : '#f1f5f9',
        borderRadius: 10, border: isOver ? '2px dashed var(--brand)' : '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden', position: 'relative',
      }}
    >
      {/* Column header */}
      <div style={{
        height: HEADER_HEIGHT, padding: '0 8px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#fff', flexShrink: 0, boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ color: stage.color, display: 'flex' }}>
            {React.createElement(STAGE_ICONS[stage.key] || Circle, { size: 14 })}
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{stage.label}</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', background: '#e2e8f0', borderRadius: 4, padding: '0 5px' }}>{cards.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {cards.length > 0 && (
            <button onClick={() => onClearColumn(stage.key)} title="Clear all cards" style={{
              border: 'none', background: 'transparent', cursor: 'pointer', padding: 2, borderRadius: 4, color: '#f87171', display: 'flex',
            }}>
              <Trash2 size={11} />
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onAddCard(stage.key); }} title="Add card at today" style={{
            border: 'none', background: 'transparent', cursor: 'pointer', padding: 2, borderRadius: 4, color: '#94a3b8', display: 'flex',
          }}><Plus size={13} /></button>
        </div>
      </div>

      {/* Body with date rows */}
      <div style={{ position: 'relative', height: dates.length * ROW_HEIGHT, flexShrink: 0 }}>
        {/* Background date rows (non-interactive grid) */}
        {dates.map(date => (
          <div
            key={dateToKey(date)}
            style={{
              height: ROW_HEIGHT, boxSizing: 'border-box',
              borderBottom: '1px solid #e2e8f0',
              background: date < new Date(new Date().setHours(0, 0, 0, 0)) ? '#f8fafc' : '#fff',
            }}
          />
        ))}

        {/* Cards — absolutely positioned at their date row */}
        {cards.map(card => {
          const rowIdx = getDateRowIndex(card, dates);
          return (
            <DraggableCard
              key={card.id}
              card={card}
              onOpen={onOpenCard}
              isDragging={activeCardId === card.id}
              top={rowIdx * ROW_HEIGHT + 4}
              dates={dates}
              onResizeEnd={onResizeEnd}
            />
          );
        }).sort((a, b) => {
          const rowA = getDateRowIndex(cards.find(c => c.id === a.key)!, dates);
          const rowB = getDateRowIndex(cards.find(c => c.id === b.key)!, dates);
          return rowA - rowB;
        })}

        {/* Click targets on empty cells + hover feedback */}
        {dates.map((date, ri) => {
          const dk = dateToKey(date);
          const cellFull = (cardsByDate[dk]?.length ?? 0) >= 1;
          // Also check if any spanning card covers this cell
          const cellCovered = !cellFull && cards.some(c => isCellCoveredBySpan(c, dates, date.toISOString()));
          return (
            <div
              key={`target-${dk}`}
              onClick={() => { if (!cellFull && !cellCovered) onAddCard(stage.key, date); }}
              style={{
                position: 'absolute', top: ri * ROW_HEIGHT, left: 0, right: 0,
                height: ROW_HEIGHT, boxSizing: 'border-box',
                cursor: (cellFull || cellCovered) ? 'default' : 'pointer',
                zIndex: 1,
              }}
              onMouseEnter={e => { if (!cellFull && !cellCovered) (e.currentTarget as HTMLElement).style.background = 'rgba(238,62,150,0.04)'; }}
              onMouseLeave={e => { if (!cellFull && !cellCovered) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Card Detail Modal ───
function CardDetailModal({ card, onClose, onSave, onDelete }: {
  card: ProjectCard | null; onClose: () => void;
  onSave: (id: string, data: Partial<ProjectCard>) => void; onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [status, setStatus] = useState<ProjectCard['status']>('not_started');
  const [cardColor, setCardColor] = useState<string | null>(null);

  useEffect(() => {
    if (card) {
      setTitle(card.title); setDesc(card.description || '');
      setStartDate(card.start_date?.split('T')[0] || '');
      setDueDate(card.due_date?.split('T')[0] || '');
      setMeetingLink(card.meeting_link || '');
      setStatus(card.status || 'not_started');
      setCardColor(card.card_color || null);
    }
  }, [card]);

  if (!card) return null;

  const STATUS_OPTS = [
    { key: 'not_started' as const, label: 'New' },
    { key: 'in_progress' as const, label: 'Progress' },
    { key: 'completed' as const, label: 'Done' },
  ];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-content/45 p-5 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-hairline bg-surface-card p-5 shadow-[var(--shadow-pop)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-extrabold tracking-tight text-content">Card details</h3>
          <button
            onClick={onClose}
            className="rounded-lg bg-surface-muted p-1.5 text-content-soft transition-colors hover:text-content"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3.5">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>End</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Add notes…" />
          </div>

          <div>
            <Label>Meeting link</Label>
            <Input value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} placeholder="https://meet.google.com/…" />
          </div>

          <div>
            <Label>Card color</Label>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setCardColor(null)}
                title="Default (status-based)"
                className={`flex size-7 items-center justify-center rounded-md bg-surface-muted text-content-muted ${cardColor === null ? 'ring-2 ring-content' : 'ring-1 ring-hairline-strong'}`}
              >
                <Circle size={12} />
              </button>
              {CARD_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setCardColor(color)}
                  title={color}
                  className={`size-7 rounded-md ${cardColor === color ? 'ring-2 ring-content' : 'ring-1 ring-hairline-strong'}`}
                  style={{ background: color }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-1.5">
              {STATUS_OPTS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setStatus(s.key)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    status === s.key
                      ? 'bg-brand-soft text-brand-strong'
                      : 'bg-surface-muted text-content-muted hover:text-content'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={() => onDelete(card.id)}>
                <Trash2 /> Delete
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  onSave(card.id, {
                    title,
                    description: desc,
                    start_date: startDate ? new Date(startDate).toISOString() : null,
                    due_date: dueDate ? new Date(dueDate).toISOString() : null,
                    meeting_link: meetingLink || null,
                    status,
                    card_color: cardColor,
                  })
                }
              >
                <Save /> Save
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───
export default function ProjectKanbanPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<any>(null);
  const [cards, setCards] = useState<ProjectCard[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [modalCard, setModalCard] = useState<ProjectCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [dates, setDates] = useState<Date[]>([]);
  useEffect(() => {
    if (project?.created_at) {
      setDates(getDateRangeFromStart(new Date(project.created_at), 18));
    }
  }, [project?.created_at]);

  const pendingCreations = useRef<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [projRes, cardsRes] = await Promise.all([
        apiFetch<{ project: any }>(`/api/projects/${projectId}`),
        apiFetch<{ cards: ProjectCard[] }>(`/api/projects/${projectId}/cards`),
      ]);
      if (projRes.ok && projRes.data) { const d = projRes.data; setProject(d.project); }
      else { setError(projRes.error || 'Failed to load project'); }
      if (cardsRes.ok && cardsRes.data) { const d = cardsRes.data; setCards(d.cards || []); }
      else { setError(cardsRes.error || 'Failed to load cards'); }
    } catch (e) { console.error(e); setError('Network error'); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => {
    const init = async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      setUserId(user?.id || null);
      await fetchData();
    };
    init();
  }, [fetchData]);

  const cardsByStage = useMemo(() => {
    const grouped: Record<string, ProjectCard[]> = {};
    for (const stage of STAGE_CONFIG) {
      const sc = cards.filter(c => c.stage_key === stage.key);
      sc.sort((a, b) => getDateRowIndex(a, dates) - getDateRowIndex(b, dates));
      grouped[stage.key] = sc;
    }
    return grouped;
  }, [cards, dates]);

  // ─── Drag ───
  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveCardId(null);
    const { active, over } = event;
    if (!over) return;

    const activeCardData = cards.find(c => c.id === active.id);
    if (!activeCardData) return;

    let targetStageKey = activeCardData.stage_key;
    if (over.data.current?.type === 'column') {
      targetStageKey = over.data.current.stage;
    } else if (over.data.current?.type === 'card') {
      const overCard = cards.find(c => c.id === over.id);
      if (overCard) targetStageKey = overCard.stage_key;
    }

    const colEl = document.querySelector(`[data-column="${targetStageKey}"]`);
    const colRect = colEl?.getBoundingClientRect();
    const translated = event.active.rect.current?.translated;

    let targetDate = activeCardData.start_date;
    if (colRect && translated) {
      const relativeY = translated.top - colRect.top - HEADER_HEIGHT;
      const rowIdx = Math.max(0, Math.min(dates.length - 1, Math.round(relativeY / ROW_HEIGHT)));
      if (dates[rowIdx]) targetDate = dates[rowIdx].toISOString();
    }

    const targetKey = targetDate ? dateToKey(new Date(targetDate)) : '';

    // Check one-card-per-cell limit (including spanning cards covering this cell)
    const cellFull = cards.some(c =>
      c.id !== active.id && c.stage_key === targetStageKey &&
      (getCardDateKey(c) === targetKey || isCellCoveredBySpan(c, dates, targetDate))
    );
    if (cellFull) {
      console.warn('Target cell already has a card — drop refused');
      return;
    }

    setCards(prev => prev.map(c =>
      c.id === active.id ? { ...c, stage_key: targetStageKey, start_date: targetDate } : c
    ));

    try {
      await apiFetch(`/api/projects/${projectId}/cards/${activeCardData.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage_key: targetStageKey, start_date: targetDate })
      });
    } catch (e) { console.error(e); }
  };

  // ─── Card CRUD ───
  const handleAddCard = async (stageKey: string, date?: Date) => {
    const targetDate = date || new Date();
    const targetKey = dateToKey(targetDate);
    const cellKey = `${stageKey}-${targetKey}`;

    if (pendingCreations.current.has(cellKey)) return;
    pendingCreations.current.add(cellKey);

    try {
      const cellFull = cards.some(c =>
        c.stage_key === stageKey && (
          getCardDateKey(c) === targetKey ||
          isCellCoveredBySpan(c, dates, targetDate.toISOString())
        )
      );
      if (cellFull) { console.warn('Cell already has a card or is covered by a span'); return; }

      const res = await apiFetch<{ card: ProjectCard }>(`/api/projects/${projectId}/cards`, {
        method: 'POST',
        body: JSON.stringify({ stage_key: stageKey, title: 'New Task', start_date: targetDate.toISOString() })
      });
      if (!res.ok || !res.data) { console.error('Card creation failed:', res.error); return; }
      if (res.data!.card) setCards(prev => [...prev, res.data!.card]);
    } catch (e) { console.error('Card creation error:', e); }
    finally { pendingCreations.current.delete(cellKey); }
  };

  const handleClearColumn = async (stageKey: string) => {
    const toDelete = cards.filter(c => c.stage_key === stageKey);
    if (toDelete.length === 0) return;

    try {
      await Promise.all(toDelete.map(c =>
        apiFetch(`/api/projects/${projectId}/cards/${c.id}`, { method: 'DELETE' })
      ));
      setCards(prev => prev.filter(c => c.stage_key !== stageKey));
    } catch (e) { console.error(e); }
  };

  const handleResizeEnd = async (cardId: string, newSpan: number) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;

    const startRow = getDateRowIndex(card, dates);
    const endRow = startRow + newSpan - 1;
    if (endRow >= dates.length) return;

    const newDueDate = dates[endRow].toISOString();

    setCards(prev => prev.map(c => c.id === cardId ? { ...c, due_date: newDueDate } : c));

    try {
      await apiFetch(`/api/projects/${projectId}/cards/${cardId}`, {
        method: 'PATCH',
        body: JSON.stringify({ due_date: newDueDate })
      });
    } catch (e) { console.error(e); }
  };

  const activeCard = useMemo(() => cards.find(c => c.id === activeCardId) || null, [cards, activeCardId]);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-surface">
      {/* Top Bar */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-hairline bg-surface-card px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Button variant="surface" size="icon" onClick={() => router.push('/dashboard/projects')} aria-label="Back to projects">
            <ArrowLeft size={16} />
          </Button>
          <div className="flex items-center gap-2.5">
            {project && (
              <Avatar
                name={(project.owner_user_id === userId ? project.counterparty : project.owner)?.name}
                size="sm"
                square
              />
            )}
            <div>
              <div className="text-[0.625rem] font-bold uppercase tracking-[0.08em] text-brand">
                {project && (project.owner_user_id === userId ? 'Client portal' : 'Creator portal')}
                {project ? ` · With ${(project.owner_user_id === userId ? project.counterparty : project.owner)?.name || 'Partner'}` : ''}
              </div>
              <h1 className="text-[0.95rem] font-extrabold tracking-tight text-content">{project?.title || 'Loading…'}</h1>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {project?.budget != null && project.budget !== '' && (
            <Badge variant="success" size="md">₹{Number(project.budget).toLocaleString()}</Badge>
          )}
          {project?.conversation_id && (
            <ButtonLink href={`/dashboard/messages?conv=${project.conversation_id}`} variant="surface" size="sm">
              <MessageSquare size={14} /> Chat
            </ButtonLink>
          )}
          <Badge variant="neutral" size="md">
            Stage {STAGE_CONFIG.findIndex((s) => s.key === project?.current_stage) + 1}/{STAGE_CONFIG.length}
          </Badge>
        </div>
      </div>

      {/* Board */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-[3px] border-hairline border-t-brand" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <h2 className="text-base font-extrabold text-content">{error}</h2>
          <Button variant="brand" onClick={fetchData}>Retry</Button>
        </div>
      ) : !project ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <h2 className="text-base font-extrabold text-content">Project not found</h2>
          <ButtonLink href="/dashboard/projects" variant="brand">Back to projects</ButtonLink>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', padding: '0 0 0 10px' }}>
          {/* Left Date Panel — sticky */}
          <div style={{ position: 'sticky', left: 0, zIndex: 10, background: '#fff', borderRight: '1px solid #e2e8f0', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Header aligned with column headers */}
            <div style={{
              height: HEADER_HEIGHT, boxSizing: 'border-box',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#fff', padding: '0 10px',
            }}>
              <Calendar size={14} color="#64748b" />
            </div>
            {/* Date rows */}
            <div style={{ height: dates.length * ROW_HEIGHT }}>
              {dates.map(date => (
                <div key={dateToKey(date)} style={{
                  height: ROW_HEIGHT, boxSizing: 'border-box',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex', flexDirection: 'column', justifyContent: 'center',
                  padding: '0 10px',
                  background: isToday(date) ? 'var(--brand-soft)' : '#fff',
                }}>
                  <div style={{ fontSize: 12, fontWeight: isToday(date) ? 900 : 700, color: isToday(date) ? 'var(--brand-strong)' : '#0f172a', lineHeight: 1.2 }}>
                    {date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 600, color: '#94a3b8' }}>
                    {date.toLocaleDateString('en-IN', { weekday: 'short' })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Columns */}
          <div style={{ display: 'flex', gap: 10, paddingRight: 10 }}>
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              {STAGE_CONFIG.map(stage => (
                <Column
                  key={stage.key}
                  stage={stage}
                  cards={cardsByStage[stage.key] || []}
                  dates={dates}
                  onOpenCard={setModalCard}
                  onAddCard={handleAddCard}
                  onClearColumn={handleClearColumn}
                  activeCardId={activeCardId}
                  onResizeEnd={handleResizeEnd}
                />
              ))}
              <DragOverlay>
                {activeCard && (
                  <div style={{
                    background: '#fff', borderRadius: 5, padding: '6px 10px',
                    boxShadow: '0 12px 36px rgba(0,0,0,0.12)',
                    fontSize: 12, fontWeight: 800, color: '#0f172a',
                    border: '2px solid var(--brand)',
                    width: 260, height: ROW_HEIGHT - 8,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <CheckCircle2 size={13} color="#94a3b8" />
                    {activeCard.title}
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      )}

      <CardDetailModal card={modalCard} onClose={() => setModalCard(null)}
        onSave={async (id, updates) => {
          try {
            const res = await apiFetch<{ card: ProjectCard }>(`/api/projects/${projectId}/cards/${id}`, {
              method: 'PATCH',
              body: JSON.stringify(updates)
            });
            if (res.ok && res.data) { setCards(prev => prev.map(c => c.id === id ? res.data!.card : c)); setModalCard(null); }
          } catch (e) { console.error(e); }
        }}
        onDelete={async (id) => {
          try {
            const res = await apiFetch(`/api/projects/${projectId}/cards/${id}`, { method: 'DELETE' });
            if (res.ok) { setCards(prev => prev.filter(c => c.id !== id)); setModalCard(null); }
          } catch (e) { console.error(e); }
        }}
      />
    </div>
  );
}
