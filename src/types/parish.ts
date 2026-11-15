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

export type AdminRole = 'super_admin' | 'vicar' | 'trustee' | 'secretary';

export type InviteStatus = 'active' | 'pending_invite';

export interface AdminUserProfile {
  user_id: string;
  email: string;
  full_name: string;
  role: AdminRole;
  designation?: string | null;
  invite_status?: InviteStatus;
  last_active_at?: string | null;
  created_at?: string;
  is_active: boolean;
}

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'PUBLISH'
  | 'PUSH_DISPATCH'
  | 'USER_INVITE'
  | 'ROLE_CHANGE'
  | 'USER_DEACTIVATE'
  | 'USER_DELETE'
  | 'PASSWORD_RESET'
  | 'THEME_CHANGE';

export interface AuditLogEntry {
  id: number;
  actor_email: string;
  actor_role?: string | null;
  action: AuditAction;
  table_name: string;
  record_id: string;
  change_summary: string;
  created_at: string;
}

export type LiturgicalSeasonId =
  | 'subara'
  | 'denaha'
  | 'sauma-ramba'
  | 'qyamta'
  | 'sliha'
  | 'qaita'
  | 'elijah-sliba-moses'
  | 'mushah'
  | 'qudash-edta';

export type ThemeId = LiturgicalSeasonId | 'classic';

export type ThemeMode = 'auto' | ThemeId;

export interface AppSettings {
  id: number;
  theme_mode: ThemeMode;
  updated_at?: string;
}

export function isSuperAdminRole(role?: string | null): boolean {
  return role === 'super_admin' || role === 'vicar';
}

export function formatRoleLabel(role?: string | null): string {
  if (role === 'super_admin' || role === 'vicar') return 'Super Admin / Vicar';
  if (role === 'trustee') return 'Trustee';
  if (role === 'secretary') return 'Secretary';
  return role ?? 'Admin';
}
