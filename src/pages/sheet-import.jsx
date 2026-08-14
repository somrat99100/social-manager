import { useEffect, useMemo, useRef, useState } from 'react';
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
  // Update #8 — the fetched rows (and their per-row run state) are restored
  // from the saved profile on load, so a browser refresh — or just coming
  // back to this page later — shows exactly what was fetched last time
  // instead of an empty list that forces a re-fetch.
  const [sheetId, setSheetId] = useState(saved.sheetId || null);
  const [rows, setRows] = useState(saved.rows || []);
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
  const [runLog, setRunLog] = useState(saved.runLog || {}); // rowNumber -> { state, message, scheduledFor }
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    if (!user) return;
    return watchPosts(user.uid, setPosts);
  }, [user]);

  // Update #8 — keep the saved copy of rows/runLog in sync as the person
  // toggles, deletes, reorders, edits captions, or runs the queue, so a
  // refresh at any point picks up right where they left off. Debounced so
  // fast actions (like dragging to reorder) don't spam Firestore.
  const persistTimerRef = useRef(null);
  const skipNextPersistRef = useRef(true); // don't re-save immediately after loading from `saved`
  useEffect(() => {
    if (!user || !sheetId) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const payload = {
        input: sheetInput.trim(),
        sheetName: sheetName.trim(),
        intervalHours,
        postFirstNow,
        pageId: selectedPageId || null,
        cycle,
        sheetId,
        rows,
        runLog,
      };
      updateProfile({ sheetSource: JSON.parse(JSON.stringify(payload)) }).catch(() => {});
    }, 600);
    return () => clearTimeout(persistTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, runLog, cycle]);

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

  // Update #8 — single place that writes everything needed to fully restore
  // this page (including the fetched rows and their run state) back to the
  // profile. Stripping through JSON drops any `undefined` values, which
  // Firestore's updateDoc would otherwise reject.
  const persistSheetSource = (overrides = {}) => {
    if (!user) return;
    const payload = {
      input: sheetInput.trim(),
      sheetName: sheetName.trim(),
      intervalHours,
      postFirstNow,
      pageId: selectedPageId || null,
      cycle,
      sheetId,
      rows,
      runLog,
      ...overrides,
    };
    updateProfile({ sheetSource: JSON.parse(JSON.stringify(payload)) }).catch(() => {});
  };

  const doFetch = async () => {
    setFetchError('');
    const parsed = parseSheetInput(sheetInput);
    if (!parsed) {
      setFetchError("That doesn't look like a Google Sheet link or ID. Paste the full URL from your browser's address bar.");
      return;
    }
    setFetching(true);
    try {
      const fetched = await fetchSheetRows({ sheetId: parsed.sheetId, gid: parsed.gid, sheetName });
      if (fetched.length === 0) {
        setFetchError('No rows found. Make sure the sheet has a header row and at least one row of data below it.');
      }
      const driveApiKey = profile?.driveApiKey || '';
      const withImages = await Promise.all(
        fetched.map(async (r) => {
          const { images, folder, error } = await resolveRowImages(r.imageUrl, driveApiKey);
          return {
            ...r,
            included: true,
            images,
            imageUrl: images[0] || '',
            imageCount: images.length,
            driveFolder: folder,
            imageError: error,
          };
        })
      );
      // Update #4 — merge into the existing queue instead of replacing it:
      // rows already sitting in the queue (and not yet posted) keep their
      // position, any local edits, and their run-log entry; only genuinely
      // new rows (by rowNumber) get appended at the end. Rows the person has
      // already deleted from the queue stay deleted even if re-fetched.
      // If this is a different sheet than what's currently loaded, start
      // clean instead of merging unrelated rows together.
      const isSameSheet = sheetId === parsed.sheetId;
      let nextRows;
      setRows((prevRows) => {
        const baseRows = isSameSheet ? prevRows : [];
        const existingByNum = new Map(baseRows.map((r) => [r.rowNumber, r]));
        const merged = baseRows.map((r) => {
          const fresh = withImages.find((f) => f.rowNumber === r.rowNumber);
          // Row still exists in the sheet — keep local state (included flag,
          // any edited caption) but refresh image resolution in case the
          // sheet's image link changed.
          return fresh ? { ...r, images: fresh.images, imageUrl: fresh.imageUrl, imageCount: fresh.imageCount, driveFolder: fresh.driveFolder, imageError: fresh.imageError } : r;
        });
        const newOnes = withImages.filter((f) => !existingByNum.has(f.rowNumber));
        nextRows = [...merged, ...newOnes];
        return nextRows;
      });
      if (!isSameSheet) setRunLog({});
      setSheetId(parsed.sheetId);
      persistSheetSource({
        sheetId: parsed.sheetId,
        rows: nextRows,
        runLog: isSameSheet ? runLog : {},
      });
    } catch (e) {
      setFetchError(e.message);
    } finally {
      setFetching(false);
    }
  };

  const toggleRow = (rowNumber) => {
    setRows((prev) => prev.map((r) => (r.rowNumber === rowNumber ? { ...r, included: !r.included } : r)));
  };

  // Update #4 — permanently remove a row from the local queue. A deleted
  // row is spliced out entirely, so a re-fetch of the sheet won't bring it
  // back with a stale state, and it can never be scheduled/posted from here.
  const deleteRow = (rowNumber) => {
    setRows((prev) => prev.filter((r) => r.rowNumber !== rowNumber));
    setRunLog((prev) => {
      const next = { ...prev };
      delete next[rowNumber];
      return next;
    });
  };

  // Update #4 — drag-to-reorder. Order here directly controls the schedule
  // order (earlier in the list = earlier publish slot), so reordering
  // before approving actually changes when each post goes out.
  const [dragRowIndex, setDragRowIndex] = useState(null);
  const [dragOverRowIndex, setDragOverRowIndex] = useState(null);
  const reorderRows = (fromIndex, toIndex) => {
    setRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
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
    persistSheetSource({ cycle: nextCycle, runLog: {} });
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
            <p className="field-hint" style={{ margin: '6px 0 4px' }}>
              Drag ⋮⋮ to reorder (changes posting order) · uncheck to skip · ✕ to delete for good — a deleted row
              never posts, even if you re-fetch the sheet.
            </p>

            <div className="post-list" style={{ marginTop: 12 }}>
              {rows.map((row, i) => {
                const key = sheetId ? rowKey(sheetId, row.rowNumber, cycle) : null;
                const isDup = key && dupSet.has(key);
                const log = runLog[row.rowNumber];
                const isImmediateSlot = postFirstNow && includedRows[0]?.rowNumber === row.rowNumber;
                const isBusy = log?.state === 'posting' || approving;

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

                const canDrag = !isBusy && !log; // once it's touched by a run, its position is locked

                return (
                  <div
                    key={row.rowNumber}
                    className="card sheet-row"
                    onClick={() => setPreviewRow(row)}
                    draggable={canDrag}
                    onDragStart={(e) => { e.stopPropagation(); setDragRowIndex(i); }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!canDrag) return;
                      setDragOverRowIndex(i);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverRowIndex(null);
                      if (dragRowIndex === null || dragRowIndex === i || !canDrag) { setDragRowIndex(null); return; }
                      reorderRows(dragRowIndex, i);
                      setDragRowIndex(null);
                    }}
                    onDragEnd={() => { setDragRowIndex(null); setDragOverRowIndex(null); }}
                    style={{
                      opacity: dragRowIndex === i ? 0.5 : 1,
                      background: dragOverRowIndex === i ? 'var(--bg-2)' : undefined,
                      cursor: canDrag ? 'grab' : undefined,
                    }}
                  >
                    {canDrag && (
                      <span style={{ opacity: 0.5, marginRight: 2 }} onClick={(e) => e.stopPropagation()}>⋮⋮</span>
                    )}
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
                    {canDrag && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => { e.stopPropagation(); deleteRow(row.rowNumber); }}
                        aria-label={`Delete row ${row.rowNumber}`}
                        title="Delete — this row will never be posted"
                      >
                        ✕
                      </button>
                    )}
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
