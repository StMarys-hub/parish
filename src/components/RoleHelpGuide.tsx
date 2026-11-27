import { HelpCircle, ShieldCheck } from 'lucide-react';
import { AdminRole, formatRoleLabel } from '../types/parish';
import { HelpGuideModal } from './HelpGuideModal';

export type HelpTopicId =
  | 'parishioner_bulletin'
  | 'parishioner_schedules'
  | 'parishioner_about'
  | 'parishioner_reimbursements'
  | 'admin_composer'
  | 'admin_special'
  | 'admin_ministries'
  | 'admin_reimbursements'
  | 'admin_schedules'
  | 'admin_parish'
  | 'admin_users'
  | 'admin_theme'
  | 'admin_audit';

interface HelpBullet {
  label: string;
  detail: string;
}

interface HelpTopicContent {
  title: string;
  subtitle: string;
  audience: string;
  bullets: HelpBullet[];
  tip?: string;
}

const ROLE_PERMISSION_SUMMARY: Record<AdminRole, string> = {
  super_admin:
    'Full Vicar / Super Admin access: publish & delete weekly bulletins, special notices, ministry updates, schedules, parish info, liturgical theme, reimbursement approvals, user & role management, and audit logs.',
  vicar:
    'Full Vicar access: publish & delete weekly bulletins, special notices, ministry updates, schedules, parish info, liturgical theme, reimbursement approvals, user & role management, and audit logs.',
  trustee:
    'Trustee access: publish bulletins, special notices, ministry updates, schedules, and parish info; review, approve, mark paid, export CSV, and download private receipts in Reimbursements. Deleting bulletins and managing roles are restricted to the Vicar / Super Admin.',
  secretary:
    'Secretary access: draft & publish weekly bulletins, special notices, ministry updates, schedules, and parish info. Reimbursement approvals, theme overrides, and user role management are restricted to Trustees & Vicar.',
};

