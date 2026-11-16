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
  | 'THEME_CHANGE'
  | 'REIMBURSEMENT_APPROVED'
  | 'REIMBURSEMENT_PAID'
  | 'REIMBURSEMENT_DECLINED';

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

// ============================================================================
// PHASE 3: REIMBURSEMENTS, SPECIAL ANNOUNCEMENTS, REACTIONS & MINISTRIES
// ============================================================================
export const PARISH_MINISTRIES = [
  'CML',
  'Sunday School / CCD',
  "Marian Women's Forum",
  'Men of St. Joseph',
  'St. Vincent de Paul',
  'Jesus Youth',
  'Choir',
  'Altar Servers',
  'Kitchen / Hospitality',
  'Maintenance',
  'Other',
] as const;

export type PayoutMethod = 'Check' | 'Zelle' | 'Direct Reimbursement';
export type ReimbursementStatus = 'pending_review' | 'approved' | 'paid' | 'declined';

export interface ReimbursementClaim {
  id: string;
  reference_code: string;
  full_name: string;
  contact_info?: string;
  ministry: string;
  expense_date: string;
  amount_cents: number;
  description: string;
  payout_method: PayoutMethod;
  receipt_mime_type?: string | null;
  receipt_file_name?: string | null;
  receipt_signed_url?: string | null;
  status: ReimbursementStatus;
  trustee_notes?: string | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  paid_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SpecialAnnouncement {
  id: string;
  title: string;
  description: string;
  event_date_label?: string | null;
  location_label?: string | null;
  maps_url?: string | null;
  web_url?: string | null;
  web_link_label?: string | null;
  flyer_url?: string | null;
  flyer_storage_path?: string | null;
  flyer_mime_type?: string | null;
  is_pinned: boolean;
  status: 'published' | 'archived';
  published_at: string;
  updated_at: string;
}

export interface MinistryUpdate {
  id: string;
  ministry_name: string;
  title: string;
  body: string;
  week_label?: string | null;
  event_date_label?: string | null;
  location_label?: string | null;
  action_url?: string | null;
  action_label?: string | null;
  status: 'published' | 'archived';
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type ReactionTargetType = 'bulletin' | 'special' | 'ministry';

export interface ReactionSummary {
  count: number;
  reactedByMe: boolean;
}

export type ReimbursementGateMode =
  | 'pin_and_login'
  | 'allowlist_only'
  | 'login_with_rate_limit';

export interface ReimbursementAccessStatus {
  email: string;
  isAdmin: boolean;
  gateMode: ReimbursementGateMode;
  hasPinConfigured: boolean;
  canSubmit: boolean;
  isBlocked: boolean;
  isApproved: boolean;
  pinVerified: boolean;
  maxPer24h: number;
  remainingToday: number;
}

export interface ReimbursementSecurityConfig {
  gateMode: ReimbursementGateMode;
  hasPinConfigured: boolean;
  maxSubmissionsPer24h: number;
  updatedAt?: string | null;
}

export interface ReimbursementSubmitter {
  email: string;
  full_name?: string | null;
  ministry?: string | null;
  is_approved: boolean;
  is_blocked: boolean;
  pin_verified_at?: string | null;
  updated_at: string;
}
