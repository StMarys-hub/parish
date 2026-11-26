import { ReactNode, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  Church,
  Film,
  Flame,
  HeartHandshake,
  Link2,
  Megaphone,
  Paperclip,
  Pin,
  Share2,
  ShieldCheck,
  Star,
  Users,
} from 'lucide-react';
import { AttentionBadgesResult } from '../lib/announcementSignals';
import { shareParishNotice } from '../lib/shareNotice';
import { cleanAnnouncementTitle, stripFormattingMarkers } from '../lib/textFormat';
import {
  AnnouncementPriority,
  CardTitleColor,
  normalizeAnnouncementPriority,
  ReactionSummary,
  ReactionTargetType,
} from '../types/parish';
import { ReactionButton } from './ReactionButton';
import { SwipeableAnnouncementCard } from './SwipeableAnnouncementCard';
import { TITLE_COLOR_TEXT_CLASSES } from './TitleColorPicker';
import { UnreadDotBadge } from './UnreadDotBadge';

interface CollapsibleAnnouncementCardProps {
  id: string;
  title: string;
  titleColor?: CardTitleColor | null;
  priority?: AnnouncementPriority | null;
  previewText: string;
  categoryLabel: string;
  dateTimeLabel?: string | null;
  locationLabel?: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  unread?: boolean;
  onDwellMarkRead?: () => void;
  canMoveToRead?: boolean;
  onMarkDoneAndMove?: () => void;
  badges?: AttentionBadgesResult;
  isPinned?: boolean;
  featuredLabel?: string | null;
  highlighted?: boolean;
  reactionTargetType?: ReactionTargetType;
  reactionSummary?: ReactionSummary;
  onToggleReaction?: (targetType: ReactionTargetType, targetId: string) => void;
  children: ReactNode;
}