export const ROLE_HELP_CONTENT: Record<HelpTopicId, HelpTopicContent> = {
  parishioner_bulletin: {
    title: 'Parish Bulletin & Notices Guide',
    subtitle: 'Quick tips for reading weekly announcements and special notices.',
    audience: 'Parishioner',
    bullets: [
      {
        label: '3-Tier Priority Cards',
        detail:
          'Urgent notices appear in crimson at the top, Important items in warm gold, and routine updates in clean white so you never miss critical changes.',
      },
      {
        label: 'Unread vs. Read',
        detail:
          'Tap any card to read it. Opened unread cards stay in place while you read, then move smoothly to Read when collapsed. Tap a Read card to expand it right in place.',
      },
      {
        label: 'Instant Search (Last 4 Weeks)',
        detail:
          'Tap the Search icon in the top banner to search Special Notices, Weekly Announcements, Ministry Updates, and daily schedules. Selected hits open on top and return to Current Week when closed.',
      },
      {
        label: 'Calendar, Share & Archive',
        detail:
          'Use Add to Calendar (.ics or Google Calendar) on dated events, tap Share to forward via WhatsApp/Messages, or switch weeks using the top-right week selector.',
      },
    ],
    tip: 'You can adjust reading text size (A- / A+) and push alerts anytime under Parish → Settings.',
  },
  parishioner_schedules: {
    title: 'Holy Qurbana & Parish Schedules',
    subtitle: 'View weekly and recurring parish liturgical timings.',
    audience: 'Parishioner',
    bullets: [
      {
        label: 'This Week’s Daily Schedule',
        detail:
          'Shows day-by-day Holy Qurbana, feast notes, and special liturgical timings for the current week, with Today highlighted.',
      },
      {
        label: 'Regular Parish Timings',
        detail:
          'Displays standard weekday/Sunday Qurbana, Confession, Adoration, Novena, and CCD/Catechism schedules.',
      },
      {
        label: 'Offline Ready',
        detail:
          'Schedules are cached automatically on your phone so you can check Mass times even with weak signal inside the church.',
      },
    ],
  },
  parishioner_about: {
    title: 'Parish Directory, Services & Settings',
    subtitle: 'Find church info, official links, reimbursements, and app preferences.',
    audience: 'Parishioner',
    bullets: [
      {
        label: 'Church Info',
        detail:
          'One-tap GPS Directions, Call, Email Vicar, Parish Leadership contacts, and official stmarysyroclt.org pages that open cleanly right inside the app.',
      },
      {
        label: 'Services',
        detail:
          'Open the Parish On Net member portal, submit or track ministry Expense Reimbursements, or install/share the Parish App.',
      },
      {
        label: 'Settings',
        detail:
          'Enable or disable push notifications, adjust Reading Text Size (A- / A+), and access the Vicar & Trustee Admin Portal (authorized staff only).',
      },
    ],
  },
  parishioner_reimbursements: {
    title: 'Expense Reimbursement Guide',
    subtitle: 'How ministry members submit bills and track trustee payouts.',
    audience: 'Parishioner / Ministry Member',
    bullets: [
      {
        label: '1. Sign In on This Device',
        detail:
          'Sign in with Email + Password, Email Device Link, or Device Passkey. First-time users are approved once by a Parish Trustee or Vicar.',
      },
      {
        label: '2. Submit Receipt',
        detail:
          'Select your Ministry, enter expense date, dollar amount, payout method (Check, Zelle, or Direct Reimbursement), and attach a photo or PDF receipt (images compress automatically).',
      },
      {
        label: '3. Track Status',
        detail:
          'Switch to My Submissions to view your Reference Code and live status: Pending Review → Approved → Paid (or Needs Info if a trustee left a note).',
      },
    ],
    tip: 'Your receipts are stored privately and are visible only to you and authorized Parish Trustees/Vicar.',
  },
  admin_composer: {
    title: 'Weekly Bulletin Composer Help',
    subtitle: 'Create, format, schedule, and publish the weekly parish bulletin.',
    audience: 'Vicar / Trustee / Secretary',
    bullets: [
      {
        label: 'Smart Paste & Inline Schedule',
        detail:
          'Paste raw Word/WhatsApp text in Quick Paste or edit individual cards and daily Holy Qurbana times directly in Card Editor.',
      },
      {
        label: 'Priority, Title Color & Rich Text',
        detail:
          'Each card defaults to Normal (upgrade to Important or Urgent when needed), supports 1-tap Title Color, and Bold / Text Color / Highlight formatting in descriptions.',
      },
      {
        label: 'Publish Now vs. Schedule',
        detail:
          'Save Draft to work privately, Publish & Notify to go live immediately (with optional Push), or set a future Schedule Publish date/time.',
      },
    ],
    tip: 'Click the composer’s "Help" button for sample bulletin paste templates.',
  },
  admin_special: {
    title: 'Special Notices Help',
    subtitle: 'Publish standalone Vicar notes, liturgical timetables, and urgent alerts.',
    audience: 'Vicar / Trustee / Secretary',
    bullets: [
      {
        label: 'Smart WhatsApp/Word Cleanup',
        detail:
          'Paste naturally — WhatsApp *bold*, numbered/bulleted lists, timestamps, Mission venues, and Google Drive/YouTube links auto-format into structured cards.',
      },
      {
        label: 'Priority, Pinning & Event Date',
        detail:
          'Defaults to Normal priority, unpinned, Vicar Note category, and Today at 7:00 PM (click Clear if no calendar date is needed).',
      },
      {
        label: 'Optional Instant Push & Scheduling',
        detail:
          'Instant push is unchecked by default to avoid alert fatigue — check it only for urgent new notices, or schedule a future publish time.',
      },
    ],
    tip: 'Use the composer’s "Help & Templates" button to load ready-to-edit Sample Templates A, B, or C.',
  },
  admin_ministries: {
    title: 'Ministry Updates Manager Help',
    subtitle: 'Post updates for CCD, CML, Jesus Youth, Choir, and Parish Ministries.',
    audience: 'Vicar / Trustee / Secretary',
    bullets: [
      {
        label: 'Grouped by Ministry',
        detail:
          'Published updates appear under the Ministry pill on the home feed and are searchable via Instant Search.',
      },
      {
        label: 'Rich Formatting & Links',
        detail:
          'Use **bold**, colors, highlights, numbered/bulleted lists, and an optional HTTPS registration or flyer link.',
      },
      {
        label: 'Archive When Finished',
        detail:
          'Edit or archive past ministry updates once an event ends to keep the Ministry tab fresh.',
      },
    ],
  },
  admin_reimbursements: {
    title: 'Trustee Reimbursement Queue Help',
    subtitle: 'Review claims, download receipts, approve payouts, and export monthly CSVs.',
    audience: 'Trustee / Vicar',
    bullets: [
      {
        label: 'Review & Download Receipts',
        detail:
          'Each claim shows the submitter, ministry, amount, and private receipt. Downloading saves the file with the owner name & reference code (use Change/Reset Folder on supported desktop browsers).',
      },
      {
        label: 'Status Workflow & Notes',
        detail:
          'Move claims from Pending Review → Approved → Paid, or Decline with a clear trustee note explaining what is needed.',
      },
      {
        label: 'Monthly Summary & CSV Export',
        detail:
          'Filter by month/status and click Export CSV for parish accounting records and trustee meetings.',
      },
    ],
  },
  admin_schedules: {
    title: 'Regular Schedules Editor Help',
    subtitle: 'Maintain recurring Holy Qurbana, Confession, Adoration, and CCD timings.',
    audience: 'Vicar / Trustee / Secretary',
    bullets: [
      {
        label: 'Recurring Parish Timings',
        detail:
          'These items power the Schedules tab and serve as the fallback for the home banner’s "Next Service" chip when no daily override exists.',
      },
      {
        label: 'Ordering & Active Toggle',
        detail:
          'Use Sort Order to control display sequence and toggle Active off to temporarily hide seasonal schedules without deleting them.',
      },
    ],
  },
  admin_parish: {
    title: 'Parish Info Editor Help',
    subtitle: 'Update church contact details, GPS link, leadership, and office hours.',
    audience: 'Vicar / Trustee / Secretary',
    bullets: [
      {
        label: 'Public Directory Sync',
        detail:
          'Changes immediately update the Parish → Church Info tab, header parish name, GPS Directions link, and Call/Email buttons.',
      },
      {
        label: 'Leadership Roster',
        detail:
          'Add, edit, or reorder Parish Trustees and contact details whenever leadership terms rotate.',
      },
    ],
  },
  admin_users: {
    title: 'Users & Roles Management Help',
    subtitle: 'Invite staff, manage RBAC permissions, and approve reimbursement submitters.',
    audience: 'Vicar / Super Admin',
    bullets: [
      {
        label: 'Role Hierarchy (RBAC)',
        detail:
          'Super Admin / Vicar has full control; Trustees can publish & process reimbursements; Secretaries can draft & publish bulletins/notices.',
      },
      {
        label: 'Safe Deactivation',
        detail:
          'Deactivate former trustees/secretaries immediately when terms end — their audit history is preserved while portal access is revoked.',
      },
      {
        label: 'Reimbursement Access Approvals',
        detail:
          'Approve or revoke parishioner accounts requesting access to submit ministry expense receipts.',
      },
    ],
  },
  admin_theme: {
    title: 'Liturgical Theme Control Help',
    subtitle: 'Automatic Syro-Malabar liturgical seasons or manual theme override.',
    audience: 'Vicar / Super Admin',
    bullets: [
      {
        label: 'Auto Liturgical Calendar (Recommended)',
        detail:
          'Automatically switches colors and header badges across Annunciation, Nativity, Epiphany, Great Lent, Resurrection, Apostles, Summer, Elijah–Cross–Moses, and Dedication of the Church.',
      },
      {
        label: 'Manual Override',
        detail:
          'Pin a specific liturgical palette for feast days or special parish celebrations, and switch back to Auto anytime.',
      },
    ],
  },
  admin_audit: {
    title: 'Audit Logs Help',
    subtitle: 'Read-only accountability log of administrative actions.',
    audience: 'Vicar / Trustee / Secretary',
    bullets: [
      {
        label: 'Immutable Governance Trail',
        detail:
          'Records who published bulletins, updated schedules, changed themes, modified roles, or deleted items along with timestamps.',
      },
      {
        label: 'Security Review',
        detail:
          'Audit logs cannot be edited or deleted from the UI, supporting transparent parish stewardship.',
      },
    ],
  },
};

