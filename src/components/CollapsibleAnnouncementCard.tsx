import { ReactNode } from 'react';
import {
  BookOpen,
  Calendar,
  ChevronDown,
  Church,
  HeartHandshake,
  Link2,
  Megaphone,
  Paperclip,
  ShieldCheck,
  Flame,
  Users,
} from 'lucide-react';
import { AttentionBadgesResult } from '../lib/announcementSignals';
import { ReactionSummary, ReactionTargetType } from '../types/parish';
import { ReactionButton } from './ReactionButton';
import { UnreadDotBadge } from './UnreadDotBadge';

interface CollapsibleAnnouncementCardProps {
  id: string;
  title: string;
  previewText: string;
  categoryLabel: string;
  dateTimeLabel?: string | null;
  locationLabel?: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  unread?: boolean;
  badges?: AttentionBadgesResult;
  featuredLabel?: string | null;
  highlighted?: boolean;
  reactionTargetType?: ReactionTargetType;
  reactionSummary?: ReactionSummary;
  onToggleReaction?: (targetType: ReactionTargetType, targetId: string) => void;
  children: ReactNode;
}

function getAccentVisuals(categoryLabel: string, highlighted?: boolean) {
  const lower = categoryLabel.toLowerCase();
  if (highlighted || lower.includes('special') || lower.includes('vicar')) {
    return {
      barClass: 'bg-parish-gold',
      iconWrapClass: 'bg-parish-gold-soft text-parish-gold-ink',
      pillClass: 'border-parish-gold/40 bg-parish-gold-soft text-parish-gold-ink',
      Icon: Megaphone,
    };
  }
  if (lower.includes('liturg')) {
    return {
      barClass: 'bg-parish-navy',
      iconWrapClass: 'bg-parish-navy/10 text-parish-navy',
      pillClass: 'border-parish-navy/20 bg-parish-navy/8 text-parish-navy',
      Icon: Church,
    };
  }
  if (lower.includes('catechism') || lower.includes('ccd')) {
    return {
      barClass: 'bg-indigo-600',
      iconWrapClass: 'bg-indigo-50 text-indigo-700',
      pillClass: 'border-indigo-200 bg-indigo-50 text-indigo-700',
      Icon: BookOpen,
    };
  }
  if (lower.includes('youth') || lower.includes('cml')) {
    return {
      barClass: 'bg-amber-600',
      iconWrapClass: 'bg-amber-50 text-amber-800',
      pillClass: 'border-amber-200 bg-amber-50 text-amber-800',
      Icon: Flame,
    };
  }
  if (lower.includes('ward') || lower.includes('community') || lower.includes('ministry') || lower.includes('forum') || lower.includes('joseph')) {
    return {
      barClass: 'bg-teal-600',
      iconWrapClass: 'bg-teal-50 text-teal-800',
      pillClass: 'border-teal-200 bg-teal-50 text-teal-800',
      Icon: Users,
    };
  }
  if (lower.includes('outreach') || lower.includes('charity') || lower.includes('vincent')) {
    return {
      barClass: 'bg-rose-600',
      iconWrapClass: 'bg-rose-50 text-rose-700',
      pillClass: 'border-rose-200 bg-rose-50 text-rose-700',
      Icon: HeartHandshake,
    };
  }
  return {
    barClass: 'bg-parish-navy/70',
    iconWrapClass: 'bg-slate-100 text-slate-700',
    pillClass: 'border-slate-200 bg-slate-100 text-slate-700',
    Icon: ShieldCheck,
  };
}

