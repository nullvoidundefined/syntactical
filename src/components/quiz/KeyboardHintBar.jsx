// Footer strip showing how to interact with the current card. Below the
// `sm` breakpoint (touch devices, no physical keyboard) it shows a plain
// tap instruction instead of key bindings; at `sm` and above it lists the
// actual keyboard shortcuts so the keyboard-only path stays discoverable.

function Hint({ keys, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="font-mono text-[10px] text-signal border border-signal/40 rounded px-1">
        {keys}
      </span>
      <span className="text-muted">{label}</span>
    </span>
  );
}

export function KeyboardHintBar({ questionType, isAnswered }) {
  return (
    <>
      <div className="flex sm:hidden items-center justify-center px-4 py-3 border-t border-line/60 font-mono text-[11px] tracking-widest uppercase text-muted">
        {isAnswered ? 'Tap next to continue' : 'Tap a choice to answer'}
      </div>
      <div className="hidden sm:flex items-center gap-5 px-6 py-4 border-t border-line/60 font-mono text-xs">
        {!isAnswered && questionType === 'mc' && <Hint keys="1-4 / A-D" label="select" />}
        {!isAnswered && questionType === 'bool' && <Hint keys="T / F" label="select" />}
        {isAnswered && <Hint keys="ENTER" label="next" />}
        <Hint keys="Q" label="query" />
        <Hint keys="ESC" label="menu" />
      </div>
    </>
  );
}
