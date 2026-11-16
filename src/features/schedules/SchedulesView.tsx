import { useMemo, useState } from 'react';
import {
  CalendarClock,
  ChevronDown,
  ChevronsUpDown,
  Church,
  Clock,
  MapPin,
  Sparkles,
} from 'lucide-react';
import {
  inferDefaultScheduleGroupKey,
  isTodayOrUpcomingDayLabel,
} from '../../lib/announcementSignals';
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

  const groupNames = useMemo(() => grouped.map(([name]) => name), [grouped]);
  const defaultExpandedGroup = useMemo(
    () => inferDefaultScheduleGroupKey(groupNames),
    [groupNames]
  );

  // Smart Default Expansion: expand today's / upcoming Sunday Qurbana group automatically
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() =>
    defaultExpandedGroup ? new Set([defaultExpandedGroup]) : new Set()
  );

  // Active Week Day-by-Day liturgical schedule (auto-expand today's day if present)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const day of activeBulletin?.daily_schedule ?? []) {
      if (isTodayOrUpcomingDayLabel(day.dayLabel)) {
        initial.add(day.date);
      }
    }
    return initial;
  });

  const allGroupsExpanded =
    groupNames.length > 0 && groupNames.every((g) => expandedGroups.has(g));

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  };

  const toggleAllGroups = () => {
    if (allGroupsExpanded) {
      setExpandedGroups(new Set());
    } else {
      setExpandedGroups(new Set(groupNames));
    }
  };

  const toggleDay = (date: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const feastDays = useMemo(
    () => (activeBulletin?.daily_schedule ?? []).filter((d) => d.feastNote),
    [activeBulletin]
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-parish-border bg-white p-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-parish-ink">Parish Schedules</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-parish-muted">
            Today&apos;s relevant Holy Qurbana timings expand automatically; tap any group to view
            full times, confessions, and locations.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleAllGroups}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-parish-border bg-parish-canvas px-3.5 py-1.5 text-xs font-semibold text-parish-navy hover:bg-slate-100"
        >
          <ChevronsUpDown className="h-3.5 w-3.5" />
          {allGroupsExpanded ? 'Collapse All' : 'Expand All'}
        </button>
      </header>

      {/* Collapsible Regular Recurring Schedule Groups */}
      <div className="space-y-3">
        {grouped.map(([groupName, items]) => {
          const isOpen = expandedGroups.has(groupName);
          const isSmartDefault = groupName === defaultExpandedGroup;
          const timeSummary = items
            .slice(0, 2)
            .map((i) => i.time_label)
            .filter(Boolean)
            .join(' • ');
          const firstLocation = items.find((i) => i.location)?.location;

          return (
            <section
              key={groupName}
              className={`overflow-hidden rounded-2xl border bg-white shadow-2xs transition-shadow hover:shadow-sm ${
                isSmartDefault ? 'border-parish-navy/35 ring-1 ring-parish-navy/10' : 'border-parish-border'
              }`}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggleGroup(groupName)}
                className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-parish-canvas/55"
              >
                <span
                  className={`h-9 w-1 shrink-0 rounded-full ${
                    isSmartDefault ? 'bg-parish-gold' : 'bg-parish-navy'
                  }`}
                  aria-hidden="true"
                />
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-parish-navy/10 text-parish-navy">
                  <Church className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isSmartDefault && (
                      <span className="rounded-full bg-parish-gold-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-parish-gold-ink">
                        Upcoming Focus
                      </span>
                    )}
                    <span className="text-[11px] font-semibold text-parish-muted">
                      {items.length} {items.length === 1 ? 'service' : 'services'}
                    </span>
                  </div>
                  <h3 className="truncate text-[16px] font-bold text-parish-ink">{groupName}</h3>
                  {!isOpen && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-parish-muted">
                      {timeSummary && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-parish-canvas px-2 py-0.5 text-[11px] font-semibold text-parish-navy">
                          <Clock className="h-3 w-3 text-parish-gold" />
                          {timeSummary}
                          {items.length > 2 ? ` +${items.length - 2}` : ''}
                        </span>
                      )}
                      {firstLocation && <span className="truncate">{firstLocation}</span>}
                    </div>
                  )}
                </div>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-parish-canvas text-parish-navy">
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </span>
              </button>

              <div className="parish-accordion-panel" data-open={isOpen}>
                <div className="parish-accordion-inner">
                  <div className="divide-y divide-parish-border border-t border-parish-border">
                    {items.map((item) => (
                      <div key={item.id} className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-parish-gold-ink">
                            {item.day_label}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-lg bg-parish-canvas px-2.5 py-1 text-xs font-bold text-parish-navy">
                            <Clock className="h-3.5 w-3.5" />
                            {item.time_label}
                          </span>
                        </div>
                        <p className="mt-1 text-base font-bold text-parish-ink">{item.title}</p>
                        {item.location && (
                          <p className="mt-1 inline-flex items-center gap-1 text-xs text-parish-muted">
                            <MapPin className="h-3.5 w-3.5 text-parish-navy" />
                            {item.location}
                          </p>
                        )}
                        {item.notes && (
                          <p className="mt-1.5 text-xs leading-relaxed text-parish-muted">
                            {item.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* Collapsible This Week's Liturgical Day-by-Day Schedule */}
      {activeBulletin && activeBulletin.daily_schedule.length > 0 && (
        <section className="space-y-2.5 rounded-2xl border border-parish-gold/35 bg-parish-gold-soft/45 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-parish-gold-ink" />
              <h3 className="text-sm font-bold text-parish-ink">
                This Week&apos;s Daily Schedule ({activeBulletin.title})
              </h3>
            </div>
            {feastDays.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-parish-gold-ink">
                <Sparkles className="h-3 w-3" />
                {feastDays.length} {feastDays.length === 1 ? 'Feast Day' : 'Feast Days'}
              </span>
            )}
          </div>

          <div className="space-y-2">
            {activeBulletin.daily_schedule.map((day) => {
              const dayOpen = expandedDays.has(day.date);
              const isTodayDay = isTodayOrUpcomingDayLabel(day.dayLabel);
              const firstService = day.items[0];

              return (
                <div
                  key={day.date}
                  className={`overflow-hidden rounded-xl border bg-white ${
                    isTodayDay ? 'border-parish-navy/40 ring-1 ring-parish-navy/10' : 'border-parish-border'
                  }`}
                >
                  <button
                    type="button"
                    aria-expanded={dayOpen}
                    onClick={() => toggleDay(day.date)}
                    className="flex min-h-[48px] w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-parish-canvas/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-bold text-parish-ink">{day.dayLabel}</span>
                        {isTodayDay && (
                          <span className="rounded-full bg-parish-navy px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                            Today
                          </span>
                        )}
                        {day.feastNote && (
                          <span className="rounded-full bg-parish-gold-soft px-2 py-0.5 text-[10px] font-semibold text-parish-gold-ink">
                            {day.feastNote}
                          </span>
                        )}
                      </div>
                      {!dayOpen && firstService && (
                        <p className="truncate text-xs text-parish-muted">
                          {firstService.time ? `${firstService.time} — ` : ''}
                          {firstService.title}
                        </p>
                      )}
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-parish-navy transition-transform duration-200 ${
                        dayOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  <div className="parish-accordion-panel" data-open={dayOpen}>
                    <div className="parish-accordion-inner">
                      <ul className="space-y-1.5 border-t border-parish-border px-3.5 py-2.5 text-xs">
                        {day.items.map((svc, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            {svc.time && (
                              <span className="w-20 shrink-0 font-bold text-parish-navy">
                                {svc.time}
                              </span>
                            )}
                            <span className="text-parish-ink">
                              {svc.title}
                              {svc.celebrant && (
                                <span className="text-parish-muted"> ({svc.celebrant})</span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
