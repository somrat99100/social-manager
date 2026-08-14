import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { savePost, watchPosts } from '../services/content';
import {
  parseSheetInput,
  fetchYoutubeSheetRows,
  classifyVideoLink,
  fetchDriveFileMeta,
  fetchDriveFileBlob,
} from '../services/sheets';
import {
  getValidAccessToken,
  buildVideoMetadata,
  uploadVideo,
} from '../services/youtube';

const INTERVAL_PRESETS = [
  { label: 'Every 30 minutes', hours: 0.5 },
  { label: 'Every 1 hour', hours: 1 },
  { label: 'Every 2 hours', hours: 2 },
  { label: 'Every 4 hours', hours: 4 },
  { label: 'Every 6 hours', hours: 6 },
  { label: 'Every 12 hours', hours: 12 },
  { label: 'Every 24 hours', hours: 24 },
  { label: 'Custom', hours: 'custom' },
];
const MIN_CUSTOM_HOURS = 0.25;

function rowKey(sheetId, rowNumber, cycle) {
  return `${sheetId}:${rowNumber}:c${cycle}`;
}

export default function SheetImportYoutube() {
  const { user, profile, updateProfile } = useAuth();
  const youtube = profile?.youtube || null;
  const connected = Boolean(youtube?.refreshToken);
  const source = profile?.youtubeSheetSource || {};

  const [sheetInput, setSheetInput] = useState(source.input || '');
  const [sheetName, setSheetName] = useState(source.sheetName || '');
  const [sheetId, setSheetId] = useState(source.sheetId || null);
  const [rows, setRows] = useState(source.rows || []);
  const [runLog, setRunLog] = useState(source.runLog || {});
  const [cycle, setCycle] = useState(source.cycle || 1);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const [intervalPreset, setIntervalPreset] = useState(
    source.intervalHours && INTERVAL_PRESETS.some((p) => p.hours === source.intervalHours) ? source.intervalHours : 4
  );
  const [customHours, setCustomHours] = useState(1);
  const intervalHours = intervalPreset === 'custom' ? Number(customHours) || MIN_CUSTOM_HOURS : intervalPreset;
  const [publishFirstNow, setPublishFirstNow] = useState(source.publishFirstNow !== false);

  const [running, setRunning] = useState(false);
  const [rowStatus, setRowStatus] = useState({}); // rowNumber -> { state, message, progress }
  const stopRef = useRef(false);
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    if (!user) return;
    return watchPosts(user.uid, setPosts);
  }, [user]);

  const persist = (overrides = {}) => {
    if (!user) return;
    const next = {
      input: sheetInput.trim(),
      sheetName: sheetName.trim(),
      sheetId,
      rows,
      runLog,
      cycle,
      intervalHours,
      publishFirstNow,
      ...overrides,
    };
    updateProfile({ youtubeSheetSource: JSON.parse(JSON.stringify(next)) }).catch(() => {});
  };

  const dupSet = useMemo(() => {
    const s = new Set();
    posts.forEach((p) => p.sheetRowKey && s.add(p.sheetRowKey));
    return s;
  }, [posts]);

  const includedRows = rows.filter((r) => sheetId && !dupSet.has(rowKey(sheetId, r.rowNumber, cycle)) && !r.linkError);
  const allDoneThisCycle = !fetching && rows.length > 0 && sheetId && rows.every((r) => dupSet.has(rowKey(sheetId, r.rowNumber, cycle)));

  const doFetch = async () => {
    setFetchError('');
    const parsed = parseSheetInput(sheetInput);
    if (!parsed) {
      setFetchError("That doesn't look like a Google Sheet link or ID. Paste the full URL from your browser's address bar.");
      return;
    }
    setFetching(true);
    try {
      const fetched = await fetchYoutubeSheetRows({ sheetId: parsed.sheetId, gid: parsed.gid, sheetName });
      if (fetched.length === 0) {
        setFetchError('No rows found. Make sure the sheet has a header row with Title and Video Link columns.');
      }
      const driveApiKey = profile?.driveApiKey || '';
      const withMeta = await Promise.all(
        fetched.map(async (r) => {
          const link = classifyVideoLink(r.videoLink);
          if (!link) return { ...r, linkError: 'No video link in this row.' };
          if (link.error) return { ...r, linkError: link.error };
          if (link.type === 'drive-file') {
            try {
              const meta = await fetchDriveFileMeta(link.fileId, driveApiKey);
              return { ...r, driveFileId: link.fileId, fileName: meta.name, fileSize: meta.size, mimeType: meta.mimeType, linkError: null };
            } catch (e) {
              return { ...r, linkError: e.message };
            }
          }
          // direct URL — browsers can't fetch arbitrary cross-origin video
          // bytes without CORS, so only Drive links are supported here.
          return { ...r, linkError: 'Only Google Drive video links are supported in this column right now.' };
        })
      );

      const isSameSheet = sheetId === parsed.sheetId;
      let nextRows;
      setRows((prev) => {
        const base = isSameSheet ? prev : [];
        const existingByNum = new Map(base.map((r) => [r.rowNumber, r]));
        const merged = base.map((r) => {
          const fresh = withMeta.find((f) => f.rowNumber === r.rowNumber);
          return fresh ? { ...r, ...fresh } : r;
        });
        const newOnes = withMeta.filter((f) => !existingByNum.has(f.rowNumber));
        nextRows = [...merged, ...newOnes];
        return nextRows;
      });
      const nextRunLog = isSameSheet ? runLog : {};
      if (!isSameSheet) setRunLog({});
      setSheetId(parsed.sheetId);
      persist({ sheetId: parsed.sheetId, rows: nextRows, runLog: nextRunLog });
    } catch (e) {
      setFetchError(e.message);
    } finally {
      setFetching(false);
    }
  };

  const removeRow = (rowNumber) => {
    const nextRows = rows.filter((r) => r.rowNumber !== rowNumber);
    setRows(nextRows);
    persist({ rows: nextRows });
  };

  const startQueue = async () => {
    if (!connected) return;
    stopRef.current = false;
    setRunning(true);
    const startTime = Date.now();
    let index = 0;
    for (const row of includedRows) {
      if (stopRef.current) break;
      const key = rowKey(sheetId, row.rowNumber, cycle);
      setRowStatus((s) => ({ ...s, [row.rowNumber]: { state: 'fetching', progress: 0 } }));
      try {
        const accessToken = await getValidAccessToken(youtube, (fresh) =>
          updateProfile({ youtube: { ...youtube, accessToken: fresh.accessToken, expiresAt: fresh.expiresAt } })
        );
        const driveApiKey = profile?.driveApiKey || '';
        const blob = await fetchDriveFileBlob(row.driveFileId, driveApiKey, (p) =>
          setRowStatus((s) => ({ ...s, [row.rowNumber]: { state: 'fetching', progress: p } }))
        );
        const file = new File([blob], row.fileName || `video-${row.rowNumber}.mp4`, { type: row.mimeType || 'video/mp4' });

        const isFirst = index === 0 && publishFirstNow;
        const publishAt = isFirst ? null : new Date(startTime + index * intervalHours * 3600 * 1000).toISOString();
        const metadata = buildVideoMetadata({
          title: row.title,
          description: row.description,
          tags: row.tags,
          privacyStatus: 'public',
          publishAt,
        });

        setRowStatus((s) => ({ ...s, [row.rowNumber]: { state: 'uploading', progress: 0 } }));
        const video = await uploadVideo({
          accessToken,
          file,
          metadata,
          onProgress: (p) => setRowStatus((s) => ({ ...s, [row.rowNumber]: { state: 'uploading', progress: p } })),
          isCancelled: () => stopRef.current,
        });

        await savePost(user.uid, {
          platform: 'youtube',
          title: row.title,
          caption: row.description,
          ytVideoId: video?.id || null,
          status: publishAt ? 'scheduled' : 'posted',
          sheetRowKey: key,
        });
        setRowStatus((s) => ({ ...s, [row.rowNumber]: { state: 'done', progress: 1 } }));
      } catch (e) {
        console.error(`Row ${row.rowNumber} failed:`, e);
        setRowStatus((s) => ({ ...s, [row.rowNumber]: { state: 'failed', message: e.message } }));
      }
      index += 1;
    }
    setRunning(false);
  };

  const stopQueue = () => { stopRef.current = true; };

  const repeatFromTop = () => {
    const nextCycle = cycle + 1;
    setCycle(nextCycle);
    setRowStatus({});
    persist({ cycle: nextCycle });
  };

  if (!connected) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>Videos from sheet</h1>
            <p className="field-hint">Upload a batch of videos straight from a Google Sheet.</p>
          </div>
        </div>
        <div className="card page-card empty-card">
          <div className="empty-card-icon">▶</div>
          <h3>No YouTube channel connected yet</h3>
          <p className="field-hint" style={{ margin: '6px 0 16px' }}>Connect your channel first, in Connect profile.</p>
          <Link to="/settings" className="btn btn-accent">Connect profile</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Videos from sheet</h1>
          <p className="field-hint">Publishing to {youtube.title}.</p>
        </div>
      </div>

      <div className="card page-card">
        <div className="field">
          <label>Google Sheet link</label>
          <input value={sheetInput} onChange={(e) => setSheetInput(e.target.value)} placeholder="Paste the sheet's URL" />
        </div>
        <div className="field">
          <label>Tab name (optional)</label>
          <input value={sheetName} onChange={(e) => setSheetName(e.target.value)} placeholder="Leave blank for the first tab" />
        </div>
        <p className="field-hint" style={{ margin: '0 0 12px' }}>
          Needs a header row with <strong>Title</strong>, <strong>Description</strong>, and{' '}
          <strong>Video Link</strong> columns — the video link must be a single Google Drive file
          shared as "Anyone with the link — Viewer" (a Drive API key is needed in Connect profile).
        </p>
        <button className="btn btn-primary" onClick={doFetch} disabled={fetching || !sheetInput.trim()}>
          {fetching ? 'Fetching…' : 'Fetch rows'}
        </button>
        {fetchError && <div className="field-error" style={{ marginTop: 8 }}>{fetchError}</div>}
      </div>

      {rows.length > 0 && (
        <>
          <div className="card page-card">
            <div className="settings-block-head" style={{ marginBottom: 10 }}>
              <h3>Posting schedule</h3>
            </div>
            <div className="field">
              <label>Interval between uploads going public</label>
              <select value={intervalPreset} onChange={(e) => setIntervalPreset(e.target.value === 'custom' ? 'custom' : Number(e.target.value))}>
                {INTERVAL_PRESETS.map((p) => (
                  <option key={p.label} value={p.hours}>{p.label}</option>
                ))}
              </select>
            </div>
            {intervalPreset === 'custom' && (
              <div className="field">
                <label>Custom hours</label>
                <input type="number" min={MIN_CUSTOM_HOURS} step={0.25} value={customHours} onChange={(e) => setCustomHours(e.target.value)} />
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px' }}>
              <input type="checkbox" checked={publishFirstNow} onChange={(e) => setPublishFirstNow(e.target.checked)} />
              <span className="field-hint" style={{ margin: 0 }}>Publish the first video immediately (rest go public spaced by the interval above)</span>
            </label>
            <p className="field-hint" style={{ margin: '0 0 12px' }}>
              Every video's bytes upload now, one at a time, in this tab — keep it open until the
              batch finishes. What's spaced out is when each one goes public.
            </p>
            {!allDoneThisCycle ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-accent" onClick={startQueue} disabled={running || includedRows.length === 0}>
                  {running ? 'Uploading…' : `Start upload (${includedRows.length} video${includedRows.length === 1 ? '' : 's'})`}
                </button>
                {running && <button className="btn btn-ghost" onClick={stopQueue}>Stop after current video</button>}
              </div>
            ) : (
              <button className="btn btn-primary" onClick={repeatFromTop}>Repeat from the top</button>
            )}
          </div>

          <div className="card page-card" style={{ padding: 0 }}>
            {rows.map((r) => {
              const key = sheetId ? rowKey(sheetId, r.rowNumber, cycle) : null;
              const queued = key && dupSet.has(key);
              const live = rowStatus[r.rowNumber];
              return (
                <div key={r.rowNumber} className="yt-row" style={{ borderBottom: '1px solid var(--line)' }}>
                  <div className="yt-row-num">{r.rowNumber}</div>
                  <div className="yt-row-text">
                    <div className="yt-row-title">{r.title || '(no title)'}</div>
                    <div className="yt-row-desc">
                      {r.linkError ? r.linkError : r.fileName ? `${r.fileName}` : r.videoLink}
                    </div>
                    {live?.state === 'fetching' && (
                      <div className="progress-track" style={{ maxWidth: 220 }}>
                        <div className="progress-fill" style={{ width: `${Math.round((live.progress || 0) * 100)}%` }} />
                      </div>
                    )}
                    {live?.state === 'uploading' && (
                      <div className="progress-track" style={{ maxWidth: 220 }}>
                        <div className="progress-fill" style={{ width: `${Math.round((live.progress || 0) * 100)}%` }} />
                      </div>
                    )}
                    {live?.state === 'failed' && <div className="field-error">{live.message}</div>}
                  </div>
                  <span className={`badge badge-${queued || live?.state === 'done' ? 'live' : live?.state === 'failed' ? 'warn' : 'idle'}`}>
                    {queued || live?.state === 'done' ? 'Uploaded' : live?.state === 'uploading' ? 'Uploading' : live?.state === 'fetching' ? 'Fetching' : live?.state === 'failed' ? 'Failed' : r.linkError ? 'Skipped' : 'Queued'}
                  </span>
                  {!running && !queued && (
                    <button className="btn btn-ghost btn-sm" onClick={() => removeRow(r.rowNumber)}>Remove</button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
