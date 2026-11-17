import { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  Eye,
  FileUp,
  HelpCircle,
  Megaphone,
  Pencil,
  Pin,
  PinOff,
  RotateCcw,
  Save,
  Trash2,
  Wand2,
} from 'lucide-react';
import { HelpGuideModal } from '../../components/HelpGuideModal';
import { SpecialNoticeBody } from '../../components/SpecialNoticeBody';
import { UnreadDotBadge } from '../../components/UnreadDotBadge';
import { parseVicarMessage } from '../../lib/vicarMessageParser';
import { sanitizeActionUrl, sanitizePlainText } from '../../lib/sanitize';
import {
  deleteSpecialAnnouncement,
  fetchAllSpecialAnnouncementsForAdmin,
  setSpecialAnnouncementStatus,
  uploadSpecialFlyer,
  upsertSpecialAnnouncement,
} from '../../services/phase3Repository';
import {
  SpecialAnnouncement,
  SpecialNoticeCategory,
  SpecialNoticeStructuredBlocks,
} from '../../types/parish';

interface SpecialAnnouncementComposerProps {
  isSandbox: boolean;
  onChanged: () => void;
}

const NOTICE_CATEGORIES: SpecialNoticeCategory[] = [
  'Vicar Note',
  'Sunday Liturgy',
  'Media & Highlights',
  'Youth & Events',
  'Urgent',
];

const SAMPLE_TEMPLATES = [
  {
    id: 'pastoral',
    label: 'Template A: Quick Pastoral / Mass Update',
    badge: 'Vicar Note',
    description: 'Strips greeting & sign-off clutter while preserving clean attribution.',
    text: `Dear Parish Family,
Praise be to Jesus Christ!

Lenten Confession & First Friday Devotion Update
Fr. Mathew will be available for individual Confessions every Friday from 5:30 PM to 6:45 PM prior to Way of the Cross and Holy Qurbana at the Main Church.

God bless you all!
- Rajeev Achan`,
  },
  {
    id: 'sunday',
    label: 'Template B: Sunday / Feast Day Schedule',
    badge: 'Sunday Liturgy',
    description: 'Formats timestamps into a clean liturgical timetable + Mission Maps chip.',
    text: `Sunday May 24 — Pentecost Sunday
Schedule:
8:00 AM - Holy Qurbana
9:30 AM - Catechism & Rosary
4:30 PM - Holy Qurbana at St. Sebastian Mission, Blythewood, SC
7:00 PM - Youth Adoration

Please arrive 15 minutes early for confessions.
- Fr. Rajeev`,
  },
  {
    id: 'media',
    label: 'Template C: Multi-Link Video / Resource List',
    badge: 'Media & Highlights',
    description: 'Groups Drive videos & shared photo albums into tappable media cards.',
    text: `Dear Parish Family,
Praise be to Jesus Christ.

Please find the highlights, recorded messages, or shared photo galleries below:

Youth Retreat Highlight Video:
https://drive.google.com/file/d/1exampleVideoLink/view

First Holy Communion Group Photos:
https://drive.google.com/drive/folders/1examplePhotosFolder

- Rajeev Achan`,
  },
] as const;

