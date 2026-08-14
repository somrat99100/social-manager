import { useRef } from 'react';
import { toUnicodeBold, toPlainFromBold, isFullyBold } from '../lib/text-format';

/**
 * A caption textarea with a "Bold" toolbar button. Select some text and
 * click Bold (or press Ctrl/Cmd+B) to swap it for bold Unicode characters —
 * clicking again on the same selection undoes it. This is a drop-in
 * replacement for a plain <textarea value={} onChange={}>.
 */
// Facebook doesn't hard-cut captions until ~63,206 chars, but posts read
// noticeably better (and get better reach) kept well under this — used
// purely as a soft, informational guide, never a hard limit.
const RECOMMENDED_LENGTH = 500;

export default function CaptionField({ value, onChange, rows = 4, placeholder, label }) {
  const ref = useRef(null);
  const length = value?.length || 0;
  const overRecommended = length > RECOMMENDED_LENGTH;

  const applyBold = () => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start === end) return; // nothing selected — no-op rather than guessing
    const selected = value.slice(start, end);
    const converted = isFullyBold(selected) ? toPlainFromBold(selected) : toUnicodeBold(selected);
    const next = value.slice(0, start) + converted + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start, start + converted.length);
    });
  };

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      applyBold();
    }
  };

  return (
    <div className="field caption-field">
      {label && <label>{label}</label>}
      <div className="caption-toolbar">
        <button
          type="button"
          className="caption-toolbar-btn"
          title="Bold the selected text (Ctrl/Cmd+B)"
          onMouseDown={(e) => e.preventDefault()} // keep the textarea selection alive through the click
          onClick={applyBold}
        >
          B
        </button>
        <span className="field-hint caption-toolbar-hint">Select text, then click B to bold it</span>
        <span className={`caption-char-count ${overRecommended ? 'caption-char-count-over' : ''}`}>
          {length.toLocaleString()}{overRecommended ? ` · long for a single post` : ''}
        </span>
      </div>
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