export function CollapsibleAnnouncementCard({
  id,
  title,
  previewText,
  categoryLabel,
  dateTimeLabel,
  isExpanded,
  onToggle,
  unread = false,
  badges,
  featuredLabel,
  highlighted = false,
  reactionTargetType,
  reactionSummary,
  onToggleReaction,
  children,
}: CollapsibleAnnouncementCardProps) {
  const { barClass, iconWrapClass, pillClass, Icon } = getAccentVisuals(categoryLabel, highlighted);
  const reactionCount = reactionSummary?.count ?? 0;

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-white shadow-2xs transition-shadow hover:shadow-sm ${
        highlighted
          ? 'border-parish-gold/55 ring-1 ring-parish-gold/25'
          : unread
            ? 'border-rose-200 ring-1 ring-rose-100'
            : 'border-parish-border'
      }`}
    >
      {/* Clickable Summary Header (Minimum 48px touch target, zero scroll jumps) */}
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={onToggle}
        className={`flex min-h-[56px] w-full items-stretch gap-3 px-3.5 py-3.5 text-left transition-colors sm:px-4 ${
          highlighted && !isExpanded ? 'bg-parish-gold-soft/30 hover:bg-parish-gold-soft/45' : 'hover:bg-parish-canvas/55'
        }`}
      >
        {/* Pre-Attentive Left Accent Bar */}
        <span className={`w-1 shrink-0 rounded-full ${barClass}`} aria-hidden="true" />

        {/* Category / Ministry Icon */}
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${iconWrapClass}`}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </span>

        {/* Middle Content: Micro-Badges -> Title -> 1-line Snippet & Meta */}
        <div className="min-w-0 flex-1 space-y-1">
          {/* Top Micro-Badge Row */}
          <div className="flex flex-wrap items-center gap-1.5">
            {unread && <UnreadDotBadge unread={true} />}
            {featuredLabel && (
              <span className="rounded-full bg-parish-navy px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                {featuredLabel}
              </span>
            )}
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${pillClass}`}>
              {categoryLabel}
            </span>
            {badges?.isNew48h && !unread && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                NEW
              </span>
            )}
            {badges?.urgencyLabel && (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900">
                {badges.urgencyLabel}
              </span>
            )}
            {badges?.actionRequired && (
              <span className="rounded-full border border-parish-navy/30 bg-parish-navy/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-parish-navy">
                Action Required
              </span>
            )}
          </div>

          {/* High-Contrast Bold Title */}
          <h3 className="line-clamp-2 text-[16px] font-bold leading-snug text-parish-ink sm:text-[17px]">
            {title}
          </h3>

          {/* Sub-Row when collapsed: Date micro-pill + 1-line truncated preview + compact indicators */}
          {!isExpanded && (
            <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs text-parish-muted">
              {dateTimeLabel && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-parish-canvas px-2 py-0.5 text-[11px] font-semibold text-parish-navy">
                  <Calendar className="h-3 w-3 text-parish-gold" />
                  {dateTimeLabel}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">{previewText}</span>
              <span className="inline-flex shrink-0 items-center gap-2 text-[11px] font-medium text-parish-muted">
                {badges?.hasFlyer && (
                  <span className="inline-flex items-center gap-0.5" title="Has Flyer attachment">
                    <Paperclip className="h-3 w-3 text-parish-navy" />
                    Flyer
                  </span>
                )}
                {badges?.hasLink && (
                  <span className="inline-flex items-center gap-0.5" title="Has web link">
                    <Link2 className="h-3 w-3 text-parish-navy" />
                    Link
                  </span>
                )}
                {reactionCount > 0 && <span>🙏 {reactionCount}</span>}
              </span>
            </div>
          )}
        </div>

        {/* Tactile Rotating Chevron */}
        <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-parish-canvas text-parish-navy">
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </span>
      </button>

      {/* GPU-Accelerated Expanded Content Body */}
      <div className="parish-accordion-panel" data-open={isExpanded}>
        <div className="parish-accordion-inner">
          <div className="border-t border-parish-border/80 px-4 pb-4 pt-3 sm:px-5">
            {children}

            {reactionTargetType && onToggleReaction && (
              <div className="mt-4 flex justify-end border-t border-parish-border/60 pt-3">
                <ReactionButton
                  targetType={reactionTargetType}
                  targetId={id}
                  summary={reactionSummary}
                  onToggle={onToggleReaction}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