interface HelpIconButtonProps {
  onClick: () => void;
  label?: string;
  compact?: boolean;
}

export function HelpIconButton({
  onClick,
  label = 'Open contextual help',
  compact = false,
}: HelpIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={
        compact
          ? 'flex h-9 w-9 items-center justify-center rounded-xl border border-parish-border bg-parish-canvas text-parish-navy transition-colors hover:bg-slate-100'
          : 'inline-flex items-center gap-1 rounded-lg border border-parish-border bg-parish-canvas px-2.5 py-1.5 text-xs font-semibold text-parish-navy transition-colors hover:bg-slate-100'
      }
    >
      <HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!compact && <span>Help</span>}
    </button>
  );
}

interface RoleHelpModalProps {
  open: boolean;
  onClose: () => void;
  topicId: HelpTopicId;
  adminRole?: AdminRole | null;
}

export function RoleHelpModal({ open, onClose, topicId, adminRole }: RoleHelpModalProps) {
  const guide = ROLE_HELP_CONTENT[topicId];

  return (
    <HelpGuideModal open={open} onClose={onClose} title={guide.title} subtitle={guide.subtitle}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-parish-navy/10 px-2.5 py-0.5 text-[11px] font-bold text-parish-navy">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Role View: {adminRole ? formatRoleLabel(adminRole) : guide.audience}
        </span>
      </div>

      {adminRole && (
        <div className="rounded-xl border border-parish-navy/20 bg-parish-navy/[0.04] px-3.5 py-2.5 text-xs leading-relaxed text-parish-ink">
          <strong className="font-bold text-parish-navy">Your Role Permissions:</strong>{' '}
          {ROLE_PERMISSION_SUMMARY[adminRole]}
        </div>
      )}

      <div className="rounded-xl border border-[#E7E2DA] bg-[#FAF8F5] p-3.5 text-xs leading-relaxed text-[#526071]">
        <ul className="list-disc space-y-2 pl-4">
          {guide.bullets.map((b) => (
            <li key={b.label}>
              <strong className="text-[#1E293B]">{b.label}:</strong> {b.detail}
            </li>
          ))}
        </ul>
      </div>

      {guide.tip && (
        <p className="rounded-xl border border-parish-gold/35 bg-parish-gold-soft/55 px-3.5 py-2 text-xs font-medium text-parish-gold-ink">
          <strong>Tip:</strong> {guide.tip}
        </p>
      )}
    </HelpGuideModal>
  );
}
