import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { watchPosts, deletePost } from '../services/content';
import TallyDot from '../components/tally-dot';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'posted', label: 'Posted' },
];

export default function Log() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!user) return;
    return watchPosts(user.uid, setPosts);
  }, [user]);

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
                <img src={p.imageDataUrl || p.imageUrl} alt="" className="post-row-thumb" />
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
