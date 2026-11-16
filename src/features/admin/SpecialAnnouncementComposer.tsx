import { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Megaphone,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { parseSpecialAnnouncementText } from '../../lib/specialAnnouncementParser';
import {
  deleteSpecialAnnouncement,
  fetchAllSpecialAnnouncementsForAdmin,
  setSpecialAnnouncementStatus,
  uploadSpecialFlyer,
  upsertSpecialAnnouncement,
} from '../../services/phase3Repository';
import { SpecialAnnouncement } from '../../types/parish';

interface SpecialAnnouncementComposerProps {
  isSandbox: boolean;
  onChanged: () => void;
}

export function SpecialAnnouncementComposer({
  isSandbox,
  onChanged,
}: SpecialAnnouncementComposerProps) {
  const [rawPaste, setRawPaste] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDateLabel, setEventDateLabel] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [webUrl, setWebUrl] = useState('');
  const [webLinkLabel, setWebLinkLabel] = useState('');
  const [flyerUrl, setFlyerUrl] = useState('');
  const [flyerPath, setFlyerPath] = useState('');
  const [flyerMime, setFlyerMime] = useState('');
  const [isPinned, setIsPinned] = useState(true);

  const [existing, setExisting] = useState<SpecialAnnouncement[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingFlyer, setUploadingFlyer] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadExisting = useCallback(async () => {
    if (isSandbox) return;
    try {
      const list = await fetchAllSpecialAnnouncementsForAdmin();
      setExisting(list);
    } catch {
      // Handled gracefully
    }
  }, [isSandbox]);

  useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  const handleFormatPreview = () => {
    const parsed = parseSpecialAnnouncementText(rawPaste);
    setTitle(parsed.title);
    setDescription(parsed.description);
    setEventDateLabel(parsed.eventDateLabel);
    setLocationLabel(parsed.locationLabel);
    setMapsUrl(parsed.mapsUrl);
    setWebUrl(parsed.webUrl);
    setWebLinkLabel(parsed.webLinkLabel);
    setStatusMsg({
      type: 'ok',
      text: 'Formatted pasted text into structured fields below. Review and click Publish when ready.',
    });
  };

  const handleFlyerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isSandbox) {
      setStatusMsg({ type: 'err', text: 'Connect Supabase to upload flyer files.' });
      return;
    }
    setUploadingFlyer(true);
    setStatusMsg(null);
    try {
      const res = await uploadSpecialFlyer(file);
      setFlyerUrl(res.publicUrl);
      setFlyerPath(res.storagePath);
      setFlyerMime(res.mimeType);
      setStatusMsg({ type: 'ok', text: `Flyer "${file.name}" attached cleanly.` });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Flyer upload failed.',
      });
    } finally {
      setUploadingFlyer(false);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setStatusMsg({ type: 'err', text: 'Title and Description are required.' });
      return;
    }
    if (isSandbox) {
      setStatusMsg({ type: 'err', text: 'Connect Supabase to publish live Special Notices.' });
      return;
    }

    setSaving(true);
    setStatusMsg(null);
    try {
      await upsertSpecialAnnouncement({
        title,
        description,
        event_date_label: eventDateLabel || null,
        location_label: locationLabel || null,
        maps_url: mapsUrl || null,
        web_url: webUrl || null,
        web_link_label: webLinkLabel || null,
        flyer_url: flyerUrl || null,
        flyer_storage_path: flyerPath || null,
        flyer_mime_type: flyerMime || null,
        is_pinned: isPinned,
        status: 'published',
      });

      setRawPaste('');
      setTitle('');
      setDescription('');
      setEventDateLabel('');
      setLocationLabel('');
      setMapsUrl('');
      setWebUrl('');
      setWebLinkLabel('');
      setFlyerUrl('');
      setFlyerPath('');
      setFlyerMime('');

      setStatusMsg({
        type: 'ok',
        text: 'Special Vicar Announcement published cleanly (separate from Weekly Bulletin).',
      });
      await loadExisting();
      onChanged();
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Publish failed.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (item: SpecialAnnouncement) => {
    const nextStatus = item.status === 'published' ? 'archived' : 'published';
    await setSpecialAnnouncementStatus(item.id, nextStatus);
    await loadExisting();
    onChanged();
  };

  const handleDelete = async (item: SpecialAnnouncement) => {
    if (!window.confirm(`Delete special notice "${item.title}"?`)) return;
    await deleteSpecialAnnouncement(item.id);
    await loadExisting();
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-parish-border bg-white p-5 shadow-2xs">
        <div className="flex items-center gap-2.5 border-b border-parish-border pb-3">
          <div className="rounded-xl bg-parish-navy/10 p-2 text-parish-navy">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-parish-ink">
              Standalone Vicar / Special Announcement Composer
            </h3>
            <p className="text-xs text-parish-muted">
              Publish urgent or mid-week notices in their own highlighted section above the Weekly
              Bulletin without altering the weekly archive.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2 rounded-xl border border-parish-gold/35 bg-parish-gold-soft/55 p-3.5">
          <label className="block text-xs font-bold text-parish-navy">
            Paste Raw Plain Text (WhatsApp / Email) → Format &amp; Preview
          </label>
          <textarea
            rows={4}
            value={rawPaste}
            onChange={(e) => setRawPaste(e.target.value)}
            placeholder={`*Special Vicar Notice: Feast Choir Practice*\nDate: Thu, Nov 20 at 6:30 PM\nVenue: Main Church https://maps.app.goo.gl/...\nAll choir members are requested to attend. Register: https://forms.gle/...`}
            className="w-full rounded-xl border border-parish-border bg-white px-3 py-2 text-xs"
          />
          <button
            type="button"
            disabled={!rawPaste.trim()}
            onClick={handleFormatPreview}
            className="inline-flex items-center gap-1.5 rounded-xl bg-parish-navy px-3.5 py-2 text-xs font-semibold text-white hover:bg-parish-navy-dark disabled:opacity-40"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Format &amp; Preview
          </button>
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

        <form onSubmit={handlePublish} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-parish-muted">
              Title / Subject *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Notice title..."
              className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-parish-muted">
              Description *
            </label>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Clean structured notice details..."
              className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-parish-muted">
                Event Date &amp; Time (Optional)
              </label>
              <input
                type="text"
                value={eventDateLabel}
                onChange={(e) => setEventDateLabel(e.target.value)}
                placeholder="e.g., Sat, Nov 22 at 9:30 AM"
                className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-parish-muted">
                Location Label (Optional)
              </label>
              <input
                type="text"
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
                placeholder="e.g., St. Mary's Parish Hall"
                className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-parish-muted">
                Google Maps Link (Optional)
              </label>
              <input
                type="url"
                value={mapsUrl}
                onChange={(e) => setMapsUrl(e.target.value)}
                placeholder="https://maps.google.com/..."
                className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-parish-muted">
                Web Reference Link (Optional)
              </label>
              <input
                type="url"
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-parish-muted">
                Button Label (Optional)
              </label>
              <input
                type="text"
                value={webLinkLabel}
                onChange={(e) => setWebLinkLabel(e.target.value)}
                placeholder="Learn More / Register"
                className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-parish-border bg-parish-canvas px-3 py-2 text-xs font-semibold text-parish-navy hover:bg-slate-100">
              <Upload className="h-3.5 w-3.5" />
              {uploadingFlyer
                ? 'Uploading Flyer...'
                : flyerUrl
                  ? 'Flyer Attached (Replace)'
                  : 'Attach Flyer Image / PDF'}
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFlyerUpload}
                className="sr-only"
              />
            </label>

            <label className="inline-flex items-center gap-2 text-xs font-semibold text-parish-ink">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                className="h-4 w-4 rounded accent-parish-navy"
              />
              Pin at top above Weekly Bulletin
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-parish-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-parish-navy-dark disabled:opacity-50"
          >
            {saving ? 'Publishing...' : 'Publish Special Announcement'}
          </button>
        </form>
      </div>

      {existing.length > 0 && (
        <div className="space-y-2.5 rounded-2xl border border-parish-border bg-white p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-parish-muted">
            Posted Special Announcements ({existing.length})
          </h4>
          {existing.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-parish-border p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      item.status === 'published'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.status}
                  </span>
                  <p className="truncate text-sm font-bold text-parish-ink">{item.title}</p>
                </div>
                {item.event_date_label && (
                  <p className="text-xs text-parish-muted">{item.event_date_label}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleToggleStatus(item)}
                  className="inline-flex items-center gap-1 rounded-lg border border-parish-border px-2.5 py-1 text-xs font-semibold text-parish-navy hover:bg-parish-canvas"
                >
                  {item.status === 'published' ? (
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
                  onClick={() => handleDelete(item)}
                  className="rounded-lg border border-rose-200 p-1.5 text-rose-700 hover:bg-rose-50"
                  aria-label="Delete special notice"
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
