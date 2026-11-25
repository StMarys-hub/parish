import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 550);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      title="Back to top"
      className="fixed bottom-20 right-3 z-30 inline-flex items-center gap-1 rounded-full border border-parish-border bg-white/95 px-3 py-1.5 text-xs font-semibold text-parish-navy shadow-md backdrop-blur-xs transition-all hover:bg-parish-navy hover:text-white active:scale-95 sm:bottom-6 sm:right-6"
    >
      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
      <span>Top</span>
    </button>
  );
}
