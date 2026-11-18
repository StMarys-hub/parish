import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ScrollablePillBarProps {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
}

export function ScrollablePillBar({ ariaLabel, children, className = '' }: ScrollablePillBarProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const syncScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(maxScroll - el.scrollLeft > 4);
  }, []);

  useEffect(() => {
    syncScrollState();
    const el = scrollerRef.current;
    if (!el) return;

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncScrollState) : null;
    ro?.observe(el);
    window.addEventListener('resize', syncScrollState);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', syncScrollState);
    };
  }, [children, syncScrollState]);

  const scrollByStep = (delta: number) => {
    scrollerRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const maskClass =
    canScrollLeft && canScrollRight
      ? 'parish-pill-mask-both'
      : canScrollRight
        ? 'parish-pill-mask-right'
        : canScrollLeft
          ? 'parish-pill-mask-left'
          : '';

  return (
    <div className={`relative min-w-0 flex-1 ${className}`}>
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label={ariaLabel}
        onScroll={syncScrollState}
        className={`no-scrollbar flex flex-nowrap items-center gap-1.5 overflow-x-auto scroll-smooth ${maskClass}`}
      >
        {children}
      </div>

      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByStep(-140)}
          aria-label="Scroll categories left"
          className="absolute left-0.5 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-parish-border/80 bg-white/85 text-parish-navy shadow-xs backdrop-blur-xs transition-opacity hover:bg-white"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}

      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByStep(140)}
          aria-label="Scroll categories right"
          className="absolute right-0.5 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-parish-border/80 bg-white/85 text-parish-navy shadow-xs backdrop-blur-xs transition-opacity hover:bg-white"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
