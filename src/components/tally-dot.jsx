export default function TallyDot({ status = 'idle' }) {
  // status: 'live' (connected/posted), 'ok' (scheduled), 'warn' (draft), 'idle' (not connected)
  const cls = {
    live: 'tally tally-live',
    ok: 'tally tally-ok',
    warn: 'tally tally-warn',
    idle: 'tally',
  }[status];
  return <span className={cls} aria-hidden="true" />;
}
