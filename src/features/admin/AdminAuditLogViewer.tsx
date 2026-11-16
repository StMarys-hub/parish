import { useEffect, useMemo, useState } from 'react';
import { Lock, RefreshCw } from 'lucide-react';
import { fetchAuditLogs } from '../../services/parishRepository';
import { AuditAction, AuditLogEntry } from '../../types/parish';

const ACTION_BADGE_COLORS: Record<AuditAction, string> = {
  CREATE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  UPDATE: 'bg-slate-100 text-slate-700 border-slate-200',
  DELETE: 'bg-rose-50 text-rose-800 border-rose-200',
  PUBLISH: 'bg-parish-navy/10 text-parish-navy border-parish-navy/20',
  PUSH_DISPATCH: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  USER_INVITE: 'bg-sky-50 text-sky-800 border-sky-200',
  ROLE_CHANGE: 'bg-purple-50 text-purple-800 border-purple-200',
  USER_DEACTIVATE: 'bg-amber-50 text-amber-900 border-amber-200',
  USER_DELETE: 'bg-rose-50 text-rose-800 border-rose-200',
  PASSWORD_RESET: 'bg-orange-50 text-orange-900 border-orange-200',
  THEME_CHANGE: 'bg-parish-gold-soft text-parish-gold-ink border-parish-gold/30',
  REIMBURSEMENT_APPROVED: 'bg-blue-50 text-blue-800 border-blue-200',
  REIMBURSEMENT_PAID: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  REIMBURSEMENT_DECLINED: 'bg-rose-50 text-rose-800 border-rose-200',
};

const GOVERNANCE_ACTIONS = new Set<AuditAction>([
  'USER_INVITE',
  'ROLE_CHANGE',
  'USER_DEACTIVATE',
  'USER_DELETE',
  'PASSWORD_RESET',
  'THEME_CHANGE',
  'REIMBURSEMENT_APPROVED',
  'REIMBURSEMENT_PAID',
  'REIMBURSEMENT_DECLINED',
]);

export function AdminAuditLogViewer({ isSandbox }: { isSandbox: boolean }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'governance'>('all');

  const load = async () => {
    if (isSandbox) return;
    setLoading(true);
    try {
      setLogs(await fetchAuditLogs(80));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [isSandbox]);

  const filteredLogs = useMemo(() => {
    if (filter === 'all') return logs;
    return logs.filter((entry) => GOVERNANCE_ACTIONS.has(entry.action));
  }, [logs, filter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-parish-navy" />
          <div>
            <h3 className="text-sm font-bold text-parish-ink">Immutable Backend Audit Trail</h3>
            <p className="text-xs text-parish-muted">
              Enforced by PostgreSQL triggers. Tracks content edits, user/role governance,
              password resets, and theme switches.
            </p>
          </div>
        </div>
        {!isSandbox && (
          <div className="flex items-center gap-2">
            <select
              aria-label="Filter audit logs"
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'all' | 'governance')}
              className="rounded-lg border border-parish-border bg-white px-2.5 py-1.5 text-xs font-medium"
            >
              <option value="all">All Activity ({logs.length})</option>
              <option value="governance">Users, Roles, Reset & Theme Only</option>
            </select>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-lg border border-parish-border bg-white px-3 py-1.5 text-xs font-semibold text-parish-navy"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        )}
      </div>

      {isSandbox ? (
        <div className="rounded-2xl border border-parish-border bg-white p-6 text-center text-xs text-parish-muted">
          Connect Supabase in <code>.env</code> to view live PostgreSQL audit log records.
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="rounded-2xl border border-parish-border bg-white p-6 text-center text-xs text-parish-muted">
          No matching audit entries recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-parish-border bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-parish-border bg-parish-canvas text-parish-muted">
              <tr>
                <th className="px-3.5 py-2.5 font-semibold">Timestamp</th>
                <th className="px-3.5 py-2.5 font-semibold">Actor</th>
                <th className="px-3.5 py-2.5 font-semibold">Action</th>
                <th className="px-3.5 py-2.5 font-semibold">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-parish-border">
              {filteredLogs.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-parish-muted">
                    {new Date(entry.created_at).toLocaleString()}
                  </td>
                  <td className="px-3.5 py-2.5 font-medium text-parish-ink">
                    {entry.actor_email}
                    {entry.actor_role && (
                      <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-parish-muted">
                        {entry.actor_role}
                      </span>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                        ACTION_BADGE_COLORS[entry.action] ??
                        'border-parish-border bg-slate-100 text-slate-800'
                      }`}
                    >
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-parish-ink">{entry.change_summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