function getAccentVisuals(categoryLabel: string, highlighted?: boolean) {
  const lower = categoryLabel.toLowerCase();
  if (lower.includes('urgent')) {
    return {
      barClass: 'bg-rose-600',
      iconWrapClass: 'bg-rose-50 text-rose-700',
      pillClass: 'border-rose-200 bg-rose-50 text-rose-700',
      Icon: AlertTriangle,
    };
  }
  if (lower.includes('media') || lower.includes('highlight')) {
    return {
      barClass: 'bg-sky-600',
      iconWrapClass: 'bg-sky-50 text-sky-700',
      pillClass: 'border-sky-200 bg-sky-50 text-sky-700',
      Icon: Film,
    };
  }
  if (lower.includes('liturg') || lower.includes('sunday')) {
    return {
      barClass: 'bg-parish-navy',
      iconWrapClass: 'bg-parish-navy/10 text-parish-navy',
      pillClass: 'border-parish-navy/20 bg-parish-navy/8 text-parish-navy',
      Icon: Church,
    };
  }
  if (lower.includes('youth') || lower.includes('cml') || lower.includes('event')) {
    return {
      barClass: 'bg-amber-600',
      iconWrapClass: 'bg-amber-50 text-amber-800',
      pillClass: 'border-amber-200 bg-amber-50 text-amber-800',
      Icon: Flame,
    };
  }
  if (highlighted || lower.includes('special') || lower.includes('vicar')) {
    return {
      barClass: 'bg-parish-gold',
      iconWrapClass: 'bg-parish-gold-soft text-parish-gold-ink',
      pillClass: 'border-parish-gold/40 bg-parish-gold-soft text-parish-gold-ink',
      Icon: Megaphone,
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
  if (
    lower.includes('ward') ||
    lower.includes('community') ||
    lower.includes('ministry') ||
    lower.includes('forum') ||
    lower.includes('joseph')
  ) {
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
  titleColor,
  priority,
  previewText,
  categoryLabel,
  dateTimeLabel,
  locationLabel,
  isExpanded,
  onToggle,
  unread = false,
  onDwellMarkRead,
  canMoveToRead = false,
  onMarkDoneAndMove,
  badges,
  isPinned = false,
  featuredLabel,
  highlighted = false,
  reactionTargetType,
  reactionSummary,
  onToggleReaction,
  children,
}: CollapsibleAnnouncementCardProps) {
  const { barClass, iconWrapClass, pillClass, Icon } = getAccentVisuals(categoryLabel, highlighted);
  const reactionCount = reactionSummary?.count ?? 0;

  // Graceful 400ms badge fade-out after expanding / dwelling (>= 1.2s total transition)
  const [dismissingBadge, setDismissingBadge] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<'shared' | 'copied' | null>(null);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await shareParishNotice({
      title,
      body: previewText,
      dateTimeLabel,
      locationLabel,
    });
    if (res === 'shared' || res === 'copied') {
      setShareFeedback(res);
      window.setTimeout(() => setShareFeedback(null), 2000);
    }
  };

  useEffect(() => {
    if (!isExpanded || !unread) {
      setDismissingBadge(false);
      return;
    }

    const fadeTimer = window.setTimeout(() => {
      setDismissingBadge(true);
    }, 800);

    const commitTimer = window.setTimeout(() => {
      onDwellMarkRead?.();
      setDismissingBadge(false);
    }, 1200);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(commitTimer);
    };
  }, [isExpanded, unread, onDwellMarkRead]);

  const handleHeaderKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!canMoveToRead || !onMarkDoneAndMove) return;
    if (e.key === 'Delete' || e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      onMarkDoneAndMove();
    }
  };

  const effectivePriority = normalizeAnnouncementPriority(priority);
  const isUrgentTier = effectivePriority === 'urgent';
  const isImportantTier = effectivePriority === 'important';
  const isMutedRead = !unread && !highlighted && !isExpanded && effectivePriority === 'normal';
  const showUnreadOrNew = unread || dismissingBadge;

  const articleToneClass = isUrgentTier
    ? unread
      ? 'border-rose-300 ring-1 ring-rose-200/90 shadow-sm'
      : 'border-rose-200/90 ring-1 ring-rose-100/70'
    : isImportantTier
      ? unread
        ? 'border-parish-gold/65 ring-1 ring-parish-gold/30 shadow-xs'
        : 'border-parish-gold/45 ring-1 ring-parish-gold/15'
      : highlighted
        ? 'border-parish-gold/55 ring-1 ring-parish-gold/25'
        : unread
          ? 'border-rose-200/90 ring-1 ring-rose-100'
          : 'border-parish-border/80';

  const headerToneClass = isUrgentTier
    ? unread
      ? 'bg-rose-50/70 hover:bg-rose-50/95'
      : 'bg-rose-50/35 hover:bg-rose-50/60'
    : isImportantTier
      ? unread
        ? 'bg-parish-gold-soft/55 hover:bg-parish-gold-soft/75'
        : 'bg-parish-gold-soft/25 hover:bg-parish-gold-soft/45'
      : highlighted && !isExpanded
        ? 'bg-parish-gold-soft/30 hover:bg-parish-gold-soft/45'
        : isMutedRead
          ? 'bg-parish-canvas/25 hover:bg-parish-canvas/55'
          : 'hover:bg-parish-canvas/55';

  const resolvedBarClass = isUrgentTier
    ? 'w-1.5 bg-rose-600'
    : isImportantTier
      ? 'w-1 bg-parish-gold'
      : `w-1 ${barClass}`;

  const resolvedTitleColorClass =
    titleColor && TITLE_COLOR_TEXT_CLASSES[titleColor]
      ? TITLE_COLOR_TEXT_CLASSES[titleColor]
      : isUrgentTier
        ? 'text-rose-800'
        : isImportantTier
          ? 'text-parish-navy'
          : isMutedRead
            ? 'text-parish-ink/85'
            : 'text-parish-ink';

  const showUrgentBadge = isUrgentTier && categoryLabel.toLowerCase() !== 'urgent';

  const cardElement = (
    <article
      className={`overflow-hidden rounded-2xl border bg-white shadow-2xs transition-all hover:shadow-sm ${articleToneClass}`}
    >
      {/* Clickable Summary Header (Minimum 56px touch target, 12px horizontal padding, zero scroll jumps) */}
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={onToggle}
        onKeyDown={handleHeaderKeyDown}
        className={`flex min-h-[56px] w-full items-stretch gap-2.5 px-3 py-3 text-left transition-all active:scale-[0.99] ${headerToneClass}`}
      >
        {/* Pre-Attentive Left Accent Bar (4px+ crimson for Urgent, gold for Important, category bar for Normal) */}
        <span
          className={`shrink-0 rounded-full transition-opacity duration-300 ${resolvedBarClass} ${
            isMutedRead ? 'opacity-40' : 'opacity-100'
          }`}
          aria-hidden="true"
        />

        {/* Category / Priority Icon */}
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-opacity duration-300 ${
            isUrgentTier
              ? 'bg-rose-100 text-rose-700'
              : isImportantTier
                ? 'bg-parish-gold-soft text-parish-gold-ink'
                : iconWrapClass
          } ${isMutedRead ? 'opacity-70' : 'opacity-100'}`}
          aria-hidden="true"
        >
          {isUrgentTier ? (
            <AlertTriangle className="h-4 w-4" />
          ) : isImportantTier ? (
            <Star className="h-4 w-4 fill-current" />
          ) : (
            <Icon className="h-4 w-4" />
          )}
        </span>

        {/* Middle Content: Micro-Badges -> Title -> 1-line Snippet & Meta */}
        <div className="min-w-0 flex-1 space-y-1">
          {/* Top Micro-Badge Row */}
          <div className="flex flex-wrap items-center gap-1.5">
            {showUnreadOrNew && (
              <UnreadDotBadge
                unread={unread}
                dismissing={dismissingBadge}
                showNewPill={true}
              />
            )}
            {showUrgentBadge && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-2xs">
                <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
                Urgent
              </span>
            )}
            {isImportantTier && (
              <span className="inline-flex items-center gap-1 rounded-full border border-parish-gold/50 bg-parish-gold-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-parish-gold-ink">
                <Star className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                Important
              </span>
            )}
            {(isPinned || featuredLabel?.toLowerCase() === 'pinned') && (
              <span
                role="img"
                aria-label="Pinned notice"
                title="Pinned notice"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-parish-gold/40 bg-parish-gold-soft text-parish-gold"
              >
                <Pin className="h-3 w-3 fill-current" aria-hidden="true" />
              </span>
            )}
            {featuredLabel && featuredLabel.toLowerCase() !== 'pinned' && (
              <span className="rounded-full bg-parish-navy px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                {featuredLabel}
              </span>
            )}
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${pillClass}`}>
              {categoryLabel}
            </span>
            {badges?.urgencyLabel && !isUrgentTier && (
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

          {/* Title (Priority-weighted color & bold hierarchy; explicit titleColor overrides if chosen) */}
          <h3
            className={`line-clamp-2 text-[16px] leading-snug sm:text-[17px] ${
              isMutedRead ? 'font-semibold' : 'font-bold'
            } ${resolvedTitleColorClass}`}
          >
            {cleanAnnouncementTitle(title) || title}
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
              <span className="min-w-0 flex-1 truncate">{stripFormattingMarkers(previewText)}</span>
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
          <div className="border-t border-parish-border/80 px-3 pb-3.5 pt-2.5">
            {children}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-parish-border/60 pt-3">
              <div>
                {canMoveToRead && onMarkDoneAndMove && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkDoneAndMove();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-parish-border bg-parish-canvas px-3 py-1 text-xs font-semibold text-parish-navy transition-colors hover:bg-parish-navy hover:text-white"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Done / Move to Bottom
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleShare}
                  title="Share notice to WhatsApp or copy link"
                  aria-label={`Share ${title}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-parish-border bg-white px-2.5 py-1 text-xs font-semibold text-parish-muted transition-colors hover:bg-parish-canvas hover:text-parish-navy"
                >
                  <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {shareFeedback === 'copied'
                      ? 'Copied!'
                      : shareFeedback === 'shared'
                        ? 'Shared!'
                        : 'Share'}
                  </span>
                </button>

                {reactionTargetType && onToggleReaction && (
                  <ReactionButton
                    targetType={reactionTargetType}
                    targetId={id}
                    summary={reactionSummary}
                    onToggle={onToggleReaction}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );

  return (
    <SwipeableAnnouncementCard
      enabled={Boolean(canMoveToRead && onMarkDoneAndMove)}
      onSwipeDone={() => onMarkDoneAndMove?.()}
    >
      {cardElement}
    </SwipeableAnnouncementCard>
  );
}
