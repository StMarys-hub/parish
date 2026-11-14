import { useEffect, useState } from 'react';
import { ArrowLeft, LogOut, ShieldCheck } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import {
  fetchAllBulletinsForAdmin,
  getActiveAdminProfile,
} from '../../services/parishRepository';
import {
  AdminUserProfile,
  ParishInfo,
  RegularScheduleItem,
  WeeklyBulletin,
} from '../../types/parish';
import { AdminAuditLogViewer } from './AdminAuditLogViewer';
import { AdminBulletinComposer } from './AdminBulletinComposer';
import { AdminParishInfoEditor } from './AdminParishInfoEditor';
import { AdminSchedulesEditor } from './AdminSchedulesEditor';

interface AdminPortalProps {
  fallbackBulletin: WeeklyBulletin;
  regularSchedules: RegularScheduleItem[];
  parishInfo: ParishInfo;
  onDataChanged: () => void;
  onBackToApp: () => void;
}

export function AdminPortal({
  fallbackBulletin,
  regularSchedules,
  parishInfo,
  onDataChanged,
  onBackToApp,
}: AdminPortalProps) {
  const [adminProfile, setAdminProfile] = useState<AdminUserProfile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(isSupabaseConfigured);
  const [sandboxMode, setSandboxMode] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [adminTab, setAdminTab] = useState<'composer' | 'schedules' | 'parish' | 'audit'>(
    'composer'
  );
  const [bulletins, setBulletins] = useState<WeeklyBulletin[]>([fallbackBulletin]);
  const [selectedBulletinIdx, setSelectedBulletinIdx] = useState(0);

  const loadAdminState = async () => {
    setCheckingAuth(true);
    try {
      const profile = await getActiveAdminProfile();
      setAdminProfile(profile);
      if (profile) {
        const list = await fetchAllBulletinsForAdmin();
        if (list.length > 0) setBulletins(list);
      }
    } finally {
      setCheckingAuth(false);
    }
  };

  useEffect(() => {
    if (isSupabaseConfigured) {
      loadAdminState();
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setSigningIn(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const profile = await getActiveAdminProfile();
      if (!profile) {
        await supabase.auth.signOut();
        throw new Error(
          'Signed in, but this account is not allow-listed in public.admin_users.'
        );
      }
      setAdminProfile(profile);
      const list = await fetchAllBulletinsForAdmin();
      if (list.length > 0) setBulletins(list);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setAdminProfile(null);
    setSandboxMode(false);
  };

  if (checkingAuth) {
    return (
      <div className="rounded-2xl border border-[#E7E2DA] bg-white p-8 text-center text-sm text-[#526071]">
        Verifying admin session...
      </div>
    );
  }

  // Unauthenticated Gate
  if (!adminProfile && !sandboxMode) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <button
          type="button"
          onClick={onBackToApp}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E3A5F] hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Parish App
        </button>

        <div className="rounded-2xl border border-[#E7E2DA] bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2.5 text-[#1E3A5F]">
            <ShieldCheck className="h-6 w-6" />
            <div>
              <h2 className="text-lg font-bold">Parish Admin Portal</h2>
              <p className="text-xs text-[#526071]">Authorized Vicar & Trustees Only</p>
            </div>
          </div>

          {!isSupabaseConfigured ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-950">
                <strong>Supabase is not connected yet.</strong> Follow{' '}
                <code>docs/manual-setup-guide.html</code> to configure <code>.env</code>. You can
                still test the Smart Paste & Card Composer in local read-only Sandbox Mode below.
              </div>
              <button
                type="button"
                onClick={() => setSandboxMode(true)}
                className="w-full rounded-xl bg-[#1E3A5F] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#152943]"
              >
                Open Composer Sandbox (Test Smart Paste)
              </button>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="mt-4 space-y-3">
              {authError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                  {authError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-[#526071]">Admin Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vicar@stmarysyroclt.org"
                  className="mt-1 w-full rounded-xl border border-[#E7E2DA] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#526071]">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E7E2DA] px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={signingIn}
                className="w-full rounded-xl bg-[#1E3A5F] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#152943] disabled:opacity-50"
              >
                {signingIn ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  const activeDraft = bulletins[selectedBulletinIdx] ?? fallbackBulletin;

  return (
    <div className="space-y-4">
      {/* Admin Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#E7E2DA] bg-white px-4 py-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBackToApp}
            className="rounded-lg border border-[#E7E2DA] p-1.5 text-[#1E3A5F] hover:bg-slate-50"
            aria-label="Back to public app"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-sm font-bold text-[#1E293B]">
              {sandboxMode ? 'Composer Sandbox (Local Preview)' : adminProfile?.full_name}
            </p>
            <p className="text-[11px] uppercase tracking-wider text-[#526071]">
              {sandboxMode ? 'Connect Supabase to publish' : `${adminProfile?.role} • ${adminProfile?.email}`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-1 rounded-lg border border-[#E7E2DA] px-3 py-1.5 text-xs font-semibold text-[#526071] hover:bg-slate-50"
        >
          <LogOut className="h-3.5 w-3.5" />
          {sandboxMode ? 'Exit Sandbox' : 'Sign Out'}
        </button>
      </div>

      {/* Admin Module Switcher */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {(
          [
            ['composer', 'Bulletin Composer'],
            ['schedules', 'Regular Schedules'],
            ['parish', 'Parish Info'],
            ['audit', 'Audit Logs'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setAdminTab(key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
              adminTab === key
                ? 'bg-[#1E3A5F] text-white'
                : 'border border-[#E7E2DA] bg-white text-[#526071]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {adminTab === 'composer' && (
        <div className="space-y-3">
          {bulletins.length > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-[#526071]">Editing Week:</span>
              <select
                value={selectedBulletinIdx}
                onChange={(e) => setSelectedBulletinIdx(Number(e.target.value))}
                className="rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1 text-xs font-medium"
              >
                {bulletins.map((b, i) => (
                  <option key={b.id} value={i}>
                    {b.title} ({b.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          <AdminBulletinComposer
            key={activeDraft.id}
            initialBulletin={activeDraft}
            isSandbox={sandboxMode}
            onSaved={async () => {
              onDataChanged();
              if (!sandboxMode) {
                const list = await fetchAllBulletinsForAdmin();
                if (list.length > 0) setBulletins(list);
              }
            }}
          />
        </div>
      )}

      {adminTab === 'schedules' && (
        <AdminSchedulesEditor
          items={regularSchedules}
          isSandbox={sandboxMode}
          onUpdated={onDataChanged}
        />
      )}

      {adminTab === 'parish' && (
        <AdminParishInfoEditor
          initialInfo={parishInfo}
          isSandbox={sandboxMode}
          onUpdated={onDataChanged}
        />
      )}

      {adminTab === 'audit' && <AdminAuditLogViewer isSandbox={sandboxMode} />}
    </div>
  );
}
