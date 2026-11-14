import { useMemo } from 'react';
import { CalendarClock, Clock, MapPin } from 'lucide-react';
import { RegularScheduleItem, WeeklyBulletin } from '../../types/parish';

interface SchedulesViewProps {
  regularSchedules: RegularScheduleItem[];
  activeBulletin?: WeeklyBulletin;
}

export function SchedulesView({ regularSchedules, activeBulletin }: SchedulesViewProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, RegularScheduleItem[]>();
    for (const item of regularSchedules) {
      const list = map.get(item.group_name) ?? [];
      list.push(item);
      map.set(item.group_name, list);
    }
    return Array.from(map.entries());
  }, [regularSchedules]);

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-[#E7E2DA] bg-white p-4">
        <h2 className="text-lg font-bold text-[#1E293B]">Parish Schedules</h2>
        <p className="mt-1 text-sm text-[#526071]">
          Standard weekly Holy Qurbana, Rosary, Novena, and Adoration timings. Check the{' '}
          <strong>Bulletin</strong> tab for feast-day additions or guest priest notices.
        </p>
      </header>

      {/* Active Week Quick Notice */}
      {activeBulletin && activeBulletin.daily_schedule.length > 0 && (
        <section className="rounded-2xl border border-[#B8860B]/30 bg-[#FEF7E0]/60 p-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-[#8A6508]" />
            <h3 className="text-sm font-bold text-[#1E293B]">
              Special Observances ({activeBulletin.title})
            </h3>
          </div>
          <ul className="mt-2 space-y-1 text-xs text-[#1E293B]">
            {activeBulletin.daily_schedule
              .filter((d) => d.feastNote)
              .map((d) => (
                <li key={d.date}>
                  <strong>{d.dayLabel}:</strong> {d.feastNote}
                </li>
              ))}
            {activeBulletin.daily_schedule.every((d) => !d.feastNote) && (
              <li className="text-[#526071]">Standard weekday & Sunday timings apply this week.</li>
            )}
          </ul>
        </section>
      )}

      {/* Regular Recurring Schedule Groups */}
      <div className="space-y-4">
        {grouped.map(([groupName, items]) => (
          <section
            key={groupName}
            className="overflow-hidden rounded-2xl border border-[#E7E2DA] bg-white shadow-2xs"
          >
            <div className="border-b border-[#E7E2DA] bg-[#1E3A5F] px-4 py-2.5">
              <h3 className="text-sm font-bold tracking-wide text-white">{groupName}</h3>
            </div>
            <div className="divide-y divide-[#E7E2DA]">
              {items.map((item) => (
                <div key={item.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#B8860B]">
                      {item.day_label}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-lg bg-[#FAF8F5] px-2.5 py-1 text-xs font-bold text-[#1E3A5F]">
                      <Clock className="h-3.5 w-3.5" />
                      {item.time_label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-base font-bold text-[#1E293B]">{item.title}</p>
                  {item.location && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-[#526071]">
                      <MapPin className="h-3.5 w-3.5 text-[#1E3A5F]" />
                      {item.location}
                    </p>
                  )}
                  {item.notes && (
                    <p className="mt-1.5 text-xs leading-relaxed text-[#526071]">{item.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
