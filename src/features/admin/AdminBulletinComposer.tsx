import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Copy,
  Eye,
  FileText,
  FileUp,
  HelpCircle,
  Link as LinkIcon,
  Plus,
  Save,
  Send,
  Trash2,
  Wand2,
} from 'lucide-react';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { FormattedTextarea } from '../../components/FormattedTextarea';
import { HelpGuideModal } from '../../components/HelpGuideModal';
import { BulletinView } from '../bulletin/BulletinView';
import { parseRawBulletin } from '../../lib/bulletinParser';
import { sanitizeActionUrl, sanitizePlainText } from '../../lib/sanitize';
import { cleanAnnouncementTitle, cleanDescriptionText } from '../../lib/textFormat';
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
  DailyScheduleService,
  MinistryUpdate,
  SpecialAnnouncement,
  WeeklyBulletin,
} from '../../types/parish';

interface AdminBulletinComposerProps {
  initialBulletin: WeeklyBulletin;
  isSandbox: boolean;
  seasonLabel?: string;
  specialAnnouncements?: SpecialAnnouncement[];
  ministryUpdates?: MinistryUpdate[];
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

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function deriveWeekdayLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return 'Day';
  const dt = new Date(Date.UTC(y, m - 1, d));
  return WEEKDAY_NAMES[dt.getUTCDay()] ?? 'Day';
}

