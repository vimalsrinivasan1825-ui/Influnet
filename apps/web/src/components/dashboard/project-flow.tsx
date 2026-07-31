'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow, Background, Controls, MarkerType,
  useNodesState, useEdgesState,
  type Node, type Edge, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Check, Circle, SkipForward, Link2, Download, ChevronDown } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Handle, Position } from '@xyflow/react';
import { STAGE_LABELS, STAGES, type Stage } from '@/lib/project-lifecycle';
import { STAGE_GUIDE } from '@/lib/project-stage-guide';

type StageStatus = 'done' | 'skipped' | 'current' | 'upcoming';

function isImageName(name?: string | null): boolean {
  return !!name && /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(name);
}
function fmt(iso: string): string {
  try { return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); }
  catch { return ''; }
}

const STATUS_STYLE: Record<StageStatus, { ring: string; pill: string; dot: string }> = {
  done: { ring: '#10b981', pill: 'bg-ok-soft text-ok', dot: '#10b981' },
  current: { ring: '#ee3e96', pill: 'bg-brand-soft text-brand-strong', dot: '#ee3e96' },
  skipped: { ring: '#94a3b8', pill: 'bg-surface-muted text-content-muted', dot: '#94a3b8' },
  upcoming: { ring: '#cbd5e1', pill: 'bg-surface-muted text-content-muted', dot: '#cbd5e1' },
};

