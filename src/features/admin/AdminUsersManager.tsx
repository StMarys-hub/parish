import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  RefreshCw,
  Shield,
  ShieldAlert,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  deleteAdminUser,
  fetchAdminUsersRoster,
  inviteAdminUser,
  sendAdminPasswordReset,
  updateAdminUserRole,
} from '../../services/parishRepository';
import {
  AdminRole,
  AdminUserProfile,
  formatRoleLabel,
  isSuperAdminRole,
} from '../../types/parish';

interface AdminUsersManagerProps {
  currentUser: AdminUserProfile | null;
  isSandbox: boolean;
}

export function AdminUsersManager({ currentUser, isSandbox }: AdminUsersManagerProps) {
  const [users, setUsers] = useState<AdminUserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Invite form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('trustee');
  const [designation, setDesignation] = useState('');
  const [inviting, setInviting] = useState(false);

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<AdminUserProfile | null>(null);

  // Passkey / Device Login enrollment state
  const [registeringPasskey, setRegisteringPasskey] = useState(false);

  const canManageUsers = !isSandbox && isSuperAdminRole(currentUser?.role);

  const activeSuperAdminCount = useMemo(
    () => users.filter((u) => u.is_active && isSuperAdminRole(u.role)).length,
    [users]
  );

  const loadUsers = useCallback(async () => {
    if (isSandbox) return;
    setLoading(true);
    try {
      const roster = await fetchAdminUsersRoster();
      setUsers(roster);
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to load admin roster.',
      });
    } finally {
      setLoading(false);
    }
  }, [isSandbox]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageUsers) return;
    setInviting(true);
    setToast(null);
    try {
      const created = await inviteAdminUser({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        role,
        designation: designation.trim() || undefined,
      });
      setToast({
        type: 'ok',
        text: `Invite sent to ${created.full_name} (${created.email}) as ${formatRoleLabel(created.role)}.`,
      });
      setFullName('');
      setEmail('');
      setRole('trustee');
      setDesignation('');
      await loadUsers();
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to invite user.',
      });
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (user: AdminUserProfile, nextRole: AdminRole) => {
    if (!canManageUsers || user.role === nextRole) return;
    setBusyId(user.user_id);
    setToast(null);
    try {
      await updateAdminUserRole({ targetUserId: user.user_id, role: nextRole });
      setToast({
        type: 'ok',
        text: `Updated ${user.full_name}'s role to ${formatRoleLabel(nextRole)}.`,
      });
      await loadUsers();
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof Error ? err.message : 'Role update blocked.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (user: AdminUserProfile) => {
    if (!canManageUsers) return;
    setBusyId(user.user_id);
    setToast(null);
    try {
      await updateAdminUserRole({
        targetUserId: user.user_id,
        role: user.role,
        isActive: !user.is_active,
      });
      setToast({
        type: 'ok',
        text: `${user.is_active ? 'Deactivated' : 'Reactivated'} ${user.full_name}.`,
      });
      await loadUsers();
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to update status.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !canManageUsers) return;
    setBusyId(deleteTarget.user_id);
    setToast(null);
    try {
      await deleteAdminUser(deleteTarget.user_id);
      setToast({
        type: 'ok',
        text: `Removed admin access for ${deleteTarget.full_name} (${deleteTarget.email}).`,
      });
      setDeleteTarget(null);
      await loadUsers();
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to delete user.',
      });
      setDeleteTarget(null);
    } finally {
      setBusyId(null);
    }
  };

  const handleSendPasswordReset = async (user: AdminUserProfile) => {
    const isSelf = user.user_id === currentUser?.user_id;
    if (!isSelf && !canManageUsers) return;
    setBusyId(user.user_id);
    setToast(null);
    try {
      await sendAdminPasswordReset({ targetUserId: user.user_id, targetEmail: user.email });
      setToast({
        type: 'ok',
        text: `Password reset email dispatched to ${user.email}.`,
      });
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to send password reset link.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleRegisterDevicePasskey = async () => {
    if (!supabase) return;
    setRegisteringPasskey(true);
    setToast(null);
    try {
      if (typeof window === 'undefined' || !window.PublicKeyCredential) {
        throw new Error('This browser or device does not support WebAuthn passkeys.');
      }
      const { data, error } = await supabase.auth.registerPasskey();
      if (error) throw error;
      if (data?.id && supabase.auth.passkey?.update) {
        await supabase.auth.passkey.update({
          passkeyId: data.id,
          friendlyName: `${currentUser?.full_name ?? 'Admin'} (${navigator.platform || 'Device'})`.slice(0, 120),
        });
      }
      setToast({
        type: 'ok',
        text: 'This device is now registered with a biometric/passkey credential for backend sign-in.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Device passkey setup failed.';
      setToast({
        type: 'err',
        text: msg.toLowerCase().includes('disabled') || msg.includes('404')
          ? 'Device Passkeys must be enabled under Supabase Auth → Providers → Passkeys before enrollment. Password + Email Device Link login remain active.'
          : msg,
      });
    } finally {
      setRegisteringPasskey(false);
    }
  };

  if (isSandbox) {
    return (
      <div className="rounded-2xl border border-parish-border bg-white p-6 text-center text-xs text-parish-muted">
        Connect Supabase in <code>.env</code> to manage admin users, roles, and password resets.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* RBAC Permissions Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-parish-border bg-white p-4">
        <div className="flex items-start gap-2.5">
          <div className="rounded-xl bg-parish-navy/10 p-2 text-parish-navy">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-parish-ink">User & Role Governance (RBAC)</h3>
            <p className="text-xs text-parish-muted">
              Your Role: <strong>{formatRoleLabel(currentUser?.role)}</strong> —{' '}
              {canManageUsers
                ? 'Full access (invite admins, assign roles, reset passwords, delete bulletins & manage themes).'
                : 'Operational Trustee access (read-only team roster; only Super Admin / Vicar can invite or modify roles).'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadUsers}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg border border-parish-border bg-parish-canvas px-3 py-1.5 text-xs font-semibold text-parish-navy"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {toast && (
        <div
          role="status"
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium ${
            toast.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {toast.type === 'ok' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
          ) : (
            <ShieldAlert className="h-4 w-4 shrink-0 text-rose-700" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Device Passkey Authentication Enrollment */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-parish-border bg-white p-4">
        <div className="flex items-start gap-2.5">
          <div className="rounded-xl bg-parish-gold-soft p-2 text-parish-gold-ink">
            <Fingerprint className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-parish-ink">
              Device Authentication (Passkey / Biometrics)
            </h4>
            <p className="text-xs text-parish-muted">
              Enroll this phone or computer (Face ID, Touch ID, Windows Hello) with Supabase Auth
              for fast one-tap device login.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleRegisterDevicePasskey}
          disabled={registeringPasskey}
          className="inline-flex items-center gap-1.5 rounded-xl border border-parish-border bg-parish-canvas px-3.5 py-2 text-xs font-semibold text-parish-navy hover:bg-slate-100 disabled:opacity-50"
        >
          <Fingerprint className="h-3.5 w-3.5" />
          {registeringPasskey ? 'Registering...' : 'Enroll This Device'}
        </button>
      </section>

      {/* Invite / Create User Form (Super Admin / Vicar only) */}
      {canManageUsers ? (
        <form
          onSubmit={handleInvite}
          className="space-y-3 rounded-2xl border border-parish-border bg-white p-4"
        >
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-parish-navy" />
            <h4 className="text-sm font-bold text-parish-ink">Add / Invite Admin User</h4>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-parish-muted">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g., Thomas Mathew"
                className="mt-1 w-full rounded-lg border border-parish-border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-parish-muted">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trustee@stmarysyroclt.org"
                className="mt-1 w-full rounded-lg border border-parish-border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-parish-muted">RBAC Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as AdminRole)}
                className="mt-1 w-full rounded-lg border border-parish-border bg-white px-3 py-2 text-sm"
              >
                <option value="trustee">Trustee (Bulletins & Schedules)</option>
                <option value="super_admin">Super Admin / Vicar (Full Governance)</option>
                <option value="secretary">Secretary (Operational)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-parish-muted">
                Title / Designation (Optional)
              </label>
              <input
                type="text"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="e.g., Vicar, Kaikkaran / Trustee, Secretary"
                className="mt-1 w-full rounded-lg border border-parish-border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={inviting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-parish-navy px-4 py-2 text-xs font-semibold text-white hover:bg-parish-navy-dark disabled:opacity-50"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {inviting ? 'Sending Invite...' : 'Send Admin Invite'}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p>
            <strong>Trustee Access Restriction:</strong> Only a <strong>Super Admin / Vicar</strong>{' '}
            can invite users, change admin roles, or revoke accounts. You can trigger a password
            reset link for your own account below.
          </p>
        </div>
      )}

      {/* Existing Admin Users Roster */}
      <div className="space-y-2.5">
        {users.map((u) => {
          const isSelf = u.user_id === currentUser?.user_id;
          const isSuper = isSuperAdminRole(u.role);
          const isLastSuperAdmin = u.is_active && isSuper && activeSuperAdminCount <= 1;
          const isBusy = busyId === u.user_id;
          const canSendReset = isSelf || canManageUsers;

          return (
            <div
              key={u.user_id}
              className="rounded-2xl border border-parish-border bg-white p-4 shadow-2xs"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-parish-ink">{u.full_name}</p>
                    {isSelf && (
                      <span className="rounded-full bg-parish-navy/10 px-2 py-0.5 text-[10px] font-bold text-parish-navy">
                        You
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        isSuper
                          ? 'bg-purple-50 text-purple-900 border border-purple-200'
                          : 'bg-slate-100 text-slate-800 border border-slate-200'
                      }`}
                    >
                      {formatRoleLabel(u.role)}
                    </span>
                    {!u.is_active ? (
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                        Deactivated
                      </span>
                    ) : u.invite_status === 'pending_invite' ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        Pending Invite
                      </span>
                    ) : (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        Active
                      </span>
                    )}
                  </div>

                  <p className="truncate text-xs text-parish-muted">
                    {u.email}
                    {u.designation ? ` • ${u.designation}` : ''}
                  </p>
                  {u.last_active_at && (
                    <p className="text-[11px] text-parish-muted">
                      Last active: {new Date(u.last_active_at).toLocaleString()}
                    </p>
                  )}
                </div>

                {/* Governance Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  {canManageUsers && (
                    <select
                      aria-label={`Role for ${u.full_name}`}
                      value={u.role}
                      disabled={isBusy || isLastSuperAdmin || isSelf}
                      onChange={(e) => handleRoleChange(u, e.target.value as AdminRole)}
                      title={
                        isLastSuperAdmin
                          ? 'Cannot demote the last remaining Super Admin / Vicar'
                          : isSelf
                            ? 'Cannot change your own role'
                            : 'Assign role'
                      }
                      className="rounded-lg border border-parish-border bg-white px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                    >
                      <option value="super_admin">Super Admin / Vicar</option>
                      {u.role === 'vicar' && <option value="vicar">Vicar (Super Admin)</option>}
                      <option value="trustee">Trustee</option>
                      <option value="secretary">Secretary</option>
                    </select>
                  )}

                  {canSendReset && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleSendPasswordReset(u)}
                      className="inline-flex items-center gap-1 rounded-lg border border-parish-border bg-parish-canvas px-2.5 py-1.5 text-xs font-semibold text-parish-navy hover:bg-slate-100 disabled:opacity-50"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Reset Link
                    </button>
                  )}

                  {canManageUsers && (
                    <>
                      <button
                        type="button"
                        disabled={isBusy || isSelf || isLastSuperAdmin}
                        onClick={() => handleToggleActive(u)}
                        title={
                          isSelf
                            ? 'Cannot deactivate your own account'
                            : isLastSuperAdmin
                              ? 'Cannot deactivate the last Super Admin / Vicar'
                              : u.is_active
                                ? 'Revoke active access'
                                : 'Restore access'
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-parish-border bg-white px-2.5 py-1.5 text-xs font-semibold text-parish-muted hover:bg-slate-50 disabled:opacity-40"
                      >
                        {u.is_active ? (
                          <>
                            <UserX className="h-3.5 w-3.5" /> Deactivate
                          </>
                        ) : (
                          <>
                            <UserCheck className="h-3.5 w-3.5" /> Reactivate
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={isBusy || isSelf || isLastSuperAdmin}
                        onClick={() => setDeleteTarget(u)}
                        title={
                          isSelf
                            ? 'Cannot delete your own currently active account'
                            : isLastSuperAdmin
                              ? 'Cannot delete the last remaining Super Admin / Vicar'
                              : 'Remove user'
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal for Delete */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-admin-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-rose-100 p-2 text-rose-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 id="delete-admin-title" className="text-base font-bold text-parish-ink">
                  Confirm Admin Removal
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-parish-muted">
                  This permanently revokes Admin Portal access and removes the account from Supabase
                  Auth. Past audit log history will remain intact.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-parish-border bg-parish-canvas p-3 text-xs">
              <p className="font-bold text-parish-ink">{deleteTarget.full_name}</p>
              <p className="text-parish-muted">{deleteTarget.email}</p>
              <p className="mt-1 text-[11px] font-semibold text-parish-navy">
                Role: {formatRoleLabel(deleteTarget.role)}
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-parish-border px-4 py-2 text-xs font-semibold text-parish-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === deleteTarget.user_id}
                onClick={handleConfirmDelete}
                className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
              >
                {busyId === deleteTarget.user_id ? 'Removing...' : 'Confirm Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
