import { X, ExternalLink, Copy, Check } from 'lucide-react';
import { useState } from 'react';

export default function GuideModal({ title, accent = 'var(--amber)', intro, steps, link, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: '#00000099' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border"
        style={{ background: 'var(--panel)', borderColor: 'var(--hairline)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b sticky top-0"
          style={{ borderColor: 'var(--hairline)', background: 'var(--panel)' }}
        >
          <span className="font-display font-semibold text-sm">{title}</span>
          <button onClick={onClose} className="focus-ring" style={{ color: 'var(--text-dim)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {intro && (
            <p className="text-sm mb-5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {intro}
            </p>
          )}

          <ol className="space-y-4">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-semibold mt-0.5"
                  style={{ background: `${accent}22`, color: accent }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm">{step.text}</p>
                  {step.copy && <CopyLine value={step.copy} />}
                  {step.note && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                      {step.note}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {link && (
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="focus-ring mt-6 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium"
              style={{ background: accent, color: '#0B0E13' }}
            >
              {link.label} <ExternalLink size={14} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function CopyLine({ value }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="focus-ring mt-2 w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left"
      style={{ background: 'var(--ink)', borderColor: 'var(--hairline)' }}
    >
      <code className="text-xs font-mono break-all" style={{ color: 'var(--text-primary)' }}>
        {value}
      </code>
      {copied ? (
        <Check size={14} color="var(--positive)" className="shrink-0" />
      ) : (
        <Copy size={14} color="var(--text-dim)" className="shrink-0" />
      )}
    </button>
  );
}
