import { useCallback, useEffect, useState } from 'react';
import { Archive, CheckCircle2, RotateCcw, Trash2, Users } from 'lucide-react';
import {
  deleteMinistryUpdate,
  fetchAllMinistryUpdatesForAdmin,
  setMinistryUpdateStatus,
  upsertMinistryUpdate,
} from '../../services/phase3Repository';
import { MinistryUpdate, PARISH_MINISTRIES } from '../../types/parish';

interface AdminMinistryUpdatesManagerProps {
  isSandbox: boolean;
  onChanged: () => void;
}

export function AdminMinistryUpdatesManager({
  isSandbox,
  onChanged,
}: AdminMinistryUpdatesManagerProps) {
  const [ministryName, setMinistryName] = useState<string>(PARISH_MINISTRIES[0]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [weekLabel, setWeekLabel] = useState('');
  const [eventDateLabel, setEventDateLabel] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [actionUrl, setActionUrl] = useState('');
  const [actionLabel, setActionLabel] = useState('');

  const [updates, setUpdates] = useState<MinistryUpdate[]>([]);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadList = useCallback(async () => {
    if (isSandbox) return;
    try {
      const list = await fetchAllMinistryUpdatesForAdmin();
      setUpdates(list);
    } catch {
      // Non-fatal
    }
  }, [isSandbox]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    if (isSandbox) {
      setStatusMsg({ type: 'err', text: 'Connect Supabase to publish Ministry Updates.' });
      return;
    }
    setSaving(true);
    setStatusMsg(null);
    try {
      await upsertMinistryUpdate({
        ministry_name: ministryName,
        title,
        body,
        week_label: weekLabel || null,
        event_date_label: eventDateLabel || null,
        location_label: locationLabel || null,
        action_url: actionUrl || null,
        action_label: actionLabel || null,
        status: 'published',
      });
      setTitle('');
      setBody('');
      setEventDateLabel('');
      setLocationLabel('');
      setActionUrl('');
      setActionLabel('');
      setStatusMsg({
        type: 'ok',
        text: `Published update under "${ministryName}" — visible under the Ministry pill.`,
      });
      await loadList();
      onChanged();
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to save ministry update.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (item: MinistryUpdate) => {
    await setMinistryUpdateStatus(
      item.id,
      item.status === 'published' ? 'archived' : 'published'
    );
    await loadList();
    onChanged();
  };

  const handleDelete = async (item: MinistryUpdate) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    await deleteMinistryUpdate(item.id);
    await loadList();
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-parish-border bg-white p-5 shadow-2xs">
        <div className="flex items-center gap-2.5 border-b border-parish-border pb-3">
          <div className="rounded-xl bg-parish-navy/10 p-2 text-parish-navy">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-parish-ink">Ministry Weekly Updates</h3>
            <p className="text-xs text-parish-muted">
              Tagged updates appear cleanly under the <strong>Ministry</strong> pill in Weekly
              Announcements, grouped by ministry.
            </p>
          </div>
        </div>

        {statusMsg && (
          <div
            className={`mt-3 flex items-center gap-2 rounded-xl border p-3 text-xs font-medium ${
              statusMsg.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{statusMsg.text}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-parish-muted">Ministry *</label>
              <select
                value={ministryName}
                onChange={(e) => setMinistryName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-parish-border bg-white px-3 py-2 text-sm"
              >
                {PARISH_MINISTRIES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-parish-muted">
                Week Label (Optional)
              </label>
              <input
                type="text"
                value={weekLabel}
                onChange={(e) => setWeekLabel(e.target.value)}
                placeholder="e.g., Week of Nov 17"
                className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-parish-muted">Update Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., CML Monthly Mission Meeting & Bake Sale"
              className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-parish-muted">Details *</label>
            <textarea
              required
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Meeting schedule, volunteers needed, or notes..."
              className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="text"
              value={eventDateLabel}
              onChange={(e) => setEventDateLabel(e.target.value)}
              placeholder="Date & Time (optional)"
              className="rounded-xl border border-parish-border px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              placeholder="Location (optional)"
              className="rounded-xl border border-parish-border px-3 py-2 text-xs"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="url"
              value={actionUrl}
              onChange={(e) => setActionUrl(e.target.value)}
              placeholder="Optional Link (https://...)"
              className="rounded-xl border border-parish-border px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={actionLabel}
              onChange={(e) => setActionLabel(e.target.value)}
              placeholder="Link Button Text (e.g., Sign Up)"
              className="rounded-xl border border-parish-border px-3 py-2 text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-parish-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-parish-navy-dark disabled:opacity-50"
          >
            {saving ? 'Publishing...' : 'Publish Ministry Update'}
          </button>
        </form>
      </div>

      {updates.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-parish-border bg-white p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-parish-muted">
            Ministry Updates ({updates.length})
          </h4>
          {updates.map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-parish-border p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-parish-navy px-2 py-0.5 text-[10px] font-bold text-white">
                    {u.ministry_name}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      u.status === 'published'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {u.status}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm font-bold text-parish-ink">{u.title}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleToggle(u)}
                  className="inline-flex items-center gap-1 rounded-lg border border-parish-border px-2.5 py-1 text-xs font-semibold text-parish-navy"
                >
                  {u.status === 'published' ? (
                    <>
                      <Archive className="h-3.5 w-3.5" />
                      Archive
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Republish
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(u)}
                  className="rounded-lg border border-rose-200 p-1.5 text-rose-700 hover:bg-rose-50"
                  aria-label="Delete ministry update"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
