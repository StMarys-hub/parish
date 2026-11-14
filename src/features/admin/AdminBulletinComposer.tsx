import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  CheckCircle2,
  Eye,
  FileUp,
  Link as LinkIcon,
  Plus,
  Save,
  Send,
  Trash2,
  Wand2,
} from 'lucide-react';
import { CategoryBadge } from '../../components/CategoryBadge';
import { parseRawBulletin } from '../../lib/bulletinParser';
import { sanitizeActionUrl, sanitizePlainText } from '../../lib/sanitize';
import {
  getActivePushSubscriberCount,
  publishBulletinAndNotify,
  uploadFlyerFile,
  upsertWeeklyBulletin,
} from '../../services/parishRepository';
import {
  ANNOUNCEMENT_CATEGORIES,
  ActionAttachment,
  AnnouncementCard,
  AnnouncementCategory,
  DailyScheduleEntry,
  WeeklyBulletin,
} from '../../types/parish';

interface AdminBulletinComposerProps {
  initialBulletin: WeeklyBulletin;
  isSandbox: boolean;
  onSaved: () => void;
}

const SAMPLE_PASTE_SNIPPET = `Weekly Schedule (06/01/2026 - 06/07/2026)
Praise be to Jesus Christ, Now, Always, and Forever!
Weekly Schedule
6/01/2026 Monday • N/A
6/02/2026 Tuesday • 6:30 PM - Rosary
• 7:00 PM - Holy Qurbana
6/04/2026 Thursday Feast of the Body and Blood of Christ
• 6:30 PM - Rosary
• 7:00 PM - Holy Qurbana followed by Adoration
6/07/2026 Sunday
• 8:00 AM - Holy Qurbana (Fr. Siby Sebastian)
• 10:00 AM - Holy Qurbana (Fr. Siby Sebastian)

Announcements
• Sunday Qurbana Time Change: Please note that beginning Sunday, June 7, the second Holy Qurbana will be celebrated at 10:00 AM.
• Ward Prayer Meeting: Ward 3 will have a prayer meeting at 7:00 PM, hosted at the residence of Sibi and Ligi on Saturday, June 6.
• VBS Summer Program: Please mark your calendars for our Vacation Bible School program, happening from June 16–18. Volunteer sign-up link: https://docs.google.com/forms/d/e/1FAIpQLSeXLQRkam8I9M_S0eWyUygKyHebz3OzPIwl_gCtBGJyaRvejA/viewform?usp=publish-editor
• Sunday Collection: The total collection for Sunday, May 24 was $462.
• Sunday Lunch Program: Here is the link to sign up for Sunday lunch program for next year:
• https: //docs.google.com/forms/d/1mukLEikLdzj8LGTdcj8sMab4l5Gli3mMwEtf_Fq1-v8/edit`;

