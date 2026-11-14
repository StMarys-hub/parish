import { useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { sanitizePlainText } from '../../lib/sanitize';
import {
  deleteRegularScheduleItem,
  saveRegularScheduleItem,
} from '../../services/parishRepository';
import { RegularScheduleItem } from '../../types/parish';

interface AdminSchedulesEditorProps {
  items: RegularScheduleItem[];
  isSandbox: boolean;
  onUpdated: () => void;
}

export function AdminSchedulesEditor({ items, isSandbox, onUpdated }: AdminSchedulesEditorProps) {
  const [rows, setRows] = useState<RegularScheduleItem[]>(items);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const handleAdd = () => {
    setRows((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        sort_order: prev.length + 1,
        group_name: 'Weekday Services',
        day_label: 'Fridays',
        time_label: '7:00 PM',
        title: 'Holy Qurbana',
        location: 'Main Church',
        notes: '',
        is_active: true,
      },
    ]);
  };

  const handleSave = async (row: RegularScheduleItem) => {
    if (isSandbox) {
      setMsg('Sandbox Mode: Connect Supabase in .env to save schedule changes.');
      return;
    }
    setSavingId(row.id);
    setMsg(null);
    try {
      const isNew = row.id.startsWith('new-');
      await saveRegularScheduleItem({
        ...(isNew ? {} : { id: row.id }),
        sort_order: row.sort_order,
        group_name: sanitizePlainText(row.group_name),
        day_label: sanitizePlainText(row.day_label),
        time_label: sanitizePlainText(row.time_label),
        title: sanitizePlainText(row.title),
        location: row.location ? sanitizePlainText(row.location) : null,
        notes: row.notes ? sanitizePlainText(row.notes) : null,
        is_active: row.is_active,
      });
      setMsg('Schedule saved (Audit log recorded).');
      onUpdated();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (id.startsWith('new-')) {
      setRows((prev) => prev.filter((r) => r.id !== id));
      return;
    }
    if (isSandbox) return;
    setSavingId(id);
    try {
      await deleteRegularScheduleItem(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      setMsg('Schedule entry deleted (Audit log recorded).');
      onUpdated();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#1E293B]">Regular Weekly Schedules</h3>
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex items-center gap-1 rounded-xl bg-[#1E3A5F] px-3 py-1.5 text-xs font-semibold text-white"
        >
          <Plus className="h-3.5 w-3.5" /> Add Timing
        </button>
      </div>

      {msg && (
        <div className="rounded-xl border border-[#E7E2DA] bg-white px-3.5 py-2 text-xs font-medium text-[#1E3A5F]">
          {msg}
        </div>
      )}

      <div className="space-y-3">
        {rows.map((row, idx) => (
          <div key={row.id} className="space-y-2.5 rounded-2xl border border-[#E7E2DA] bg-white p-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                type="text"
                value={row.group_name}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, i) => (i === idx ? { ...r, group_name: e.target.value } : r))
                  )
                }
                placeholder="Group (e.g. Sunday Holy Qurbana)"
                className="rounded-lg border border-[#E7E2DA] px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                value={row.day_label}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, i) => (i === idx ? { ...r, day_label: e.target.value } : r))
                  )
                }
                placeholder="Day (e.g. Sundays)"
                className="rounded-lg border border-[#E7E2DA] px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                value={row.time_label}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, i) => (i === idx ? { ...r, time_label: e.target.value } : r))
                  )
                }
                placeholder="Time (e.g. 8:00 AM)"
                className="rounded-lg border border-[#E7E2DA] px-2.5 py-1.5 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="text"
                value={row.title}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, i) => (i === idx ? { ...r, title: e.target.value } : r))
                  )
                }
                placeholder="Service Title"
                className="rounded-lg border border-[#E7E2DA] px-2.5 py-1.5 text-sm font-semibold"
              />
              <input
                type="text"
                value={row.location ?? ''}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, i) => (i === idx ? { ...r, location: e.target.value } : r))
                  )
                }
                placeholder="Location"
                className="rounded-lg border border-[#E7E2DA] px-2.5 py-1.5 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => handleDelete(row.id)}
                disabled={savingId === row.id}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
              <button
                type="button"
                onClick={() => handleSave(row)}
                disabled={savingId === row.id}
                className="inline-flex items-center gap-1 rounded-lg bg-[#1E3A5F] px-3 py-1 text-xs font-semibold text-white hover:bg-[#152943]"
              >
                <Save className="h-3.5 w-3.5" />
                {savingId === row.id ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
