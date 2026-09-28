// Thin progress indicator showing position within the current round.

export function ProgressBar({ current, total }) {
  const percent = total === 0 ? 0 : Math.round((current / total) * 100);

  return (
    <div className="px-4 pt-3 sm:px-6 sm:pt-4">
      <div className="flex items-center justify-between font-mono text-xs tracking-widest text-muted uppercase mb-2">
        <span>
          Q{Math.min(current + 1, total)} <span className="text-line">/</span> {total}
        </span>
      </div>
      <div className="h-1 w-full bg-line/60 rounded-full overflow-hidden">
        <div
          className="h-full bg-signal transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
