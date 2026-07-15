'use client';
import { toast } from "sonner";

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/api-client';
import {
  DndContext, DragOverlay, useSensor, useSensors,
  PointerSensor, useDraggable, useDroppable,
  defaultDropAnimationSideEffects,
  type DragStartEvent, type DragEndEvent, type DropAnimation,
} from '@dnd-kit/core';

// Smooth "snap into place" when a card is dropped (Trello/Jira feel).
const DROP_ANIMATION: DropAnimation = {
  duration: 200,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }),
};
import {
  ArrowLeft, MessageSquare, Plus, X, Calendar,
  GripVertical, Circle, CheckCircle2, Clock,
  Trash2, Save, Zap, Wallet, FileText, Camera, Scissors, Eye,
  RefreshCw, ThumbsUp, CreditCard, Award, Star,
  Check, Lock, ChevronRight, Loader2, Flag,
  ListChecks, LayoutGrid, Hourglass, History,
  UserPlus, Banknote, SkipForward, Pencil,
  Send, Paperclip, Link2, Download,
  Waypoints, PartyPopper,
} from 'lucide-react';
import type { ProjectCard } from '@/types';
import { blockingItems, type StageItem } from '@/lib/project-stage-items';
import { STAGE_ACTOR, type Stage } from '@/lib/project-lifecycle';
import { STAGE_GUIDE, isMutualSignoffStage, stageSignoffAt, isSkippableStage, stageSkipProposal } from '@/lib/project-stage-guide';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { PaymentGate } from '@/components/dashboard/payment-gate';
import { ProjectFlow } from '@/components/dashboard/project-flow';
import { uploadToCloudinary } from '@/lib/storage/upload-client';

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

// In-app payments enabled? Mirrors PaymentGate — presence of the public key.
// When true, payment gate items are opened only by a confirmed payment, never
// by a manual tick.
const PAYMENTS_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID);

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
        // Glide to the new row/shadow on drop (Jira/Trello feel). We deliberately
        // do NOT transition `transform` so live dragging stays 1:1 with the pointer.
        transition: isDragging ? 'none' : 'top 200ms cubic-bezier(0.2, 0, 0, 1), box-shadow 150ms ease, border-color 150ms ease',
        willChange: 'top, transform',
        background: card.card_color ? hexToLightBg(card.card_color) : '#fff', borderRadius: 6,
        border: `1px solid ${card.card_color ? borderColor : '#e2e8f0'}`, borderLeft: `3px solid ${borderColor}`,
        padding: '5px 7px', cursor: isDragging ? 'grabbing' : 'grab',
        boxShadow: isDragging ? '0 12px 28px rgba(0,0,0,0.14)' : '0 1px 2px rgba(0,0,0,0.05)',
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

// ─── Stage Pipeline (gated checklist + tracker) ───
function StagePipeline({
  currentStage, items, userRole, canToggleStage, canAdvance,
  advancing, advanceError, onToggleItem, onAdvance,
  isFinalPayment, myConfirmed, otherConfirmed, onConfirmCompletion,
  projectId, budget, advanceAmount, onPaid,
}: {
  currentStage?: string;
  items: StageItem[];
  userRole: 'business' | 'creator' | null;
  canToggleStage: boolean;
  canAdvance: boolean;
  advancing: boolean;
  advanceError: string | null;
  onToggleItem: (item: StageItem, done: boolean) => void;
  onAdvance: (stageKey?: string) => void;
  isFinalPayment: boolean;
  myConfirmed: boolean;
  otherConfirmed: boolean;
  onConfirmCompletion: () => void;
  projectId: number | string;
  budget?: number | string | null;
  advanceAmount?: number | string | null;
  onPaid: () => void;
}) {
  // Payment stages carry a money gate — advance_payment always, and
  // final_payment (which also drives the dual-confirm completion).
  const isPaymentStage = currentStage === 'advance_payment' || currentStage === 'final_payment';
  const paymentGateItem = isPaymentStage
    ? items.find((it) => it.stage_key === currentStage && it.is_gate)
    : undefined;
  const currentIdx = STAGE_CONFIG.findIndex((s) => s.key === currentStage);
  const stage = STAGE_CONFIG[currentIdx];
  const nextStage = STAGE_CONFIG[currentIdx + 1];
  const isComplete = currentStage === 'project_completed';
  // 'sent_for_review' forks: the reviewer either sends the draft back for
  // revisions or approves it straight to final approval.
  const isReviewFork = currentStage === 'sent_for_review';

  const roleLabel = (r: string) => (r === 'business' ? 'Client' : r === 'creator' ? 'Creator' : 'Both');

  return (
    <div className="flex-shrink-0 border-b border-hairline bg-surface-card">
      {/* Tracker */}
      <div className="flex items-center gap-1 overflow-x-auto px-4 py-2.5">
        {STAGE_CONFIG.map((s, i) => {
          const state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'upcoming';
          return (
            <div key={s.key} className="flex items-center gap-1">
              <div
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.6875rem] font-bold transition-colors ${
                  state === 'current'
                    ? 'bg-brand text-white'
                    : state === 'done'
                    ? 'bg-ok-soft text-ok'
                    : 'bg-surface-muted text-content-muted'
                }`}
                title={s.label}
              >
                {state === 'done' ? <Check size={11} /> : state === 'current' ? <Circle size={9} fill="currentColor" /> : <Circle size={9} />}
                {s.label}
              </div>
              {i < STAGE_CONFIG.length - 1 && <ChevronRight size={12} className="shrink-0 text-content-muted" />}
            </div>
          );
        })}
      </div>

      {/* Current stage checklist + advance */}
      {!isComplete && stage && (
        <div className="flex flex-col gap-3 border-t border-hairline px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[0.625rem] font-bold uppercase tracking-[0.08em] text-brand">Current stage</span>
              <span className="text-sm font-extrabold text-content">{stage.label}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {items.length === 0 && (
                <span className="text-xs text-content-muted">No required steps — you can advance when ready.</span>
              )}
              {items.map((it) => {
                const canToggleThis = canToggleStage && (it.owner_role === 'both' || it.owner_role === userRole);
                const done = !!it.done_at;
                return (
                  <button
                    key={it.id}
                    disabled={!canToggleThis}
                    onClick={() => onToggleItem(it, !done)}
                    className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                      canToggleThis ? 'hover:bg-surface-muted' : 'cursor-not-allowed opacity-80'
                    }`}
                    title={canToggleThis ? 'Toggle done' : `Only the ${roleLabel(it.owner_role)} can mark this`}
                  >
                    <span
                      className={`flex size-[18px] shrink-0 items-center justify-center rounded-md border ${
                        done ? 'border-ok bg-ok text-white' : 'border-hairline-strong bg-surface'
                      }`}
                    >
                      {done && <Check size={12} />}
                    </span>
                    <span className={`font-semibold ${done ? 'text-content-muted line-through' : 'text-content'}`}>
                      {it.label}
                    </span>
                    {it.is_gate && (
                      <Badge variant="warning" size="sm" className="ml-0.5">
                        <Lock size={9} /> Gate
                      </Badge>
                    )}
                    {it.is_required && !done && (
                      <span className="text-[0.625rem] font-bold uppercase tracking-wide text-content-muted">Required</span>
                    )}
                    <span className="ml-auto text-[0.625rem] font-semibold text-content-muted">{roleLabel(it.owner_role)}</span>
                  </button>
                );
              })}
            </div>

            {isPaymentStage && (currentStage as string) === 'advance_payment' && (
              <PaymentGate
                projectId={projectId}
                stageKey="advance_payment"
                amountRupees={advanceAmount != null && advanceAmount !== '' ? Number(advanceAmount) : budget != null && budget !== '' ? Number(budget) : null}
                userRole={userRole}
                isDone={!!paymentGateItem?.done_at}
                onPaid={onPaid}
              />
            )}
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-1.5 lg:w-64 lg:items-end">
            {isFinalPayment ? (
              <>
                {isFinalPayment && (advanceAmount != null && advanceAmount !== '' ? Number(budget || 0) - Number(advanceAmount) : 0) > 0 && (
                  <div className="mb-4">
                    <PaymentGate
                      projectId={projectId}
                      stageKey="final_payment"
                      amountRupees={(advanceAmount != null && advanceAmount !== '' ? Number(budget || 0) - Number(advanceAmount) : 0)}
                      userRole={userRole}
                      isDone={items.some((it) => it.stage_key === 'final_payment' && it.is_gate && !!it.done_at)}
                      onPaid={onPaid}
                    />
                  </div>
                )}

                <Button
                  variant={myConfirmed ? 'surface' : 'brand'}
                  size="sm"
                  disabled={myConfirmed || advancing}
                  onClick={onConfirmCompletion}
                  className="w-full lg:w-auto"
                >
                  {advancing ? <Loader2 className="animate-spin" /> : myConfirmed ? <Check /> : <ThumbsUp />}
                  {myConfirmed ? 'You confirmed completion' : 'Confirm completion'}
                </Button>
                <span className="text-right text-[0.6875rem] text-content-muted">
                  {otherConfirmed
                    ? 'The other party has confirmed.'
                    : `Waiting on the ${roleLabel(userRole === 'business' ? 'creator' : 'business')} to also confirm.`}
                  {' '}Both must confirm to complete the project.
                </span>
              </>
            ) : isReviewFork ? (
              STAGE_ACTOR[currentStage as Stage] === userRole ? (
                <>
                  <div className="flex w-full flex-col gap-1.5 lg:flex-row lg:justify-end">
                    <Button variant="surface" size="sm" disabled={!canAdvance || advancing} onClick={() => onAdvance('revisions')} className="w-full lg:w-auto">
                      {advancing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      Request revisions
                    </Button>
                    <Button variant="brand" size="sm" disabled={!canAdvance || advancing} onClick={() => onAdvance('final_approval')} className="w-full lg:w-auto">
                      {advancing ? <Loader2 className="animate-spin" /> : <ThumbsUp />}
                      Approve draft
                    </Button>
                  </div>
                  <span className="text-right text-[0.6875rem] text-content-muted">
                    Review the draft — send it back for changes, or approve it to move to final approval.
                  </span>
                  {!canAdvance && (
                    <span className="text-right text-[0.6875rem] text-warn block mt-1">
                      Finish the required steps above first.
                    </span>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-end justify-center py-2">
                  <span className="text-right text-[0.6875rem] text-content-muted">
                    Waiting on the {roleLabel(STAGE_ACTOR[currentStage as Stage] || 'both')} to review the draft.
                  </span>
                </div>
              )
            ) : (
              <>
                <Button variant="brand" size="sm" disabled={!canAdvance || advancing} onClick={() => onAdvance()} className="w-full lg:w-auto">
                  {advancing ? <Loader2 className="animate-spin" /> : <ChevronRight />}
                  {nextStage ? `Advance to ${nextStage.label}` : 'Advance'}
                </Button>
                {!canToggleStage && (
                  <span className="text-right text-[0.6875rem] text-content-muted">
                    Waiting on the {roleLabel(STAGE_ACTOR[currentStage as Stage] || 'both')} to move this stage forward.
                  </span>
                )}
                {canToggleStage && !canAdvance && (
                  <span className="text-right text-[0.6875rem] text-warn">
                    Finish the required steps above to advance.
                  </span>
                )}
              </>
            )}
            {advanceError && <span className="text-right text-[0.6875rem] text-danger">{advanceError}</span>}
          </div>
        </div>
      )}

      {isComplete && (
        <div className="flex items-center gap-2 border-t border-hairline px-4 py-3 text-sm font-bold text-ok">
          <Award size={16} /> Project completed — reviews are now open.
        </div>
      )}
    </div>
  );
}

