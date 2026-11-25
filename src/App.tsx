import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, BookOpen, CalendarDays, Info } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';
import { ScrollToTopButton } from './components/ScrollToTopButton';
import { PHASE_FLAGS } from './config/features';
import {
  SAMPLE_BULLETINS,
  SAMPLE_PARISH_INFO,
  SAMPLE_REGULAR_SCHEDULES,
} from './data/sampleData';
import { BulletinView } from './features/bulletin/BulletinView';
import { AboutParishView, ParishSegment } from './features/parish/AboutParishView';
import { InstallShareBanner } from './features/pwa/InstallShareBanner';
import { SchedulesView } from './features/schedules/SchedulesView';
import { applyTextScaleToDocument, getStoredTextScale } from './lib/textScale';
import { applyThemeToDocument, resolveActiveTheme } from './lib/themeEngine';
import { initialAuthCallbackState, supabase } from './lib/supabase';

// Lazy-load Admin & Reimbursement portals so parishioners load only the lightweight bulletin bundle
const AdminPortal = lazy(() =>
  import('./features/admin/AdminPortal').then((m) => ({ default: m.AdminPortal }))
);
const ReimbursementPortal = lazy(() =>
  import('./features/reimbursements/ReimbursementPortal').then((m) => ({
    default: m.ReimbursementPortal,
  }))
);
import { hasLocalPushPreference } from './services/pushService';
import {
  fetchAppSettings,
  fetchParishInfo,
  fetchPublishedBulletins,
  fetchRegularSchedules,
} from './services/parishRepository';
import {
  fetchPublishedMinistryUpdates,
  fetchPublishedSpecialAnnouncements,
} from './services/phase3Repository';
import {
  MinistryUpdate,
  ParishInfo,
  RegularScheduleItem,
  SpecialAnnouncement,
  ThemeMode,
  WeeklyBulletin,
} from './types/parish';

type AppTab = 'bulletin' | 'schedules' | 'about' | 'reimbursements' | 'admin';

