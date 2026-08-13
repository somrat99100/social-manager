import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { publishToPage, schedulePost } from '../services/facebook';
import { savePost, watchPosts } from '../services/content';
import { parseSheetInput, fetchSheetRows, resolveRowImages } from '../services/sheets';
import SheetRowModal from '../components/sheet-row-modal';
import TallyDot from '../components/tally-dot';

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

const MIN_CUSTOM_HOURS = 0.25; // 15 min — Facebook's floor is 10 min
const MAX_SCHEDULE_SECONDS = 75 * 24 * 3600 - 300; // Facebook allows up to 75 days out

function rowKey(sheetId, rowNumber, cycle) {
  // cycle lets the same row be posted again on a later loop without ever
  // colliding with (or being blocked by) its earlier run's dedupe key.
  return `${sheetId}:${rowNumber}:c${cycle}`;
}

export default function SheetImport() {
  const { user, profile, updateProfile } = useAuth();
  const pages = profile?.pages || [];
  const saved = profile?.sheetSource || {};

  const [selectedPageId, setSelectedPageId] = useState(saved.pageId || pages[0]?.pageId || null);
  const fb = pages.find((p) => p.pageId === selectedPageId) || pages[0] || null;

  const [sheetInput, setSheetInput] = useState(saved.input || '');
  const [sheetName, setSheetName] = useState(saved.sheetName || '');
  const [sheetId, setSheetId] = useState(null);
  const [rows, setRows] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const [intervalPreset, setIntervalPreset] = useState(
    saved.intervalHours && INTERVAL_PRESETS.some((p) => p.hours === saved.intervalHours) ? saved.intervalHours : 4
  );
  const [customHours, setCustomHours] = useState(
    saved.intervalHours && !INTERVAL_PRESETS.some((p) => p.hours === saved.intervalHours) ? saved.intervalHours : 1
  );
  const intervalHours = intervalPreset === 'custom' ? Number(customHours) || MIN_CUSTOM_HOURS : intervalPreset;

  const [postFirstNow, setPostFirstNow] = useState(saved.postFirstNow !== false);

  const [cycle, setCycle] = useState(saved.cycle || 1);
  const [previewRow, setPreviewRow] = useState(null);
  const [approving, setApproving] = useState(false);
  const [runLog, setRunLog] = useState({}); // rowNumber -> { state, message, scheduledFor }
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    if (!user) return;
    return watchPosts(user.uid, setPosts);
  }, [user]);

  const dupSet = useMemo(() => {
    const s = new Set();
    posts.forEach((p) => p.sheetRowKey && s.add(p.sheetRowKey));
    return s;
  }, [posts]);

  const includedRows = rows.filter(
    (r) => r.included && sheetId && !dupSet.has(rowKey(sheetId, r.rowNumber, cycle))
  );

  // True once every fetched row has already been posted/scheduled under the
  // current cycle — i.e. this loop is finished and there's nothing left to
  // approve. Derived from Firestore data, so it's correct even after a
  // refresh (not just right after clicking Approve in this session).
  const allQueuedThisCycle =
    !fetching &&
    rows.length > 0 &&
    sheetId &&
    rows.every((r) => dupSet.has(rowKey(sheetId, r.rowNumber, cycle)));

  const doFetch = async () => {
    setFetchError('');
    setRunLog({});
    const parsed = parseSheetInput(sheetInput);
    if (!parsed) {
      setFetchError("That doesn't look like a Google Sheet link or ID. Paste the full URL from your browser's address bar.");
      return;
    }
    setFetching(true);
    setRows([]);
    try {
      const fetched = await fetchSheetRows({ sheetId: parsed.sheetId, gid: parsed.gid, sheetName });
      if (fetched.length === 0) {
        setFetchError('No rows found. Make sure the sheet has a header row and at least one row of data below it.');
      }
      const driveApiKey = profile?.driveApiKey || '';
      // Resolve each row's image cell in parallel: a direct link stays as-is,
      // a single Drive file link becomes a direct-view URL, and a Drive
      // folder link gets expanded into every image inside it.
      const withImages = await Promise.all(
        fetched.map(async (r) => {
          const { images, folder, error } = await resolveRowImages(r.imageUrl, driveApiKey);
          return {
            ...r,
            included: true,
            images,
            imageUrl: images[0] || '', // first image, kept for the row thumbnail / single-image posts
            imageCount: images.length,
            driveFolder: folder,
            imageError: error,
          };
        })
      );
      setRows(withImages);
      setSheetId(parsed.sheetId);
      if (user) {
        updateProfile({
          sheetSource: {
            input: sheetInput.trim(),
            sheetName: sheetName.trim(),
            intervalHours,
            postFirstNow,
            pageId: selectedPageId || null,
            cycle,
          },
        }).catch(() => {});
      }
    } catch (e) {
      setFetchError(e.message);
    } finally {
      setFetching(false);
    }
  };

  const toggleRow = (rowNumber) => {
    setRows((prev) => prev.map((r) => (r.rowNumber === rowNumber ? { ...r, included: !r.included } : r)));
  };

  const updateCaption = (rowNumber, caption) => {
    setRows((prev) => prev.map((r) => (r.rowNumber === rowNumber ? { ...r, caption } : r)));
  };

  // targetRows/targetCycle let "Repeat from the top" run this same logic
  // against the new cycle without waiting on a stale state read.
  const runApprove = async (targetRows, targetCycle) => {
    if (!fb) return;
    if (targetRows.length === 0) return;
    setApproving(true);
    const nowSec = Math.floor(Date.now() / 1000);
    const intervalSec = Math.round(intervalHours * 3600);
    let scheduleSteps = 0;

    for (let i = 0; i < targetRows.length; i++) {
      const row = targetRows[i];
      const key = rowKey(sheetId, row.rowNumber, targetCycle);
      setRunLog((prev) => ({ ...prev, [row.rowNumber]: { state: 'posting' } }));

      if (row.driveFolder && row.imageError) {
        setRunLog((prev) => ({ ...prev, [row.rowNumber]: { state: 'failed', message: row.imageError } }));
        continue;
      }

      const isImmediate = postFirstNow && i === 0;
      try {
        if (isImmediate) {
          const res = await publishToPage({
            pageId: fb.pageId,
            pageAccessToken: fb.pageAccessToken,
            message: row.caption,
            imageUrls: row.images && row.images.length > 0 ? row.images : undefined,
          });
          await savePost(user.uid, {
            caption: row.caption,
            imageUrl: row.imageUrl || null,
            imageUrls: row.images || [],
            status: 'posted',
            fbPostId: res.id,
            fbPageId: fb.pageId,
            source: 'sheet',
            sheetRowKey: key,
          });
          setRunLog((prev) => ({ ...prev, [row.rowNumber]: { state: 'posted' } }));
        } else {
          scheduleSteps += 1;
          const publishAt = nowSec + scheduleSteps * intervalSec;
          if (publishAt - nowSec > MAX_SCHEDULE_SECONDS) {
            setRunLog((prev) => ({
              ...prev,
              [row.rowNumber]: {
                state: 'failed',
                message: "Beyond Facebook's 75-day scheduling limit — run this again once earlier posts go out.",
              },
            }));
            continue;
          }
          const res = await schedulePost({
            pageId: fb.pageId,
            pageAccessToken: fb.pageAccessToken,
            message: row.caption,
            publishTimeUnix: publishAt,
            imageUrls: row.images && row.images.length > 0 ? row.images : undefined,
          });
          await savePost(user.uid, {
            caption: row.caption,
            imageUrl: row.imageUrl || null,
            imageUrls: row.images || [],
            status: 'scheduled',
            fbPostId: res.id,
            fbPageId: fb.pageId,
            source: 'sheet',
            sheetRowKey: key,
            scheduledAt: publishAt * 1000,
          });
          setRunLog((prev) => ({ ...prev, [row.rowNumber]: { state: 'scheduled', scheduledFor: publishAt * 1000 } }));
        }
      } catch (e) {
        setRunLog((prev) => ({ ...prev, [row.rowNumber]: { state: 'failed', message: e.message } }));
      }
    }
    setApproving(false);
  };

  const handleApprove = () => runApprove(includedRows, cycle);

  const handleRepeat = () => {
    const nextCycle = cycle + 1;
    setCycle(nextCycle);
    setRunLog({});
    if (user) {
      updateProfile({
        sheetSource: {
          input: sheetInput.trim(),
          sheetName: sheetName.trim(),
          intervalHours,
          postFirstNow,
          pageId: selectedPageId || null,
          cycle: nextCycle,
        },
      }).catch(() => {});
    }
    // Under the new cycle none of the current rows are in dupSet yet, so
    // every checked row is eligible again.
    const freshRows = rows.filter((r) => r.included);
    runApprove(freshRows, nextCycle);
  };

  const results = Object.values(runLog);
  const doneCount = results.filter((r) => r.state === 'posted' || r.state === 'scheduled').length;
  const failedCount = results.filter((r) => r.state === 'failed').length;
  const runComplete = results.length > 0 && !approving && results.length >= includedRows.length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Post from Google Sheet</h1>
          <p className="field-hint">
            Pull captions and image links from a sheet, then post them one by one on a timer.
          </p>
        </div>
        {pages.length > 1 && (
          <select value={fb?.pageId || ''} onChange={(e) => setSelectedPageId(e.target.value)} style={{ maxWidth: 220 }}>
            {pages.map((p) => (
              <option key={p.pageId} value={p.pageId}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {!fb && (
        <div className="card page-card empty-card">
          <div className="empty-card-icon">f</div>
          <h3>Connect a Facebook Page first</h3>
          <p className="field-hint" style={{ margin: '6px 0 16px' }}>
            You'll need a page connected before Social Manager can post anything from a sheet.
          </p>
          <Link to="/settings" className="btn btn-accent">Connect profile</Link>
        </div>
      )}

      <div className="card page-card">
        <div className="settings-block-head">
          <h3>Sheet</h3>
          <TallyDot status={rows.length > 0 ? 'live' : 'idle'} />
        </div>
        <p className="field-hint" style={{ margin: '6px 0 14px' }}>
          Share the sheet as <strong>Anyone with the link — Viewer</strong>, then paste its link below. Put a
          header row on top with columns like <strong>Caption</strong> and <strong>Image Link</strong> — if no
          headers match, column A is used as the caption and column B as the image link. The image link can be a
          direct image URL, a Google Drive file link, or a Drive <strong>folder</strong> link (every image inside
          it becomes one multi-photo post — needs a Drive API key in Connect profile). Wrap words in{' '}
          <strong>**double asterisks**</strong> to make them bold.
        </p>

        <div className="field">
          <label>Google Sheet link (or ID)</label>
          <input
            value={sheetInput}
            onChange={(e) => setSheetInput(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…"
          />
        </div>
        <div className="field">
          <label>Tab name (optional — leave blank for the first tab)</label>
          <input value={sheetName} onChange={(e) => setSheetName(e.target.value)} placeholder="e.g. Sheet1" />
        </div>
        <button className="btn btn-primary" onClick={doFetch} disabled={fetching || !sheetInput.trim()}>
          {fetching ? 'Fetching…' : rows.length > 0 ? 'Re-fetch rows' : 'Fetch rows'}
        </button>
        {fetchError && <div className="field-error" style={{ marginTop: 10 }}>{fetchError}</div>}
      </div>

      {rows.length > 0 && (
        <>
          <div className="card page-card">
            <div className="settings-block-head">
              <h3>Posting schedule</h3>
            </div>
            <div className="schedule-settings-grid">
              <div className="field">
                <label>Post every</label>
                <select value={intervalPreset} onChange={(e) => {
                  const v = e.target.value === 'custom' ? 'custom' : Number(e.target.value);
                  setIntervalPreset(v);
                }}>
                  {INTERVAL_PRESETS.map((p) => (
                    <option key={p.label} value={p.hours}>{p.label}</option>
                  ))}
                </select>
              </div>
              {intervalPreset === 'custom' && (
                <div className="field">
                  <label>Custom interval (hours)</label>
                  <input
                    type="number"
                    min={MIN_CUSTOM_HOURS}
                    step="0.25"
                    value={customHours}
                    onChange={(e) => setCustomHours(e.target.value)}
                  />
                </div>
              )}
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={postFirstNow} onChange={(e) => setPostFirstNow(e.target.checked)} />
              Post the first item right away, then space out the rest
            </label>
            <p className="field-hint" style={{ marginTop: 10 }}>
              Once approved, later posts are scheduled directly on Facebook's side — they go out on time even if
              you close this browser tab.
            </p>
          </div>

          <div className="card page-card">
            <div className="settings-block-head">
              <h3>
                Rows found ({rows.length}) · {includedRows.length} queued
              </h3>
              {cycle > 1 && <span className="badge badge-idle">Loop {cycle}</span>}
            </div>

            <div className="post-list" style={{ marginTop: 12 }}>
              {rows.map((row, i) => {
                const key = sheetId ? rowKey(sheetId, row.rowNumber, cycle) : null;
                const isDup = key && dupSet.has(key);
                const log = runLog[row.rowNumber];
                const isImmediateSlot = postFirstNow && includedRows[0]?.rowNumber === row.rowNumber;

                let statusLabel = 'Ready';
                let statusClass = 'ok';
                if (isDup) { statusLabel = 'Already queued'; statusClass = 'idle'; }
                else if (row.driveFolder && row.imageError) { statusLabel = 'Drive folder error'; statusClass = 'warn'; }
                else if (!row.caption && row.imageCount === 0) { statusLabel = 'Empty row'; statusClass = 'warn'; }
                else if (!row.caption) { statusLabel = 'No caption'; statusClass = 'warn'; }
                else if (row.imageCount === 0) { statusLabel = 'Text only'; statusClass = 'idle'; }
                else {
                  const imgSuffix = row.imageCount > 1 ? ` · ${row.imageCount} images` : '';
                  statusLabel = row.included && isImmediateSlot ? `Ready · posts immediately${imgSuffix}` : `Ready${imgSuffix}`;
                }

                if (log?.state === 'posting') { statusLabel = 'Posting…'; statusClass = 'warn'; }
                else if (log?.state === 'posted') { statusLabel = 'Posted ✓'; statusClass = 'live'; }
                else if (log?.state === 'scheduled') {
                  statusLabel = `Scheduled · ${new Date(log.scheduledFor).toLocaleString()}`;
                  statusClass = 'ok';
                } else if (log?.state === 'failed') { statusLabel = 'Failed'; statusClass = 'warn'; }

                return (
                  <div key={row.rowNumber} className="card sheet-row" onClick={() => setPreviewRow(row)}>
                    <span className="sheet-row-num">{i + 1}</span>
                    <input
                      type="checkbox"
                      checked={row.included}
                      disabled={isDup}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleRow(row.rowNumber)}
                    />
                    {row.imageUrl ? (
                      <div className="post-row-thumb-wrap">
                        <img src={row.imageUrl} alt="" className="post-row-thumb" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                        {row.imageCount > 1 && <span className="post-row-thumb-count">{row.imageCount}</span>}
                      </div>
                    ) : (
                      <div className="post-row-thumb sheet-row-thumb-empty" />
                    )}
                    <div className="post-row-text">{row.caption || <span className="field-hint">(no caption)</span>}</div>
                    {row.imageError && !log?.message && (
                      <div className="field-hint" style={{ color: 'var(--warn)' }}>{row.imageError}</div>
                    )}
                    {log?.message && <div className="field-hint" style={{ color: 'var(--warn)' }}>{log.message}</div>}
                    <span className={`badge badge-${statusClass}`}>{statusLabel}</span>
                  </div>
                );
              })}
            </div>

            {runComplete && (
              <p className="field-hint" style={{ marginTop: 14 }}>
                Done — {doneCount} sent to Facebook{failedCount > 0 ? `, ${failedCount} failed` : ''}. Check the{' '}
                <Link to="/log">broadcast log</Link> for full status.
              </p>
            )}

            {allQueuedThisCycle ? (
              <>
                <p className="field-hint" style={{ marginTop: 14 }}>
                  Every row in this sheet has been posted or scheduled for loop {cycle}. Repeat it to start a new
                  loop from row 1, spaced out the same way.
                </p>
                <button
                  className="btn btn-accent btn-block"
                  style={{ marginTop: 10 }}
                  disabled={!fb || approving}
                  onClick={handleRepeat}
                >
                  {approving ? 'Posting…' : `Repeat from the top (loop ${cycle + 1})`}
                </button>
              </>
            ) : (
              <button
                className="btn btn-accent btn-block"
                style={{ marginTop: 16 }}
                disabled={!fb || approving || includedRows.length === 0}
                onClick={handleApprove}
              >
                {approving
                  ? 'Posting…'
                  : `Approve & schedule ${includedRows.length} post${includedRows.length === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </>
      )}

      {previewRow && (
        <SheetRowModal
          row={previewRow}
          page={fb}
          onClose={() => setPreviewRow(null)}
          onSave={(caption) => updateCaption(previewRow.rowNumber, caption)}
        />
      )}
    </div>
  );
}
