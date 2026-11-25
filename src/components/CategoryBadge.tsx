import { AnnouncementCategory, normalizeAnnouncementCategory } from '../types/parish';

const CATEGORY_STYLES: Record<AnnouncementCategory, string> = {
  'Liturgy & Sacraments': 'bg-indigo-50 text-indigo-800 border-indigo-200',
  'Faith & CCD': 'bg-amber-50 text-amber-900 border-amber-200',
  'Youth & Ministries': 'bg-purple-50 text-purple-800 border-purple-200',
  'Parish Events & Wards': 'bg-emerald-50 text-emerald-800 border-emerald-200',
  'General & Parish': 'bg-slate-100 text-slate-800 border-slate-200',
};

export function CategoryBadge({ category }: { category: AnnouncementCategory | string }) {
  const normalized = normalizeAnnouncementCategory(category);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${
        CATEGORY_STYLES[normalized] ?? CATEGORY_STYLES['General & Parish']
      }`}
    >
      {normalized}
    </span>
  );
}
