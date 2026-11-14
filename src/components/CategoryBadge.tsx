import { AnnouncementCategory } from '../types/parish';

const CATEGORY_STYLES: Record<AnnouncementCategory, string> = {
  Liturgical: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  'Ward Prayer': 'bg-emerald-50 text-emerald-800 border-emerald-200',
  'Catechism/CCD': 'bg-amber-50 text-amber-900 border-amber-200',
  'Youth/Young Adults': 'bg-purple-50 text-purple-800 border-purple-200',
  'Outreach/Charity': 'bg-rose-50 text-rose-800 border-rose-200',
  'Parish Admin': 'bg-slate-100 text-slate-800 border-slate-200',
};

export function CategoryBadge({ category }: { category: AnnouncementCategory }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${
        CATEGORY_STYLES[category] ?? CATEGORY_STYLES['Parish Admin']
      }`}
    >
      {category}
    </span>
  );
}
