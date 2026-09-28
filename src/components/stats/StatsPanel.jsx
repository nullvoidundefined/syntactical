// Compact readout of cumulative stats shown under the menu: overall
// accuracy plus a per-track breakdown pulled from persisted storage.

import { DIFFICULTIES, LANGUAGES } from '../../constants/appConfig.js';
import { calculateAccuracy } from '../../services/quizService.js';

export function StatsPanel({ stats }) {
  const overallAccuracy = calculateAccuracy(stats.totals.correct, stats.totals.attempted);
  const hasHistory = stats.totals.attempted > 0;

  return (
    <div className="mt-10 border-t border-line/60 pt-6">
      <div className="flex items-center justify-between font-mono text-xs tracking-widest text-muted uppercase">
        <span>Lifetime accuracy</span>
        <span className="text-ink">{hasHistory ? `${overallAccuracy}%` : '\u2014'}</span>
      </div>

      {hasHistory && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {LANGUAGES.flatMap((language) =>
            DIFFICULTIES.map((difficulty) => {
              const track = stats.tracks[`${language.id}:${difficulty.id}`];
              if (!track || track.attempted === 0) return null;
              const accuracy = calculateAccuracy(track.correct, track.attempted);
              return (
                <div
                  key={`${language.id}:${difficulty.id}`}
                  className="border border-line rounded px-3 py-2"
                >
                  <p className="font-mono text-[10px] tracking-widest text-muted uppercase">
                    {language.glyph} / {difficulty.label}
                  </p>
                  <p className="font-mono text-sm text-ink mt-1">{accuracy}%</p>
                </div>
              );
            }),
          )}
        </div>
      )}
    </div>
  );
}
