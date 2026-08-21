import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { publishToPage, schedulePost } from '../services/facebook';
import { savePost, watchPosts } from '../services/content';
import { parseWebsiteInput, fetchWebsiteRows, buildWebsiteCaption } from '../services/website';
import { fetchImageBlob } from '../services/sheets';
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

// Website rows are keyed by their own URL rather than a spreadsheet row
// number, since there's no sheet — the URL is the one stable identifier a
// given row will always have, even across re-fetches.
function rowKey(url, cycle) {
  return `website:${url}:c${cycle}`;
}

function genId() {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptySource(pageId) {
  return {
    id: genId(),
    label: '',
    pageId: pageId || null,
    input: '',
    promoCode: 'CAMPUS',
    intervalHours: 4,
    postFirstNow: true,
    cycle: 1,
    rows: [],
    runLog: {},
    createdAt: Date.now(),
  };
}

export default function WebsiteImport() {
  const { user, profile, updateProfile } = useAuth();
  const pages = profile?.pages || [];

  // Same multi-queue pattern as Post from sheet — each queue is its own
  // entry in `profile.websiteSources`, switchable via tabs, so a queue for
  // one page keeps running on its own schedule while a separate one is set
  // up for another page.
  const sources = useMemo(() => profile?.websiteSources || [], [profile]);

  const [activeSourceId, setActiveSourceId] = useState(null);

  useEffect(() => {
    if (activeSourceId && sources.some((s) => s.id === activeSourceId)) return;
    if (sources.length > 0) {
      setActiveSourceId(sources[0].id);
    } else if (pages.length > 0 && user) {
      const entry = emptySource(pages[0].pageId);
      updateProfile({ websiteSources: [entry] }).catch(() => {});
      setActiveSourceId(entry.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, pages.length, user]);

  const activeSource = sources.find((s) => s.id === activeSourceId) || null;

  const [selectedPageId, setSelectedPageId] = useState(null);
  const fb = pages.find((p) => p.pageId === selectedPageId) || pages[0] || null;

  const [queueLabel, setQueueLabel] = useState('');
  const [urlsInput, setUrlsInput] = useState('');
  const [promoCode, setPromoCode] = useState('CAMPUS');
  const [rows, setRows] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const [intervalPreset, setIntervalPreset] = useState(4);
  const [customHours, setCustomHours] = useState(1);
  const intervalHours = intervalPreset === 'custom' ? Number(customHours) || MIN_CUSTOM_HOURS : intervalPreset;

  const [postFirstNow, setPostFirstNow] = useState(true);
  const [cycle, setCycle] = useState(1);
  const [previewRow, setPreviewRow] = useState(null);
  const [approving, setApproving] = useState(false);
  const [runLog, setRunLog] = useState({}); // rowNumber -> { state, message, scheduledFor }
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    if (!user) return;
    return watchPosts(user.uid, setPosts);
  }, [user]);

  const persistTimerRef = useRef(null);
  const skipNextPersistRef = useRef(true);
  const loadedIdRef = useRef(null);
  useEffect(() => {
    if (!activeSourceId || loadedIdRef.current === activeSourceId) return;
    const s = sources.find((x) => x.id === activeSourceId) || {};
    loadedIdRef.current = activeSourceId;
    skipNextPersistRef.current = true;
    setSelectedPageId(s.pageId || pages[0]?.pageId || null);
    setQueueLabel(s.label || '');
    setUrlsInput(s.input || '');
    setPromoCode(s.promoCode ?? 'CAMPUS');
    setRows(s.rows || []);
    setIntervalPreset(
      s.intervalHours && INTERVAL_PRESETS.some((p) => p.hours === s.intervalHours) ? s.intervalHours : 4
    );
    setCustomHours(
      s.intervalHours && !INTERVAL_PRESETS.some((p) => p.hours === s.intervalHours) ? s.intervalHours : 1
    );
    setPostFirstNow(s.postFirstNow !== false);
    setCycle(s.cycle || 1);
    setRunLog(s.runLog || {});
    setFetchError('');
    setPreviewRow(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSourceId, sources]);

  const persistActiveSource = (overrides = {}) => {
    if (!user || !activeSourceId) return;
    const current = {
      id: activeSourceId,
      label: queueLabel.trim(),
      pageId: selectedPageId || null,
      input: urlsInput.trim(),
      promoCode: promoCode.trim(),
      intervalHours,
      postFirstNow,
      cycle,
      rows,
      runLog,
      createdAt: activeSource?.createdAt || Date.now(),
      ...overrides,
    };
    const nextSources = sources.map((s) => (s.id === activeSourceId ? current : s));
    if (!nextSources.some((s) => s.id === activeSourceId)) nextSources.push(current);
    updateProfile({ websiteSources: JSON.parse(JSON.stringify(nextSources)) }).catch(() => {});
  };

  useEffect(() => {
    if (!user || rows.length === 0 || !activeSourceId) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => persistActiveSource(), 600);
    return () => clearTimeout(persistTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, runLog, cycle]);

  const addQueue = async () => {
    const usedPageIds = new Set(sources.map((s) => s.pageId));
    const nextPage = pages.find((p) => !usedPageIds.has(p.pageId)) || pages[0];
    const entry = emptySource(nextPage?.pageId || null);
    const nextSources = [...sources, entry];
    await updateProfile({ websiteSources: JSON.parse(JSON.stringify(nextSources)) });
    loadedIdRef.current = null;
    setActiveSourceId(entry.id);
  };

  const removeQueue = async (id) => {
    const target = sources.find((s) => s.id === id);
    const name = target?.label || pages.find((p) => p.pageId === target?.pageId)?.name || 'this queue';
    if (!confirm(`Remove "${name}"? Posts already sent or scheduled stay on Facebook and in the broadcast log — this only removes the queue view here.`)) return;
    const nextSources = sources.filter((s) => s.id !== id);
    await updateProfile({ websiteSources: JSON.parse(JSON.stringify(nextSources)) });
    if (activeSourceId === id) {
      loadedIdRef.current = null;
      setActiveSourceId(nextSources[0]?.id || null);
    }
  };

  const dupSet = useMemo(() => {
    const s = new Set();
    posts.forEach((p) => p.sheetRowKey && s.add(p.sheetRowKey));
    return s;
  }, [posts]);

  const postByRowKey = useMemo(() => {
    const m = new Map();
    posts.forEach((p) => { if (p.sheetRowKey) m.set(p.sheetRowKey, p); });
    return m;
  }, [posts]);

  const includedRows = rows.filter(
    (r) => r.included && !dupSet.has(rowKey(r.url, cycle))
  );

  const allQueuedThisCycle =
    !fetching &&
    rows.length > 0 &&
    rows.every((r) => dupSet.has(rowKey(r.url, cycle)));

  const displayIndices = useMemo(() => {
    return rows
      .map((_, idx) => idx)
      .sort((a, b) => {
        const failedA = runLog[rows[a].rowNumber]?.state === 'failed' ? 1 : 0;
        const failedB = runLog[rows[b].rowNumber]?.state === 'failed' ? 1 : 0;
        if (failedA !== failedB) return failedA - failedB;
        return a - b;
      });
  }, [rows, runLog]);

  const doFetch = async () => {
    setFetchError('');
    const urls = parseWebsiteInput(urlsInput);
    if (urls.length === 0) {
      setFetchError('Paste at least one product/book page link (one per line).');
      return;
    }
    setFetching(true);
    try {
      const fetched = await fetchWebsiteRows({ urls, promoCode: promoCode.trim() });
      const withFlags = fetched.map((r) => ({ ...r, included: !r.imageError || !!r.title }));

      // Merge into the existing queue instead of replacing it, same as
      // sheet re-fetch: rows for a URL already in the queue keep their
      // local edits/position/run-log, refreshed only for title/image/price;
      // genuinely new URLs get appended at the end.
      let nextRows;
      setRows((prevRows) => {
        const existingByUrl = new Map(prevRows.map((r) => [r.url, r]));
        const merged = prevRows.map((r) => {
          const fresh = withFlags.find((f) => f.url === r.url);
          return fresh
            ? { ...r, title: fresh.title, price: fresh.price, imageUrl: fresh.imageUrl, images: fresh.images, imageCount: fresh.imageCount, imageSourceType: fresh.imageSourceType, imageError: fresh.imageError }
            : r;
        });
        const newOnes = withFlags.filter((f) => !existingByUrl.has(f.url)).map((f, i) => ({ ...f, rowNumber: prevRows.length + i + 1 }));
        nextRows = [...merged, ...newOnes];
        return nextRows;
      });
      const failedCount = fetched.filter((r) => r.imageError).length;
      if (failedCount === fetched.length) {
        setFetchError("Couldn't read any of those pages — they may block automated fetches, or the links are broken.");
      } else if (failedCount > 0) {
        setFetchError(`${failedCount} of ${fetched.length} link${fetched.length === 1 ? '' : 's'} couldn't be read — check them in the row list below.`);
      }
      persistActiveSource({ rows: nextRows });
    } catch (e) {
      setFetchError(e.message);
    } finally {
      setFetching(false);
    }
  };

  const toggleRow = (rowNumber) => {
    setRows((prev) => prev.map((r) => (r.rowNumber === rowNumber ? { ...r, included: !r.included } : r)));
  };

  const deleteRow = (rowNumber) => {
    setRows((prev) => prev.filter((r) => r.rowNumber !== rowNumber));
    setRunLog((prev) => {
      const next = { ...prev };
      delete next[rowNumber];
      return next;
    });
  };

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

  // Re-applies the current Promo code field to every row's caption without
  // re-fetching the pages — handy after tweaking the code (e.g. CAMPUS ->
  // CAMPUS10) once titles/prices are already pulled in.
  const reapplyPromoCode = () => {
    setRows((prev) => prev.map((r) => ({ ...r, caption: buildWebsiteCaption({ title: r.title, price: r.price, promoCode: promoCode.trim(), url: r.url }) })));
    persistActiveSource({ promoCode: promoCode.trim() });
  };

  const publishOneRow = async ({ row, key, publishAt }) => {
    setRunLog((prev) => ({ ...prev, [row.rowNumber]: { state: 'posting' } }));

    if (!row.images?.length && row.imageError) {
      setRunLog((prev) => ({ ...prev, [row.rowNumber]: { state: 'failed', message: row.imageError } }));
      return;
    }

    // The scraped image is a plain internet link (same as a "direct" sheet
    // image) — downloaded into the browser and uploaded as raw bytes,
    // since a lot of stores hotlink-protect their images against unknown
    // fetchers, including Facebook's own server.
    const isDirectSingleImage = row.imageSourceType === 'direct' && row.images?.length === 1;
    let imageBlob;
    if (isDirectSingleImage) {
      try {
        setRunLog((prev) => ({ ...prev, [row.rowNumber]: { state: 'posting', message: 'Downloading image…' } }));
        imageBlob = await fetchImageBlob(row.images[0]);
      } catch (e) {
        setRunLog((prev) => ({ ...prev, [row.rowNumber]: { state: 'failed', message: e.message } }));
        return;
      }
    }

    try {
      if (!publishAt) {
        const res = await publishToPage({
          pageId: fb.pageId,
          pageAccessToken: fb.pageAccessToken,
          message: row.caption,
          imageBlob,
          imageUrls: !imageBlob && row.images && row.images.length > 0 ? row.images : undefined,
        });
        await savePost(user.uid, {
          caption: row.caption,
          imageUrl: row.imageUrl || null,
          imageUrls: row.images || [],
          status: 'posted',
          fbPostId: res.id,
          fbPageId: fb.pageId,
          source: 'website',
          sheetRowKey: key,
        });
        setRunLog((prev) => ({ ...prev, [row.rowNumber]: { state: 'posted' } }));
      } else {
        const nowSec = Math.floor(Date.now() / 1000);
        if (publishAt - nowSec > MAX_SCHEDULE_SECONDS) {
          setRunLog((prev) => ({
            ...prev,
            [row.rowNumber]: {
              state: 'failed',
              message: "Beyond Facebook's 75-day scheduling limit — run this again once earlier posts go out.",
            },
          }));
          return;
        }
        const res = await schedulePost({
          pageId: fb.pageId,
          pageAccessToken: fb.pageAccessToken,
          message: row.caption,
          publishTimeUnix: publishAt,
          imageBlob,
          imageUrls: !imageBlob && row.images && row.images.length > 0 ? row.images : undefined,
        });
        await savePost(user.uid, {
          caption: row.caption,
          imageUrl: row.imageUrl || null,
          imageUrls: row.images || [],
          status: 'scheduled',
          fbPostId: res.id,
          fbPageId: fb.pageId,
          source: 'website',
          sheetRowKey: key,
          scheduledAt: publishAt * 1000,
        });
        setRunLog((prev) => ({ ...prev, [row.rowNumber]: { state: 'scheduled', scheduledFor: publishAt * 1000 } }));
      }
    } catch (e) {
      setRunLog((prev) => ({ ...prev, [row.rowNumber]: { state: 'failed', message: e.message } }));
    }
  };

  const runApprove = async (targetRows, targetCycle) => {
    if (!fb) return;
    if (targetRows.length === 0) return;
    setApproving(true);
    const nowSec = Math.floor(Date.now() / 1000);
    const intervalSec = Math.round(intervalHours * 3600);
    let scheduleSteps = 0;

    for (let i = 0; i < targetRows.length; i++) {
      const row = targetRows[i];
      const key = rowKey(row.url, targetCycle);
      const isImmediate = postFirstNow && i === 0;
      let publishAt = null;
      if (!isImmediate) {
        scheduleSteps += 1;
        publishAt = nowSec + scheduleSteps * intervalSec;
      }
      await publishOneRow({ row, key, publishAt });
    }
    setApproving(false);
  };

  const handleApprove = () => runApprove(includedRows, cycle);

  const retryRow = async (row) => {
    if (!fb || approving) return;
    const key = rowKey(row.url, cycle);
    await publishOneRow({ row, key, publishAt: null });
  };

  const retryAllFailed = async () => {
    if (!fb || approving) return;
    const failed = rows.filter((r) => runLog[r.rowNumber]?.state === 'failed');
    if (failed.length === 0) return;
    setApproving(true);
    for (const row of failed) {
      const key = rowKey(row.url, cycle);
      await publishOneRow({ row, key, publishAt: null });
    }
    setApproving(false);
  };

  const handleRepeat = () => {
    const nextCycle = cycle + 1;
    setCycle(nextCycle);
    setRunLog({});
    persistActiveSource({ cycle: nextCycle, runLog: {} });
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
          <h1>Post from website</h1>
          <p className="field-hint">
            Paste product/book page links — Title, image, and price are pulled straight off each page, with a bold
            promo code line added automatically. Then post them one by one on a timer, just like a sheet queue.
          </p>
        </div>
      </div>

      {sources.length > 0 && (
        <div className="tab-strip queue-tab-strip">
          {sources.map((s) => {
            const pageName = pages.find((p) => p.pageId === s.pageId)?.name || 'No page';
            const rowCount = s.id === activeSourceId ? rows.length : (s.rows?.length || 0);
            return (
              <button
                key={s.id}
                className={`tab-btn queue-tab-btn ${activeSourceId === s.id ? 'tab-btn-active' : ''}`}
                onClick={() => setActiveSourceId(s.id)}
              >
                {s.label || pageName}
                {rowCount > 0 && <span className="queue-tab-count">{rowCount}</span>}
              </button>
            );
          })}
          <button className="tab-btn queue-tab-add" onClick={addQueue} disabled={pages.length === 0}>
            + New queue
          </button>
        </div>
      )}

      {!fb && (
        <div className="card page-card empty-card">
          <div className="empty-card-icon">f</div>
          <h3>Connect a Facebook Page first</h3>
          <p className="field-hint" style={{ margin: '6px 0 16px' }}>
            You'll need a page connected before Social Manager can post anything from a website.
          </p>
          <Link to="/settings" className="btn btn-accent">Connect profile</Link>
        </div>
      )}

      {fb && (
        <div className="card page-card">
          <div className="section-step-head">
            <span className="section-step-num">1</span>
            <div className="settings-block-head" style={{ flex: 1 }}>
              <h3>Website links</h3>
              <TallyDot status={rows.length > 0 ? 'live' : 'idle'} />
            </div>
          </div>
          <p className="field-hint" style={{ margin: '6px 0 14px' }}>
            Paste one product/book page link per line. Each page's <strong>Title</strong>, <strong>image</strong>,
            and <strong>Price</strong> are read automatically (from the page's own product data where available),
            and a bold <strong>Promo Code</strong> line is added under the price on every post.
          </p>

          {sources.length > 1 && (
            <div className="field">
              <label>Queue name (optional — helps tell queues apart)</label>
              <input
                value={queueLabel}
                onChange={(e) => setQueueLabel(e.target.value)}
                onBlur={() => persistActiveSource({ label: queueLabel.trim() })}
                placeholder="e.g. New arrivals"
              />
            </div>
          )}

          {pages.length > 1 && (
            <div className="field">
              <label>Posting page for this queue</label>
              <select
                value={fb?.pageId || ''}
                onChange={(e) => {
                  const nextPageId = e.target.value;
                  setSelectedPageId(nextPageId);
                  persistActiveSource({ pageId: nextPageId });
                }}
              >
                {pages.map((p) => (
                  <option key={p.pageId} value={p.pageId}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="field">
            <label>Product / book page links (one per line)</label>
            <textarea
              value={urlsInput}
              onChange={(e) => setUrlsInput(e.target.value)}
              onBlur={() => persistActiveSource({ input: urlsInput.trim() })}
              rows={5}
              placeholder={'https://example-store.com/product-1\nhttps://example-store.com/product-2'}
            />
          </div>

          <div className="field">
            <label>Promo code</label>
            <input
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              onBlur={reapplyPromoCode}
              placeholder="e.g. CAMPUS"
            />
            <p className="field-hint" style={{ marginTop: 4 }}>
              Added to every post as a bold line: <strong>Promo Code: {promoCode.trim() || 'CAMPUS'}</strong>, followed
              by that book's page link.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={doFetch} disabled={fetching || !urlsInput.trim()}>
              {fetching ? 'Fetching…' : rows.length > 0 ? 'Re-fetch pages' : 'Fetch pages'}
            </button>
            {sources.length > 1 && (
              <button className="btn btn-danger btn-sm" onClick={() => removeQueue(activeSourceId)}>
                Remove this queue
              </button>
            )}
          </div>
          {fetchError && <div className="field-error" style={{ marginTop: 10 }}>{fetchError}</div>}
        </div>
      )}

      {fb && rows.length > 0 && (
        <>
          <div className="card page-card">
            <div className="section-step-head">
              <span className="section-step-num">2</span>
              <div className="settings-block-head" style={{ flex: 1 }}>
                <h3>Posting schedule</h3>
              </div>
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
              you close this browser tab. This queue runs independently of any other queue you've set up.
            </p>
          </div>

          <div className="card page-card">
            <div className="section-step-head">
              <span className="section-step-num">3</span>
              <div className="settings-block-head" style={{ flex: 1 }}>
                <h3>
                  Pages found ({rows.length}) · {includedRows.length} queued
                </h3>
                {cycle > 1 && <span className="badge badge-idle">Loop {cycle}</span>}
              </div>
            </div>
            <p className="field-hint" style={{ margin: '6px 0 4px' }}>
              Drag ⋮⋮ to reorder (changes posting order) · uncheck to skip · ✕ to delete for good — a deleted row
              never posts, even if you re-fetch the links.
            </p>

            <div className="post-list" style={{ marginTop: 12 }}>
              {displayIndices.map((i) => {
                const row = rows[i];
                const key = rowKey(row.url, cycle);
                const isDup = dupSet.has(key);
                const livePost = postByRowKey.get(key);
                const log = runLog[row.rowNumber];
                const isImmediateSlot = postFirstNow && includedRows[0]?.rowNumber === row.rowNumber;
                const isBusy = log?.state === 'posting' || approving;
                const isFailed = log?.state === 'failed';

                let statusLabel = 'Ready';
                let statusClass = 'ok';
                if (isDup) { statusLabel = 'Already queued'; statusClass = 'idle'; }
                else if (row.imageError) { statusLabel = 'Could not read page'; statusClass = 'warn'; }
                else if (!row.caption) { statusLabel = 'No data found'; statusClass = 'warn'; }
                else {
                  statusLabel = row.included && isImmediateSlot ? 'Ready · posts immediately' : 'Ready';
                }

                if (livePost?.status === 'posted') { statusLabel = 'Posted ✓'; statusClass = 'live'; }
                else if (livePost?.status === 'scheduled') {
                  statusLabel = `Scheduled · ${new Date(livePost.scheduledAt || log?.scheduledFor).toLocaleString()}`;
                  statusClass = 'ok';
                } else if (log?.state === 'posting') { statusLabel = 'Posting…'; statusClass = 'warn'; }
                else if (log?.state === 'posted') { statusLabel = 'Posted ✓'; statusClass = 'live'; }
                else if (log?.state === 'scheduled') {
                  statusLabel = `Scheduled · ${new Date(log.scheduledFor).toLocaleString()}`;
                  statusClass = 'ok';
                } else if (isFailed) { statusLabel = 'Failed'; statusClass = 'warn'; }

                const canDrag = !isBusy && !log;

                return (
                  <div
                    key={row.rowNumber}
                    className={`card sheet-row ${isFailed ? 'sheet-row-failed' : ''}`}
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
                      <span className="sheet-row-drag" onClick={(e) => e.stopPropagation()}>⋮⋮</span>
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
                      </div>
                    ) : (
                      <div className="post-row-thumb sheet-row-thumb-empty" />
                    )}
                    <div className="sheet-row-body">
                      <div className="sheet-row-caption">{row.caption || <span className="field-hint">(no data)</span>}</div>
                      {row.imageError && !log?.message && (
                        <div className="field-hint" style={{ color: 'var(--warn)' }}>{row.imageError}</div>
                      )}
                      {log?.message && <div className="field-hint" style={{ color: 'var(--warn)' }}>{log.message}</div>}
                    </div>
                    <span className={`badge badge-${statusClass}`}>{statusLabel}</span>
                    <div className="sheet-row-actions" onClick={(e) => e.stopPropagation()}>
                      {isFailed && (
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={approving}
                          onClick={() => retryRow(row)}
                          title="Post this one right away"
                        >
                          ↻ Retry
                        </button>
                      )}
                      {canDrag && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => deleteRow(row.rowNumber)}
                          aria-label={`Delete row ${row.rowNumber}`}
                          title="Delete — this row will never be posted"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {results.length > 0 && (
              <div className="run-summary">
                <div className="run-summary-stats">
                  <span className="run-summary-chip run-summary-chip-ok">✓ {doneCount} sent</span>
                  {failedCount > 0 && (
                    <span className="run-summary-chip run-summary-chip-warn">⚠ {failedCount} failed</span>
                  )}
                  {approving && <span className="run-summary-chip">Working…</span>}
                </div>
                {failedCount > 0 && (
                  <button className="btn btn-ghost btn-sm" disabled={approving} onClick={retryAllFailed}>
                    ↻ Retry all failed
                  </button>
                )}
              </div>
            )}

            {runComplete && (
              <p className="field-hint" style={{ marginTop: 10 }}>
                Done — {doneCount} sent to Facebook{failedCount > 0 ? `, ${failedCount} failed` : ''}. Check the{' '}
                <Link to="/log">broadcast log</Link> for full status.
              </p>
            )}

            {allQueuedThisCycle ? (
              <>
                <p className="field-hint" style={{ marginTop: 14 }}>
                  Every link in this queue has been posted or scheduled for loop {cycle}. Repeat it to start a new
                  loop from the top, spaced out the same way.
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