export function App() {
  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    if (initialAuthCallbackState.openAdmin) return 'admin';
    if (initialAuthCallbackState.openReimbursements) return 'reimbursements';
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#/reimbursements')) {
      return 'reimbursements';
    }
    return 'bulletin';
  });
  const [parishSegment, setParishSegment] = useState<ParishSegment>('info');
  const [bulletinResetTick, setBulletinResetTick] = useState(0);
  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState<boolean>(
    () => initialAuthCallbackState.isRecovery
  );
  const [bulletins, setBulletins] = useState<WeeklyBulletin[]>(SAMPLE_BULLETINS);
  const [bulletinSource, setBulletinSource] = useState<'live' | 'cache' | 'sample'>('sample');
  const [loadingBulletins, setLoadingBulletins] = useState(true);
  const [regularSchedules, setRegularSchedules] = useState<RegularScheduleItem[]>(
    SAMPLE_REGULAR_SCHEDULES
  );
  const [parishInfo, setParishInfo] = useState<ParishInfo>(SAMPLE_PARISH_INFO);
  const [themeMode, setThemeMode] = useState<ThemeMode>('auto');
  const [specialAnnouncements, setSpecialAnnouncements] = useState<SpecialAnnouncement[]>([]);
  const [ministryUpdates, setMinistryUpdates] = useState<MinistryUpdate[]>([]);

  const resolvedTheme = useMemo(() => resolveActiveTheme(themeMode), [themeMode]);

  useEffect(() => {
    try {
      applyThemeToDocument(resolvedTheme.effectiveThemeId);
    } catch {
      applyThemeToDocument('classic');
    }
  }, [resolvedTheme.effectiveThemeId]);

  useEffect(() => {
    applyTextScaleToDocument(getStoredTextScale());
  }, []);

  const loadAll = useCallback(async () => {
    setLoadingBulletins(true);
    try {
      const [bulRes, schedRes, infoRes, settingsRes, specialRes, ministryRes] = await Promise.all([
        fetchPublishedBulletins(4),
        fetchRegularSchedules(),
        fetchParishInfo(),
        fetchAppSettings(),
        fetchPublishedSpecialAnnouncements().catch(() => [] as SpecialAnnouncement[]),
        fetchPublishedMinistryUpdates().catch(() => [] as MinistryUpdate[]),
      ]);
      setBulletins(bulRes.bulletins);
      setBulletinSource(bulRes.source);
      setRegularSchedules(schedRes);
      setParishInfo(infoRes);
      setThemeMode(settingsRes.theme_mode);
      setSpecialAnnouncements(specialRes);
      setMinistryUpdates(ministryRes);
    } finally {
      setLoadingBulletins(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryPending(true);
        setActiveTab('admin');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onHashChange = (e: HashChangeEvent) => {
      if (window.location.hash.startsWith('#/admin')) {
        setActiveTab('admin');
        return;
      }
      if (window.location.hash.startsWith('#/reimbursements')) {
        setActiveTab('reimbursements');
        return;
      }
      // Prevent Supabase clearing #access_token=... or #error=... from bouncing out of Admin recovery
      if (
        passwordRecoveryPending ||
        e.oldURL.includes('access_token=') ||
        e.oldURL.includes('error_description=') ||
        e.oldURL.includes('type=recovery') ||
        e.oldURL.includes('type=magiclink') ||
        e.oldURL.includes('type=invite')
      ) {
        return;
      }
      if (activeTab === 'admin' || activeTab === 'reimbursements') {
        setActiveTab('bulletin');
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [activeTab, passwordRecoveryPending]);

  const navigate = (tab: AppTab) => {
    if (tab === 'bulletin') {
      setBulletinResetTick((n) => n + 1);
    }
    if (tab !== 'admin') {
      setPasswordRecoveryPending(false);
    }
    if (window.location.search.includes('auth=')) {
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.delete('auth');
      const nextSearch = nextParams.toString();
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`
      );
    }
    setActiveTab(tab);
    window.location.hash =
      tab === 'admin' ? '#/admin' : tab === 'reimbursements' ? '#/reimbursements' : '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-parish-canvas pb-24 sm:pb-10">
      {/* Persistent Top Header (Fixed height for zero CLS) */}
      <header className="sticky top-0 z-30 border-b border-parish-border bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-2 sm:px-3.5">
          <button
            type="button"
            onClick={() => navigate('bulletin')}
            className="flex items-center gap-3 text-left"
          >
            <img
              src="/pwa-192x192.png"
              alt="St. Mary's Syro-Malabar Catholic Church Emblem"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-xl shadow-2xs"
            />
            <div className="min-w-0">
              <h1 className="truncate font-serif text-sm font-bold text-parish-navy sm:text-base">
                {parishInfo.parish_name}
              </h1>
              <p className="truncate text-[11px] text-parish-muted">Charlotte, NC</p>
            </div>
          </button>

          {/* Desktop Navigation + Compact Alerts Shortcut */}
          {activeTab !== 'admin' && (
            <div className="flex items-center gap-1.5">
              <nav aria-label="Primary navigation" className="hidden gap-1 sm:flex">
                <button
                  type="button"
                  onClick={() => navigate('bulletin')}
                  className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                    activeTab === 'bulletin'
                      ? 'bg-parish-navy text-white'
                      : 'text-parish-muted hover:bg-parish-canvas hover:text-parish-ink'
                  }`}
                >
                  Bulletin
                </button>
                <button
                  type="button"
                  onClick={() => navigate('schedules')}
                  className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                    activeTab === 'schedules'
                      ? 'bg-parish-navy text-white'
                      : 'text-parish-muted hover:bg-parish-canvas hover:text-parish-ink'
                  }`}
                >
                  Schedules
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setParishSegment('info');
                    navigate('about');
                  }}
                  className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                    activeTab === 'about'
                      ? 'bg-parish-navy text-white'
                      : 'text-parish-muted hover:bg-parish-canvas hover:text-parish-ink'
                  }`}
                >
                  Parish
                </button>
              </nav>
              <button
                type="button"
                title={
                  hasLocalPushPreference()
                    ? 'Parish alerts enabled — tap to manage in Parish Settings'
                    : 'Manage parish push alert settings'
                }
                aria-label="Manage parish alert settings"
                onClick={() => {
                  setParishSegment('settings');
                  navigate('about');
                  window.setTimeout(() => {
                    document
                      .getElementById('parish-alerts-section')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 120);
                }}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-parish-border bg-parish-canvas text-parish-navy hover:bg-slate-100"
              >
                <Bell className="h-4 w-4" />
                {hasLocalPushPreference() && (
                  <span
                    aria-hidden="true"
                    className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white"
                  />
                )}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto max-w-3xl px-2 pt-2.5 sm:px-3.5">
        {activeTab !== 'admin' && (
          <ErrorBoundary>
            <InstallShareBanner variant="banner" />
          </ErrorBoundary>
        )}

        {activeTab === 'bulletin' && PHASE_FLAGS.weeklyBulletin && (
          <BulletinView
            bulletins={bulletins}
            isLoading={loadingBulletins}
            source={bulletinSource}
            seasonLabel={resolvedTheme.displayLabel}
            specialAnnouncements={specialAnnouncements}
            ministryUpdates={ministryUpdates}
            regularSchedules={regularSchedules}
            resetSignal={bulletinResetTick}
          />
        )}

        {activeTab === 'schedules' && PHASE_FLAGS.schedules && (
          <SchedulesView
            regularSchedules={regularSchedules}
            activeBulletin={bulletins[0]}
          />
        )}

        {activeTab === 'about' && PHASE_FLAGS.aboutParish && (
          <AboutParishView
            info={parishInfo}
            initialSegment={parishSegment}
            onOpenAdmin={() => navigate('admin')}
            onOpenReimbursements={() => navigate('reimbursements')}
          />
        )}

        {activeTab === 'reimbursements' && PHASE_FLAGS.reimbursements && (
          <ErrorBoundary
            fallback={
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-900">
                Reimbursement Portal encountered an error. Existing parish bulletins &amp; schedules
                remain unaffected.
              </div>
            }
          >
            <Suspense
              fallback={
                <div className="rounded-2xl border border-parish-border bg-white p-8 text-center text-xs text-parish-muted">
                  Loading Reimbursement Portal...
                </div>
              }
            >
              <ReimbursementPortal
                onBackToParish={() => {
                  setParishSegment('services');
                  navigate('about');
                }}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'admin' && PHASE_FLAGS.adminPortal && (
          <ErrorBoundary
            fallback={
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-900">
                Admin Portal encountered an unexpected error. Please reload or return to the main bulletin.
              </div>
            }
          >
            <Suspense
              fallback={
                <div className="rounded-2xl border border-parish-border bg-white p-8 text-center text-xs text-parish-muted">
                  Loading Parish Admin Portal...
                </div>
              }
            >
              <AdminPortal
                fallbackBulletin={bulletins[0] ?? SAMPLE_BULLETINS[0]}
                regularSchedules={regularSchedules}
                parishInfo={parishInfo}
                themeMode={themeMode}
                seasonLabel={resolvedTheme.displayLabel}
                specialAnnouncements={specialAnnouncements}
                ministryUpdates={ministryUpdates}
                initialRecoveryMode={passwordRecoveryPending}
                initialAuthError={initialAuthCallbackState.errorDescription}
                onRecoveryComplete={() => {
                  setPasswordRecoveryPending(false);
                  window.history.replaceState(null, '', `${window.location.pathname}#/admin`);
                }}
                onThemeUpdated={(nextMode) => setThemeMode(nextMode)}
                onDataChanged={loadAll}
                onBackToApp={() => navigate('bulletin')}
              />
            </Suspense>
          </ErrorBoundary>
        )}
      </main>

      <ScrollToTopButton />

      {/* Mobile Bottom Tab Bar */}
      {activeTab !== 'admin' && (
        <nav
          aria-label="Mobile bottom navigation"
          className="fixed bottom-0 left-0 right-0 z-30 border-t border-parish-border bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:hidden"
        >
          <div className="mx-auto grid max-w-md grid-cols-3">
            <button
              type="button"
              onClick={() => navigate('bulletin')}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${
                activeTab === 'bulletin' ? 'text-parish-navy' : 'text-parish-muted'
              }`}
            >
              <BookOpen className="h-5 w-5" />
              Bulletin
            </button>
            <button
              type="button"
              onClick={() => navigate('schedules')}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${
                activeTab === 'schedules' ? 'text-parish-navy' : 'text-parish-muted'
              }`}
            >
              <CalendarDays className="h-5 w-5" />
              Schedules
            </button>
            <button
              type="button"
              onClick={() => {
                setParishSegment('info');
                navigate('about');
              }}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${
                activeTab === 'about' ? 'text-parish-navy' : 'text-parish-muted'
              }`}
            >
              <Info className="h-5 w-5" />
              Parish
            </button>
          </div>
        </nav>
      )}

      <PwaUpdatePrompt />
    </div>
  );
}

export default App;
