'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Save, Loader2 } from 'lucide-react';

export default function SettingsPage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [bio, setBio] = useState('');
  const [headline, setHeadline] = useState('');
  const [instagram, setInstagram] = useState('');
  const [youtube, setYoutube] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const sb = createClient();
        const { data: { session } } = await sb.auth.getSession();
        const token = session?.access_token;
        if (!token) return;

        const res = await fetch('/api/profile', {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to load profile');
        }

        const data = await res.json();
        const p = data.profile;
        setProfile(p);
        setName(p.name || '');
        setPhone(p.phone || '');
        setLocation(p.location || '');
        setCompanyName(p.company_name || '');
        setIndustry(p.industry || '');
        setBio(p.bio || '');
        setUsername(p.username || '');
        setHeadline(p.headline || '');
        setInstagram(p.instagram_handle || '');
        setYoutube(p.youtube_handle || '');
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSuccess('');
    setError('');
    try {
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      const token = session?.access_token;

      const payload: any = { name, phone, location };
      if (profile?.role === 'business_owner') {
        payload.company_name = companyName;
        payload.industry = industry;
        if (username) payload.username = username;
      } else if (profile?.role === 'influencer') {
        payload.bio = bio;
        payload.headline = headline;
        if (username) payload.username = username;
        payload.instagram_handle = instagram;
        payload.youtube_handle = youtube;
      }

      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save');
      }

      // Update localStorage cache
      const stored = localStorage.getItem('influnet_user');
      if (stored) {
        const user = JSON.parse(stored);
        user.name = name;
        localStorage.setItem('influnet_user', JSON.stringify(user));
      }

      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100%', fontFamily: '"Plus Jakarta Sans", Inter, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, border: '3px solid #f1f5f9', borderTopColor: '#ee3e96', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Loading profile settings...</p>
        </div>
        <style dangerouslySetInnerHTML={{__html: `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}} />
      </div>
    );
  }

  const isBusiness = profile?.role === 'business_owner';
  const isInfluencer = profile?.role === 'influencer';

  return (
    <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100%', fontFamily: '"Plus Jakarta Sans", Inter, sans-serif', color: '#0f172a' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#020617' }}>Account Settings</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Manage your profile and account information</p>
      </div>

      {success && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, color: '#16a34a', fontWeight: 600, fontSize: 13 }}>
          ✓ {success}
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 12, color: '#dc2626', fontWeight: 600, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 560 }}>
        {/* Profile Section */}
        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #f1f5f9', padding: '24px' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 900, color: '#020617', borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
            Profile Information
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Full Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fafafb' }}
                onFocus={e => { e.target.style.borderColor = '#ee3e96'; e.target.style.boxShadow = '0 0 0 3px rgba(238,62,150,0.1)'; e.target.style.background = '#fff'; }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#fafafb'; }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</label>
              <input
                value={profile?.email || ''}
                disabled
                style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#f8fafc', color: '#94a3b8', cursor: 'not-allowed' }}
              />
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>Email cannot be changed</p>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone</label>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fafafb' }}
                onFocus={e => { e.target.style.borderColor = '#ee3e96'; e.target.style.boxShadow = '0 0 0 3px rgba(238,62,150,0.1)'; e.target.style.background = '#fff'; }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#fafafb'; }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Location</label>
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="City, Country"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fafafb' }}
                onFocus={e => { e.target.style.borderColor = '#ee3e96'; e.target.style.boxShadow = '0 0 0 3px rgba(238,62,150,0.1)'; e.target.style.background = '#fff'; }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#fafafb'; }}
              />
            </div>
          </div>
        </div>

        {/* Role-specific Section */}
        {isBusiness && (
          <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #f1f5f9', padding: '24px' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 900, color: '#020617', borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
              Business Details
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Platform Username</label>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="yourusername"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fafafb' }}
                  onFocus={e => { e.target.style.borderColor = '#ee3e96'; e.target.style.boxShadow = '0 0 0 3px rgba(238,62,150,0.1)'; e.target.style.background = '#fff'; }}
                  onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#fafafb'; }}
                />
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>This is your public URL: influnet.app/c/{username || 'yourusername'}</p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Company Name</label>
                <input
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="Your company"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fafafb' }}
                  onFocus={e => { e.target.style.borderColor = '#ee3e96'; e.target.style.boxShadow = '0 0 0 3px rgba(238,62,150,0.1)'; e.target.style.background = '#fff'; }}
                  onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#fafafb'; }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Industry</label>
                <input
                  value={industry}
                  onChange={e => setIndustry(e.target.value)}
                  placeholder="e.g. Fashion, Tech, Food"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fafafb' }}
                  onFocus={e => { e.target.style.borderColor = '#ee3e96'; e.target.style.boxShadow = '0 0 0 3px rgba(238,62,150,0.1)'; e.target.style.background = '#fff'; }}
                  onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#fafafb'; }}
                />
              </div>
            </div>
          </div>
        )}

        {isInfluencer && (
          <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #f1f5f9', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: 12, marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#020617' }}>
                Creator Profile
              </h2>
              {profile?.username && (
                <a href={`/c/${profile.username}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 700, color: '#ee3e96', textDecoration: 'none' }}>
                  View Public Profile →
                </a>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Platform Username</label>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="yourusername"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fafafb' }}
                  onFocus={e => { e.target.style.borderColor = '#ee3e96'; e.target.style.boxShadow = '0 0 0 3px rgba(238,62,150,0.1)'; e.target.style.background = '#fff'; }}
                  onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#fafafb'; }}
                />
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>This is your public URL: influnet.app/c/{username || 'yourusername'}</p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Headline</label>
                <input
                  value={headline}
                  onChange={e => setHeadline(e.target.value)}
                  placeholder="e.g. Fitness Creator | 50K Followers"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fafafb' }}
                  onFocus={e => { e.target.style.borderColor = '#ee3e96'; e.target.style.boxShadow = '0 0 0 3px rgba(238,62,150,0.1)'; e.target.style.background = '#fff'; }}
                  onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#fafafb'; }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bio</label>
                <textarea
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  placeholder="Tell brands about yourself..."
                  rows={3}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical', background: '#fafafb' }}
                  onFocus={e => { e.target.style.borderColor = '#ee3e96'; e.target.style.boxShadow = '0 0 0 3px rgba(238,62,150,0.1)'; e.target.style.background = '#fff'; }}
                  onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#fafafb'; }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Instagram Handle</label>
                <input
                  value={instagram}
                  onChange={e => setInstagram(e.target.value)}
                  placeholder="@username"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fafafb' }}
                  onFocus={e => { e.target.style.borderColor = '#ee3e96'; e.target.style.boxShadow = '0 0 0 3px rgba(238,62,150,0.1)'; e.target.style.background = '#fff'; }}
                  onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#fafafb'; }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>YouTube Channel</label>
                <input
                  value={youtube}
                  onChange={e => setYoutube(e.target.value)}
                  placeholder="@channel"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fafafb' }}
                  onFocus={e => { e.target.style.borderColor = '#ee3e96'; e.target.style.boxShadow = '0 0 0 3px rgba(238,62,150,0.1)'; e.target.style.background = '#fff'; }}
                  onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#fafafb'; }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Save Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 24px', borderRadius: 12, border: 'none',
              cursor: saving ? 'wait' : 'pointer',
              fontWeight: 800, fontSize: 14,
              background: 'linear-gradient(105deg, #ee3e96, #f26e59)',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(238,62,150,0.25)',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? (
              <><Loader2 size={16} style={{ animation: 'spin2 1s linear infinite' }} /> Saving...</>
            ) : (
              <><Save size={16} /> Save Changes</>
            )}
          </button>
        </div>
        <style dangerouslySetInnerHTML={{__html: `@keyframes spin2 { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}} />
      </div>
    </div>
  );
}
