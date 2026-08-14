import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { watchPosts, deletePost, updatePostStatus, updatePostInsights } from '../services/content';
import { checkPostStatus, fetchPostInsights } from '../services/facebook';
import TallyDot from '../components/tally-dot';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'posted', label: 'Posted' },
];

/** The one timestamp that actually matters for ordering a row: when it went
 * out (posted), when it's due (scheduled), or when it was last touched
 * (draft) — falling back through whichever fields exist on the post. */
function rowTime(p) {
  return p.scheduledAt || p.updatedAt?.toMillis?.() || p.updatedAt || p.createdAt?.toMillis?.() || p.createdAt || 0;
}

export default function Log() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [filter, setFilter] = useState('all');
  const [pageFilter, setPageFilter] = useState('all');
  const pages = profile?.pages || [];
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);
  // Update #12 — surface WHY a scheduled post couldn't be verified, instead
  // of it just silently staying "Scheduled" with no explanation.
  const [staleTokenPages, setStaleTokenPages] = useState([]);
  const [refreshingInsights, setRefreshingInsights] = useState(false);

  useEffect(() => {
    if (!user) return;
    return watchPosts(user.uid, setPosts);
  }, [user]);

  // Pull reactions/comments/shares for every posted item that either has
  // no insights yet, or whose numbers are more than 30 minutes stale — so
  // opening the log keeps performance data reasonably fresh without
  // hammering the Graph API on every render.
  const refreshInsights = async () => {
    if (refreshingInsights) return;
    const STALE_MS = 30 * 60 * 1000;
    const targets = posts.filter(
      (p) => p.status === 'posted' && p.fbPostId && p.fbPageId && (!p.insights || Date.now() - (p.insights.fetchedAt || 0) > STALE_MS)
    );
    if (targets.length === 0) return;
    setRefreshingInsights(true);
    try {
      for (const p of targets) {
        const page = pages.find((pg) => pg.pageId === p.fbPageId);
        if (!page?.pageAccessToken) continue;
        const insights = await fetchPostInsights(p.fbPostId, page.pageAccessToken);
        if (insights) await updatePostInsights(user.uid, p.id, insights);
      }
    } finally {
      setRefreshingInsights(false);
    }
  };

  useEffect(() => {
    if (posts.length > 0) refreshInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, posts.length]);

  // Update #10 — the background sync that flips "scheduled" → "posted" now
  // runs globally (see ProtectedLayout / use-post-status-sync.js) so it
  // keeps working no matter which page is open. This button lets you force
  // an immediate check against Facebook right now, on top of that.
  const checkNow = async () => {
    if (checking) return;
    const pages = profile?.pages || [];
    const scheduled = posts.filter((p) => p.status === 'scheduled' && p.fbPostId && p.fbPageId);
    setChecking(true);
    const authFailedPageIds = new Set();
    try {
      for (const p of scheduled) {
        const page = pages.find((pg) => pg.pageId === p.fbPageId);
        if (!page?.pageAccessToken) continue;
        const result = await checkPostStatus(p.fbPostId, page.pageAccessToken);
        if (result === 'posted') {
          await updatePostStatus(user.uid, p.id, 'posted');
        } else if (result === 'auth_error') {
          authFailedPageIds.add(p.fbPageId);
        }
      }
      setStaleTokenPages(pages.filter((pg) => authFailedPageIds.has(pg.pageId)).map((pg) => pg.name));
      setLastChecked(Date.now());
    } finally {
      setChecking(false);
    }
  };

  const byStatus = filter === 'all' ? posts : posts.filter((p) => p.status === filter);
  const byPage = pageFilter === 'all' ? byStatus : byStatus.filter((p) => p.fbPageId === pageFilter);
  // Selecting a page shows every one of its posts in true chronological
  // order — most recent (or soonest-due) first — instead of the mixed,
  // recently-edited ordering Firestore returns by default.
  const visible = [...byPage].sort((a, b) => rowTime(b) - rowTime(a));
  const scheduledCount = posts.filter((p) => p.status === 'scheduled').length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Broadcast log</h1>
          <p className="field-hint">Every draft and every post, in one place.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {pages.length > 1 && (
            <select value={pageFilter} onChange={(e) => setPageFilter(e.target.value)} style={{ maxWidth: 200 }}>
              <option value="all">All pages</option>
              {pages.map((p) => (
                <option key={p.pageId} value={p.pageId}>{p.name}</option>
              ))}
            </select>
          )}
          <button className="btn btn-ghost btn-sm" onClick={refreshInsights} disabled={refreshingInsights}>
            {refreshingInsights ? 'Loading…' : '📈 Refresh performance'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={checkNow} disabled={checking || scheduledCount === 0}>
            {checking ? 'Checking…' : '↻ Check status now'}
          </button>
        </div>
      </div>
      {lastChecked && (
        <p className="field-hint" style={{ marginTop: -10, marginBottom: 14 }}>
          Last checked {new Date(lastChecked).toLocaleTimeString()}
        </p>
      )}
      {staleTokenPages.length > 0 && (
        <div className="field-error" style={{ marginTop: -8, marginBottom: 14 }}>
          Couldn't verify posts for {staleTokenPages.join(', ')} — that page's saved token has expired.{' '}
          <Link to="/settings">Reconnect it in Settings</Link>, then check again. If a post's scheduled time has
          already passed, it's likely already live on Facebook even though it still shows "Scheduled" here — you
          can mark it manually below once you're sure.
        </div>
      )}

      <div className="tab-strip">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`tab-btn ${filter === f.key ? 'tab-btn-active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            {f.key === 'scheduled' && scheduledCount > 0 ? ` (${scheduledCount})` : ''}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="card page-card empty-card-sm">
          <p className="field-hint">Nothing here yet.</p>
        </div>
      ) : (
        <div className="post-list">
          {visible.map((p) => {
            const page = pages.find((pg) => pg.pageId === p.fbPageId);
            return (
              <div key={p.id} className="card post-row post-row-lg">
                <TallyDot status={p.status === 'posted' ? 'live' : p.status === 'scheduled' ? 'ok' : 'warn'} />
                {(p.imageDataUrl || p.imageUrl) && (
                  <div className="post-row-thumb-wrap">
                    <img src={p.imageDataUrl || p.imageUrl} alt="" className="post-row-thumb" />
                    {p.imageUrls && p.imageUrls.length > 1 && (
                      <span className="post-row-thumb-count">{p.imageUrls.length}</span>
                    )}
                  </div>
                )}
                <div className="post-row-text">
                  {page && (
                    <span className="post-row-page">
                      {page.avatar && <img src={page.avatar} alt="" className="post-row-page-avatar" />}
                      {page.name}
                    </span>
                  )}
                  <div>{p.caption || '(no caption)'}</div>
                  {p.status === 'scheduled' && p.scheduledAt && (
                    <span className="field-hint" style={{ display: 'block' }}>
                      Scheduled for {new Date(p.scheduledAt).toLocaleString()}
                      {p.scheduledAt < Date.now() && ' · past due — likely already live'}
                    </span>
                  )}
                  {p.status === 'posted' && rowTime(p) > 0 && (
                    <span className="field-hint" style={{ display: 'block' }}>
                      Posted {new Date(rowTime(p)).toLocaleString()}
                    </span>
                  )}
                  {p.status === 'posted' && p.insights && (
                    <span className="post-row-insights mono">
                      ❤ {p.insights.reactions} · 💬 {p.insights.comments} · ↪ {p.insights.shares}
                    </span>
                  )}
                </div>
                <span className={`badge badge-${p.status === 'posted' ? 'live' : p.status === 'scheduled' ? 'ok' : 'warn'}`}>
                  {p.status}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {p.status === 'draft' && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => navigate('/create', { state: { draft: p } })}
                    >
                      Continue editing
                    </button>
                  )}
                  {p.status === 'scheduled' && p.scheduledAt < Date.now() && (
                    <button
                      className="btn btn-ghost btn-sm"
                      title="Use this once you've confirmed on Facebook that it actually posted"
                      onClick={() => updatePostStatus(user.uid, p.id, 'posted')}
                    >
                      Mark as posted
                    </button>
                  )}
                  <button className="btn btn-danger btn-sm" onClick={() => deletePost(user.uid, p.id)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
