interface UnreadDotBadgeProps {
  unread: boolean;
}

/**
 * Compact crimson indicator dot displayed on announcement cards until tapped or read.
 */
export function UnreadDotBadge({ unread }: UnreadDotBadgeProps) {
  if (!unread) return null;

  return (
    <span
      title="Unread announcement — tap card to mark as read"
      className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700"
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
      </span>
      New
    </span>
  );
}
