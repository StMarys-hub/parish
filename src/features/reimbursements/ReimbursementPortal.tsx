import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Fingerprint,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { HelpIconButton, RoleHelpModal } from '../../components/RoleHelpGuide';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import {
  fetchReimbursementAccessStatus,
  fetchTrackedReimbursements,
} from '../../services/phase3Repository';
import {
  ReimbursementAccessStatus,
  ReimbursementClaim,
  ReimbursementStatus,
} from '../../types/parish';
import { ReimbursementForm } from './ReimbursementForm';

interface ReimbursementPortalProps {
  onBackToParish: () => void;
}

const STATUS_BADGE: Record<ReimbursementStatus, { label: string; className: string }> = {
  pending_review: {
    label: 'Pending Review',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  approved: {
    label: 'Approved',
    className: 'border-blue-200 bg-blue-50 text-blue-800',
  },
  paid: {
    label: 'Paid',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  declined: {
    label: 'Needs Info / Rejected',
    className: 'border-rose-200 bg-rose-50 text-rose-800',
  },
};

export function ReimbursementPortal({ onBackToParish }: ReimbursementPortalProps) {
  const [checkingAuth, setCheckingAuth] = useState(isSupabaseConfigured);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<ReimbursementAccessStatus | null>(null);

  // Device login form state
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [registeringPasskey, setRegisteringPasskey] = useState(false);

  // Authenticated portal tabs
  const [subTab, setSubTab] = useState<'submit' | 'tracker'>('submit');
  const [claims, setClaims] = useState<ReimbursementClaim[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const currentUserIdRef = useRef<string | null>(null);

  const loadPortalData = useCallback(async (isInitialBoot = false) => {
    if (!supabase || !isSupabaseConfigured) {
      setCheckingAuth(false);
      return;
    }
    if (isInitialBoot) {
      setCheckingAuth(true);
    }
    setAuthError(null);
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id ?? null;
      const userEmail = data.user?.email ?? null;
      currentUserIdRef.current = userId;
      setSignedInEmail(userEmail);

      if (userEmail) {
        const [statusRes, claimsRes] = await Promise.all([
          fetchReimbursementAccessStatus(),
          fetchTrackedReimbursements(),
        ]);
        setAccessStatus(statusRes);
        setClaims(claimsRes);
      } else {
        setAccessStatus(null);
        setClaims([]);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to verify device session.');
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    loadPortalData(true);
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUid = session?.user?.id ?? null;
      // Do NOT re-trigger full checkingAuth or reload when OS file picker triggers tab focus TOKEN_REFRESHED
      if (event === 'TOKEN_REFRESHED' || (nextUid && nextUid === currentUserIdRef.current)) {
        return;
      }
      if (event === 'SIGNED_OUT') {
        currentUserIdRef.current = null;
        setSignedInEmail(null);
        setAccessStatus(null);
        setClaims([]);
        setCheckingAuth(false);
        return;
      }
      loadPortalData(false);
    });
    return () => subscription.unsubscribe();
  }, [loadPortalData]);

  const refreshClaims = async () => {
    setLoadingClaims(true);
    try {
      const [statusRes, list] = await Promise.all([
        fetchReimbursementAccessStatus(),
        fetchTrackedReimbursements(),
      ]);
      setAccessStatus(statusRes);
      setClaims(list);
    } catch {
      // Non-fatal
    } finally {
      setLoadingClaims(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || password.length < 6) {
      setAuthError('Enter a valid email and password (minimum 6 characters).');
      return;
    }
    setSigningIn(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/?auth=reimbursements`,
          },
        });
        if (error) throw error;
        if (data.session) {
          await loadPortalData();
        } else {
          setAuthInfo(
            `Confirmation link sent to ${cleanEmail}. Open it on this device, then sign in.`
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;
        await loadPortalData();
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSendDeviceEmailLink = async () => {
    if (!supabase) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setAuthError('Enter your email address first to receive a one-tap device link.');
      return;
    }
    setSigningIn(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/?auth=reimbursements`,
        },
      });
      if (error) throw error;
      setAuthInfo(`Device login link sent to ${cleanEmail}. Open it on this device to continue.`);
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
        throw new Error('Passkeys are not supported on this browser.');
      }
      const { error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
      await loadPortalData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Device Passkey login failed.';
      setAuthError(
        msg.toLowerCase().includes('disabled') || msg.includes('404')
          ? 'Device Passkeys are not enabled on Supabase Auth yet. Sign in with Email & Password or Email Device Link below.'
          : msg
      );
    } finally {
      setSigningIn(false);
    }
  };

  const handleRegisterPasskey = async () => {
    if (!supabase) return;
    setRegisteringPasskey(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      if (typeof window === 'undefined' || !window.PublicKeyCredential) {
        throw new Error('This device does not support biometric/passkey credentials.');
      }
      const { data, error } = await supabase.auth.registerPasskey();
      if (error) throw error;
      if (data?.id && supabase.auth.passkey?.update) {
        await supabase.auth.passkey.update({
          passkeyId: data.id,
          friendlyName: `${signedInEmail ?? 'Parish Member'} (${navigator.platform || 'Device'})`.slice(0, 120),
        });
      }
      setAuthInfo('Device Passkey saved! Next time, tap "Device Passkey" for 1-tap login.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Passkey registration failed.';
      setAuthError(
        msg.toLowerCase().includes('disabled') || msg.includes('404')
          ? 'Enable Passkeys under Supabase Auth → Providers → Passkeys first. Your device stays signed in via session cookie.'
          : msg
      );
    } finally {
      setRegisteringPasskey(false);
    }
  };

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setSignedInEmail(null);
    setAccessStatus(null);
    setClaims([]);
  };

  const passkeySupported =
    typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToParish}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-parish-navy hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Parish Info
          </button>
          <HelpIconButton
            label="Reimbursement submission & tracking help"
            onClick={() => setHelpOpen(true)}
          />
        </div>

        {signedInEmail && (
          <div className="flex gap-1.5 rounded-xl border border-parish-border bg-white p-1">
            <button
              type="button"
              onClick={() => setSubTab('submit')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                subTab === 'submit'
                  ? 'bg-parish-navy text-white'
                  : 'text-parish-muted hover:text-parish-ink'
              }`}
            >
              Submit Receipt
            </button>
            <button
              type="button"
              onClick={() => {
                setSubTab('tracker');
                refreshClaims();
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                subTab === 'tracker'
                  ? 'bg-parish-navy text-white'
                  : 'text-parish-muted hover:text-parish-ink'
              }`}
            >
              My Submissions ({claims.length})
            </button>
          </div>
        )}
      </div>

      {checkingAuth && (
        <div className="rounded-2xl border border-parish-border bg-white p-8 text-center text-xs text-parish-muted">
          Verifying device login...
        </div>
      )}

      {/* Unauthenticated Gate — Device Login Required to Prevent Anonymous Upload Spam */}
      {!checkingAuth && !signedInEmail && (
        <div className="mx-auto max-w-md rounded-2xl border border-parish-border bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2.5 text-parish-navy">
            <ShieldCheck className="h-6 w-6" />
            <div>
              <h2 className="text-base font-bold">Device Login Required</h2>
              <p className="text-xs text-parish-muted">
                Sign in on this device to submit bills or track your private receipts.
              </p>
            </div>
          </div>

          {!isSupabaseConfigured ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
              Connect Supabase in <code>.env</code> to enable verified device login &amp; receipt
              uploads.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
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

              <div className="grid grid-cols-2 gap-1 rounded-xl border border-parish-border bg-parish-canvas p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    setAuthError(null);
                  }}
                  className={`rounded-lg py-1.5 ${
                    authMode === 'signin' ? 'bg-parish-navy text-white' : 'text-parish-muted'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signup');
                    setAuthError(null);
                  }}
                  className={`rounded-lg py-1.5 ${
                    authMode === 'signup' ? 'bg-parish-navy text-white' : 'text-parish-muted'
                  }`}
                >
                  First Time? Register
                </button>
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-parish-muted">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-parish-muted">Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={authMode === 'signup' ? 'Choose a password (min 6 chars)' : 'Password'}
                    className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={signingIn}
                  className="w-full rounded-xl bg-parish-navy px-4 py-2.5 text-xs font-semibold text-white hover:bg-parish-navy-dark disabled:opacity-50"
                >
                  {signingIn
                    ? 'Please wait...'
                    : authMode === 'signup'
                      ? 'Create Account on This Device'
                      : 'Sign In on This Device'}
                </button>
              </form>

              <div className="space-y-2 border-t border-parish-border pt-3">
                <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-parish-muted">
                  Passwordless Device Options
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
            </div>
          )}
        </div>
      )}

      {/* Signed-In Reimbursement Experience */}
      {!checkingAuth && signedInEmail && accessStatus && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-parish-border bg-white px-4 py-3 text-xs">
            <div>
              <span className="text-parish-muted">Signed in on this device as </span>
              <strong className="text-parish-ink">{signedInEmail}</strong>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {passkeySupported && (
                <button
                  type="button"
                  disabled={registeringPasskey}
                  onClick={handleRegisterPasskey}
                  className="inline-flex items-center gap-1 rounded-lg border border-parish-border bg-parish-canvas px-2.5 py-1 text-[11px] font-semibold text-parish-navy hover:bg-slate-100 disabled:opacity-50"
                >
                  <Fingerprint className="h-3.5 w-3.5" />
                  {registeringPasskey ? 'Saving...' : 'Enable Face/Touch ID'}
                </button>
              )}
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1 rounded-lg border border-parish-border px-2.5 py-1 text-[11px] font-semibold text-parish-muted hover:bg-parish-canvas"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          </div>

          {authError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
              {authError}
            </div>
          )}
          {authInfo && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              {authInfo}
            </div>
          )}

          {subTab === 'submit' && (
            <ReimbursementForm
              accessStatus={accessStatus}
              onAccessVerified={refreshClaims}
              onSubmitted={(newClaim) => {
                setClaims((prev) => [newClaim, ...prev.filter((c) => c.id !== newClaim.id)]);
              }}
            />
          )}

          {subTab === 'tracker' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl border border-parish-border bg-white px-4 py-3 text-xs">
                <span className="font-bold uppercase tracking-wider text-parish-muted">
                  Your Submitted Reimbursements
                </span>
                <button
                  type="button"
                  onClick={refreshClaims}
                  disabled={loadingClaims}
                  className="inline-flex items-center gap-1 font-semibold text-parish-navy hover:underline disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingClaims ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {claims.length === 0 ? (
                <div className="rounded-2xl border border-parish-border bg-white p-8 text-center text-xs text-parish-muted">
                  No reimbursement submissions found for {signedInEmail} yet.
                </div>
              ) : (
                claims.map((claim) => {
                  const badge = STATUS_BADGE[claim.status];
                  const amountDisplay = `$${(claim.amount_cents / 100).toFixed(2)}`;
                  return (
                    <article
                      key={claim.id}
                      className="rounded-2xl border border-parish-border bg-white p-4 shadow-2xs"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-xs font-bold text-parish-navy">
                            {claim.reference_code}
                          </span>
                          <h4 className="text-sm font-bold text-parish-ink">
                            {claim.ministry} • {amountDisplay}
                          </h4>
                          <p className="text-xs text-parish-muted">
                            Expense Date: {claim.expense_date} • Payout: {claim.payout_method}
                          </p>
                        </div>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      <p className="mt-2 text-xs leading-relaxed text-parish-ink">
                        {claim.description}
                      </p>

                      {claim.trustee_notes && (
                        <div className="mt-2 rounded-xl border border-parish-border bg-parish-canvas p-2.5 text-xs text-parish-ink">
                          <span className="font-semibold">Trustee Note:</span> {claim.trustee_notes}
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-parish-muted">
                        <span>
                          Submitted {new Date(claim.created_at).toLocaleDateString()}
                          {claim.reviewed_by_name ? ` • Reviewed by ${claim.reviewed_by_name}` : ''}
                        </span>
                        {claim.receipt_signed_url && (
                          <a
                            href={claim.receipt_signed_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-parish-navy underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View Receipt (5-min secure link)
                          </a>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          )}
        </>
      )}
      <RoleHelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        topicId="parishioner_reimbursements"
      />
    </div>
  );
}