function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function AdminBulletinComposer({
  initialBulletin,
  isSandbox,
  seasonLabel,
  specialAnnouncements = [],
  ministryUpdates = [],
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
  const [scheduleEditorOpen, setScheduleEditorOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [copiedHelp, setCopiedHelp] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [scheduledPublishLocal, setScheduledPublishLocal] = useState('');
  const [subscriberCount, setSubscriberCount] = useState<number>(0);
  const [sendPush, setSendPush] = useState(true);
  const [pushTitle, setPushTitle] = useState("St. Mary's Parish Bulletin");
  const [pushBody, setPushBody] = useState(
    `New weekly schedule & announcements published (${initialBulletin.title}).`
  );

  const handleAutoParse = () => {
    if (!rawPaste.trim()) return;
    const parsed = parseRawBulletin(rawPaste);
    if (parsed.weekStart && parsed.weekStart !== weekStart) {
      setBulletinId(undefined);
    }
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
      category: 'General & Parish',
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

  // Daily Holy Qurbana & Services inline editor helpers
  const addScheduleDay = () => {
    const lastDate = dailySchedule[dailySchedule.length - 1]?.date;
    const nextDate = lastDate ? addDaysIso(lastDate, 1) : weekStart || new Date().toISOString().slice(0, 10);
    setDailySchedule((prev) => [
      ...prev,
      {
        date: nextDate,
        dayLabel: deriveWeekdayLabel(nextDate),
        feastNote: '',
        items: [{ time: '7:00 PM', title: 'Holy Qurbana', celebrant: '' }],
      },
    ]);
    setScheduleEditorOpen(true);
  };

  const generateWeekDaysFromStart = () => {
    if (!weekStart) return;
    const existingByDate = new Map(dailySchedule.map((d) => [d.date, d]));
    const days: DailyScheduleEntry[] = Array.from({ length: 7 }, (_, i) => {
      const date = addDaysIso(weekStart, i);
      const existing = existingByDate.get(date);
      if (existing) return existing;
      const dayLabel = deriveWeekdayLabel(date);
      return {
        date,
        dayLabel,
        feastNote: '',
        items:
          dayLabel === 'Sunday'
            ? [
                { time: '8:00 AM', title: 'Holy Qurbana', celebrant: '' },
                { time: '10:30 AM', title: 'Holy Qurbana (English)', celebrant: '' },
              ]
            : [{ time: '7:00 PM', title: 'Holy Qurbana', celebrant: '' }],
      };
    });
    setDailySchedule(days);
    setScheduleEditorOpen(true);
  };

  const updateScheduleDay = (dayIdx: number, patch: Partial<DailyScheduleEntry>) => {
    setDailySchedule((prev) =>
      prev.map((d, i) => (i === dayIdx ? { ...d, ...patch } : d))
    );
  };

  const moveScheduleDay = (dayIdx: number, dir: -1 | 1) => {
    const target = dayIdx + dir;
    if (target < 0 || target >= dailySchedule.length) return;
    setDailySchedule((prev) => {
      const copy = [...prev];
      [copy[dayIdx], copy[target]] = [copy[target], copy[dayIdx]];
      return copy;
    });
  };

  const removeScheduleDay = (dayIdx: number) => {
    setDailySchedule((prev) => prev.filter((_, i) => i !== dayIdx));
  };

  const addServiceItem = (dayIdx: number) => {
    setDailySchedule((prev) =>
      prev.map((d, i) =>
        i === dayIdx
          ? { ...d, items: [...d.items, { time: '6:30 PM', title: 'Rosary', celebrant: '' }] }
          : d
      )
    );
  };

  const updateServiceItem = (
    dayIdx: number,
    svcIdx: number,
    patch: Partial<DailyScheduleService>
  ) => {
    setDailySchedule((prev) =>
      prev.map((d, i) =>
        i === dayIdx
          ? {
              ...d,
              items: d.items.map((svc, sIdx) => (sIdx === svcIdx ? { ...svc, ...patch } : svc)),
            }
          : d
      )
    );
  };

  const removeServiceItem = (dayIdx: number, svcIdx: number) => {
    setDailySchedule((prev) =>
      prev.map((d, i) =>
        i === dayIdx ? { ...d, items: d.items.filter((_, sIdx) => sIdx !== svcIdx) } : d
      )
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

  const buildPayload = (status: 'draft' | 'published', scheduledPublishIso?: string | null) => {
    const sanitizedAnnouncements = announcements.map((card, i) => ({
      ...card,
      order: i + 1,
      title: cleanAnnouncementTitle(sanitizePlainText(card.title)),
      body: cleanDescriptionText(sanitizePlainText(card.body)),
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

    const sanitizedSchedule: DailyScheduleEntry[] = dailySchedule.map((day) => ({
      date: day.date,
      dayLabel: sanitizePlainText(day.dayLabel) || deriveWeekdayLabel(day.date),
      feastNote: day.feastNote ? sanitizePlainText(day.feastNote) : null,
      items: day.items
        .map((svc) => ({
          time: sanitizePlainText(svc.time),
          title: sanitizePlainText(svc.title),
          celebrant: svc.celebrant ? sanitizePlainText(svc.celebrant) : null,
        }))
        .filter((svc) => svc.title || svc.time),
    }));

    return {
      ...(bulletinId ? { id: bulletinId } : {}),
      schema_version: 1,
      week_start: weekStart,
      week_end: weekEnd,
      title: sanitizePlainText(title),
      subtitle: 'Church Services & Parish Announcements',
      greeting: sanitizePlainText(greeting),
      daily_schedule: sanitizedSchedule,
      announcements: sanitizedAnnouncements,
      collection_summary: collectionAmount.trim()
        ? {
            label: sanitizePlainText(collectionLabel) || 'Sunday Collection',
            amountDisplay: sanitizePlainText(collectionAmount),
          }
        : null,
      sign_off: initialBulletin.sign_off,
      status,
      published_at: status === 'published' ? scheduledPublishIso || new Date().toISOString() : null,
      ...(scheduledPublishIso !== undefined ? { scheduled_publish_at: scheduledPublishIso } : {}),
    };
  };

  const validateDates = (): string | null => {
    if (!weekStart || !weekEnd) return 'Please enter both Week Start and Week End dates.';
    if (weekEnd < weekStart) return 'Week End date must be on or after Week Start date.';
    if (!title.trim()) return 'Please enter a Bulletin Title.';
    return null;
  };

  const handleSaveDraft = async () => {
    if (isSandbox) {
      setStatusBanner({
        type: 'err',
        text: 'Sandbox Mode: Connect Supabase in .env to save drafts to PostgreSQL.',
      });
      return;
    }
    const validationErr = validateDates();
    if (validationErr) {
      setStatusBanner({ type: 'err', text: validationErr });
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
    const validationErr = validateDates();
    if (validationErr) {
      setStatusBanner({ type: 'err', text: validationErr });
      return;
    }
    setSaving(true);
    try {
      // Preserve current status so opening and canceling the modal never unpublishes a live bulletin
      const saved = await upsertWeeklyBulletin(buildPayload(initialBulletin.status));
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
      const scheduledDate = scheduledPublishLocal ? new Date(scheduledPublishLocal) : null;
      const isFutureSchedule = Boolean(
        scheduledDate && Number.isFinite(scheduledDate.getTime()) && scheduledDate.getTime() > Date.now()
      );

      if (isFutureSchedule && scheduledDate) {
        await upsertWeeklyBulletin(buildPayload('published', scheduledDate.toISOString()));
        setPublishModalOpen(false);
        setStatusBanner({
          type: 'ok',
          text: `Bulletin scheduled to go live automatically on ${scheduledDate.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}.`,
        });
        onSaved();
        return;
      }

      const res = await publishBulletinAndNotify({
        bulletinId,
        sendPush,
        pushTitle: sanitizePlainText(pushTitle),
        pushBody: sanitizePlainText(pushBody),
      });
      setPublishModalOpen(false);
      if (sendPush) {
        const platformParts = Object.entries(res.sentByPlatform ?? {})
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        const errNote =
          res.failedCount && res.failedCount > 0 && res.deliveryErrors?.length
            ? ` ⚠️ ${res.failedCount} failed (${res.deliveryErrors.map((e) => `${e.platform}: HTTP ${e.status ?? '?'} ${e.detail}`).join('; ')})`
            : '';
        setStatusBanner({
          type: res.failedCount ? 'err' : 'ok',
          text: `Bulletin published! Push sent to ${res.sent} devices${
            platformParts ? ` (${platformParts})` : ''
          } • ${res.deactivated} expired removed.${errNote}`,
        });
      } else {
        setStatusBanner({
          type: 'ok',
          text: 'Bulletin published silently (without push notification).',
        });
      }
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

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            aria-label="Weekly Bulletin Formatting Guide"
            title="Weekly Bulletin Formatting Guide"
            className="inline-flex items-center gap-1 rounded-lg border border-[#E7E2DA] bg-[#FAF8F5] px-2.5 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-100"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Help
          </button>
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

                <FormattedTextarea
                  rows={3}
                  value={card.body}
                  onChange={(nextBody) => updateCard(idx, { body: nextBody })}
                  placeholder="Announcement details... (select text to Bold or Highlight)"
                  ariaLabel={`Description for ${card.title || `item ${idx + 1}`}`}
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

          {/* Inline Collapsible Daily Schedule Editor ("This Week's Holy Qurbana & Services") */}
          <div className="overflow-hidden rounded-2xl border border-[#E7E2DA] bg-white shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <button
                type="button"
                aria-expanded={scheduleEditorOpen}
                onClick={() => setScheduleEditorOpen((v) => !v)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <div className="rounded-lg bg-[#1E3A5F]/10 p-2 text-[#1E3A5F]">
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-sm font-bold text-[#1E293B]">
                      This Week&rsquo;s Holy Qurbana &amp; Services
                    </h3>
                    <span className="rounded-full border border-[#E7E2DA] bg-[#FAF8F5] px-2 py-0.5 text-[10px] font-semibold text-[#526071]">
                      {dailySchedule.length} {dailySchedule.length === 1 ? 'day' : 'days'}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-[#1E3A5F] transition-transform duration-200 ${
                        scheduleEditorOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                  <p className="text-xs text-[#526071]">
                    {scheduleEditorOpen
                      ? 'Edit daily Mass times, celebrants, or feast notes without re-pasting.'
                      : 'Tap to add or tweak daily Qurbana times & liturgical feast notes.'}
                  </p>
                </div>
              </button>

              {scheduleEditorOpen && (
                <div className="flex flex-wrap gap-1.5">
                  {weekStart && (
                    <button
                      type="button"
                      onClick={generateWeekDaysFromStart}
                      className="rounded-lg border border-[#E7E2DA] bg-[#FAF8F5] px-2.5 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-100"
                    >
                      Fill Missing 7 Days
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={addScheduleDay}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#1E3A5F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#152943]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Day
                  </button>
                </div>
              )}
            </div>

            {scheduleEditorOpen && (
              <div className="space-y-3 border-t border-[#E7E2DA] p-4">
                {dailySchedule.length === 0 ? (
                  <p className="text-xs text-[#526071]">
                    No daily schedule rows yet. Click <strong>Fill Missing 7 Days</strong> or{' '}
                    <strong>Add Day</strong> above, or use Smart Paste.
                  </p>
                ) : (
                  dailySchedule.map((day, dayIdx) => (
                    <div
                      key={`${day.date}-${dayIdx}`}
                      className="space-y-2.5 rounded-xl border border-[#E7E2DA] bg-[#FAF8F5] p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
                          <input
                            type="date"
                            aria-label="Service date"
                            value={day.date}
                            onChange={(e) => {
                              const nextDate = e.target.value;
                              updateScheduleDay(dayIdx, {
                                date: nextDate,
                                dayLabel: nextDate ? deriveWeekdayLabel(nextDate) : day.dayLabel,
                              });
                            }}
                            className="rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs font-medium"
                          />
                          <input
                            type="text"
                            aria-label="Day label"
                            value={day.dayLabel}
                            onChange={(e) => updateScheduleDay(dayIdx, { dayLabel: e.target.value })}
                            placeholder="e.g. Sunday"
                            className="rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs font-semibold"
                          />
                          <input
                            type="text"
                            aria-label="Feast or liturgical note"
                            value={day.feastNote ?? ''}
                            onChange={(e) => updateScheduleDay(dayIdx, { feastNote: e.target.value })}
                            placeholder="Feast note (optional)"
                            className="rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs"
                          />
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveScheduleDay(dayIdx, -1)}
                            disabled={dayIdx === 0}
                            aria-label="Move day up"
                            className="rounded p-1 text-[#526071] hover:bg-white disabled:opacity-30"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveScheduleDay(dayIdx, 1)}
                            disabled={dayIdx === dailySchedule.length - 1}
                            aria-label="Move day down"
                            className="rounded p-1 text-[#526071] hover:bg-white disabled:opacity-30"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeScheduleDay(dayIdx)}
                            aria-label="Remove day"
                            className="rounded p-1 text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5 pl-1">
                        {day.items.map((svc, svcIdx) => (
                          <div key={svcIdx} className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              aria-label="Service time"
                              value={svc.time}
                              onChange={(e) =>
                                updateServiceItem(dayIdx, svcIdx, { time: e.target.value })
                              }
                              placeholder="8:00 AM"
                              className="w-24 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1E3A5F]"
                            />
                            <input
                              type="text"
                              aria-label="Service title"
                              value={svc.title}
                              onChange={(e) =>
                                updateServiceItem(dayIdx, svcIdx, { title: e.target.value })
                              }
                              placeholder="Holy Qurbana / Rosary / N/A"
                              className="min-w-0 flex-1 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs"
                            />
                            <input
                              type="text"
                              aria-label="Celebrant"
                              value={svc.celebrant ?? ''}
                              onChange={(e) =>
                                updateServiceItem(dayIdx, svcIdx, { celebrant: e.target.value })
                              }
                              placeholder="Celebrant (optional)"
                              className="w-40 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => removeServiceItem(dayIdx, svcIdx)}
                              aria-label="Remove service"
                              className="rounded p-1 text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => addServiceItem(dayIdx)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1E3A5F] hover:bg-slate-50"
                        >
                          <Plus className="h-3 w-3" />
                          Add Service
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mode 3: Interactive Mobile Preview (matches exact live BulletinView & active Liturgical Theme) */}
      {mode === 'preview' && (
        <div className="mx-auto max-w-md space-y-2">
          <p className="text-center text-[11px] font-semibold text-parish-muted">
            Interactive Mobile Preview — tap cards, Expand All, Ministry pill, or Collection to test
          </p>
          <div className="overflow-hidden rounded-[2rem] border-4 border-slate-800 bg-parish-canvas shadow-xl">
            <div className="flex items-center justify-between border-b border-parish-border bg-white/95 px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <img
                  src="/pwa-192x192.png"
                  alt=""
                  width={26}
                  height={26}
                  className="h-6.5 w-6.5 shrink-0 rounded-lg"
                />
                <span className="truncate font-serif text-xs font-bold text-parish-navy">
                  St. Mary&apos;s Syro-Malabar Parish
                </span>
              </div>
              <span className="shrink-0 rounded-full bg-parish-canvas px-2 py-0.5 text-[10px] font-semibold text-parish-muted">
                Preview
              </span>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-3.5">
              <ErrorBoundary
                fallback={
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900">
                    Unable to render preview — check dates or announcement fields.
                  </div>
                }
              >
                <BulletinView
                  bulletins={[
                    {
                      ...buildPayload('draft'),
                      id: bulletinId ?? initialBulletin.id ?? 'preview-draft',
                      updated_at: new Date().toISOString(),
                    },
                  ]}
                  isLoading={false}
                  source={isSandbox ? 'sample' : 'live'}
                  seasonLabel={seasonLabel}
                  specialAnnouncements={specialAnnouncements}
                  ministryUpdates={ministryUpdates}
                  isPreview={true}
                />
              </ErrorBoundary>
            </div>
          </div>
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

            <div className="rounded-xl border border-[#E7E2DA] bg-[#FAF8F5] p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <label className="font-semibold text-[#1E293B]" htmlFor="bulletin-schedule-publish">
                  Schedule Publish (Optional)
                </label>
                {scheduledPublishLocal && (
                  <button
                    type="button"
                    onClick={() => setScheduledPublishLocal('')}
                    className="text-[11px] font-semibold text-rose-700 hover:underline"
                  >
                    Publish Now
                  </button>
                )}
              </div>
              <input
                id="bulletin-schedule-publish"
                type="datetime-local"
                value={scheduledPublishLocal}
                onChange={(e) => {
                  const val = e.target.value;
                  setScheduledPublishLocal(val);
                  if (val) setSendPush(false);
                }}
                className="mt-1.5 w-full rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs"
              />
              <p className="mt-1 text-[11px] text-[#526071]">
                Leave blank to publish right now, or pick a future time (e.g., Saturday 6:00 PM) to go live automatically.
              </p>
            </div>

            {!scheduledPublishLocal && (
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
            )}

            {!scheduledPublishLocal && sendPush && (
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

            {statusBanner?.type === 'err' && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-900">
                {statusBanner.text}
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
                {saving
                  ? 'Saving...'
                  : scheduledPublishLocal
                    ? 'Schedule Bulletin'
                    : sendPush
                      ? 'Publish & Send Push'
                      : 'Publish Only'}
              </button>
            </div>
          </div>
        </div>
      )}

      <HelpGuideModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Weekly Bulletin Formatting Guide"
        subtitle="Paste directly from Word, Email, PDF, or WhatsApp — schedules, cards, and categories auto-format cleanly."
      >
        <div className="rounded-xl border border-[#E7E2DA] bg-[#FAF8F5] p-3.5 text-xs leading-relaxed text-[#526071]">
          <p className="font-bold text-[#1E293B]">Smart Paste, Categories &amp; Formatting Tips:</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-4">
            <li>
              <strong>Header Line:</strong> Start with{' '}
              <code className="rounded bg-white px-1 py-0.5 text-[#1E3A5F]">
                Weekly Schedule (MM/DD/YYYY - MM/DD/YYYY)
              </code>{' '}
              so week dates auto-fill. You can also edit individual Mass times anytime under{' '}
              <strong>Card Editor → This Week&apos;s Holy Qurbana &amp; Services</strong>.
            </li>
            <li>
              <strong>Auto-Cleansed Titles:</strong> Start bullets with{' '}
              <code className="rounded bg-white px-1 py-0.5 text-[#1E3A5F]">• Title: Details...</code>.
              Extra spaces, invisible Word/PDF characters, and leading bullets/numbers are stripped from titles automatically.
            </li>
            <li>
              <strong>5 Parish Categories (Auto-Tagged):</strong>{' '}
              <code className="rounded bg-white px-1 py-0.5">Liturgy &amp; Sacraments</code>,{' '}
              <code className="rounded bg-white px-1 py-0.5">Faith &amp; CCD</code>,{' '}
              <code className="rounded bg-white px-1 py-0.5">Youth &amp; Ministries</code>,{' '}
              <code className="rounded bg-white px-1 py-0.5">Parish Events &amp; Wards</code>, and{' '}
              <code className="rounded bg-white px-1 py-0.5">General &amp; Parish</code>.
            </li>
            <li>
              <strong>Bold, Text Color &amp; Highlight:</strong> In <strong>Card Editor</strong>, select any phrase in a description and tap{' '}
              <strong>Bold</strong> (<kbd className="rounded border bg-white px-1">Ctrl+B</kbd>),{' '}
              <strong>Text Color</strong> (Parish Navy, Urgent Red, Green, Gold, Purple), or{' '}
              <strong>Highlight</strong> (Gold, Urgent Rose, Soft Green, Info Blue — <kbd className="rounded border bg-white px-1">Ctrl+Shift+H</kbd>).
            </li>
            <li>
              <strong>Collection, Calendar &amp; Links:</strong> Include{' '}
              <code className="rounded bg-white px-1 py-0.5">Sunday Collection: $462</code> for the Weekly Offertory card; dates enable one-tap{' '}
              <strong>Add to Calendar</strong>, and <code className="rounded bg-white px-1 py-0.5">https://...</code> URLs become safe action buttons.
            </li>
            <li>
              <strong>Scheduled Publishing:</strong> Click <strong>Publish &amp; Notify</strong> and optionally set a future date/time (e.g., Saturday 6:00 PM) to go live automatically.
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-[#E7E2DA] bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1E293B]">
              <FileText className="h-3.5 w-3.5 text-[#1E3A5F]" />
              Copyable Weekly Bulletin Sample
            </span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(SAMPLE_PASTE_SNIPPET);
                setCopiedHelp(true);
                window.setTimeout(() => setCopiedHelp(false), 1800);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1E3A5F] hover:bg-slate-100"
            >
              <Copy className="h-3 w-3" />
              {copiedHelp ? 'Copied!' : 'Copy Format'}
            </button>
          </div>
          <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[#E7E2DA] bg-white p-2.5 font-mono text-[11px] text-[#334155]">
            {SAMPLE_PASTE_SNIPPET}
          </pre>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3">
          <p className="text-xs text-indigo-950">
            Want to test formatting right away? Insert the sample text into Smart Paste.
          </p>
          <button
            type="button"
            onClick={() => {
              setMode('paste');
              setRawPaste(SAMPLE_PASTE_SNIPPET);
              setHelpOpen(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A5F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#152943]"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Insert Sample Weekly Template
          </button>
        </div>
      </HelpGuideModal>
    </div>
  );
}
