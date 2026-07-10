'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/api-client';

const STAGES = [
  { key: 'collaboration_started', label: 'Started', color: '#3b82f6', desc: 'Collaboration initiated between brand and creator' },
  { key: 'project_discussion', label: 'Discussion', color: '#6366f1', desc: 'Discussing terms, requirements, and deliverables' },
  { key: 'advance_payment', label: 'Deposit', color: '#10b981', desc: 'Advance payment/deposit processing' },
  { key: 'content_planning', label: 'Planning', color: '#f59e0b', desc: 'Scripting, storyboarding, and planning concept' },
  { key: 'content_confirmation', label: 'Concept Approved', color: '#06b6d4', desc: 'Concept and script approved by the brand' },
  { key: 'shooting_in_progress', label: 'Shooting', color: '#a855f7', desc: 'Creator is filming and shooting content' },
  { key: 'editing_in_progress', label: 'Editing', color: '#ec4899', desc: 'Post-production and content editing' },
  { key: 'sent_for_review', label: 'Review', color: '#eab308', desc: 'Draft submitted for brand review and feedback' },
  { key: 'revisions', label: 'Revisions', color: '#f43f5e', desc: 'Making requested edits and revisions' },
  { key: 'final_approval', label: 'Approved', color: '#14b8a6', desc: 'Content approved for publication' },
  { key: 'final_payment', label: 'Payment', color: '#10b981', desc: 'Final invoice and payment settlement' },
  { key: 'project_completed', label: 'Completed', color: '#16a34a', desc: 'Campaign successfully completed' },
];

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const sb = createClient();
        const { data: { user }, error: authErr } = await sb.auth.getUser();
        if (authErr) throw authErr;
        if (user) {
          setUserId(user.id);
        }

        await fetchProjects();
      } catch (e: any) {
        console.error(e);
        setErrorMsg(e.message || 'Failed to initialize projects');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const fetchProjects = async () => {
    const res = await apiFetch<{ projects: any[] }>('/api/projects');
    if (!res.ok || !res.data) {
      throw new Error(res.error || 'Failed to load projects');
    }
    setProjects(res.data.projects || []);
  };

  const handleAdvanceStage = async (projectId: string, currentStage: string) => {
    const currentIndex = STAGES.findIndex(s => s.key === currentStage);
    if (currentIndex === -1 || currentIndex === STAGES.length - 1) return; // already completed or invalid
    const nextStage = STAGES[currentIndex + 1].key;

    setUpdatingId(projectId);
    try {
      const res = await apiFetch('/api/projects', {
        method: 'PATCH',
        body: JSON.stringify({
          id: projectId,
          current_stage: nextStage,
          status: nextStage === 'completed' ? 'completed' : 'active'
        })
      });

      if (!res.ok) {
        throw new Error(res.error || 'Failed to update stage');
      }

      await fetchProjects(); // refresh
    } catch (e: any) {
      alert(e.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCancellationAction = async (projectId: string, actionType: 'request' | 'decline' | 'accept') => {
    setUpdatingId(projectId);
    try {
      let action = '';
      if (actionType === 'request') action = 'request_cancellation';
      else if (actionType === 'decline') action = 'decline_cancellation';
      else if (actionType === 'accept') action = 'accept_cancellation';

      const res = await apiFetch('/api/projects', {
        method: 'PATCH',
        body: JSON.stringify({
          id: projectId,
          action
        })
      });

      if (!res.ok) {
        throw new Error(res.error || 'Failed to process cancellation request.');
      }

      const resData = res.data || {};
      if (resData.deleted) {
        alert('Project successfully cancelled and deleted.');
      }

      await fetchProjects(); // refresh
    } catch (e: any) {
      alert(e.message);
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100%', fontFamily: '"Plus Jakarta Sans", Inter, sans-serif' }}>
        <div style={{ height: 26, width: 140, background: '#e2e8f0', borderRadius: 8, marginBottom: 8 }} />
        <div style={{ height: 14, width: 260, background: '#f1f5f9', borderRadius: 6, marginBottom: 28 }} />
        {[1, 2].map(i => (
          <div key={i} style={{ height: 160, background: '#fff', borderRadius: 20, border: '1px solid #f1f5f9', marginBottom: 16 }} />
        ))}
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100%', fontFamily: '"Plus Jakarta Sans", Inter, sans-serif' }}>
        <div style={{ padding: 20, background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 16, color: '#dc2626', fontWeight: 600 }}>
          ⚠️ {errorMsg}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100%', fontFamily: '"Plus Jakarta Sans", Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#020617' }}>Campaign Projects</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Track campaign deliverables and pipeline progress stage-by-stage</p>
      </div>

      {projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 64, background: '#fff', borderRadius: 20, border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🚀</div>
          <p style={{ fontWeight: 700, color: '#020617', marginBottom: 4 }}>No active campaigns yet</p>
          <p style={{ fontSize: 13, color: '#94a3b8' }}>Accept a collaboration request to launch your campaign workspace.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {projects.map((p) => {
            const isOwner = p.owner_user_id === userId;
            const counterparty = isOwner ? p.counterparty : p.owner;
            const currentStageObj = STAGES.find(s => s.key === p.current_stage) || STAGES[0];
            const currentStageIndex = STAGES.findIndex(s => s.key === p.current_stage);
            const isCompleted = p.current_stage === 'completed';
            const isAdvancing = updatingId === p.id;

            return (
              <div key={p.id} onClick={() => router.push(`/dashboard/projects/${p.id}`)} style={{
                background: '#fff',
                borderRadius: 20,
                border: '1px solid #f1f5f9',
                boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
                cursor: 'pointer',
                transition: 'box-shadow 0.15s, transform 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.02)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                {/* Upper row: Info & Action */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#ee3e96' }}>
                        {isOwner ? '⚡ Client Portal' : '✨ Creator Portal'}
                      </span>
                      <span style={{ color: '#cbd5e1' }}>•</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>
                        With {counterparty?.name || 'Partner'} ({counterparty?.role === 'influencer' ? 'Creator' : 'Brand'})
                      </span>
                    </div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#020617' }}>{p.title}</h3>
                    {p.description && (
                      <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                        {p.description}
                      </p>
                    )}
                  </div>

                  {/* Actions column */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                    {p.budget && (
                      <div style={{ marginRight: 8, textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Campaign budget</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: '#020617' }}>₹{Number(p.budget).toLocaleString()}</div>
                      </div>
                    )}
                    
                    {!isCompleted ? (
                      <button
                        onClick={() => handleAdvanceStage(p.id, p.current_stage)}
                        disabled={isAdvancing}
                        style={{
                          padding: '10px 18px', borderRadius: 12, border: 'none',
                          cursor: isAdvancing ? 'wait' : 'pointer', fontWeight: 800, fontSize: 13,
                          background: 'linear-gradient(105deg, #ee3e96, #f26e59)', color: '#fff',
                          boxShadow: '0 4px 12px rgba(238,62,150,0.2)'
                        }}
                      >
                        {isAdvancing ? 'Updating...' : `Advance Stage ➔`}
                      </button>
                    ) : (
                      <span style={{ padding: '6px 14px', borderRadius: 10, background: '#f0fdf4', color: '#16a34a', fontWeight: 800, fontSize: 12 }}>
                        🎉 Campaign Completed
                      </span>
                    )}
                  </div>
                    {/* Stepper Train */}
                <div style={{ margin: '12px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '12px 0 16px 0', width: '100%', overflowX: 'auto', paddingBottom: 6 }}>
                    {STAGES.map((s, idx) => {
                      const isActive = s.key === p.current_stage;
                      const isPast = idx < currentStageIndex;
                      
                      let dotBg = '#cbd5e1';
                      let dotBorder = 'none';
                      if (isActive) {
                        dotBg = 'linear-gradient(135deg, #ee3e96, #a855f7)';
                      } else if (isPast) {
                        dotBg = '#ee3e96';
                      }

                      return (
                        <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 40 }}>
                          {/* Dot */}
                          <div
                            title={s.label}
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              background: dotBg,
                              border: dotBorder,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fff',
                              fontSize: 9,
                              fontWeight: 900,
                              flexShrink: 0,
                              boxShadow: isActive ? '0 0 10px rgba(238,62,150,0.4)' : 'none',
                              cursor: 'help'
                            }}
                          >
                            {isPast ? '✓' : idx + 1}
                          </div>
                          {/* Line */}
                          {idx < STAGES.length - 1 && (
                            <div style={{
                              flex: 1,
                              height: 3,
                              background: isPast ? '#ee3e96' : '#e2e8f0',
                              margin: '0 4px',
                              minWidth: 12
                            }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Current stage detail info description */}
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: 14,
                    background: '#f8fafc',
                    border: '1px solid #f1f5f9',
                    fontSize: 13,
                    color: '#1e293b',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <span style={{ fontWeight: 800, color: '#0f172a' }}>
                        Current Stage ({currentStageIndex + 1}/{STAGES.length}): <span style={{ color: '#db2777' }}>{currentStageObj.label}</span>
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                        Last updated: {new Date(p.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div style={{ color: '#64748b', fontSize: 12.5, lineHeight: 1.4 }}>
                      {currentStageObj.desc}
                    </div>
                  </div>
                </div>              </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
