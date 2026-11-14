import { useEffect, useState } from 'react';
import { Lock, RefreshCw } from 'lucide-react';
import { fetchAuditLogs } from '../../services/parishRepository';
import { AuditLogEntry } from '../../types/parish';

export function AdminAuditLogViewer({ isSandbox }: { isSandbox: boolean }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (isSandbox) return;
    setLoading(true);
    try {
      setLogs(await fetchAuditLogs(50));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [isSandbox]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-[#1E3A5F]" />
          <div>
            <h3 className="text-sm font-bold text-[#1E293B]">Immutable Backend Audit Trail</h3>
            <p className="text-xs text-[#526071]">
              Enforced by PostgreSQL triggers. Entries cannot be modified or deleted.
            </p>
          </div>
        </div>
        {!isSandbox && (
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-[#E7E2DA] bg-white px-3 py-1.5 text-xs font-semibold text-[#1E3A5F]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        )}
      </div>

      {isSandbox ? (
        <div className="rounded-2xl border border-[#E7E2DA] bg-white p-6 text-center text-xs text-[#526071]">
          Connect Supabase in <code>.env</code> to view live PostgreSQL audit log records.
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-2xl border border-[#E7E2DA] bg-white p-6 text-center text-xs text-[#526071]">
          No audit entries recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#E7E2DA] bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#E7E2DA] bg-[#FAF8F5] text-[#526071]">
              <tr>
                <th className="px-3.5 py-2.5 font-semibold">Timestamp</th>
                <th className="px-3.5 py-2.5 font-semibold">Actor</th>
                <th className="px-3.5 py-2.5 font-semibold">Action</th>
                <th className="px-3.5 py-2.5 font-semibold">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E2DA]">
              {logs.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-[#526071]">
                    {new Date(entry.created_at).toLocaleString()}
                  </td>
                  <td className="px-3.5 py-2.5 font-medium text-[#1E293B]">
                    {entry.actor_email}
                    {entry.actor_role && (
                      <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-[#526071]">
                        {entry.actor_role}
                      </span>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <span className="rounded-full bg-[#1E3A5F]/10 px-2 py-0.5 text-[10px] font-bold text-[#1E3A5F]">
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-[#1E293B]">{entry.change_summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
