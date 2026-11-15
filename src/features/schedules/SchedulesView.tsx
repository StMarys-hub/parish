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
      <header className="rounded-2xl border border-parish-border bg-white p-4">
        <h2 className="text-lg font-bold text-parish-ink">Parish Schedules</h2>
        <p className="mt-1 text-sm text-parish-muted">
          Standard weekly Holy Qurbana, Rosary, Novena, and Adoration timings. Check the{' '}
          <strong>Bulletin</strong> tab for feast-day additions or guest priest notices.
        </p>
      </header>

      {/* Active Week Quick Notice */}
      {activeBulletin && activeBulletin.daily_schedule.length > 0 && (
        <section className="rounded-2xl border border-parish-gold/30 bg-parish-gold-soft/60 p-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-parish-gold-ink" />
            <h3 className="text-sm font-bold text-parish-ink">
              Special Observances ({activeBulletin.title})
            </h3>
          </div>
          <ul className="mt-2 space-y-1 text-xs text-parish-ink">
            {activeBulletin.daily_schedule
              .filter((d) => d.feastNote)
              .map((d) => (
                <li key={d.date}>
                  <strong>{d.dayLabel}:</strong> {d.feastNote}
                </li>
              ))}
            {activeBulletin.daily_schedule.every((d) => !d.feastNote) && (
              <li className="text-parish-muted">Standard weekday & Sunday timings apply this week.</li>
            )}
          </ul>
        </section>
      )}

      {/* Regular Recurring Schedule Groups */}
      <div className="space-y-4">
        {grouped.map(([groupName, items]) => (
          <section
            key={groupName}
            className="overflow-hidden rounded-2xl border border-parish-border bg-white shadow-2xs"
          >
            <div className="border-b border-parish-border bg-parish-navy px-4 py-2.5">
              <h3 className="text-sm font-bold tracking-wide text-white">{groupName}</h3>
            </div>
            <div className="divide-y divide-parish-border">
              {items.map((item) => (
                <div key={item.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-parish-gold-ink">
                      {item.day_label}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-lg bg-parish-canvas px-2.5 py-1 text-xs font-bold text-parish-navy">
                      <Clock className="h-3.5 w-3.5" />
                      {item.time_label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-base font-bold text-parish-ink">{item.title}</p>
                  {item.location && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-parish-muted">
                      <MapPin className="h-3.5 w-3.5 text-parish-navy" />
                      {item.location}
                    </p>
                  )}
                  {item.notes && (
                    <p className="mt-1.5 text-xs leading-relaxed text-parish-muted">{item.notes}</p>
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
