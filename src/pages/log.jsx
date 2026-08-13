import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { watchPosts, deletePost, updatePostStatus } from '../services/content';
import { checkPostStatus } from '../services/facebook';
import TallyDot from '../components/tally-dot';

const STATUS_CHECK_INTERVAL_MS = 60_000; // check every 60s, per Update #1

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'posted', label: 'Posted' },
];

export default function Log() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [filter, setFilter] = useState('all');
  const checkingRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    return watchPosts(user.uid, setPosts);
  }, [user]);

  // Update #1 — scheduled posts don't flip to "posted" on their own once
  // Facebook actually publishes them; poll the Graph API periodically and
  // update Firestore the moment a scheduled post goes live.
  useEffect(() => {
    if (!user) return;

    const runCheck = async () => {
      if (checkingRef.current) return;
      const pages = profile?.pages || [];
      const scheduled = posts.filter((p) => p.status === 'scheduled' && p.fbPostId && p.fbPageId);
      if (scheduled.length === 0 || pages.length === 0) return;
      checkingRef.current = true;
      try {
        for (const p of scheduled) {
          const page = pages.find((pg) => pg.pageId === p.fbPageId);
          if (!page?.pageAccessToken) continue;
          const result = await checkPostStatus(p.fbPostId, page.pageAccessToken);
          if (result === 'posted') {
            await updatePostStatus(user.uid, p.id, 'posted');
          }
        }
      } finally {
        checkingRef.current = false;
      }
    };

    runCheck();
    const t = setInterval(runCheck, STATUS_CHECK_INTERVAL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, posts, profile]);

  const visible = filter === 'all' ? posts : posts.filter((p) => p.status === filter);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Broadcast log</h1>
          <p className="field-hint">Every draft and every post, in one place.</p>
        </div>
      </div>

      <div className="tab-strip">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`tab-btn ${filter === f.key ? 'tab-btn-active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="card page-card empty-card-sm">
          <p className="field-hint">Nothing here yet.</p>
        </div>
      ) : (
        <div className="post-list">
          {visible.map((p) => (
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
                {p.caption || '(no caption)'}
                {p.status === 'scheduled' && p.scheduledAt && (
                  <span className="field-hint" style={{ display: 'block' }}>
                    Scheduled for {new Date(p.scheduledAt).toLocaleString()}
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
                <button className="btn btn-danger btn-sm" onClick={() => deletePost(user.uid, p.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
