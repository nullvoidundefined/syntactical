// One selectable option inside a menu step: a bordered card showing a
// key-hint badge, a label, and a short description.

export function SelectionCard({ keyHint, title, subtitle, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group w-full text-left border border-line rounded-lg px-5 py-4 sm:px-6 sm:py-5 bg-surface
                 hover:border-signal/60 hover:bg-surface-raised transition-colors duration-150
                 focus:outline-none focus-visible:ring-1 focus-visible:ring-signal"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-lg tracking-wide text-ink group-hover:text-signal transition-colors">
          {title}
        </span>
        <span className="font-mono text-xs text-muted border border-line rounded px-2 py-0.5 group-hover:border-signal/60 group-hover:text-signal">
          {keyHint}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted">{subtitle}</p>
    </button>
  );
}