// ─── Change requests (propose → accept/reject term edits) ───
const CR_FIELD_LABEL: Record<string, string> = {
  title: 'Title', budget: 'Budget', description: 'Description', deliverables: 'Deliverables',
};
function crFormatVal(key: string, v: unknown): string {
  if (v == null || v === '') return '—';
  if (key === 'budget') return `₹${Number(v).toLocaleString('en-IN')}`;
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

function ChangeRequestsPanel({ requests, userId, onAct, onOpenPropose, busy }: {
  requests: any[];
  userId: string | null;
  onAct: (id: string, action: 'accept' | 'reject' | 'withdraw', note?: string) => void;
  onOpenPropose: () => void;
  busy: boolean;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const pending = requests.filter((r) => r.status === 'pending');

  return (
    <div className="mb-4 flex flex-col gap-3">
      {pending.map((cr) => {
        const mine = cr.proposed_by === userId;
        const keys = Object.keys(cr.changes || {});
        return (
          <div key={cr.id} className="rounded-2xl border border-brand/30 bg-brand-soft/30 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-content">
              <Pencil size={15} className="text-brand" />
              {mine ? 'You proposed a change' : 'A change was proposed'}
            </div>
            <div className="mb-3 flex flex-col gap-1.5">
              {keys.map((k) => (
                <div key={k} className="flex flex-wrap items-center gap-x-2 text-sm">
                  <span className="text-[0.625rem] font-bold uppercase tracking-wide text-content-muted">{CR_FIELD_LABEL[k] || k}</span>
                  <span className="text-content-muted line-through">{crFormatVal(k, cr.before?.[k])}</span>
                  <ChevronRight size={12} className="text-content-muted" />
                  <span className="font-semibold text-content">{crFormatVal(k, cr.changes?.[k])}</span>
                </div>
              ))}
            </div>
            {mine ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-content-muted">Waiting for the other party to review.</span>
                <Button variant="surface" size="sm" disabled={busy} onClick={() => onAct(cr.id, 'withdraw')}>Withdraw</Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Textarea
                  rows={2}
                  placeholder="Optional note if you reject (e.g. what to change)…"
                  value={notes[cr.id] || ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [cr.id]: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button variant="surface" size="sm" disabled={busy} onClick={() => onAct(cr.id, 'reject', notes[cr.id])} className="flex-1">
                    <X size={14} /> Reject
                  </Button>
                  <Button variant="brand" size="sm" disabled={busy} onClick={() => onAct(cr.id, 'accept')} className="flex-1">
                    <Check size={14} /> Accept
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <button
        onClick={onOpenPropose}
        className="flex items-center gap-1.5 self-start text-xs font-semibold text-content-muted transition-colors hover:text-content"
      >
        <Pencil size={13} /> Propose a change to the terms
      </button>
    </div>
  );
}

function ProposeChangeModal({ project, onClose, onSubmit, busy }: {
  project: any;
  onClose: () => void;
  onSubmit: (changes: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState(project?.title || '');
  const [budget, setBudget] = useState(project?.budget != null ? String(project.budget) : '');
  const [advanceAmount, setAdvanceAmount] = useState(project?.advance_amount != null ? String(project.advance_amount) : '');
  const [deliverables, setDeliverables] = useState(project?.deliverables || '');
  const [description, setDescription] = useState(project?.description || '');
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    const changes: Record<string, unknown> = {};
    if (title.trim() && title.trim() !== (project?.title || '')) changes.title = title.trim();
    if (budget !== '' && Number(budget) !== Number(project?.budget)) changes.budget = Number(budget);
    if (advanceAmount !== '' && Number(advanceAmount) !== Number(project?.advance_amount)) changes.advance_amount = Number(advanceAmount);
    if (deliverables !== (project?.deliverables || '')) changes.deliverables = deliverables;
    if (description !== (project?.description || '')) changes.description = description;
    if (Object.keys(changes).length === 0) { setErr('Change at least one field.'); return; }
    onSubmit(changes);
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-[1000] flex items-center justify-center bg-content/45 p-5 backdrop-blur-sm">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-hairline bg-surface-card p-5 shadow-[var(--shadow-pop)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-extrabold tracking-tight text-content">Propose a change</h3>
          <button onClick={onClose} className="rounded-lg bg-surface-muted p-1.5 text-content-soft transition-colors hover:text-content"><X size={16} /></button>
        </div>
        <p className="mb-4 text-xs text-content-muted">The other party has to accept before it takes effect.</p>
        <div className="flex flex-col gap-3.5">
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>Budget (₹)</Label><Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} /></div>
          <div><Label>Advance Payment (₹)</Label><Input type="number" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} placeholder="Leave blank for 100% advance" /></div>
          <div><Label>Deliverables</Label><Textarea rows={2} value={deliverables} onChange={(e) => setDeliverables(e.target.value)} placeholder="What the creator will deliver…" /></div>
          <div><Label>Description</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          {err && <span className="text-xs font-semibold text-warn">{err}</span>}
          <div className="flex justify-end gap-2">
            <Button variant="surface" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="brand" size="sm" disabled={busy} onClick={submit}>
              {busy ? <Loader2 className="animate-spin" /> : <Pencil />} Send proposal
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Compose a stage update (message + link + file) ───
function StageUpdateModal({ stageLabel, onClose, onSubmit, busy }: {
  stageLabel: string;
  onClose: () => void;
  onSubmit: (payload: { body?: string; link_url?: string; file?: File | null }) => void;
  busy: boolean;
}) {
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const submit = () => {
    if (!body.trim() && !link.trim() && !file) { setErr('Add a message, a link, or a file.'); return; }
    if (file && file.size > 25 * 1024 * 1024) { setErr('File is too large (max 25 MB).'); return; }
    onSubmit({ body: body.trim() || undefined, link_url: link.trim() || undefined, file });
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-[1000] flex items-center justify-center bg-content/45 p-5 backdrop-blur-sm">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-hairline bg-surface-card p-5 shadow-[var(--shadow-pop)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-extrabold tracking-tight text-content">Send an update · {stageLabel}</h3>
          <button onClick={onClose} className="rounded-lg bg-surface-muted p-1.5 text-content-soft transition-colors hover:text-content"><X size={16} /></button>
        </div>
        <div className="flex flex-col gap-3.5">
          <div>
            <Label>Message</Label>
            <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Share the work, ask a question, or leave a remark…" />
          </div>
          <div>
            <Label>Link (optional)</Label>
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/…" />
          </div>
          <div>
            <Label>File (Images only)</Label>
            <input accept="image/*" ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <div className="flex items-center gap-2">
              <Button variant="surface" size="sm" onClick={() => fileRef.current?.click()}><Paperclip size={14} /> Attach image</Button>
              {file && (
                <span className="flex items-center gap-1 text-xs font-semibold text-content">
                  {file.name}
                  <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }} className="text-content-muted hover:text-danger"><X size={12} /></button>
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-content-muted">For videos or large files, upload to Google Drive and paste the link above.</p>
          </div>
          {err && <span className="text-xs font-semibold text-warn">{err}</span>}
          <div className="flex justify-end gap-2">
            <Button variant="surface" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="brand" size="sm" disabled={busy} onClick={submit}>
              {busy ? <Loader2 className="animate-spin" /> : <Send />} Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Activity Timeline (the project log) ───
const ACTIVITY_ICON: Record<string, { icon: React.ComponentType<any>; tone: string }> = {
  project_created: { icon: UserPlus, tone: 'bg-brand-soft text-brand-strong' },
  stage_advanced: { icon: ChevronRight, tone: 'bg-ok-soft text-ok' },
  stage_signoff: { icon: Check, tone: 'bg-ok-soft text-ok' },
  stage_skipped: { icon: SkipForward, tone: 'bg-surface-muted text-content-muted' },
  revisions_requested: { icon: RefreshCw, tone: 'bg-warn-soft text-warn' },
  draft_approved: { icon: ThumbsUp, tone: 'bg-ok-soft text-ok' },
  terms_change_proposed: { icon: Pencil, tone: 'bg-brand-soft text-brand-strong' },
  terms_change_accepted: { icon: Check, tone: 'bg-ok-soft text-ok' },
  terms_change_rejected: { icon: X, tone: 'bg-danger-soft text-danger' },
  payment_paid: { icon: Banknote, tone: 'bg-ok-soft text-ok' },
  completion_confirmed: { icon: ThumbsUp, tone: 'bg-ok-soft text-ok' },
  project_completed: { icon: Award, tone: 'bg-ok-soft text-ok' },
  cancellation_requested: { icon: X, tone: 'bg-danger-soft text-danger' },
  cancellation_declined: { icon: RefreshCw, tone: 'bg-surface-muted text-content-muted' },
  cancellation_accepted: { icon: X, tone: 'bg-danger-soft text-danger' },
};

function activityFmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

function ActivityTimeline({ activity, userId }: { activity: any[]; userId: string | null }) {
  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <div className="mb-4 text-xs font-bold uppercase tracking-[0.08em] text-brand">Activity</div>
      {activity.length === 0 ? (
        <p className="text-base text-content-muted">Nothing recorded yet.</p>
      ) : (
        <ol className="relative flex flex-col gap-3 pl-8">
          <span className="absolute bottom-3 left-[18px] top-3 w-0.5 bg-hairline" aria-hidden />
          {activity.map((ev) => {
            const cfg = ACTIVITY_ICON[ev.type] || { icon: Circle, tone: 'bg-surface-muted text-content-muted' };
            const Icon = cfg.icon;
            const who = ev.actor ? (ev.actor.id === userId ? 'You' : ev.actor.name || 'Someone') : null;
            const amount = ev.metadata?.amount_rupees;
            return (
              <li key={ev.id} className="relative">
                <span className={`absolute -left-8 top-3 flex size-9 items-center justify-center rounded-full ring-4 ring-surface ${cfg.tone}`}>
                  <Icon size={16} />
                </span>
                <div className="rounded-2xl border border-hairline bg-surface-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-base font-semibold text-content">
                      {who && <span className="font-extrabold">{who} </span>}
                      {who ? ev.summary.charAt(0).toLowerCase() + ev.summary.slice(1) : ev.summary}
                    </span>
                    {ev.type === 'payment_paid' && amount != null && (
                      <Badge variant="success" size="md">₹{Number(amount).toLocaleString('en-IN')}</Badge>
                    )}
                  </div>
                  <div className="mt-1 text-sm font-medium text-content-muted">{activityFmt(ev.created_at)}</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ─── Stage completion celebration (animated, dependency-free) ───
function StageCelebration({ label, onClose }: { label: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4200);
    return () => clearTimeout(t);
  }, [onClose]);

  const confetti = Array.from({ length: 16 });
  const colors = ['#ee3e96', '#10b981', '#f59e0b', '#6366f1', '#06b6d4', '#f43f5e'];

  return (
    <div onClick={onClose} className="fixed inset-0 z-[1100] flex items-center justify-center bg-content/40 p-5 backdrop-blur-sm">
      <style>{`
        @keyframes inf-pop { 0%{transform:scale(.7);opacity:0} 60%{transform:scale(1.05)} 100%{transform:scale(1);opacity:1} }
        @keyframes inf-check { to { stroke-dashoffset: 0 } }
        @keyframes inf-fall { 0%{transform:translateY(-20px) rotate(0);opacity:1} 100%{transform:translateY(320px) rotate(360deg);opacity:0} }
      `}</style>
      <div onClick={(e) => e.stopPropagation()} className="relative overflow-hidden rounded-3xl border border-hairline bg-surface-card px-8 py-9 text-center shadow-[var(--shadow-pop)]" style={{ animation: 'inf-pop .35s cubic-bezier(0.2,0,0,1) both', width: 'min(92vw, 380px)' }}>
        {confetti.map((_, i) => (
          <span key={i} aria-hidden style={{
            position: 'absolute', top: 0, left: `${(i * 6.25 + 4)}%`,
            width: 8, height: 8, borderRadius: i % 2 ? '50%' : 2,
            background: colors[i % colors.length],
            animation: `inf-fall ${1.6 + (i % 5) * 0.25}s ${(i % 7) * 0.12}s linear infinite`,
          }} />
        ))}
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-ok-soft">
          <svg width="34" height="34" viewBox="0 0 52 52" fill="none">
            <circle cx="26" cy="26" r="24" stroke="#10b981" strokeWidth="3" opacity="0.25" />
            <path d="M15 27 l7 7 l15 -16" stroke="#10b981" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
              style={{ strokeDasharray: 44, strokeDashoffset: 44, animation: 'inf-check .5s .25s cubic-bezier(0.2,0,0,1) forwards' }} />
          </svg>
        </div>
        <div className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ok">
          <PartyPopper size={14} /> Stage complete
        </div>
        <h3 className="mt-1.5 text-xl font-extrabold text-content">Nice work!</h3>
        <p className="mt-1 text-base font-medium text-content-soft">Moving on to <span className="font-extrabold text-brand-strong">{label}</span>.</p>
        <Button variant="brand" size="sm" className="mt-5" onClick={onClose}>Continue</Button>
      </div>
    </div>
  );
}

// ─── Guided Flow (step-by-step, bilateral sign-off) ───
function GuidedFlow({
  project, userId, userRole, currentStage, items, requiredDone,
  advancing, advanceError, onToggleItem, onSignoff, onRevokeSignoff, onAdvance,
  onProposeSkip, onConfirmSkip, onCancelSkip,
  entries, onOpenCompose, onDeleteEntry,
  isFinalPayment, myConfirmed, otherConfirmed, onConfirmCompletion,
  projectId, budget, advanceAmount, onPaid, onPreviewImage,
}: {
  project: any;
  userId: string | null;
  userRole: 'business' | 'creator' | null;
  currentStage?: string;
  items: StageItem[];
  requiredDone: boolean;
  advancing: boolean;
  advanceError: string | null;
  onToggleItem: (item: StageItem, done: boolean) => void;
  onSignoff: () => void;
  onRevokeSignoff: () => void;
  onAdvance: (stageKey?: string) => void;
  onProposeSkip: () => void;
  onConfirmSkip: () => void;
  onCancelSkip: () => void;
  entries: any[];
  onOpenCompose: () => void;
  onDeleteEntry: (id: string) => void;
  isFinalPayment: boolean;
  myConfirmed: boolean;
  otherConfirmed: boolean;
  onConfirmCompletion: () => void;
  projectId: number | string;
  budget?: number | string | null;
  advanceAmount?: number | string | null;
  onPaid: () => void;
  onPreviewImage: (url: string) => void;
}) {
  const roleLabel = (r: string) => (r === 'business' ? 'Brand' : r === 'creator' ? 'Creator' : 'Both');
  const currentIdx = STAGE_CONFIG.findIndex((s) => s.key === currentStage);
  const stage = STAGE_CONFIG[currentIdx];
  const nextStage = STAGE_CONFIG[currentIdx + 1];
  const isComplete = currentStage === 'project_completed';
  const isReviewFork = currentStage === 'sent_for_review';
  const isAdvancePayment = currentStage === 'advance_payment';
  const mutual = !!currentStage && isMutualSignoffStage(currentStage) && !isFinalPayment;
  const guide = currentStage ? STAGE_GUIDE[currentStage as Stage] : undefined;

  const otherRole = userRole === 'business' ? 'creator' : 'business';
  const sp = project?.stage_progress as Record<string, any> | undefined;
  const mySignoff = currentStage && userRole ? stageSignoffAt(sp, currentStage, userRole) : null;
  const otherSignoff = currentStage ? stageSignoffAt(sp, currentStage, otherRole) : null;

  // Skip-by-consent state for the current stage.
  const skippable = !!currentStage && isSkippableStage(currentStage) && !isComplete;
  const skipProposal = currentStage ? stageSkipProposal(sp, currentStage) : null;
  const iProposedSkip = !!skipProposal && skipProposal.by === userId;

  const myActions = guide ? (userRole === 'business' ? guide.brand : guide.creator) : [];
  const partnerActions = guide ? (userRole === 'business' ? guide.creator : guide.brand) : [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
      {/* Stepper — all 12 stages, wrapped (never horizontally scrolling) */}
      <div className="flex flex-wrap gap-2 rounded-2xl border border-hairline bg-surface-card p-4">
        {STAGE_CONFIG.map((s, i) => {
          const state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'upcoming';
          return (
            <div
              key={s.key}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
                state === 'current' ? 'bg-brand text-white'
                  : state === 'done' ? 'bg-ok-soft text-ok'
                  : 'bg-surface-muted text-content-muted'
              }`}
              title={s.label}
            >
              <span className={`flex size-4 items-center justify-center rounded-full text-[0.625rem] font-bold ${state === 'current' ? 'bg-white/25' : state === 'done' ? 'bg-ok/15' : 'bg-content/5'}`}>
                {state === 'done' ? <Check size={11} /> : i + 1}
              </span>
              {s.label}
            </div>
          );
        })}
      </div>

      {isComplete ? (
        <div className="flex items-center gap-2 rounded-2xl border border-hairline bg-surface-card px-5 py-4 text-sm font-bold text-ok">
          <Award size={18} /> Project completed — reviews are now open.
        </div>
      ) : stage && (
        <div className="flex flex-col gap-4 rounded-2xl border border-hairline bg-surface-card p-5">
          {/* Stage header + summary */}
          <div>
            <div className="mb-1.5 flex items-center gap-2.5">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-brand">
                Step {currentIdx + 1} of {STAGE_CONFIG.length}
              </span>
              <span className="text-xl font-extrabold text-content">{stage.label}</span>
            </div>
            {guide && <p className="text-base font-medium leading-relaxed text-content-soft">{guide.summary}</p>}
          </div>

          {/* What each side does */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-brand/30 bg-brand-soft/40 p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-strong">You ({roleLabel(userRole || 'both')})</div>
              <ul className="flex flex-col gap-1.5">
                {myActions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm font-medium text-content"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />{a}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-hairline bg-surface-muted p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-content-muted">Partner ({roleLabel(otherRole)})</div>
              <ul className="flex flex-col gap-1.5">
                {partnerActions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm font-medium text-content-soft"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-content-muted" />{a}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Updates — the "mail" thread: send notes, links, files; both review */}
          <div className="flex flex-col gap-2.5 rounded-xl border border-hairline bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-content">Updates</span>
              <Button variant="brand" size="sm" onClick={onOpenCompose}>
                <Send size={14} /> Send an update
              </Button>
            </div>
            {entries.length === 0 ? (
              <p className="text-sm font-medium text-content-muted">No updates yet. Share the work, a link, or a file — the other side reviews it here before you both sign off.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {entries.map((e) => {
                  const mine = e.author?.id === userId;
                  return (
                    <div key={e.id} className="rounded-xl border border-hairline bg-surface-card p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <Avatar name={e.author?.name} size="sm" square />
                        <span className="text-sm font-bold text-content">{mine ? 'You' : e.author?.name || 'Partner'}</span>
                        <span className="text-xs font-medium text-content-muted">
                          {(() => { try { return new Date(e.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } })()}
                        </span>
                        {mine && (
                          <button onClick={() => onDeleteEntry(e.id)} className="ml-auto text-content-muted transition-colors hover:text-danger" title="Delete update">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      {e.body && <p className="whitespace-pre-wrap text-sm font-medium text-content">{e.body}</p>}
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {e.link_url && (
                          <a href={e.link_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-2.5 py-1 text-xs font-semibold text-brand-strong hover:bg-surface-muted">
                            <Link2 size={13} /> {(() => { try { return new URL(e.link_url).hostname; } catch { return 'Link'; } })()}
                          </a>
                        )}
                      </div>
                      {e.file_url && (
                        <div className="mt-2 w-full max-w-sm overflow-hidden rounded-lg border border-hairline">
                          <button
                            onClick={() => onPreviewImage(e.file_url)}
                            className="block w-full cursor-zoom-in overflow-hidden bg-surface-muted"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={e.file_url}
                              alt={e.file_name || 'Attachment'}
                              className="h-auto w-full object-cover transition-all hover:scale-[1.02] hover:opacity-90"
                            />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Checklist */}
          {items.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="text-xs font-bold uppercase tracking-wide text-content-muted">Steps in this stage</div>
              {items.map((it) => {
                const done = !!it.done_at;
                // Only PAYMENT gate items open via a confirmed payment. Approval
                // gates (concept / final approval) are ticked by hand as normal.
                const isPaymentStage = currentStage === 'advance_payment' || currentStage === 'final_payment';
                const paymentLocked = it.is_gate && isPaymentStage && PAYMENTS_CONFIGURED && !done;
                const canToggleThis = (it.owner_role === 'both' || it.owner_role === userRole) && !paymentLocked;
                return (
                  <button
                    key={it.id}
                    disabled={!canToggleThis}
                    onClick={() => onToggleItem(it, !done)}
                    className={`group flex items-center gap-2.5 rounded-lg border border-hairline px-3 py-2.5 text-left text-base transition-colors ${
                      canToggleThis ? 'hover:bg-surface-muted' : 'cursor-not-allowed opacity-80'
                    }`}
                    title={paymentLocked ? 'Opens automatically once the payment is confirmed' : canToggleThis ? 'Toggle done' : `Only the ${roleLabel(it.owner_role)} can mark this`}
                  >
                    <span className={`flex size-[18px] shrink-0 items-center justify-center rounded-md border ${done ? 'border-ok bg-ok text-white' : 'border-hairline-strong bg-surface'}`}>
                      {done && <Check size={12} />}
                    </span>
                    <span className={`font-semibold ${done ? 'text-content-muted line-through' : 'text-content'}`}>{it.label}</span>
                    {it.is_gate && <Badge variant="warning" size="sm" className="ml-0.5"><Lock size={9} /> Gate</Badge>}
                    {it.is_required && !done && <span className="text-[0.625rem] font-bold uppercase tracking-wide text-content-muted">Required</span>}
                    <span className="ml-auto text-[0.625rem] font-semibold text-content-muted">{roleLabel(it.owner_role)}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Payment gate on the advance-payment stage */}
          {isAdvancePayment && (
            <PaymentGate
              projectId={projectId}
              stageKey="advance_payment"
              amountRupees={advanceAmount != null && advanceAmount !== '' ? Number(advanceAmount) : budget != null && budget !== '' ? Number(budget) : null}
              userRole={userRole}
              isDone={items.some((it) => it.is_gate && !!it.done_at)}
              onPaid={onPaid}
            />
          )}

          {/* Action zone */}
          <div className="border-t border-hairline pt-4">
            {isFinalPayment ? (
              <>
                {isFinalPayment && (advanceAmount != null && advanceAmount !== '' ? Number(budget || 0) - Number(advanceAmount) : 0) > 0 && (
                  <div className="mb-4">
                    <PaymentGate
                      projectId={projectId}
                      stageKey="final_payment"
                      amountRupees={(advanceAmount != null && advanceAmount !== '' ? Number(budget || 0) - Number(advanceAmount) : 0)}
                      userRole={userRole}
                      isDone={items.some((it) => it.stage_key === 'final_payment' && it.is_gate && !!it.done_at)}
                      onPaid={onPaid}
                    />
                  </div>
                )}
 <div className="flex flex-col gap-2">
                <Button variant={myConfirmed ? 'surface' : 'brand'} disabled={myConfirmed || advancing} onClick={onConfirmCompletion}>
                  {advancing ? <Loader2 className="animate-spin" /> : myConfirmed ? <Check /> : <ThumbsUp />}
                  {myConfirmed ? 'You confirmed completion' : 'Confirm completion'}
                </Button>
                <span className="text-xs text-content-muted">
                  {otherConfirmed ? 'The other party has confirmed.' : `Waiting on the ${roleLabel(otherRole)} to also confirm.`} Both must confirm to complete the project.
                </span>
              </div>
              </>
            ) : isReviewFork ? (
              <div className="flex flex-col gap-2">
                {STAGE_ACTOR[currentStage as Stage] === userRole ? (
                  <>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button variant="surface" disabled={!requiredDone || advancing} onClick={() => onAdvance('revisions')} className="flex-1">
                        {advancing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Request revisions
                      </Button>
                      <Button variant="brand" disabled={!requiredDone || advancing} onClick={() => onAdvance('final_approval')} className="flex-1">
                        {advancing ? <Loader2 className="animate-spin" /> : <ThumbsUp />} Approve draft
                      </Button>
                    </div>
                    <span className="text-xs text-content-muted">Review the draft — send it back for changes, or approve it to move on.</span>
                  </>
                ) : (
                  <span className="text-xs text-content-muted">
                    Waiting on the {roleLabel(STAGE_ACTOR[currentStage as Stage] || 'both')} to review the draft.
                  </span>
                )}
              </div>
            ) : mutual ? (
              skipProposal ? (
                /* A skip has been proposed — needs the other side's consent. */
                <div className="flex flex-col gap-2 rounded-xl border border-warn/40 bg-warn-soft px-3 py-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-warn">
                    <SkipForward size={16} />
                    {iProposedSkip ? 'You proposed skipping this stage' : `The ${roleLabel(otherRole)} wants to skip this stage`}
                  </div>
                  {iProposedSkip ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-content-soft">Waiting for the {roleLabel(otherRole)} to confirm.</span>
                      <Button variant="surface" size="sm" disabled={advancing} onClick={onCancelSkip}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs text-content-soft">If you agree it isn’t needed, confirm to move on. Otherwise reject and continue the stage.</span>
                      <div className="flex gap-2">
                        <Button variant="surface" size="sm" disabled={advancing} onClick={onCancelSkip} className="flex-1">Reject</Button>
                        <Button variant="brand" size="sm" disabled={advancing} onClick={onConfirmSkip} className="flex-1">
                          {advancing ? <Loader2 className="animate-spin" /> : <SkipForward />} Confirm skip
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* Both-sides confirmation status */}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${mySignoff ? 'border-ok/40 bg-ok-soft text-ok' : 'border-hairline bg-surface-muted text-content-muted'}`}>
                      {mySignoff ? <CheckCircle2 size={16} /> : <Circle size={16} />} You {mySignoff ? 'confirmed' : 'not yet'}
                    </div>
                    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${otherSignoff ? 'border-ok/40 bg-ok-soft text-ok' : 'border-hairline bg-surface-muted text-content-muted'}`}>
                      {otherSignoff ? <CheckCircle2 size={16} /> : <Hourglass size={16} />} {roleLabel(otherRole)} {otherSignoff ? 'confirmed' : 'waiting'}
                    </div>
                  </div>

                  {mySignoff ? (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs text-content-muted">
                        {otherSignoff ? 'Both confirmed — moving on…' : `Waiting on the ${roleLabel(otherRole)} to confirm. The project advances once they do.`}
                      </span>
                      {!otherSignoff && (
                        <Button variant="ghost" size="sm" disabled={advancing} onClick={onRevokeSignoff} className="self-start">
                          Undo my confirmation
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <Button variant="brand" disabled={!requiredDone || advancing} onClick={onSignoff}>
                        {advancing ? <Loader2 className="animate-spin" /> : <Check />}
                        Confirm this stage{nextStage ? ` → ${nextStage.label}` : ''}
                      </Button>
                      {!requiredDone && <span className="text-xs text-warn">Finish the required steps above before confirming.</span>}
                    </div>
                  )}

                  {/* Skip option — this stage isn't always needed */}
                  {skippable && !mySignoff && !otherSignoff && (
                    <button
                      disabled={advancing}
                      onClick={onProposeSkip}
                      className="flex items-center gap-1.5 self-start text-xs font-semibold text-content-muted transition-colors hover:text-content disabled:opacity-60"
                    >
                      <SkipForward size={13} /> This stage isn’t needed — propose skipping it
                    </button>
                  )}
                </div>
              )
            ) : null}
            {advanceError && <span className="mt-2 block text-xs text-danger">{advanceError}</span>}
          </div>
        </div>
      )}
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
  const [stageItems, setStageItems] = useState<StageItem[]>([]);
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [modalCard, setModalCard] = useState<ProjectCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'guided' | 'board' | 'activity' | 'flow'>('guided');
  const [activity, setActivity] = useState<any[]>([]);
  const [celebrateLabel, setCelebrateLabel] = useState<string | null>(null);
  const [changeRequests, setChangeRequests] = useState<any[]>([]);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [crBusy, setCrBusy] = useState(false);
  const [stageEntries, setStageEntries] = useState<any[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [entryBusy, setEntryBusy] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Reviews state
  const [reviews, setReviews] = useState<any[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Report state (trust & safety)
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState<'spam' | 'harassment' | 'scam' | 'fake' | 'other'>('scam');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportDone, setReportDone] = useState(false);

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
      const [projRes, cardsRes, reviewsRes, itemsRes, activityRes, crRes, entriesRes] = await Promise.all([
        apiFetch<{ project: any }>(`/api/projects/${projectId}`),
        apiFetch<{ cards: ProjectCard[] }>(`/api/projects/${projectId}/cards`),
        apiFetch<{ reviews: any[] }>(`/api/projects/${projectId}/reviews`),
        apiFetch<{ items: StageItem[] }>(`/api/projects/${projectId}/stage-items`),
        apiFetch<{ activity: any[] }>(`/api/projects/${projectId}/activity`),
        apiFetch<{ change_requests: any[] }>(`/api/projects/${projectId}/change-requests`),
        apiFetch<{ entries: any[] }>(`/api/projects/${projectId}/stage-entries`),
      ]);
      if (projRes.ok && projRes.data) { const d = projRes.data; setProject(d.project); }
      else { setError(projRes.error || 'Failed to load project'); }
      if (cardsRes.ok && cardsRes.data) { const d = cardsRes.data; setCards(d.cards || []); }
      else { setError(cardsRes.error || 'Failed to load cards'); }
      if (reviewsRes.ok && reviewsRes.data) { setReviews(reviewsRes.data.reviews || []); }
      if (itemsRes.ok && itemsRes.data) { setStageItems(itemsRes.data.items || []); }
      if (activityRes.ok && activityRes.data) { setActivity(activityRes.data.activity || []); }
      if (crRes.ok && crRes.data) { setChangeRequests(crRes.data.change_requests || []); }
      if (entriesRes.ok && entriesRes.data) { setStageEntries(entriesRes.data.entries || []); }
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

  // Celebrate whenever the project moves forward to a new stage.
  const prevStageRef = useRef<string | null>(null);
  useEffect(() => {
    const cs = project?.current_stage as string | undefined;
    if (!cs) return;
    const prev = prevStageRef.current;
    if (prev && prev !== cs) {
      const prevIdx = STAGE_CONFIG.findIndex((s) => s.key === prev);
      const nextIdx = STAGE_CONFIG.findIndex((s) => s.key === cs);
      if (nextIdx > prevIdx) setCelebrateLabel(STAGE_CONFIG[nextIdx]?.label || cs);
    }
    prevStageRef.current = cs;
  }, [project?.current_stage]);

  const cardsByStage = useMemo(() => {
    const grouped: Record<string, ProjectCard[]> = {};
    for (const stage of STAGE_CONFIG) {
      const sc = cards.filter(c => c.stage_key === stage.key);
      sc.sort((a, b) => getDateRowIndex(a, dates) - getDateRowIndex(b, dates));
      grouped[stage.key] = sc;
    }
    return grouped;
  }, [cards, dates]);

  // ─── Stage pipeline (gated checklist) ───
  const userRole: 'business' | 'creator' | null = project
    ? (project.owner_user_id === userId ? 'business' : 'creator')
    : null;
  const currentStage: string | undefined = project?.current_stage;
  const currentStageItems = useMemo(
    () => stageItems.filter((it) => it.stage_key === currentStage).sort((a, b) => a.position - b.position),
    [stageItems, currentStage],
  );
  const currentStageActor = currentStage ? STAGE_ACTOR[currentStage as Stage] : undefined;
  const gateBlocking = currentStage ? blockingItems(currentStage, stageItems) : [];
  const canToggleStage = !!currentStage && (currentStageActor === 'either' || currentStageActor === userRole);
  const canAdvance = gateBlocking.length === 0 && canToggleStage && currentStage !== 'project_completed';

  const handleToggleItem = async (item: StageItem, done: boolean) => {
    setStageItems((prev) => prev.map((it) => it.id === item.id
      ? { ...it, done_at: done ? new Date().toISOString() : null, done_by: done ? userId : null }
      : it));
    setAdvanceError(null);
    try {
      const res = await apiFetch<{ item: StageItem }>(`/api/projects/${projectId}/stage-items`, {
        method: 'PATCH',
        body: JSON.stringify({ item_id: item.id, done }),
      });
      if (!res.ok) { setAdvanceError(res.error || 'Could not update that step.'); await fetchData(); }
    } catch (e) { console.error(e); await fetchData(); }
  };

  const handleAdvance = async (stageKey?: string) => {
    if (!currentStage) return;
    setAdvancing(true);
    setAdvanceError(null);
    try {
      const res = await apiFetch<{ project: any }>(`/api/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify(stageKey ? { action: 'advance', stage_key: stageKey } : { action: 'advance' }),
      });
      if (res.ok && res.data) { setProject(res.data.project); }
      else { setAdvanceError(res.error || 'Could not advance to the next stage.'); }
    } catch (e) { console.error(e); setAdvanceError('Network error while advancing.'); }
    finally { setAdvancing(false); }
  };

  // Bilateral stage sign-off (Guided mode). Each side confirms the current
  // stage; the server auto-advances once both have confirmed.
  const handleSignoff = async (action: 'signoff' | 'revoke_signoff') => {
    if (!currentStage) return;
    setAdvancing(true);
    setAdvanceError(null);
    try {
      const res = await apiFetch<{ project: any }>(`/api/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      if (res.ok && res.data) { setProject(res.data.project); }
      else { setAdvanceError(res.error || 'Could not update your confirmation.'); }
    } catch (e) { console.error(e); setAdvanceError('Network error while confirming.'); }
    finally { setAdvancing(false); }
  };

  // Skip a stage by mutual consent (propose → the other confirms).
  const handleSkip = async (action: 'propose_skip' | 'confirm_skip' | 'cancel_skip') => {
    if (!currentStage) return;
    setAdvancing(true);
    setAdvanceError(null);
    try {
      const res = await apiFetch<{ project: any }>(`/api/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      if (res.ok && res.data) { setProject(res.data.project); if (action === 'confirm_skip') void fetchData(); }
      else { setAdvanceError(res.error || 'Could not update the skip.'); }
    } catch (e) { console.error(e); setAdvanceError('Network error while updating the skip.'); }
    finally { setAdvancing(false); }
  };

  // Change requests: propose an edit to the terms, or act on one.
  const handleProposeChange = async (changes: Record<string, unknown>) => {
    setCrBusy(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/change-requests`, {
        method: 'POST', body: JSON.stringify({ changes }),
      });
      if (res.ok) { setProposeOpen(false); await fetchData(); }
      else { toast.error(res.error || 'Could not send the proposal.'); }
    } catch (e) { console.error(e); }
    finally { setCrBusy(false); }
  };

  const handleActOnChange = async (requestId: string, action: 'accept' | 'reject' | 'withdraw', note?: string) => {
    setCrBusy(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/change-requests`, {
        method: 'PATCH', body: JSON.stringify({ request_id: requestId, action, note }),
      });
      if (res.ok) { await fetchData(); }
      else { toast.error(res.error || 'Could not update the change request.'); }
    } catch (e) { console.error(e); }
    finally { setCrBusy(false); }
  };

  // Stage updates ("mail" thread). A file, if any, is uploaded to the private
  // project-assets bucket first (RLS-scoped by the <project_id>/ path prefix),
  // then the update row is recorded with its path.
  const handlePostUpdate = async ({ body, link_url, file }: { body?: string; link_url?: string; file?: File | null }) => {
    if (!currentStage) return;
    setEntryBusy(true);
    try {
      let file_url: string | undefined;
      let file_name: string | undefined;
      let file_public_id: string | undefined;
      if (file) {
        try {
          const up = await uploadToCloudinary(file, 'stage');
          file_url = up.url;
          file_public_id = up.publicId;
          file_name = file.name;
        } catch (upErr: any) {
          toast.error(upErr?.message || 'File upload failed.');
          return;
        }
      }
      const res = await apiFetch(`/api/projects/${projectId}/stage-entries`, {
        method: 'POST',
        body: JSON.stringify({ stage_key: currentStage, body, link_url, file_url, file_name, file_public_id }),
      });
      if (res.ok) { setComposeOpen(false); await fetchData(); }
      else { toast.error(res.error || 'Could not send the update.'); }
    } catch (e) { console.error(e); toast.error('Something went wrong sending the update.'); }
    finally { setEntryBusy(false); }
  };

  const handleDeleteUpdate = async (entryId: string) => {
    try {
      const res = await apiFetch(`/api/projects/${projectId}/stage-entries?entry_id=${entryId}`, { method: 'DELETE' });
      if (res.ok) await fetchData();
    } catch (e) { console.error(e); }
  };

  // Dual-confirm completion (both parties must confirm at final_payment).
  const myConfirmed = userRole === 'business' ? !!project?.owner_confirmed_complete : !!project?.counterparty_confirmed_complete;
  const otherConfirmed = userRole === 'business' ? !!project?.counterparty_confirmed_complete : !!project?.owner_confirmed_complete;

  const handleConfirmCompletion = async () => {
    setAdvancing(true);
    setAdvanceError(null);
    try {
      const res = await apiFetch<{ project: any }>(`/api/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'confirm_completion' }),
      });
      if (res.ok && res.data) { setProject(res.data.project); }
      else { setAdvanceError(res.error || 'Could not confirm completion.'); }
    } catch (e) { console.error(e); setAdvanceError('Network error while confirming.'); }
    finally { setAdvancing(false); }
  };

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
          {/* Guided ↔ Board view toggle */}
          <div className="flex items-center gap-0.5 rounded-lg border border-hairline bg-surface-muted p-0.5">
            <button
              onClick={() => setView('guided')}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold transition-colors ${view === 'guided' ? 'bg-surface-card text-content shadow-sm' : 'text-content-muted hover:text-content'}`}
              title="Step-by-step guided flow"
            >
              <ListChecks size={13} /> Guided
            </button>
            <button
              onClick={() => setView('board')}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold transition-colors ${view === 'board' ? 'bg-surface-card text-content shadow-sm' : 'text-content-muted hover:text-content'}`}
              title="Schedule board"
            >
              <LayoutGrid size={13} /> Board
            </button>
            <button
              onClick={() => setView('activity')}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold transition-colors ${view === 'activity' ? 'bg-surface-card text-content shadow-sm' : 'text-content-muted hover:text-content'}`}
              title="Activity timeline"
            >
              <History size={13} /> Activity
            </button>
            <button
              onClick={() => setView('flow')}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold transition-colors ${view === 'flow' ? 'bg-surface-card text-content shadow-sm' : 'text-content-muted hover:text-content'}`}
              title="Stage-by-stage recap"
            >
              <Waypoints size={13} /> Flow
            </button>
          </div>
          {project?.budget != null && project.budget !== '' && (
            <Badge variant="success" size="md">
              ₹{Number(project.budget).toLocaleString()} 
              {project?.advance_amount != null && project.advance_amount !== '' && Number(project.advance_amount) < Number(project.budget) 
                ? ` (₹${Number(project.advance_amount).toLocaleString()} advance)` 
                : ''}
            </Badge>
          )}
          {project?.conversation_id && (
            <ButtonLink href={`/dashboard/messages?conv=${project.conversation_id}`} variant="surface" size="sm">
              <MessageSquare size={14} /> Chat
            </ButtonLink>
          )}
          {project && (
            <Button variant="surface" size="icon" onClick={() => setShowReportModal(true)} aria-label="Report this user" title="Report this user">
              <Flag size={14} />
            </Button>
          )}
          {project?.status === 'completed' && (
            <Button variant="surface" size="sm" onClick={() => setShowReviewModal(true)}>
              <Star size={14} fill={reviews.some(r => r.from_user?.id === userId) ? "var(--brand)" : "none"} color="var(--brand)" /> 
              {reviews.some(r => r.from_user?.id === userId) ? 'View Reviews' : 'Leave a Review'}
            </Button>
          )}
          <Badge variant="neutral" size="md">
            Stage {STAGE_CONFIG.findIndex((s) => s.key === project?.current_stage) + 1}/{STAGE_CONFIG.length}
          </Badge>
        </div>
      </div>

      {/* Stage Pipeline — the spine of the collaboration (board view only) */}
      {view === 'board' && !loading && !error && project && (
        <StagePipeline
          currentStage={currentStage}
          items={currentStageItems}
          userRole={userRole}
          canToggleStage={canToggleStage}
          canAdvance={canAdvance}
          advancing={advancing}
          advanceError={advanceError}
          onToggleItem={handleToggleItem}
          onAdvance={handleAdvance}
          isFinalPayment={currentStage === 'final_payment'}
          myConfirmed={myConfirmed}
          otherConfirmed={otherConfirmed}
          onConfirmCompletion={handleConfirmCompletion}
          projectId={projectId}
          budget={project?.budget}
          advanceAmount={project?.advance_amount}
          onPaid={() => { setTimeout(() => { void fetchData(); }, 2500); }}
        />
      )}

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
      ) : view === 'guided' ? (
        <div className="flex-1 overflow-auto bg-surface">
          {currentStage !== 'project_completed' && (
            <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6">
              <ChangeRequestsPanel
                requests={changeRequests}
                userId={userId}
                onAct={handleActOnChange}
                onOpenPropose={() => setProposeOpen(true)}
                busy={crBusy}
              />
            </div>
          )}
          <GuidedFlow
            project={project}
            userId={userId}
            userRole={userRole}
            currentStage={currentStage}
            items={currentStageItems}
            requiredDone={gateBlocking.length === 0}
            advancing={advancing}
            advanceError={advanceError}
            onToggleItem={handleToggleItem}
            onSignoff={() => handleSignoff('signoff')}
            onRevokeSignoff={() => handleSignoff('revoke_signoff')}
            onAdvance={handleAdvance}
            onProposeSkip={() => handleSkip('propose_skip')}
            onConfirmSkip={() => handleSkip('confirm_skip')}
            onCancelSkip={() => handleSkip('cancel_skip')}
            entries={stageEntries.filter((e) => e.stage_key === currentStage)}
            onOpenCompose={() => setComposeOpen(true)}
            onDeleteEntry={handleDeleteUpdate}
            isFinalPayment={currentStage === 'final_payment'}
            myConfirmed={myConfirmed}
            otherConfirmed={otherConfirmed}
            onConfirmCompletion={handleConfirmCompletion}
            projectId={projectId}
            budget={project?.budget}
          advanceAmount={project?.advance_amount}
            onPaid={() => { setTimeout(() => { void fetchData(); }, 2500); }}
            onPreviewImage={setLightboxImage}
          />
        </div>
      ) : view === 'activity' ? (
        <div className="flex-1 overflow-auto bg-surface">
          <ActivityTimeline activity={activity} userId={userId} />
        </div>
      ) : view === 'flow' ? (
        <div className="flex-1 overflow-auto bg-surface">
          <ProjectFlow project={project} entries={stageEntries} userId={userId} />
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', padding: '0 0 0 10px' }}>
          {/* Left Date Panel — sticky */}
          <div style={{ position: 'sticky', left: 0, zIndex: 10, background: '#fff', borderRight: '1px solid #e2e8f0', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Header aligned with column headers */}
            <div style={{
              height: HEADER_HEIGHT, minHeight: HEADER_HEIGHT, boxSizing: 'border-box',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#fff', padding: '0 10px', flexShrink: 0,
            }}>
              <Calendar size={14} color="#64748b" />
            </div>
            {/* Date rows */}
            <div style={{ height: dates.length * ROW_HEIGHT, flexShrink: 0 }}>
              {dates.map(date => (
                <div key={dateToKey(date)} style={{
                  height: ROW_HEIGHT, boxSizing: 'border-box',
                  borderBottom: '1px solid #e2e8f0',
                  // Top-align the label to line up with cards (which sit at +4px
                  // from the row top), so date rows read level with their cells.
                  display: 'flex', flexDirection: 'column', justifyContent: 'flex-start',
                  padding: '8px 10px 0',
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
              <DragOverlay dropAnimation={DROP_ANIMATION}>
                {activeCard && (
                  <div style={{
                    background: '#fff', borderRadius: 6, padding: '6px 10px',
                    boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
                    fontSize: 12, fontWeight: 800, color: '#0f172a',
                    border: '2px solid var(--brand)',
                    width: 260, height: ROW_HEIGHT - 8,
                    transform: 'rotate(1.5deg)',
                    display: 'flex', alignItems: 'center', gap: 6,
                    cursor: 'grabbing',
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

      {proposeOpen && project && (
        <ProposeChangeModal
          project={project}
          onClose={() => setProposeOpen(false)}
          onSubmit={handleProposeChange}
          busy={crBusy}
        />
      )}

      {composeOpen && (
        <StageUpdateModal
          stageLabel={STAGE_CONFIG.find((s) => s.key === currentStage)?.label || 'Stage'}
          onClose={() => setComposeOpen(false)}
          onSubmit={handlePostUpdate}
          busy={entryBusy}
        />
      )}

      {lightboxImage && (
        <div onClick={() => setLightboxImage(null)} className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm cursor-zoom-out">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxImage} alt="Expanded preview" className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
        </div>
      )}

      {celebrateLabel && (
        <StageCelebration label={celebrateLabel} onClose={() => setCelebrateLabel(null)} />
      )}

      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-content">Report this user</h3>
              <button onClick={() => { setShowReportModal(false); setReportDone(false); }} className="text-content-muted hover:text-content">
                <X size={20} />
              </button>
            </div>
            {reportDone ? (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <CheckCircle2 size={32} className="text-ok" />
                <p className="text-sm font-semibold text-content">Thanks — our team will review this report.</p>
                <Button variant="surface" size="sm" onClick={() => { setShowReportModal(false); setReportDone(false); }}>Close</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-content-muted">Reports are private and sent to the Influnet team for review.</p>
                <div>
                  <Label>Reason</Label>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(['scam', 'harassment', 'spam', 'fake', 'other'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => setReportReason(r)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold capitalize transition-colors ${
                          reportReason === r ? 'bg-brand-soft text-brand-strong' : 'bg-surface-muted text-content-muted hover:text-content'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Details (optional)</Label>
                  <Textarea value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} placeholder="What happened?" rows={3} />
                </div>
                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={submittingReport}
                  onClick={async () => {
                    if (!project) return;
                    const reportedId = project.owner_user_id === userId ? project.counterparty_user_id : project.owner_user_id;
                    setSubmittingReport(true);
                    try {
                      const res = await apiFetch('/api/reports', {
                        method: 'POST',
                        body: JSON.stringify({
                          reported_id: reportedId,
                          reason: reportReason,
                          details: reportDetails || undefined,
                          project_id: Number(projectId),
                        }),
                      });
                      if (res.ok) { setReportDone(true); setReportDetails(''); }
                      else { toast.error(res.error || 'Failed to submit report'); }
                    } finally {
                      setSubmittingReport(false);
                    }
                  }}
                >
                  {submittingReport ? <Loader2 className="animate-spin" /> : <Flag />} Submit report
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-extrabold text-content">Project Reviews</h3>
              <button onClick={() => setShowReviewModal(false)} className="text-content-muted hover:text-content">
                <X size={20} />
              </button>
            </div>
            
            {/* Existing Reviews */}
            {reviews.length > 0 && (
              <div className="mb-6 space-y-4">
                {reviews.map(r => (
                  <div key={r.id} className="rounded-xl border border-hairline bg-surface-card p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-bold text-content">{r.from_user?.name || 'User'}</span>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(star => (
                          <Star key={star} size={14} fill={star <= r.rating ? "var(--brand)" : "none"} color={star <= r.rating ? "var(--brand)" : "#cbd5e1"} />
                        ))}
                      </div>
                    </div>
                    {r.comment && <p className="text-sm text-content-soft">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Leave a Review Form */}
            {!reviews.some(r => r.from_user?.id === userId) && (
              <div className="space-y-4 border-t border-hairline pt-4">
                <div>
                  <Label>Rating</Label>
                  <div className="mt-2 flex gap-2">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button key={star} onClick={() => setReviewRating(star)}>
                        <Star size={24} fill={star <= reviewRating ? "var(--brand)" : "none"} color={star <= reviewRating ? "var(--brand)" : "#cbd5e1"} />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Comment (optional)</Label>
                  <Textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)} placeholder="How was working with them?" rows={3} />
                </div>
                <Button 
                  variant="brand" 
                  className="w-full"
                  disabled={submittingReview}
                  onClick={async () => {
                    setSubmittingReview(true);
                    try {
                      const res = await apiFetch(`/api/projects/${projectId}/reviews`, {
                        method: 'POST',
                        body: JSON.stringify({ rating: reviewRating, comment: reviewComment })
                      });
                      if (res.ok) {
                        await fetchData();
                        setShowReviewModal(false);
                      } else {
                        toast.error(res.error || 'Failed to submit review');
                      }
                    } finally {
                      setSubmittingReview(false);
                    }
                  }}
                >
                  Submit Review
                </Button>
              </div>
            )}
            
            {reviews.length === 0 && !reviews.some(r => r.from_user?.id === userId) && (
              <p className="mt-2 text-center text-sm text-content-muted">No reviews yet. Be the first to leave one!</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
