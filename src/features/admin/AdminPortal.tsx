import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  LogOut,
  Mail,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import {
  deleteWeeklyBulletin,
  fetchAllBulletinsForAdmin,
  getActiveAdminProfile,
} from '../../services/parishRepository';
import {
  AdminUserProfile,
  formatRoleLabel,
  isSuperAdminRole,
  ParishInfo,
  RegularScheduleItem,
  ThemeMode,
  WeeklyBulletin,
} from '../../types/parish';
import { AdminAuditLogViewer } from './AdminAuditLogViewer';
import { AdminBulletinComposer } from './AdminBulletinComposer';
import { AdminParishInfoEditor } from './AdminParishInfoEditor';
import { AdminSchedulesEditor } from './AdminSchedulesEditor';
import { AdminThemeControl } from './AdminThemeControl';
import { AdminUsersManager } from './AdminUsersManager';

interface AdminPortalProps {
  fallbackBulletin: WeeklyBulletin;
  regularSchedules: RegularScheduleItem[];
  parishInfo: ParishInfo;
  themeMode: ThemeMode;
  onThemeUpdated: (nextMode: ThemeMode) => void;
  onDataChanged: () => void;
  onBackToApp: () => void;
}

export function AdminPortal({
  fallbackBulletin,
  regularSchedules,
  parishInfo,
  themeMode,
  onThemeUpdated,
  onDataChanged,
  onBackToApp,
}: AdminPortalProps) {
  const [adminProfile, setAdminProfile] = useState<AdminUserProfile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(isSupabaseConfigured);
  const [sandboxMode, setSandboxMode] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  // Password recovery flow when arriving via reset email link
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const [adminTab, setAdminTab] = useState<
    'composer' | 'schedules' | 'parish' | 'users' | 'theme' | 'audit'
  >('composer');
  const [bulletins, setBulletins] = useState<WeeklyBulletin[]>([fallbackBulletin]);
  const [selectedBulletinIdx, setSelectedBulletinIdx] = useState(0);
  const [deletingBulletin, setDeletingBulletin] = useState(false);

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
    if (!isSupabaseConfigured || !supabase) return;
    loadAdminState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setSigningIn(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const profile = await getActiveAdminProfile();
      if (!profile) {
        await supabase.auth.signOut();
        throw new Error(
          'Signed in, but this account is not active in public.admin_users.'
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

  const handleSendDeviceEmailLink = async () => {
    if (!supabase) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setAuthError('Enter your admin email address first.');
      return;
    }
    setSigningIn(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/#/admin`,
        },
      });
      if (error) throw error;
      setAuthInfo(`One-tap device login link sent to ${cleanEmail}. Open it on this device to sign in.`);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to send device login link.');
    } finally {
      setSigningIn(false);
    }
  };

  const handlePasskeySignIn = async () => {
    if (!supabase) return;
    setSigningIn(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      if (typeof window === 'undefined' || !window.PublicKeyCredential) {
        throw new Error('Passkeys are not supported by this browser.');
      }
      const { error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
      const profile = await getActiveAdminProfile();
      if (!profile) {
        await supabase.auth.signOut();
        throw new Error('Signed in, but this account is not active in public.admin_users.');
      }
      setAdminProfile(profile);
      const list = await fetchAllBulletinsForAdmin();
      if (list.length > 0) setBulletins(list);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Device passkey login failed.';
      setAuthError(
        msg.toLowerCase().includes('disabled') || msg.includes('404')
          ? 'Device Passkeys are not enabled on Supabase Auth yet. Sign in with Password or Device Email Link below.'
          : msg
      );
    } finally {
      setSigningIn(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!supabase) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setAuthError('Enter your admin email address first to receive a password reset link.');
      return;
    }
    setSigningIn(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/#/admin`,
      });
      if (error) throw error;
      setAuthInfo(`Password reset link sent to ${cleanEmail}.`);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to send password reset email.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleCompleteRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || newPassword.length < 8) {
      setAuthError('New password must be at least 8 characters.');
      return;
    }
    setUpdatingPassword(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setRecoveryMode(false);
      setNewPassword('');
      setAuthInfo('Password updated! You are signed in.');
      await loadAdminState();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setAdminProfile(null);
    setSandboxMode(false);
  };

  const handleDeleteBulletin = async (target: WeeklyBulletin) => {
    if (!isSuperAdminRole(adminProfile?.role)) return;
    if (bulletins.length <= 1) return;
    const confirmed = window.confirm(
      `Delete "${target.title}"? This removes the weekly bulletin permanently.`
    );
    if (!confirmed) return;
    setDeletingBulletin(true);
    try {
      await deleteWeeklyBulletin(target.id);
      const list = await fetchAllBulletinsForAdmin();
      setBulletins(list.length > 0 ? list : [fallbackBulletin]);
      setSelectedBulletinIdx(0);
      onDataChanged();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to delete bulletin.');
    } finally {
      setDeletingBulletin(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="rounded-2xl border border-parish-border bg-white p-8 text-center text-sm text-parish-muted">
        Verifying admin session...
      </div>
    );
  }

  if (recoveryMode) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <div className="rounded-2xl border border-parish-border bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2 text-parish-navy">
            <KeyRound className="h-5 w-5" />
            <h2 className="text-lg font-bold">Set New Admin Password</h2>
          </div>
          <p className="mt-1 text-xs text-parish-muted">
            Enter a strong new password (at least 8 characters) to complete your reset.
          </p>
          {authError && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
              {authError}
            </div>
          )}
          <form onSubmit={handleCompleteRecovery} className="mt-4 space-y-3">
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="w-full rounded-xl border border-parish-border px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={updatingPassword}
              className="w-full rounded-xl bg-parish-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-parish-navy-dark disabled:opacity-50"
            >
              {updatingPassword ? 'Updating Password...' : 'Save New Password'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Unauthenticated Gate
  if (!adminProfile && !sandboxMode) {
    const passkeySupported =
      typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';

    return (
      <div className="mx-auto max-w-md space-y-4">
        <button
          type="button"
          onClick={onBackToApp}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-parish-navy hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Parish App
        </button>

        <div className="rounded-2xl border border-parish-border bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2.5 text-parish-navy">
            <ShieldCheck className="h-6 w-6" />
            <div>
              <h2 className="text-lg font-bold">Parish Admin Portal</h2>
              <p className="text-xs text-parish-muted">Authorized Vicar & Trustees Only</p>
            </div>
          </div>

          {!isSupabaseConfigured ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-950">
                <strong>Supabase is not connected yet.</strong> Follow{' '}
                <code>docs/manual-setup-guide.html</code> to configure <code>.env</code>. You can
                still test the Smart Paste, Liturgical Themes & Card Composer in local Sandbox Mode.
              </div>
              <button
                type="button"
                onClick={() => setSandboxMode(true)}
                className="w-full rounded-xl bg-parish-navy px-4 py-2.5 text-xs font-semibold text-white hover:bg-parish-navy-dark"
              >
                Open Composer Sandbox (Test Smart Paste & Themes)
              </button>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="mt-4 space-y-3">
              {authError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                  {authError}
                </div>
              )}
              {authInfo && (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                  <span>{authInfo}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-parish-muted">Admin Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vicar@stmarysyroclt.org"
                  className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-parish-muted">Password</label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-[11px] font-semibold text-parish-navy hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={signingIn}
                className="w-full rounded-xl bg-parish-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-parish-navy-dark disabled:opacity-50"
              >
                {signingIn ? 'Signing in...' : 'Sign In'}
              </button>

              <div className="space-y-2 border-t border-parish-border pt-3">
                <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-parish-muted">
                  Device Login Options
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={signingIn}
                    onClick={handleSendDeviceEmailLink}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-parish-border bg-parish-canvas px-3 py-2 text-xs font-semibold text-parish-navy hover:bg-slate-100 disabled:opacity-50"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Email Device Link
                  </button>
                  {passkeySupported && (
                    <button
                      type="button"
                      disabled={signingIn}
                      onClick={handlePasskeySignIn}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-parish-border bg-parish-canvas px-3 py-2 text-xs font-semibold text-parish-navy hover:bg-slate-100 disabled:opacity-50"
                    >
                      <Fingerprint className="h-3.5 w-3.5" />
                      Device Passkey
                    </button>
                  )}
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  const activeDraft = bulletins[selectedBulletinIdx] ?? fallbackBulletin;
  const canDeleteBulletin =
    !sandboxMode && isSuperAdminRole(adminProfile?.role) && bulletins.length > 1;

  return (
    <div className="space-y-4">
      {/* Admin Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-parish-border bg-white px-4 py-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBackToApp}
            className="rounded-lg border border-parish-border p-1.5 text-parish-navy hover:bg-slate-50"
            aria-label="Back to public app"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-sm font-bold text-parish-ink">
              {sandboxMode ? 'Composer Sandbox (Local Preview)' : adminProfile?.full_name}
            </p>
            <p className="text-[11px] uppercase tracking-wider text-parish-muted">
              {sandboxMode
                ? 'Connect Supabase to publish'
                : `${formatRoleLabel(adminProfile?.role)} • ${adminProfile?.email}`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-1 rounded-lg border border-parish-border px-3 py-1.5 text-xs font-semibold text-parish-muted hover:bg-slate-50"
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
            ['users', 'Users & Roles'],
            ['theme', 'Liturgical Theme'],
            ['audit', 'Audit Logs'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setAdminTab(key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              adminTab === key
                ? 'bg-parish-navy text-white'
                : 'border border-parish-border bg-white text-parish-muted hover:text-parish-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {adminTab === 'composer' && (
        <div className="space-y-3">
          {bulletins.length > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-parish-muted">Editing Week:</span>
                <select
                  value={selectedBulletinIdx}
                  onChange={(e) => setSelectedBulletinIdx(Number(e.target.value))}
                  className="rounded-lg border border-parish-border bg-white px-2.5 py-1 text-xs font-medium"
                >
                  {bulletins.map((b, i) => (
                    <option key={b.id} value={i}>
                      {b.title} ({b.status})
                    </option>
                  ))}
                </select>
              </div>
              {canDeleteBulletin && (
                <button
                  type="button"
                  disabled={deletingBulletin}
                  onClick={() => handleDeleteBulletin(activeDraft)}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deletingBulletin ? 'Deleting...' : 'Delete Week'}
                </button>
              )}
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

      {adminTab === 'users' && (
        <ErrorBoundary
          fallback={
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900">
              Unable to render User & Role Management right now. Try refreshing the page.
            </div>
          }
        >
          <AdminUsersManager currentUser={adminProfile} isSandbox={sandboxMode} />
        </ErrorBoundary>
      )}

      {adminTab === 'theme' && (
        <ErrorBoundary
          fallback={
            <div className="rounded-2xl border border-parish-border bg-white p-4 text-xs text-parish-muted">
              Theme selector encountered an unexpected error; Classic Parish Default remains active.
            </div>
          }
        >
          <AdminThemeControl
            currentMode={themeMode}
            userRole={sandboxMode ? 'super_admin' : adminProfile?.role}
            isSandbox={sandboxMode}
            onThemeUpdated={onThemeUpdated}
          />
        </ErrorBoundary>
      )}

      {adminTab === 'audit' && <AdminAuditLogViewer isSandbox={sandboxMode} />}
    </div>
  );
}
