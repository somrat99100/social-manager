import { ChevronRight } from 'lucide-react';

export default function ChannelCard({ name, tagline, color, connectedCount, lastSync, disabled, onOpen }) {
  return (
    <div
      className="rounded-2xl border p-5 flex flex-col gap-4 transition-transform"
      style={{
        background: 'var(--panel)',
        borderColor: 'var(--hairline)',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: disabled ? 'var(--text-dim)' : 'var(--positive)' }}
          />
          <div>
            <div className="font-display font-semibold text-base">{name}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{tagline}</div>
          </div>
        </div>
        <span
          className="w-9 h-9 rounded-lg grid place-items-center font-mono text-xs font-semibold"
          style={{ background: color + '22', color }}
        >
          {name[0]}
        </span>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="font-mono text-2xl font-medium">{connectedCount}</div>
          <div className="text-xs" style={{ color: 'var(--text-dim)' }}>connected {connectedCount === 1 ? 'account' : 'accounts'}</div>
        </div>
        <div className="text-xs text-right" style={{ color: 'var(--text-dim)' }}>
          {disabled ? 'Phase 2' : `Synced ${lastSync}`}
        </div>
      </div>

      <button
        onClick={onOpen}
        disabled={disabled}
        className="focus-ring w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed"
        style={{
          background: disabled ? 'var(--panel-raised)' : color,
          color: disabled ? 'var(--text-dim)' : '#0B0E13',
        }}
      >
        {disabled ? 'Coming soon' : 'Open channel'}
        {!disabled && <ChevronRight size={16} />}
      </button>
    </div>
  );
}
