import { useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { sanitizeActionUrl, sanitizePlainText } from '../../lib/sanitize';
import { updateParishInfo } from '../../services/parishRepository';
import { ParishInfo } from '../../types/parish';

interface AdminParishInfoEditorProps {
  initialInfo: ParishInfo;
  isSandbox: boolean;
  onUpdated: () => void;
}

export function AdminParishInfoEditor({
  initialInfo,
  isSandbox,
  onUpdated,
}: AdminParishInfoEditorProps) {
  const [info, setInfo] = useState<ParishInfo>(initialInfo);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSandbox) {
      setMsg('Sandbox Mode: Connect Supabase in .env to save parish info.');
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await updateParishInfo({
        ...info,
        parish_name: sanitizePlainText(info.parish_name),
        address_line: sanitizePlainText(info.address_line),
        maps_url: sanitizeActionUrl(info.maps_url) ?? info.maps_url,
        phone: sanitizePlainText(info.phone),
        email: sanitizePlainText(info.email),
        website_url: sanitizeActionUrl(info.website_url) ?? info.website_url,
        vicar_name: sanitizePlainText(info.vicar_name),
        office_hours: info.office_hours ? sanitizePlainText(info.office_hours) : null,
        general_notes: info.general_notes ? sanitizePlainText(info.general_notes) : null,
      });
      setMsg('Parish info updated (Audit log recorded).');
      onUpdated();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4 rounded-2xl border border-[#E7E2DA] bg-white p-4">
      <h3 className="text-sm font-bold text-[#1E293B]">Parish Information & Trustees</h3>

      {msg && (
        <div className="rounded-xl border border-[#E7E2DA] bg-[#FAF8F5] px-3.5 py-2 text-xs font-medium text-[#1E3A5F]">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-[#526071]">Vicar Name</label>
          <input
            type="text"
            value={info.vicar_name}
            onChange={(e) => setInfo({ ...info, vicar_name: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#526071]">Parish Phone</label>
          <input
            type="text"
            value={info.phone}
            onChange={(e) => setInfo({ ...info, phone: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#526071]">Email</label>
          <input
            type="email"
            value={info.email}
            onChange={(e) => setInfo({ ...info, email: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#526071]">Address</label>
          <input
            type="text"
            value={info.address_line}
            onChange={(e) => setInfo({ ...info, address_line: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-[#526071]">Office Hours</label>
          <input
            type="text"
            value={info.office_hours ?? ''}
            onChange={(e) => setInfo({ ...info, office_hours: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-2 border-t border-[#E7E2DA] pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[#1E293B]">Trustees</span>
          <button
            type="button"
            onClick={() =>
              setInfo({
                ...info,
                trustees: [...info.trustees, { name: '', role: 'Parish Trustee', phone: '', email: '' }],
              })
            }
            className="inline-flex items-center gap-1 rounded-lg border border-[#E7E2DA] px-2.5 py-1 text-xs font-semibold text-[#1E3A5F]"
          >
            <Plus className="h-3.5 w-3.5" /> Add Trustee
          </button>
        </div>
        {info.trustees.map((t, idx) => (
          <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <input
              type="text"
              value={t.name}
              placeholder="Name"
              onChange={(e) => {
                const next = [...info.trustees];
                next[idx] = { ...t, name: e.target.value };
                setInfo({ ...info, trustees: next });
              }}
              className="rounded-lg border border-[#E7E2DA] px-2.5 py-1.5 text-xs"
            />
            <input
              type="text"
              value={t.role}
              placeholder="Role"
              onChange={(e) => {
                const next = [...info.trustees];
                next[idx] = { ...t, role: e.target.value };
                setInfo({ ...info, trustees: next });
              }}
              className="rounded-lg border border-[#E7E2DA] px-2.5 py-1.5 text-xs"
            />
            <input
              type="text"
              value={t.phone ?? ''}
              placeholder="Phone"
              onChange={(e) => {
                const next = [...info.trustees];
                next[idx] = { ...t, phone: e.target.value };
                setInfo({ ...info, trustees: next });
              }}
              className="rounded-lg border border-[#E7E2DA] px-2.5 py-1.5 text-xs"
            />
            <div className="flex items-center gap-1">
              <input
                type="email"
                value={t.email ?? ''}
                placeholder="Email"
                onChange={(e) => {
                  const next = [...info.trustees];
                  next[idx] = { ...t, email: e.target.value };
                  setInfo({ ...info, trustees: next });
                }}
                className="min-w-0 flex-1 rounded-lg border border-[#E7E2DA] px-2.5 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() =>
                  setInfo({ ...info, trustees: info.trustees.filter((_, i) => i !== idx) })
                }
                aria-label="Remove trustee"
                className="p-1 text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-xl bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#152943] disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save Parish Info'}
      </button>
    </form>
  );
}
