interface UnreadDotBadgeProps {
  unread: boolean;
  dismissing?: boolean;
  showNewPill?: boolean;
}

/**
 * Displays the crimson unread indicator dot + green `NEW` micro-badge.
 * Supports a smooth 400ms CSS fade/scale collapse (`dismissing=true`) before unmounting.
 */
export function UnreadDotBadge({
  unread,
  dismissing = false,
  showNewPill = true,
}: UnreadDotBadgeProps) {
  if (!unread && !dismissing) return null;

  return (
    <span
      data-dismissing={dismissing ? 'true' : 'false'}
      title="Unread announcement — expand to read or swipe to mark done"
      className="parish-badge-fade items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700"
    >
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
      </span>
      {showNewPill && <span>NEW</span>}
    </span>
  );
}
