// Feature flags isolating Phase 1 scope while keeping a clean seam for Phase 2+ modules.

export const PHASE_FLAGS = {
  // Phase 1 (Active)
  weeklyBulletin: true,
  threeWeekArchive: true,
  schedules: true,
  aboutParish: true,
  pushNotifications: true,
  adminPortal: true,
  auditLogs: true,

  // Phase 2+ (Strictly deferred out of Phase 1)
  dailyReadingsAndNovenas: false,
  livestreamEmbeds: false,
  inAppRsvps: false,
  prayerRequests: false,
  familyDirectory: false,
  onlineDonations: false,
} as const;