// Custom node — a stage card. Display-only; selection/click handled by React Flow.
function StageNode({ data, selected }: NodeProps) {
  const d = data as { label: string; status: StageStatus; count: number; index: number };
  const s = STATUS_STYLE[d.status];
  const upcoming = d.status === 'upcoming';
  return (
    <div
      className="rounded-2xl border bg-surface-card px-4 py-3 shadow-[0_2px_10px_rgba(0,0,0,0.06)]"
      style={{
        width: 210,
        opacity: upcoming ? 0.7 : 1,
        borderTopColor: selected ? s.ring : 'var(--hairline, #e2e8f0)',
        borderRightColor: selected ? s.ring : 'var(--hairline, #e2e8f0)',
        borderBottomColor: selected ? s.ring : 'var(--hairline, #e2e8f0)',
        borderLeftColor: s.ring,
        borderLeftWidth: 4,
        borderLeftStyle: upcoming ? 'dashed' : 'solid',
        boxShadow: selected ? `0 0 0 2px ${s.ring}` : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full text-[0.625rem] font-bold text-white" style={{ background: s.dot }}>
          {d.status === 'done' ? <Check size={13} /> : d.status === 'skipped' ? <SkipForward size={12} /> : d.index + 1}
        </span>
        <span className="text-sm font-extrabold text-content">{d.label}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[0.5625rem] font-bold uppercase ${s.pill}`}>{d.status}</span>
        {!upcoming && (
          <span className="text-xs font-semibold text-content-muted">{d.count} update{d.count === 1 ? '' : 's'}</span>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { stage: StageNode };

export function ProjectFlow({ project, entries, userId, onPreviewImage }: { project: any; entries: any[]; userId: string | null; onPreviewImage?: (url: string) => void }) {
  const currentIdx = STAGES.indexOf(project?.current_stage as Stage);
  const sp = (project?.stage_progress || {}) as Record<string, any>;
  // Which side of STAGE_GUIDE to show for an unreached stage — the whole
  // point of showing it is telling THIS viewer what they'll need to do.
  const userRole: 'business' | 'creator' = project?.owner_user_id === userId ? 'business' : 'creator';

  // Render every stage, not just the ones reached so far. Hiding what's ahead
  // meant a creator had no way to see or prepare for what comes next — the
  // per-stage guidance in STAGE_GUIDE already covers every stage, it just
  // wasn't reachable for anything upcoming.
  const allStages = STAGES;

  const statusOf = useCallback((key: string, i: number): StageStatus => {
    if (sp[key]?.status === 'skipped') return 'skipped';
    if (i === currentIdx) return 'current';
    if (currentIdx >= 0 && i > currentIdx) return 'upcoming';
    return 'done';
  }, [sp, currentIdx]);

  const initialNodes: Node[] = useMemo(() => allStages.map((key: Stage, i: number) => ({
    id: key,
    type: 'stage',
    position: { x: i * 280, y: (i % 2) * 120 },
    data: { label: STAGE_LABELS[key] || key, status: statusOf(key, i), count: entries.filter((e) => e.stage_key === key).length, index: i },
    deletable: false,
  })), [allStages, statusOf, entries]);

  const initialEdges: Edge[] = useMemo(() => allStages.slice(1).map((key: Stage, i: number) => ({
    id: `${allStages[i]}-${key}`,
    source: allStages[i],
    target: key,
    animated: statusOf(key, i + 1) !== 'upcoming',
    deletable: false,
    style: {
      stroke: statusOf(key, i + 1) === 'upcoming' ? '#cbd5e1' : '#10b981',
      strokeWidth: 2,
      strokeDasharray: '5 5',
    },
    markerEnd: { type: MarkerType.ArrowClosed, color: statusOf(key, i + 1) === 'upcoming' ? '#cbd5e1' : '#10b981' },
  })), [allStages, statusOf]);

  // useNodesState/useEdgesState only SEED from initialNodes/initialEdges once.
  // Without syncing on change, signing off a stage genuinely advances
  // project.current_stage but this diagram keeps showing the old one until a
  // full remount — the creator's action looks like it silently failed, so
  // they click again.
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  useEffect(() => setNodes(initialNodes), [initialNodes, setNodes]);
  useEffect(() => setEdges(initialEdges), [initialEdges, setEdges]);
  const [selected, setSelected] = useState<string | null>(project?.current_stage || null);

  const selectedEntries = selected ? entries.filter((e) => e.stage_key === selected) : [];

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="flex-1 lg:border-r border-b lg:border-b-0 border-hairline" style={{ minHeight: '62vh' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => setSelected(node.id)}
          nodesConnectable={false}
          edgesReconnectable={false}
          deleteKeyCode={null}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} color="#cbd5e1" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {/* Detail panel for the selected node */}
      <div className="w-full lg:w-[400px] xl:w-[480px] shrink-0 overflow-y-auto p-4 sm:p-6">
        {selected ? (
          <>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-brand">Stage</span>
              <span className="text-lg font-extrabold text-content">{STAGE_LABELS[selected as Stage] || selected}</span>
            </div>
            {/* What this stage is for, and what each side does in it — always
                shown, not just for stages not yet reached, so "what happens
                next" is one click away instead of a surprise when it arrives. */}
            {STAGE_GUIDE[selected as Stage] && (
              <div className="mb-4 rounded-2xl border border-hairline bg-surface-muted p-4">
                <p className="text-sm font-medium text-content">{STAGE_GUIDE[selected as Stage].summary}</p>
                <p className="mt-2.5 text-xs font-bold uppercase tracking-[0.06em] text-content-muted">Your side</p>
                <ul className="mt-1 list-disc pl-4 text-sm text-content-soft">
                  {STAGE_GUIDE[selected as Stage][userRole === 'business' ? 'brand' : 'creator'].map(
                    (line: string, i: number) => (
                      <li key={i}>{line}</li>
                    ),
                  )}
                </ul>
              </div>
            )}
            {selectedEntries.length === 0 ? (
              <p className="text-base font-medium text-content-muted">No updates were shared in this stage yet.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {selectedEntries.map((e) => {
                  const mine = e.author?.id === userId;
                  return (
                    <div key={e.id} className="rounded-2xl border border-hairline bg-surface-card p-4">
                      <div className="mb-1.5 flex items-center gap-2">
                        <Avatar name={e.author?.name} size="sm" square />
                        <span className="text-sm font-bold text-content">{mine ? 'You' : e.author?.name || 'Partner'}</span>
                        <span className="text-xs font-medium text-content-muted">{fmt(e.created_at)}</span>
                      </div>
                      {e.body && <p className="whitespace-pre-wrap text-sm font-medium text-content">{e.body}</p>}
                      {e.file_url && isImageName(e.file_name) && (
                        <button onClick={() => onPreviewImage && onPreviewImage(e.file_url!)} className="mt-2 block w-full overflow-hidden rounded-xl border border-hairline text-left transition-opacity hover:opacity-90">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={e.file_url} alt={e.file_name || 'shared image'} className="max-h-80 w-full object-cover" />
                        </button>
                      )}
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {e.link_url && (
                          <a href={e.link_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-2.5 py-1 text-xs font-semibold text-brand-strong hover:bg-surface-muted">
                            <Link2 size={13} /> {(() => { try { return new URL(e.link_url).hostname; } catch { return 'Link'; } })()}
                          </a>
                        )}
                        {e.file_url && !isImageName(e.file_name) && (
                          <a href={e.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-2.5 py-1 text-xs font-semibold text-content hover:bg-surface-muted">
                            <Download size={13} /> {e.file_name || 'File'}
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <p className="flex items-center gap-2 text-base font-medium text-content-muted">
            <ChevronDown size={16} /> Click a stage to see everything shared in it.
          </p>
        )}
      </div>
    </div>
  );
}
