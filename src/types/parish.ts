export type AnnouncementCategory =
  | 'Liturgical'
  | 'Youth/Young Adults'
  | 'Ward Prayer'
  | 'Catechism/CCD'
  | 'Outreach/Charity'
  | 'Parish Admin';

export const ANNOUNCEMENT_CATEGORIES: readonly AnnouncementCategory[] = [
  'Liturgical',
  'Ward Prayer',
  'Catechism/CCD',
  'Youth/Young Adults',
  'Outreach/Charity',
  'Parish Admin',
] as const;

export type ActionAttachmentKind = 'external_url' | 'form' | 'flyer' | 'drive';

export interface ActionAttachment {
  label: string;
  kind: ActionAttachmentKind;
  url: string;
  storagePath?: string | null;
  mimeType?: string | null;
}

export interface AnnouncementCard {
  id: string;
  order: number;
  title: string;
  category: AnnouncementCategory;
  dateTimeLabel?: string | null;
  locationLabel?: string | null;
  body: string;
  actions: ActionAttachment[];
}

export interface DailyScheduleService {
  time: string;
  title: string;
  celebrant?: string | null;
}

export interface DailyScheduleEntry {
  date: string; // YYYY-MM-DD
  dayLabel: string;
  feastNote?: string | null;
  items: DailyScheduleService[];
}

export interface CollectionSummary {
  label: string;
  amountDisplay: string;
  notes?: string | null;
}

export interface PastoralSignOff {
  closing: string;
  name: string;
  title: string;
  email: string;
  website: string;
}

export interface WeeklyBulletin {
  id: string;
  schema_version: number;
  week_start: string; // YYYY-MM-DD
  week_end: string;   // YYYY-MM-DD
  title: string;
  subtitle: string;
  greeting: string;
  intro_text?: string | null;
  daily_schedule: DailyScheduleEntry[];
  announcements: AnnouncementCard[];
  collection_summary?: CollectionSummary | null;
  sign_off: PastoralSignOff;
  status: 'draft' | 'published';
  published_at?: string | null;
  push_sent_at?: string | null;
  updated_at: string;
}

export interface RegularScheduleItem {
  id: string;
  sort_order: number;
  group_name: string;
  day_label: string;
  time_label: string;
  title: string;
  location?: string | null;
  notes?: string | null;
  is_active: boolean;
}

export interface TrusteeContact {
  name: string;
  role: string;
  phone?: string;
  email?: string;
}

export interface ParishInfo {
  id: number;
  parish_name: string;
  diocese_name: string;
  address_line: string;
  maps_url: string;
  phone: string;
  email: string;
  website_url: string;
  vicar_name: string;
  vicar_title: string;
  trustees: TrusteeContact[];
  office_hours?: string | null;
  general_notes?: string | null;
}

export interface AdminUserProfile {
  user_id: string;
  email: string;
  full_name: string;
  role: 'vicar' | 'trustee' | 'secretary';
  is_active: boolean;
}

export interface AuditLogEntry {
  id: number;
  actor_email: string;
  actor_role?: string | null;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'PUBLISH' | 'PUSH_DISPATCH';
  table_name: string;
  record_id: string;
  change_summary: string;
  created_at: string;
}
