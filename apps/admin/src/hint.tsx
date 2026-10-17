import { useEffect, useId, useRef, useState } from 'react';

export function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <span className="help-tip" ref={ref}>
      <button
        type="button"
        className="help-btn"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={text}
        onClick={() => setOpen((value) => !value)}
      >
        ?
      </button>
      {open ? (
        <span id={panelId} className="help-pop" role="note">
          {text}
        </span>
      ) : null}
    </span>
  );
}
