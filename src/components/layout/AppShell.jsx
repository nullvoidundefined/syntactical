// The persistent outer frame: brand mark, live streak readout, and the
// main content slot every view renders into.

export function AppShell({ streak, children }) {
  return (
    <div className="min-h-dvh bg-obsidian text-ink flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-line/60">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs sm:text-sm tracking-[0.2em] sm:tracking-[0.3em] text-ink">
            SYNTACTICAL
          </span>
          <span className="h-2 w-2 rounded-full bg-signal animate-pulse" aria-hidden="true" />
        </div>
        <div className="font-mono text-[11px] sm:text-xs tracking-widest text-muted uppercase">
          streak <span className="text-signal">{streak.current}</span>
          <span className="mx-1 text-line">/</span>
          best <span className="text-ink">{streak.best}</span>
        </div>
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
