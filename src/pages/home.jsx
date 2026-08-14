import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { watchPosts } from '../services/content';
import TallyDot from '../components/tally-dot';

const PLATFORMS = [
  { key: 'facebook', label: 'Facebook', icon: 'f', live: true },
  { key: 'instagram', label: 'Instagram', icon: '◎', live: false },
  { key: 'youtube', label: 'YouTube', icon: '▶', live: true },
];

export default function Home() {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState('facebook');
  const [posts, setPosts] = useState([]);
  const pages = profile?.pages || [];
  const youtube = profile?.youtube || null;

  useEffect(() => {
    if (!user) return;
    return watchPosts(user.uid, setPosts);
  }, [user]);

  // Older Facebook posts were saved before a `platform` field existed, so
  // treat a missing platform as Facebook rather than losing them from Home.
  const postsForTab = posts.filter((p) => (p.platform || 'facebook') === tab);
  const recent = postsForTab.slice(0, 4);
  const draftCount = postsForTab.filter((p) => p.status === 'draft').length;
  const postedCount = postsForTab.filter((p) => p.status === 'posted').length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Home</h1>
          <p className="field-hint">Every channel, one control room.</p>
        </div>
        <Link to="/create" className="btn btn-accent">+ New post</Link>
      </div>

      <div className="platform-tabs">
        {PLATFORMS.map((p) => (
          <button
            key={p.key}
            className={`platform-tab ${tab === p.key ? 'platform-tab-active' : ''}`}
            onClick={() => setTab(p.key)}
          >
            <TallyDot
              status={
                (p.key === 'facebook' && pages.length > 0) || (p.key === 'youtube' && youtube?.refreshToken)
                  ? 'live'
                  : 'idle'
              }
            />
            <span className="platform-tab-icon">{p.icon}</span>
            {p.label}
            {!p.live && <span className="badge badge-idle" style={{ marginLeft: 6 }}>Soon</span>}
          </button>
        ))}
      </div>

      {tab === 'facebook' ? (
        <>
          {pages.length > 0 ? (
            <>
              {pages.map((fb) => (
                <div key={fb.pageId} className="card page-card channel-card">
                  <img src={fb.avatar} alt="" className="channel-card-avatar" />
                  <div className="channel-card-info">
                    <div className="channel-card-name">
                      {fb.name}
                      <TallyDot status="live" />
                    </div>
                    <div className="field-hint mono">
                      {fb.fanCount != null ? `${fb.fanCount.toLocaleString()} followers` : 'Facebook Page'}
                    </div>
                  </div>
                  <div className="channel-card-actions">
                    <Link to="/create" className="btn btn-primary btn-sm">Create post</Link>
                    <Link to="/settings" className="btn btn-ghost btn-sm">Manage</Link>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="card page-card empty-card">
              <div className="empty-card-icon">f</div>
              <h3>No page connected yet</h3>
              <p className="field-hint" style={{ margin: '6px 0 16px' }}>
                Connect your Facebook Page to start publishing from here.
              </p>
              <Link to="/settings" className="btn btn-accent">Connect profile</Link>
            </div>
          )}

          <div className="stat-row">
            <div className="card stat-card">
              <div className="stat-num">{postedCount}</div>
              <div className="field-hint">Posted</div>
            </div>
            <div className="card stat-card">
              <div className="stat-num">{draftCount}</div>
              <div className="field-hint">Drafts waiting</div>
            </div>
          </div>

          <div className="section-head">
            <h3>Recent activity</h3>
            <Link to="/log" className="field-hint">View broadcast log →</Link>
          </div>
          {recent.length === 0 ? (
            <div className="card page-card empty-card-sm">
              <p className="field-hint">Nothing here yet — your posts and drafts will show up once you create one.</p>
            </div>
          ) : (
            <div className="post-list">
              {recent.map((p) => (
                <div key={p.id} className="card post-row">
                  <TallyDot status={p.status === 'posted' ? 'live' : p.status === 'scheduled' ? 'ok' : 'warn'} />
                  {(p.imageDataUrl || p.imageUrl) && (
                    <img src={p.imageDataUrl || p.imageUrl} alt="" className="post-row-thumb" />
                  )}
                  <div className="post-row-text">{p.caption || '(no caption)'}</div>
                  <span className={`badge badge-${p.status === 'posted' ? 'live' : p.status === 'scheduled' ? 'ok' : 'warn'}`}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : tab === 'youtube' ? (
        <>
          {youtube?.refreshToken ? (
            <div className="card page-card channel-card">
              {youtube.avatar && <img src={youtube.avatar} alt="" className="channel-card-avatar" />}
              <div className="channel-card-info">
                <div className="channel-card-name">
                  {youtube.title}
                  <TallyDot status="live" />
                </div>
                <div className="field-hint mono">
                  {youtube.subscriberCount != null ? `${Number(youtube.subscriberCount).toLocaleString()} subscribers` : 'YouTube channel'}
                </div>
              </div>
              <div className="channel-card-actions">
                <Link to="/create-youtube" className="btn btn-primary btn-sm">Upload video</Link>
                <Link to="/settings" className="btn btn-ghost btn-sm">Manage</Link>
              </div>
            </div>
          ) : (
            <div className="card page-card empty-card">
              <div className="empty-card-icon">▶</div>
              <h3>No YouTube channel connected yet</h3>
              <p className="field-hint" style={{ margin: '6px 0 16px' }}>
                Connect your YouTube channel to start uploading — manually or straight from a sheet.
              </p>
              <Link to="/settings" className="btn btn-accent">Connect profile</Link>
            </div>
          )}
          <div className="stat-row">
            <div className="card stat-card">
              <div className="stat-num">{postedCount}</div>
              <div className="field-hint">Posted</div>
            </div>
            <div className="card stat-card">
              <div className="stat-num">{draftCount}</div>
              <div className="field-hint">Drafts waiting</div>
            </div>
          </div>
          <div className="section-head">
            <h3>Recent activity</h3>
            <Link to="/log" className="field-hint">View broadcast log →</Link>
          </div>
          {recent.length === 0 ? (
            <div className="card page-card empty-card-sm">
              <p className="field-hint">Nothing here yet — your uploads and drafts will show up once you create one.</p>
            </div>
          ) : (
            <div className="post-list">
              {recent.map((p) => (
                <div key={p.id} className="card post-row">
                  <TallyDot status={p.status === 'posted' ? 'live' : p.status === 'scheduled' ? 'ok' : 'warn'} />
                  <div className="post-row-text">{p.title || p.caption || '(untitled)'}</div>
                  <span className={`badge badge-${p.status === 'posted' ? 'live' : p.status === 'scheduled' ? 'ok' : 'warn'}`}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="card page-card empty-card">
          <div className="empty-card-icon">{PLATFORMS.find((p) => p.key === tab)?.icon}</div>
          <h3>{PLATFORMS.find((p) => p.key === tab)?.label} is on the way</h3>
          <p className="field-hint" style={{ margin: '6px 0 0' }}>
            This tab is reserved for when {PLATFORMS.find((p) => p.key === tab)?.label} support ships.
          </p>
        </div>
      )}
    </div>
  );
}
