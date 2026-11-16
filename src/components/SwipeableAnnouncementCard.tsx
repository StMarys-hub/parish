import { ReactNode, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

interface SwipeableAnnouncementCardProps {
  enabled: boolean;
  onSwipeDone: () => void;
  children: ReactNode;
}

/**
 * Lightweight 60fps touch-gesture wrapper (zero external dependencies):
 * - Enforces vertical-scroll lock (`|dx| > |dy| * 1.5`) so normal scrolling never misfires.
 * - Swiping >= 35% width reveals a Liturgical-Theme backdrop cue + haptic buzz,
 *   slides the card smoothly out (250ms), collapses height, and moves to Read section.
 */
export function SwipeableAnnouncementCard({
  enabled,
  onSwipeDone,
  children,
}: SwipeableAnnouncementCardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const axisRef = useRef<'none' | 'horizontal' | 'vertical'>('none');
  const vibratedRef = useRef(false);

  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [thresholdReached, setThresholdReached] = useState(false);
  const [exiting, setExiting] = useState(false);

  if (!enabled) {
    return <>{children}</>;
  }

  const getWidth = () => containerRef.current?.offsetWidth || 320;

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (exiting || e.touches.length !== 1) return;
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    axisRef.current = 'none';
    vibratedRef.current = false;
    setThresholdReached(false);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (exiting || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - startXRef.current;
    const dy = e.touches[0].clientY - startYRef.current;

    if (axisRef.current === 'none') {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dx) > Math.abs(dy) * 1.5) {
        axisRef.current = 'horizontal';
        setDragging(true);
      } else {
        axisRef.current = 'vertical';
        return;
      }
    }

    if (axisRef.current !== 'horizontal') return;

    const width = getWidth();
    const crossed = Math.abs(dx) >= width * 0.35;
    setThresholdReached(crossed);
    if (crossed && !vibratedRef.current) {
      vibratedRef.current = true;
      navigator.vibrate?.(15);
    } else if (!crossed) {
      vibratedRef.current = false;
    }

    // Clamp max drag slightly inside container width for tactile resistance
    const clamped = Math.max(-width * 0.85, Math.min(width * 0.85, dx));
    setDragX(clamped);
  };

  const finishDrag = () => {
    if (axisRef.current !== 'horizontal') {
      axisRef.current = 'none';
      return;
    }

    const width = getWidth();
    setDragging(false);
    axisRef.current = 'none';

    if (Math.abs(dragX) >= width * 0.35) {
      const direction = dragX >= 0 ? 1 : -1;
      setExiting(true);
      setDragX(direction * (width + 48));
      window.setTimeout(() => {
        onSwipeDone();
      }, 240);
    } else {
      setDragX(0);
      setThresholdReached(false);
    }
  };

  const showBackdrop = dragging && Math.abs(dragX) > 12;

  return (
    <div
      ref={containerRef}
      className="parish-swipe-collapse relative overflow-hidden rounded-2xl"
      data-collapsing={exiting ? 'true' : 'false'}
      style={{ touchAction: 'pan-y' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={finishDrag}
      onTouchCancel={finishDrag}
    >
      <div className="parish-accordion-inner relative">
        {/* Underlying Swipe Reveal Backdrop */}
        {(showBackdrop || exiting) && (
          <div
            aria-hidden="true"
            className={`absolute inset-0 flex items-center justify-between rounded-2xl px-4 text-xs font-bold transition-colors ${
              thresholdReached || exiting
                ? 'bg-parish-navy text-white'
                : 'bg-parish-gold-soft text-parish-navy'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              Mark as Read &amp; Move to Bottom
            </span>
            <span className="inline-flex items-center gap-1.5">
              Mark as Read &amp; Move to Bottom
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
        )}

        {/* GPU-translated Foreground Card */}
        <div
          style={{
            transform: `translate3d(${dragX}px, 0, 0)`,
            transition: dragging
              ? 'none'
              : 'transform 250ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
