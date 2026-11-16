import { useState } from 'react';
import { CalendarRange, CheckCircle2, Palette, ShieldAlert } from 'lucide-react';
import { PARISH_THEMES } from '../../config/themes';
import { resolveActiveTheme } from '../../lib/themeEngine';
import { updateThemeMode } from '../../services/parishRepository';
import { isSuperAdminRole, ThemeMode } from '../../types/parish';

interface AdminThemeControlProps {
  currentMode: ThemeMode;
  userRole?: string | null;
  isSandbox: boolean;
  onThemeUpdated: (nextMode: ThemeMode) => void;
}

export function AdminThemeControl({
  currentMode,
  userRole,
  isSandbox,
  onThemeUpdated,
}: AdminThemeControlProps) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const canModifyTheme = isSandbox || isSuperAdminRole(userRole);
  const autoPreview = resolveActiveTheme('auto');
  const effectivePreview = resolveActiveTheme(currentMode);

  const handleSelect = async (nextMode: ThemeMode) => {
    if (!canModifyTheme) return;
    setSaving(true);
    setStatus(null);
    // Apply immediately via CSS custom properties without re-mounting
    onThemeUpdated(nextMode);
    try {
      await updateThemeMode(nextMode);
      setStatus({
        type: 'ok',
        text:
          nextMode === 'auto'
            ? `Theme set to Auto (${autoPreview.displayLabel}). Parishioners now see the live Syro-Malabar season.`
            : `Locked parish theme to "${resolveActiveTheme(nextMode).displayLabel}" (Audit log recorded).`,
      });
    } catch (err) {
      setStatus({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to persist theme setting.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-parish-border bg-white p-4">
        <div className="flex items-start gap-2.5">
          <div className="rounded-xl bg-parish-navy/10 p-2 text-parish-navy">
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-parish-ink">
              Syro-Malabar Liturgical Theme Engine (10 Themes)
            </h3>
            <p className="text-xs text-parish-muted">
              Active right now: <strong>{effectivePreview.displayLabel}</strong>{' '}
              {currentMode === 'auto' ? '(Auto Seasonal Sync)' : '(Manual Override)'}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
          WCAG AA Reading Cards Preserved
        </span>
      </div>

      {!canModifyTheme && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p>
            <strong>Super Admin / Vicar Required:</strong> Trustees can inspect active liturgical
            seasons here, while parish-wide theme overrides are restricted to Super Admin / Vicar
            by database RLS.
          </p>
        </div>
      )}

      {status && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium ${
            status.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{status.text}</span>
        </div>
      )}

      {/* Auto Mode Card */}
      <button
        type="button"
        disabled={!canModifyTheme || saving}
        onClick={() => handleSelect('auto')}
        className={`flex w-full items-start justify-between gap-3 rounded-2xl border p-4 text-left transition-all disabled:opacity-60 ${
          currentMode === 'auto'
            ? 'border-parish-navy bg-parish-gold-soft/50 ring-2 ring-parish-navy/25'
            : 'border-parish-border bg-white hover:border-parish-navy/40'
        }`}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-parish-gold-ink" />
            <span className="text-sm font-bold text-parish-ink">
              Auto (Current Syro-Malabar Liturgical Season) — Recommended
            </span>
          </div>
          <p className="text-xs text-parish-muted">
            Detected today: <strong>{autoPreview.displayLabel}</strong>
            {autoPreview.seasonResolution
              ? ` (${autoPreview.seasonResolution.seasonStartIso} to ${autoPreview.seasonResolution.seasonEndIso})`
              : ''}
            . Automatically pivots on Qyamta (Easter) & Subara.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
            currentMode === 'auto'
              ? 'bg-parish-navy text-white'
              : 'border border-parish-border bg-parish-canvas text-parish-muted'
          }`}
        >
          {currentMode === 'auto' ? 'Selected' : 'Use Auto'}
        </span>
      </button>

      {/* Manual Locks: 9 Seasons + Theme 10 Classic Default */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PARISH_THEMES.map((theme) => {
          const isSelected = currentMode === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              disabled={!canModifyTheme || saving}
              onClick={() => handleSelect(theme.id)}
              className={`flex items-start justify-between gap-3 rounded-2xl border p-3.5 text-left transition-all disabled:opacity-60 ${
                isSelected
                  ? 'border-parish-navy bg-parish-gold-soft/45 ring-2 ring-parish-navy/25'
                  : 'border-parish-border bg-white hover:border-parish-navy/40'
              }`}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-parish-muted">
                    {theme.orderLabel}
                  </span>
                  <span className="truncate text-xs font-bold text-parish-ink">{theme.name}</span>
                </div>
                <p className="text-[11px] font-medium text-parish-muted">
                  {theme.syriacOrMalayalamSubtitle}
                </p>
                <p className="text-[11px] text-parish-muted">{theme.description}</p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="flex items-center gap-1 rounded-lg border border-parish-border bg-white p-1">
                  <span
                    className="h-4 w-4 rounded"
                    style={{ backgroundColor: theme.primarySwatch }}
                    title="Primary"
                  />
                  <span
                    className="h-4 w-4 rounded"
                    style={{ backgroundColor: theme.accentSwatch }}
                    title="Accent"
                  />
                  <span
                    className="h-4 w-4 rounded border border-slate-200"
                    style={{ backgroundColor: theme.softSwatch }}
                    title="Highlight"
                  />
                </div>
                {isSelected && (
                  <span className="text-[10px] font-bold text-parish-navy">Locked Active</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
