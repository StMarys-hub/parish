import { useCallback, useEffect, useState } from 'react';
import { BookOpen, CalendarDays, Info } from 'lucide-react';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';
import { PHASE_FLAGS } from './config/features';
import {
  SAMPLE_BULLETINS,
  SAMPLE_PARISH_INFO,
  SAMPLE_REGULAR_SCHEDULES,
} from './data/sampleData';
import { AdminPortal } from './features/admin/AdminPortal';
import { BulletinView } from './features/bulletin/BulletinView';
import { AboutParishView } from './features/parish/AboutParishView';
import { SchedulesView } from './features/schedules/SchedulesView';
import {
  fetchParishInfo,
  fetchPublishedBulletins,
  fetchRegularSchedules,
} from './services/parishRepository';
import { ParishInfo, RegularScheduleItem, WeeklyBulletin } from './types/parish';

type AppTab = 'bulletin' | 'schedules' | 'about' | 'admin';

export function App() {
  const [activeTab, setActiveTab] = useState<AppTab>(() =>
    window.location.hash === '#/admin' ? 'admin' : 'bulletin'
  );
  const [bulletins, setBulletins] = useState<WeeklyBulletin[]>(SAMPLE_BULLETINS);
  const [bulletinSource, setBulletinSource] = useState<'live' | 'cache' | 'sample'>('sample');
  const [loadingBulletins, setLoadingBulletins] = useState(true);
  const [regularSchedules, setRegularSchedules] = useState<RegularScheduleItem[]>(
    SAMPLE_REGULAR_SCHEDULES
  );
  const [parishInfo, setParishInfo] = useState<ParishInfo>(SAMPLE_PARISH_INFO);

  const loadAll = useCallback(async () => {
    setLoadingBulletins(true);
    try {
      const [bulRes, schedRes, infoRes] = await Promise.all([
        fetchPublishedBulletins(4),
        fetchRegularSchedules(),
        fetchParishInfo(),
      ]);
      setBulletins(bulRes.bulletins);
      setBulletinSource(bulRes.source);
      setRegularSchedules(schedRes);
      setParishInfo(infoRes);
    } finally {
      setLoadingBulletins(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash === '#/admin') {
        setActiveTab('admin');
      } else if (activeTab === 'admin') {
        setActiveTab('bulletin');
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [activeTab]);

  const navigate = (tab: AppTab) => {
    setActiveTab(tab);
    window.location.hash = tab === 'admin' ? '#/admin' : '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-24 sm:pb-10">
      {/* Persistent Top Header (Fixed height for zero CLS) */}
      <header className="sticky top-0 z-30 border-b border-[#E7E2DA] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <button
            type="button"
            onClick={() => navigate('bulletin')}
            className="flex items-center gap-3 text-left"
          >
            <img
              src="/favicon.svg"
              alt="St. Mary's Cross Emblem"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-xl"
            />
            <div className="min-w-0">
              <h1 className="truncate font-serif text-sm font-bold text-[#1E3A5F] sm:text-base">
                {parishInfo.parish_name}
              </h1>
              <p className="truncate text-[11px] text-[#526071]">Charlotte, NC</p>
            </div>
          </button>

          {/* Desktop Navigation */}
          {activeTab !== 'admin' && (
            <nav aria-label="Primary navigation" className="hidden gap-1 sm:flex">
              <button
                type="button"
                onClick={() => navigate('bulletin')}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                  activeTab === 'bulletin'
                    ? 'bg-[#1E3A5F] text-white'
                    : 'text-[#526071] hover:bg-[#FAF8F5] hover:text-[#1E293B]'
                }`}
              >
                Bulletin
              </button>
              <button
                type="button"
                onClick={() => navigate('schedules')}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                  activeTab === 'schedules'
                    ? 'bg-[#1E3A5F] text-white'
                    : 'text-[#526071] hover:bg-[#FAF8F5] hover:text-[#1E293B]'
                }`}
              >
                Schedules
              </button>
              <button
                type="button"
                onClick={() => navigate('about')}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                  activeTab === 'about'
                    ? 'bg-[#1E3A5F] text-white'
                    : 'text-[#526071] hover:bg-[#FAF8F5] hover:text-[#1E293B]'
                }`}
              >
                About Parish
              </button>
            </nav>
          )}
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto max-w-3xl px-4 pt-5">
        {activeTab === 'bulletin' && PHASE_FLAGS.weeklyBulletin && (
          <BulletinView
            bulletins={bulletins}
            isLoading={loadingBulletins}
            source={bulletinSource}
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
            onOpenAdmin={() => navigate('admin')}
          />
        )}

        {activeTab === 'admin' && PHASE_FLAGS.adminPortal && (
          <AdminPortal
            fallbackBulletin={bulletins[0] ?? SAMPLE_BULLETINS[0]}
            regularSchedules={regularSchedules}
            parishInfo={parishInfo}
            onDataChanged={loadAll}
            onBackToApp={() => navigate('bulletin')}
          />
        )}
      </main>

      {/* Mobile Bottom Tab Bar */}
      {activeTab !== 'admin' && (
        <nav
          aria-label="Mobile bottom navigation"
          className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#E7E2DA] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:hidden"
        >
          <div className="mx-auto grid max-w-md grid-cols-3">
            <button
              type="button"
              onClick={() => navigate('bulletin')}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${
                activeTab === 'bulletin' ? 'text-[#1E3A5F]' : 'text-[#526071]'
              }`}
            >
              <BookOpen className="h-5 w-5" />
              Bulletin
            </button>
            <button
              type="button"
              onClick={() => navigate('schedules')}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${
                activeTab === 'schedules' ? 'text-[#1E3A5F]' : 'text-[#526071]'
              }`}
            >
              <CalendarDays className="h-5 w-5" />
              Schedules
            </button>
            <button
              type="button"
              onClick={() => navigate('about')}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${
                activeTab === 'about' ? 'text-[#1E3A5F]' : 'text-[#526071]'
              }`}
            >
              <Info className="h-5 w-5" />
              About Parish
            </button>
          </div>
        </nav>
      )}

      <PwaUpdatePrompt />
    </div>
  );
}

export default App;