export function AdminBulletinComposer({
  initialBulletin,
  isSandbox,
  onSaved,
}: AdminBulletinComposerProps) {
  const [mode, setMode] = useState<'paste' | 'builder' | 'preview'>('builder');
  const [rawPaste, setRawPaste] = useState('');
  const [parseMessage, setParseMessage] = useState<string | null>(null);

  const [bulletinId, setBulletinId] = useState<string | undefined>(
    initialBulletin.id.startsWith('sample-') ? undefined : initialBulletin.id
  );
  const [weekStart, setWeekStart] = useState(initialBulletin.week_start);
  const [weekEnd, setWeekEnd] = useState(initialBulletin.week_end);
  const [title, setTitle] = useState(initialBulletin.title);
  const [greeting, setGreeting] = useState(initialBulletin.greeting);
  const [dailySchedule, setDailySchedule] = useState<DailyScheduleEntry[]>(
    initialBulletin.daily_schedule
  );
  const [announcements, setAnnouncements] = useState<AnnouncementCard[]>(
    initialBulletin.announcements
  );
  const [collectionLabel, setCollectionLabel] = useState(
    initialBulletin.collection_summary?.label ?? 'Sunday Collection'
  );
  const [collectionAmount, setCollectionAmount] = useState(
    initialBulletin.collection_summary?.amountDisplay ?? ''
  );

  const [saving, setSaving] = useState(false);
  const [uploadingForId, setUploadingForId] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // Publish & Push confirmation modal state
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState<number>(0);
  const [sendPush, setSendPush] = useState(true);
  const [pushTitle, setPushTitle] = useState("St. Mary's Parish Bulletin");
  const [pushBody, setPushBody] = useState(
    `New weekly schedule & announcements published (${initialBulletin.title}).`
  );

  const handleAutoParse = () => {
    if (!rawPaste.trim()) return;
    const parsed = parseRawBulletin(rawPaste);
    if (parsed.weekStart) setWeekStart(parsed.weekStart);
    if (parsed.weekEnd) setWeekEnd(parsed.weekEnd);
    if (parsed.title) {
      setTitle(parsed.title);
      setPushBody(`New weekly schedule & announcements published (${parsed.title}).`);
    }
    if (parsed.greeting) setGreeting(parsed.greeting);
    if (parsed.dailySchedule.length > 0) setDailySchedule(parsed.dailySchedule);
    if (parsed.announcements.length > 0) setAnnouncements(parsed.announcements);
    if (parsed.collectionSummary) {
      setCollectionLabel(parsed.collectionSummary.label);
      setCollectionAmount(parsed.collectionSummary.amountDisplay);
    }

    const warningNote = parsed.warnings.length > 0 ? ` Warnings: ${parsed.warnings.join(' ')}` : '';
    setParseMessage(
      `Parsed ${parsed.announcements.length} announcement cards and ${parsed.dailySchedule.length} schedule days.${warningNote}`
    );
    setMode('builder');
  };

  const addBlankCard = () => {
    const newCard: AnnouncementCard = {
      id: `ann-${Date.now().toString(36)}`,
      order: announcements.length + 1,
      title: 'New Announcement',
      category: 'Parish Admin',
      dateTimeLabel: '',
      locationLabel: '',
      body: '',
      actions: [],
    };
    setAnnouncements((prev) => [...prev, newCard]);
  };

  const updateCard = (idx: number, patch: Partial<AnnouncementCard>) => {
    setAnnouncements((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const moveCard = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= announcements.length) return;
    setAnnouncements((prev) => {
      const copy = [...prev];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy.map((c, i) => ({ ...c, order: i + 1 }));
    });
  };

  const removeCard = (idx: number) => {
    setAnnouncements((prev) =>
      prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, order: i + 1 }))
    );
  };

  const handleFlyerUpload = async (cardIdx: number, file: File) => {
    if (isSandbox) {
      setStatusBanner({
        type: 'err',
        text: 'Flyer upload requires a connected Supabase project (.env).',
      });
      return;
    }
    const card = announcements[cardIdx];
    setUploadingForId(card.id);
    setStatusBanner(null);
    try {
      const uploaded = await uploadFlyerFile(file);
      const nextAction: ActionAttachment = {
        label: `View ${file.name.replace(/\.[^.]+$/, '')}`,
        kind: 'flyer',
        url: uploaded.publicUrl,
        storagePath: uploaded.storagePath,
        mimeType: uploaded.mimeType,
      };
      updateCard(cardIdx, { actions: [...card.actions, nextAction] });
      setStatusBanner({ type: 'ok', text: `Uploaded flyer "${file.name}".` });
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Flyer upload failed.',
      });
    } finally {
      setUploadingForId(null);
    }
  };

  const buildPayload = (status: 'draft' | 'published') => {
    const sanitizedAnnouncements = announcements.map((card, i) => ({
      ...card,
      order: i + 1,
      title: sanitizePlainText(card.title),
      body: sanitizePlainText(card.body),
      dateTimeLabel: card.dateTimeLabel ? sanitizePlainText(card.dateTimeLabel) : null,
      locationLabel: card.locationLabel ? sanitizePlainText(card.locationLabel) : null,
      actions: card.actions
        .map((a) => {
          const safeUrl = sanitizeActionUrl(a.url);
          if (!safeUrl) return null;
          return {
            ...a,
            label: sanitizePlainText(a.label) || 'Open Link',
            url: safeUrl,
          };
        })
        .filter(Boolean) as ActionAttachment[],
    }));

    return {
      ...(bulletinId ? { id: bulletinId } : {}),
      schema_version: 1,
      week_start: weekStart,
      week_end: weekEnd,
      title: sanitizePlainText(title),
      subtitle: 'Church Services & Parish Announcements',
      greeting: sanitizePlainText(greeting),
      daily_schedule: dailySchedule,
      announcements: sanitizedAnnouncements,
      collection_summary: collectionAmount.trim()
        ? {
            label: sanitizePlainText(collectionLabel) || 'Sunday Collection',
            amountDisplay: sanitizePlainText(collectionAmount),
          }
        : null,
      sign_off: initialBulletin.sign_off,
      status,
      published_at: status === 'published' ? new Date().toISOString() : null,
    };
  };

  const handleSaveDraft = async () => {
    if (isSandbox) {
      setStatusBanner({
        type: 'err',
        text: 'Sandbox Mode: Connect Supabase in .env to save drafts to PostgreSQL.',
      });
      return;
    }
    setSaving(true);
    setStatusBanner(null);
    try {
      const saved = await upsertWeeklyBulletin(buildPayload('draft'));
      setBulletinId(saved.id);
      setStatusBanner({ type: 'ok', text: 'Draft saved (Audit log recorded).' });
      onSaved();
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to save draft.',
      });
    } finally {
      setSaving(false);
    }
  };

  const openPublishConfirm = async () => {
    if (isSandbox) {
      setStatusBanner({
        type: 'err',
        text: 'Sandbox Mode: Connect Supabase in .env to publish and send push notifications.',
      });
      return;
    }
    setSaving(true);
    try {
      // Save latest edits as draft first so we have a guaranteed bulletinId
      const saved = await upsertWeeklyBulletin(buildPayload('draft'));
      setBulletinId(saved.id);
      const count = await getActivePushSubscriberCount();
      setSubscriberCount(count);
      setPublishModalOpen(true);
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to prepare publish.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmPublish = async () => {
    if (!bulletinId) return;
    setSaving(true);
    setStatusBanner(null);
    try {
      const res = await publishBulletinAndNotify({
        bulletinId,
        sendPush,
        pushTitle: sanitizePlainText(pushTitle),
        pushBody: sanitizePlainText(pushBody),
      });
      setPublishModalOpen(false);
      setStatusBanner({
        type: 'ok',
        text: sendPush
          ? `Bulletin published! Push sent to ${res.sent} devices (${res.deactivated} expired removed).`
          : 'Bulletin published silently (without push notification).',
      });
      onSaved();
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Publish failed.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-mode tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E7E2DA] bg-white p-1.5">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMode('paste')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
              mode === 'paste' ? 'bg-[#1E3A5F] text-white' : 'text-[#526071] hover:bg-slate-100'
            }`}
          >
            <Wand2 className="h-3.5 w-3.5" />
            Smart Paste & Auto-Split
          </button>
          <button
            type="button"
            onClick={() => setMode('builder')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
              mode === 'builder' ? 'bg-[#1E3A5F] text-white' : 'text-[#526071] hover:bg-slate-100'
            }`}
          >
            Card Editor ({announcements.length})
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
              mode === 'preview' ? 'bg-[#1E3A5F] text-white' : 'text-[#526071] hover:bg-slate-100'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            Mobile Preview
          </button>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] bg-[#FAF8F5] px-3 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-100 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            Save Draft
          </button>
          <button
            type="button"
            onClick={openPublishConfirm}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A5F] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#152943] disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            Publish & Notify
          </button>
        </div>
      </div>

      {statusBanner && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium ${
            statusBanner.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {statusBanner.text}
        </div>
      )}

      {parseMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-medium text-indigo-900">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {parseMessage}
        </div>
      )}

      {/* Mode 1: Smart Paste */}
      {mode === 'paste' && (
        <div className="space-y-3 rounded-2xl border border-[#E7E2DA] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#1E293B]">
                Paste Weekly Bulletin Text (Word / Email / PDF / WhatsApp)
              </h3>
              <p className="text-xs text-[#526071]">
                Automatically splits bullets into cards, repairs broken URLs, extracts dates & Sunday collection, and sanitizes HTML.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRawPaste(SAMPLE_PASTE_SNIPPET)}
              className="rounded-lg border border-[#E7E2DA] px-2.5 py-1 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-50"
            >
              Load Sample Text
            </button>
          </div>
          <textarea
            rows={12}
            value={rawPaste}
            onChange={(e) => setRawPaste(e.target.value)}
            placeholder="Paste the full weekly schedule & announcements here..."
            className="w-full rounded-xl border border-[#E7E2DA] bg-[#FAF8F5] p-3 font-mono text-xs text-[#1E293B] focus:border-[#1E3A5F] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAutoParse}
            disabled={!rawPaste.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#1E3A5F] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#152943] disabled:opacity-50"
          >
            <Wand2 className="h-4 w-4" />
            Auto-Split into Announcement Cards
          </button>
        </div>
      )}

      {/* Mode 2: Structured Builder */}
      {mode === 'builder' && (
        <div className="space-y-4">
          {/* Header Meta */}
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[#E7E2DA] bg-white p-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#526071]">Week Start (Mon)</label>
              <input
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#526071]">Week End (Sun)</label>
              <input
                type="date"
                value={weekEnd}
                onChange={(e) => setWeekEnd(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#526071]">Bulletin Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#526071]">Pastoral Greeting</label>
              <input
                type="text"
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Announcement Cards */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1E293B]">
                Announcement Cards ({announcements.length})
              </h3>
              <button
                type="button"
                onClick={addBlankCard}
                className="inline-flex items-center gap-1 rounded-xl bg-[#1E3A5F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#152943]"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Item
              </button>
            </div>

            {announcements.map((card, idx) => (
              <div
                key={card.id}
                className="space-y-3 rounded-2xl border border-[#E7E2DA] bg-white p-4 shadow-2xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#526071]">Item #{idx + 1}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveCard(idx, -1)}
                      disabled={idx === 0}
                      aria-label="Move item up"
                      className="rounded p-1 text-[#526071] hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCard(idx, 1)}
                      disabled={idx === announcements.length - 1}
                      aria-label="Move item down"
                      className="rounded p-1 text-[#526071] hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCard(idx)}
                      aria-label="Delete item"
                      className="rounded p-1 text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <input
                    type="text"
                    value={card.title}
                    onChange={(e) => updateCard(idx, { title: e.target.value })}
                    placeholder="Title"
                    className="rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm font-semibold sm:col-span-2"
                  />
                  <select
                    value={card.category}
                    onChange={(e) =>
                      updateCard(idx, { category: e.target.value as AnnouncementCategory })
                    }
                    className="rounded-lg border border-[#E7E2DA] bg-white px-3 py-2 text-sm"
                  >
                    {ANNOUNCEMENT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <input
                    type="text"
                    value={card.dateTimeLabel ?? ''}
                    onChange={(e) => updateCard(idx, { dateTimeLabel: e.target.value })}
                    placeholder="Date / Time chip (optional, e.g. Sat, Jun 6 • 7:00 PM)"
                    className="rounded-lg border border-[#E7E2DA] px-3 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    value={card.locationLabel ?? ''}
                    onChange={(e) => updateCard(idx, { locationLabel: e.target.value })}
                    placeholder="Location chip (optional)"
                    className="rounded-lg border border-[#E7E2DA] px-3 py-1.5 text-xs"
                  />
                </div>

                <textarea
                  rows={3}
                  value={card.body}
                  onChange={(e) => updateCard(idx, { body: e.target.value })}
                  placeholder="Announcement details..."
                  className="w-full rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm"
                />

                {/* Action Links & Flyer Upload */}
                <div className="space-y-2 border-t border-[#E7E2DA] pt-2.5">
                  {card.actions.map((act, aIdx) => (
                    <div key={aIdx} className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={act.label}
                        onChange={(e) => {
                          const next = [...card.actions];
                          next[aIdx] = { ...act, label: e.target.value };
                          updateCard(idx, { actions: next });
                        }}
                        placeholder="Button Label"
                        className="w-48 rounded border border-[#E7E2DA] px-2 py-1 text-xs"
                      />
                      <input
                        type="url"
                        value={act.url}
                        onChange={(e) => {
                          const next = [...card.actions];
                          next[aIdx] = { ...act, url: e.target.value };
                          updateCard(idx, { actions: next });
                        }}
                        placeholder="https://..."
                        className="min-w-0 flex-1 rounded border border-[#E7E2DA] px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateCard(idx, {
                            actions: card.actions.filter((_, i) => i !== aIdx),
                          })
                        }
                        className="text-xs font-semibold text-rose-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateCard(idx, {
                          actions: [
                            ...card.actions,
                            { label: 'Open Link', kind: 'external_url', url: 'https://' },
                          ],
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-[#E7E2DA] px-2.5 py-1 text-xs font-medium text-[#1E3A5F] hover:bg-slate-50"
                    >
                      <LinkIcon className="h-3.5 w-3.5" />
                      Add Link / Form
                    </button>

                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[#E7E2DA] px-2.5 py-1 text-xs font-medium text-[#1E3A5F] hover:bg-slate-50">
                      <FileUp className="h-3.5 w-3.5" />
                      {uploadingForId === card.id ? 'Uploading...' : 'Attach Flyer (PDF/Image)'}
                      <input
                        type="file"
                        accept=".pdf,image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={uploadingForId === card.id}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFlyerUpload(idx, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Collection Summary */}
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[#E7E2DA] bg-white p-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#526071]">
                Sunday Collection Label
              </label>
              <input
                type="text"
                value={collectionLabel}
                onChange={(e) => setCollectionLabel(e.target.value)}
                placeholder="Sunday Collection (May 24)"
                className="mt-1 w-full rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#526071]">
                Amount Display (leave blank to hide)
              </label>
              <input
                type="text"
                value={collectionAmount}
                onChange={(e) => setCollectionAmount(e.target.value)}
                placeholder="$462.00"
                className="mt-1 w-full rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Mode 3: Mobile Preview */}
      {mode === 'preview' && (
        <div className="mx-auto max-w-md space-y-3 rounded-3xl border-4 border-slate-800 bg-[#FAF8F5] p-4 shadow-lg">
          <div className="rounded-xl bg-[#1E3A5F] p-4 text-white">
            <p className="font-serif text-sm font-semibold">“{greeting}”</p>
            <p className="mt-1 text-[11px] text-slate-300">{title}</p>
          </div>
          {announcements.map((c) => (
            <div key={c.id} className="rounded-xl border border-[#E7E2DA] bg-white p-3.5">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-bold text-[#1E293B]">{c.title}</h4>
                <CategoryBadge category={c.category} />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[#1E293B]">{c.body}</p>
              {c.actions.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {c.actions.map((a, i) => (
                    <span
                      key={i}
                      className="rounded-lg bg-[#1E3A5F] px-2.5 py-1 text-xs font-semibold text-white"
                    >
                      {a.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Publish & Push Confirmation Modal */}
      {publishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center gap-2 text-[#1E3A5F]">
              <Bell className="h-5 w-5" />
              <h3 className="text-base font-bold">Confirm Publish & Push Alert</h3>
            </div>

            <label className="flex items-start gap-2.5 rounded-xl border border-[#E7E2DA] bg-[#FAF8F5] p-3 text-xs">
              <input
                type="checkbox"
                checked={sendPush}
                onChange={(e) => setSendPush(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Send instant push notification to{' '}
                <strong>{subscriberCount} subscribed device(s)</strong>.
              </span>
            </label>

            {sendPush && (
              <div className="space-y-2.5">
                <div>
                  <label className="block text-xs font-semibold text-[#526071]">Alert Title</label>
                  <input
                    type="text"
                    maxLength={90}
                    value={pushTitle}
                    onChange={(e) => setPushTitle(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#526071]">Alert Message</label>
                  <textarea
                    rows={2}
                    maxLength={200}
                    value={pushBody}
                    onChange={(e) => setPushBody(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#E7E2DA] px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPublishModalOpen(false)}
                className="rounded-xl border border-[#E7E2DA] px-4 py-2 text-xs font-semibold text-[#526071]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPublish}
                disabled={saving}
                className="rounded-xl bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#152943] disabled:opacity-50"
              >
                {saving ? 'Publishing...' : sendPush ? 'Publish & Send Push' : 'Publish Only'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
