'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { FolderGit2, Trash2, Search } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

const STAGE_LABELS: Record<string, string> = {
  collaboration_started: 'Started',
  project_discussion: 'Discussion',
  advance_payment: 'Deposit',
  content_planning: 'Planning',
  content_confirmation: 'Approved',
  shooting_in_progress: 'Shooting',
  editing_in_progress: 'Editing',
  sent_for_review: 'Review',
  revisions: 'Revisions',
  final_approval: 'Final OK',
  final_payment: 'Payment',
  project_completed: 'Completed',
};

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchProjects = async () => {
    try {
      const res = await apiFetch<{ projects: any[] }>('/api/admin/projects');
      if (!res.ok || !res.data) throw new Error(res.error || 'Failed to fetch projects');
      setProjects(res.data.projects || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProjects(); }, []);

  const handleDeleteProject = async (projectId: string) => {
    setDeletingId(projectId);
    try {
      const res = await apiFetch('/api/admin/projects', {
        method: 'DELETE',
        body: JSON.stringify({ project_id: projectId })
      });

      if (!res.ok) {
        throw new Error(res.error || 'Failed to delete');
      }

      setConfirmDelete(null);
      await fetchProjects();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = projects.filter((p: any) =>
    !search ||
    p.title?.toLowerCase().includes(search.toLowerCase()) ||
    p.owner?.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.counterparty?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100%', fontFamily: '"Plus Jakarta Sans", Inter, sans-serif', color: '#0f172a' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <FolderGit2 size={18} style={{ color: '#6366f1' }} />
              <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6366f1' }}>Admin</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>All Campaign Projects</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{projects.length} total projects — admin can view and delete any project</p>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding: '8px 12px 8px 32px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, width: 220, outline: 'none' }}
            />
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: 16, background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 12, color: '#dc2626', fontWeight: 600, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: 72, background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
          <p style={{ fontWeight: 700, color: '#64748b' }}>No projects found</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((p: any) => {
            const stageLabel = STAGE_LABELS[p.current_stage] || p.current_stage;
            const isActive = p.status === 'active';

            return (
              <div key={p.id} style={{
                background: '#fff',
                borderRadius: 12,
                border: `1px solid ${isActive ? '#e0e7ff' : '#f1f5f9'}`,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: isActive ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#e2e8f0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 900, fontSize: 14,
                }}>
                  {p.title?.charAt(0).toUpperCase() || 'P'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: '#020617' }}>{p.title}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 6px',
                      background: isActive ? '#eef2ff' : '#f8fafc',
                      color: isActive ? '#6366f1' : '#94a3b8',
                    }}>
                      {isActive ? 'Active' : p.status}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 6px', background: '#fdf2f8', color: '#be185d' }}>
                      {stageLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>
                    <span>👤 {p.owner?.name || 'Unknown'} (Brand)</span>
                    <span style={{ margin: '0 6px' }}>↔</span>
                    <span>👤 {p.counterparty?.name || 'Unknown'} (Creator)</span>
                    {p.budget && <span style={{ marginLeft: 12 }}>💰 ₹{Number(p.budget).toLocaleString()}</span>}
                    <span style={{ marginLeft: 12 }}>📅 {new Date(p.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Delete Button */}
                {confirmDelete === p.id ? (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => handleDeleteProject(p.id)}
                      disabled={deletingId === p.id}
                      style={{
                        padding: '6px 12px', borderRadius: 8, border: 'none',
                        cursor: 'pointer', fontWeight: 800, fontSize: 11,
                        background: '#dc2626', color: '#fff',
                      }}
                    >
                      {deletingId === p.id ? '...' : 'Confirm Delete'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      style={{
                        padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
                        cursor: 'pointer', fontWeight: 700, fontSize: 11,
                        background: '#fff', color: '#475569',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(p.id)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: '1px solid #fee2e2',
                      cursor: 'pointer', fontWeight: 700, fontSize: 11,
                      background: '#fef2f2', color: '#dc2626', flexShrink: 0,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