export function SpecialAnnouncementComposer({
  isSandbox,
  onChanged,
}: SpecialAnnouncementComposerProps) {
  const [rawPaste, setRawPaste] = useState('');
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [categoryBadge, setCategoryBadge] = useState<SpecialNoticeCategory>('Vicar Note');
  const [summaryPreview, setSummaryPreview] = useState('');
  const [signOff, setSignOff] = useState('Rajeev Achan');
  const [structuredBlocks, setStructuredBlocks] = useState<SpecialNoticeStructuredBlocks>({
    paragraphs: [],
    timeline: [],
    mediaLinks: [],
    externalLinks: [],
    locations: [],
  });
  const [description, setDescription] = useState('');
  const [eventDateLabel, setEventDateLabel] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [webUrl, setWebUrl] = useState('');
  const [webLinkLabel, setWebLinkLabel] = useState('');
  const [flyerUrl, setFlyerUrl] = useState('');
  const [flyerStoragePath, setFlyerStoragePath] = useState('');
  const [flyerMimeType, setFlyerMimeType] = useState('');
  const [flyerNote, setFlyerNote] = useState<string | null>(null);
  const [isPinned, setIsPinned] = useState(true);

  const [previewExpanded, setPreviewExpanded] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);

  const [existing, setExisting] = useState<SpecialAnnouncement[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadExisting = useCallback(async () => {
    setLoadingList(true);
    try {
      const list = await fetchAllSpecialAnnouncementsForAdmin();
      setExisting(list);
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to load Special Notices.',
      });
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  const applyParsedMessage = (inputText: string, notifyBanner = false) => {
    const parsed = parseVicarMessage(inputText);
    setTitle(parsed.title);
    setCategoryBadge(parsed.categoryBadge);
    setSummaryPreview(parsed.summaryPreview);
    setSignOff(parsed.signOff);
    setStructuredBlocks(parsed.structuredBlocks);
    setDescription(parsed.description);
    setEventDateLabel(parsed.eventDateLabel);
    setLocationLabel(parsed.locationLabel);
    setMapsUrl(parsed.mapsUrl);
    setWebUrl(parsed.webUrl);
    setWebLinkLabel(parsed.webLinkLabel);
    if (notifyBanner) {
      setStatusBanner({
        type: 'ok',
        text: `Auto-formatted as "${parsed.categoryBadge}" (${parsed.structuredBlocks.timeline?.length ?? 0} schedule rows, ${
          (parsed.structuredBlocks.mediaLinks?.length ?? 0) +
          (parsed.structuredBlocks.externalLinks?.length ?? 0)
        } links). Review the live preview below!`,
      });
    }
  };

  const handleRawPasteChange = (nextText: string) => {
    setRawPaste(nextText);
    if (!nextText.trim()) return;
    applyParsedMessage(nextText, false);
  };

  const handleInsertSample = (sampleText: string, sampleLabel: string) => {
    setRawPaste(sampleText);
    applyParsedMessage(sampleText, false);
    setHelpOpen(false);
    setStatusBanner({
      type: 'ok',
      text: `Loaded ${sampleLabel}. Edit any field or click Publish Special Notice when ready.`,
    });
  };

  const handleFlyerUpload = async (file: File) => {
    if (isSandbox) {
      setStatusBanner({ type: 'err', text: 'Sandbox mode: connect Supabase to upload flyers.' });
      return;
    }
    setUploading(true);
    setStatusBanner(null);
    setFlyerNote(null);
    try {
      const res = await uploadSpecialFlyer(file);
      setFlyerUrl(res.publicUrl);
      setFlyerStoragePath(res.storagePath);
      setFlyerMimeType(res.mimeType);
      setFlyerNote(res.compressionNote);
      setStatusBanner({ type: 'ok', text: 'Flyer uploaded & optimized cleanly.' });
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Flyer upload failed.',
      });
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setEditingId(undefined);
    setRawPaste('');
    setTitle('');
    setCategoryBadge('Vicar Note');
    setSummaryPreview('');
    setSignOff('Rajeev Achan');
    setStructuredBlocks({
      paragraphs: [],
      timeline: [],
      mediaLinks: [],
      externalLinks: [],
      locations: [],
    });
    setDescription('');
    setEventDateLabel('');
    setLocationLabel('');
    setMapsUrl('');
    setWebUrl('');
    setWebLinkLabel('');
    setFlyerUrl('');
    setFlyerStoragePath('');
    setFlyerMimeType('');
    setFlyerNote(null);
    setIsPinned(true);
  };

  const startEditing = (item: SpecialAnnouncement) => {
    setEditingId(item.id);
    setRawPaste(item.raw_message || item.description || '');
    setTitle(item.title);
    setCategoryBadge(item.category_badge ?? 'Vicar Note');
    setSummaryPreview(item.summary_preview || item.description.slice(0, 140));
    setSignOff(item.sign_off || 'Rajeev Achan');
    setStructuredBlocks(
      item.structured_blocks ?? {
        paragraphs: [item.description],
        timeline: [],
        mediaLinks: [],
        externalLinks: [],
        locations: [],
      }
    );
    setDescription(item.description);
    setEventDateLabel(item.event_date_label ?? '');
    setLocationLabel(item.location_label ?? '');
    setMapsUrl(item.maps_url ?? '');
    setWebUrl(item.web_url ?? '');
    setWebLinkLabel(item.web_link_label ?? '');
    setFlyerUrl(item.flyer_url ?? '');
    setFlyerStoragePath(item.flyer_storage_path ?? '');
    setFlyerMimeType(item.flyer_mime_type ?? '');
    setFlyerNote(null);
    setIsPinned(item.is_pinned);
    setStatusBanner(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSandbox) {
      setStatusBanner({ type: 'err', text: 'Sandbox mode: Supabase required to publish Special Notices.' });
      return;
    }
    if (!title.trim() || (!summaryPreview.trim() && !description.trim())) {
      setStatusBanner({ type: 'err', text: 'Title and message content are required.' });
      return;
    }
    setSaving(true);
    setStatusBanner(null);
    try {
      const safeMaps = mapsUrl.trim() ? sanitizeActionUrl(mapsUrl.trim()) : null;
      if (mapsUrl.trim() && !safeMaps) {
        throw new Error('Google Maps link must start with https://');
      }
      const safeWeb = webUrl.trim() ? sanitizeActionUrl(webUrl.trim()) : null;
      if (webUrl.trim() && !safeWeb) {
        throw new Error('Web / Registration link must start with https://');
      }

      const finalBlocks: SpecialNoticeStructuredBlocks = {
        ...structuredBlocks,
        eventDateLabel: eventDateLabel.trim() ? sanitizePlainText(eventDateLabel) : null,
        locationLabel: locationLabel.trim() ? sanitizePlainText(locationLabel) : null,
      };

      await upsertSpecialAnnouncement({
        id: editingId,
        title: title.trim(),
        category_badge: categoryBadge,
        summary_preview: summaryPreview.trim() || description.slice(0, 140),
        raw_message: rawPaste.trim() || description.trim(),
        structured_blocks: finalBlocks,
        sign_off: signOff.trim() || 'Rajeev Achan',
        description: description.trim() || summaryPreview.trim(),
        event_date_label: eventDateLabel.trim() || null,
        location_label: locationLabel.trim() || null,
        maps_url: safeMaps,
        web_url: safeWeb,
        web_link_label: webLinkLabel.trim() || null,
        flyer_url: flyerUrl || null,
        flyer_storage_path: flyerStoragePath || null,
        flyer_mime_type: flyerMimeType || null,
        is_pinned: isPinned,
        status: 'published',
      });
      setStatusBanner({
        type: 'ok',
        text: editingId
          ? 'Special Notice updated cleanly.'
          : 'Special Notice published to Parish Bulletin Board!',
      });
      resetForm();
      await loadExisting();
      onChanged();
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to save Special Notice.',
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

  const handleTogglePin = async (item: SpecialAnnouncement) => {
    await upsertSpecialAnnouncement({
      ...item,
      is_pinned: !item.is_pinned,
    });
    await loadExisting();
    onChanged();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this Special Notice permanently?')) return;
    await deleteSpecialAnnouncement(id);
    if (editingId === id) resetForm();
    await loadExisting();
    onChanged();
  };

  const previewNotice: SpecialAnnouncement = {
    id: editingId ?? 'preview',
    title: title || 'Notice Title Preview',
    category_badge: categoryBadge,
    summary_preview: summaryPreview || 'Collapsed summary line appears cleanly here without raw URLs.',
    raw_message: rawPaste,
    structured_blocks: structuredBlocks,
    sign_off: signOff || 'Rajeev Achan',
    description: description || rawPaste,
    event_date_label: eventDateLabel || null,
    location_label: locationLabel || null,
    maps_url: mapsUrl || null,
    web_url: webUrl || null,
    web_link_label: webLinkLabel || null,
    flyer_url: flyerUrl || null,
    flyer_mime_type: flyerMimeType || null,
    is_pinned: isPinned,
    status: 'published',
    published_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const hasContentForPreview = Boolean(rawPaste.trim() || title.trim() || summaryPreview.trim());

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#E7E2DA] bg-white p-5 shadow-xs">
        {/* Header with built-in ? Help button */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-[#1E293B]">
              <Megaphone className="h-4.5 w-4.5 text-[#D97706]" />
              {editingId ? 'Edit Special Notice' : 'Post Vicar / Special Notice'}
            </h2>
            <p className="mt-0.5 text-xs text-[#526071]">
              Paste any WhatsApp, Word, or Email message — timelines, Drive videos, Mission maps, and greetings auto-format instantaneously.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label="How to Format a Special Notice"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] bg-[#FAF8F5] px-3 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-100"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Help & Templates
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-[#E7E2DA] px-3 py-1.5 text-xs font-semibold text-[#526071] hover:bg-slate-50"
              >
                New Notice
              </button>
            )}
          </div>
        </div>

        {/* Large Smart Paste Box + Quick Sample Pills */}
        <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/45 p-3.5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#92400E]">
              Paste Raw Message (WhatsApp / Word / Email)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleInsertSample(tpl.text, tpl.label)}
                  className="rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-[#92400E] hover:bg-amber-50"
                >
                  {tpl.id === 'pastoral' ? 'Sample: Pastoral' : tpl.id === 'sunday' ? 'Sample: Sunday' : 'Sample: Media Links'}
                </button>
              ))}
            </div>
          </div>
          <textarea
            rows={5}
            value={rawPaste}
            onChange={(e) => handleRawPasteChange(e.target.value)}
            placeholder="Paste Fr. Rajeev's message directly here — schedules, Mission locations, Drive photo/video links, greetings & sign-offs are parsed automatically..."
            className="w-full rounded-lg border border-[#E7E2DA] bg-white p-3 text-xs leading-relaxed text-[#1E293B] focus:border-[#1E3A5F] focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-[#526071]">
              Auto-formats live as you paste — no external codes required.
            </span>
            <button
              type="button"
              onClick={() => applyParsedMessage(rawPaste, true)}
              disabled={!rawPaste.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A5F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#152943] disabled:opacity-50"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Re-Parse Structured Card
            </button>
          </div>
        </div>

        {/* Instant Interactive Live Preview (Collapsed + Expanded) */}
        {hasContentForPreview && (
          <div className="mt-4 rounded-xl border border-parish-border bg-[#FAF8F5] p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#1E3A5F]">
                <Eye className="h-3.5 w-3.5 text-[#D97706]" />
                Live Parishioner Card Preview
              </span>
              <button
                type="button"
                onClick={() => setPreviewExpanded((prev) => !prev)}
                className="text-xs font-semibold text-[#1E3A5F] underline"
              >
                {previewExpanded ? 'Preview Collapsed State' : 'Preview Expanded State'}
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-parish-gold/50 bg-white shadow-xs">
              <button
                type="button"
                onClick={() => setPreviewExpanded((prev) => !prev)}
                className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full border border-parish-gold/40 bg-parish-gold-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-parish-gold-ink">
                      {previewNotice.category_badge}
                    </span>
                    {isPinned && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                        Pinned
                      </span>
                    )}
                    <UnreadDotBadge unread showNewPill />
                  </div>
                  <h4 className="text-sm font-bold text-[#1E293B]">{previewNotice.title}</h4>
                  {!previewExpanded && (
                    <p className="truncate text-xs text-[#526071]">{previewNotice.summary_preview}</p>
                  )}
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-[#1E3A5F] transition-transform ${
                    previewExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {previewExpanded && (
                <div className="border-t border-[#E7E2DA] px-4 py-3">
                  <SpecialNoticeBody notice={previewNotice} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Structured Details & Publish Form */}
        <form onSubmit={handleSave} className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#526071]">Notice Headline *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Sunday May 24 — Pentecost Sunday"
                className="mt-1 w-full rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#526071]">Category Badge</label>
              <select
                value={categoryBadge}
                onChange={(e) => setCategoryBadge(e.target.value as SpecialNoticeCategory)}
                className="mt-1 w-full rounded-lg border border-[#E7E2DA] bg-white px-3 py-2 text-sm"
              >
                {NOTICE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#526071]">
                Collapsed Summary Preview (shown before tap) *
              </label>
              <input
                type="text"
                required
                maxLength={160}
                value={summaryPreview}
                onChange={(e) => setSummaryPreview(e.target.value)}
                placeholder="Concise 1-line summary without URLs or greetings"
                className="mt-1 w-full rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#526071]">Sign-Off Attribution</label>
              <input
                type="text"
                value={signOff}
                onChange={(e) => setSignOff(e.target.value)}
                placeholder="Rajeev Achan"
                className="mt-1 w-full rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#526071]">Event Date / Time Chip</label>
              <input
                type="text"
                value={eventDateLabel}
                onChange={(e) => setEventDateLabel(e.target.value)}
                placeholder="Sunday, May 24"
                className="mt-1 w-full rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#526071]">Location Label</label>
              <input
                type="text"
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
                placeholder="St. Sebastian Mission, Blythewood, SC"
                className="mt-1 w-full rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E7E2DA] bg-[#FAF8F5] px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#E7E2DA] bg-white px-3 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-50">
                <FileUp className="h-3.5 w-3.5" />
                {uploading ? 'Compressing & Uploading...' : flyerUrl ? 'Replace Flyer / Image' : 'Attach Flyer / Image (Compressed)'}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFlyerUpload(f);
                  }}
                />
              </label>
              {flyerUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setFlyerUrl('');
                    setFlyerStoragePath('');
                    setFlyerMimeType('');
                    setFlyerNote(null);
                  }}
                  className="text-xs font-semibold text-rose-700 underline"
                >
                  Remove Attachment
                </button>
              )}
              {flyerNote && <span className="text-[11px] font-medium text-emerald-700">{flyerNote}</span>}
            </div>

            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#1E293B]">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#1E3A5F]"
              />
              Pin as top priority notice
            </label>
          </div>

          {statusBanner && (
            <div
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium ${
                statusBanner.type === 'ok'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900'
              }`}
            >
              {statusBanner.type === 'ok' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
              <span>{statusBanner.text}</span>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1E3A5F] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#152943] disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : editingId ? 'Update Special Notice' : 'Publish Special Notice'}
            </button>
          </div>
        </form>
      </div>

      {/* Existing Published & Archived Notices List */}
      <div className="rounded-2xl border border-[#E7E2DA] bg-white p-5 shadow-xs">
        <h3 className="text-sm font-bold text-[#1E293B]">Published & Archived Special Notices</h3>
        {loadingList ? (
          <p className="mt-3 text-xs text-[#526071]">Loading notices...</p>
        ) : existing.length === 0 ? (
          <p className="mt-3 text-xs text-[#526071]">No Special Notices posted yet.</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {existing.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E7E2DA] bg-[#FAF8F5] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-[#1E3A5F] ring-1 ring-[#E7E2DA]">
                      {item.category_badge ?? 'Vicar Note'}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        item.status === 'published'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {item.status}
                    </span>
                    {item.is_pinned && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                        Pinned
                      </span>
                    )}
                    <h4 className="text-sm font-bold text-[#1E293B]">{item.title}</h4>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[#526071]">
                    {item.summary_preview || item.description}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleTogglePin(item)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-50"
                  >
                    {item.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    {item.is_pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditing(item)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(item)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#526071] hover:bg-slate-50"
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
                    onClick={() => handleDelete(item.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Special Notice Composer ? Help Modal */}
      <HelpGuideModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="How to Format a Special Notice"
        subtitle="Just paste naturally from WhatsApp, Word, or Email — the smart parser organizes everything automatically."
      >
        <div className="rounded-xl border border-[#E7E2DA] bg-[#FAF8F5] p-3.5 text-xs leading-relaxed text-[#526071]">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              <strong className="text-[#1E293B]">Zero special codes needed:</strong> Paste Fr. Rajeev’s text verbatim from WhatsApp, Word, or Email.
            </li>
            <li>
              <strong className="text-[#1E293B]">Timetables, Maps & Media Links auto-group:</strong> Time lines (<code className="rounded bg-white px-1">8:00 AM - Holy Qurbana</code>), Mission locations (<code className="rounded bg-white px-1">St. Sebastian Mission, Blythewood</code>), and labeled Google Drive/YouTube URLs automatically turn into clean timeline rows, map buttons, and media resource cards.
            </li>
            <li>
              <strong className="text-[#1E293B]">Clean Collapsed Previews:</strong> Greetings like <code className="rounded bg-white px-1">Dear Parish Family</code> and raw URLs are stripped from collapsed previews, while sign-offs (<code className="rounded bg-white px-1">— Rajeev Achan</code>) remain attributed cleanly at the bottom.
            </li>
          </ul>
        </div>

        <div className="space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-wider text-[#526071]">
            One-Click Sample Templates
          </p>
          {SAMPLE_TEMPLATES.map((tpl) => (
            <div
              key={tpl.id}
              className="rounded-xl border border-[#E7E2DA] bg-white p-3.5 shadow-2xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                    {tpl.badge}
                  </span>
                  <h4 className="mt-1 text-xs font-bold text-[#1E293B]">{tpl.label}</h4>
                  <p className="text-[11px] text-[#526071]">{tpl.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleInsertSample(tpl.text, tpl.label)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#1E3A5F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#152943]"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Insert Sample Template
                </button>
              </div>
              <pre className="mt-2.5 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[#E7E2DA] bg-[#FAF8F5] p-2.5 font-mono text-[11px] text-[#334155]">
                {tpl.text}
              </pre>
            </div>
          ))}
        </div>
      </HelpGuideModal>
    </div>
  );
}
