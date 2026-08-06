import { useState } from 'react';
import { useAuth } from '../context/auth-context';
import { fetchManagedPages } from '../services/facebook';
import TallyDot from '../components/tally-dot';

export default function Settings() {
  const { profile, updateProfile } = useAuth();
  const fb = profile?.fb;

  const [userToken, setUserToken] = useState('');
  const [pages, setPages] = useState([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [fbError, setFbError] = useState('');
  const [showFbGuide, setShowFbGuide] = useState(false);

  const [geminiKey, setGeminiKey] = useState(profile?.geminiApiKey || '');
  const [geminiSaved, setGeminiSaved] = useState(false);
  const [showGeminiGuide, setShowGeminiGuide] = useState(false);

  const findPages = async () => {
    if (!userToken.trim()) return;
    setFbError('');
    setLoadingPages(true);
    setPages([]);
    try {
      const result = await fetchManagedPages(userToken.trim());
      if (result.length === 0) setFbError('That token worked, but no Pages were found for it.');
      setPages(result);
    } catch (e) {
      setFbError(e.message);
    } finally {
      setLoadingPages(false);
    }
  };

  const connectPage = async (page) => {
    await updateProfile({
      fb: {
        pageId: page.id,
        pageAccessToken: page.accessToken,
        name: page.name,
        avatar: page.avatar,
        fanCount: page.fanCount,
        connectedAt: Date.now(),
      },
    });
    setPages([]);
    setUserToken('');
  };

  const disconnectPage = async () => {
    await updateProfile({ fb: null });
  };

  const saveGeminiKey = async () => {
    await updateProfile({ geminiApiKey: geminiKey.trim() });
    setGeminiSaved(true);
    setTimeout(() => setGeminiSaved(false), 2000);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Connect profile</h1>
          <p className="field-hint">Link the accounts Social Manager publishes to and generates with.</p>
        </div>
      </div>

      {/* Facebook connect */}
      <div className="card page-card">
        <div className="settings-block-head">
          <h3>Facebook Page</h3>
          <TallyDot status={fb ? 'live' : 'idle'} />
        </div>

        {fb ? (
          <div className="channel-card" style={{ marginTop: 12 }}>
            <img src={fb.avatar} alt="" className="channel-card-avatar" />
            <div className="channel-card-info">
              <div className="channel-card-name">{fb.name}</div>
              <div className="field-hint mono">
                {fb.fanCount != null ? `${fb.fanCount.toLocaleString()} followers` : 'Connected'}
              </div>
            </div>
            <button className="btn btn-danger btn-sm" onClick={disconnectPage}>Disconnect</button>
          </div>
        ) : (
          <>
            <div className="field" style={{ marginTop: 14 }}>
              <label>Facebook Page access token</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={userToken}
                  onChange={(e) => setUserToken(e.target.value)}
                  placeholder="Paste your token"
                />
                <button className="btn btn-primary" onClick={findPages} disabled={loadingPages || !userToken.trim()}>
                  {loadingPages ? 'Looking…' : 'Find pages'}
                </button>
              </div>
              {fbError && <div className="field-error">{fbError}</div>}
            </div>

            {pages.length > 0 && (
              <div className="page-pick-list">
                {pages.map((p) => (
                  <div key={p.id} className="page-pick-row">
                    <img src={p.avatar} alt="" className="channel-card-avatar" />
                    <div className="channel-card-info">
                      <div className="channel-card-name">{p.name}</div>
                      <div className="field-hint mono">
                        {p.fanCount != null ? `${p.fanCount.toLocaleString()} followers` : ''}
                      </div>
                    </div>
                    <button className="btn btn-accent btn-sm" onClick={() => connectPage(p)}>Connect</button>
                  </div>
                ))}
              </div>
            )}

            <button className="link-toggle" onClick={() => setShowFbGuide((v) => !v)}>
              {showFbGuide ? 'Hide' : 'How do I get a token?'}
            </button>
            {showFbGuide && (
              <ol className="guide-list">
                <li>Go to developers.facebook.com and create a free app (type: "Business").</li>
                <li>Add the "Facebook Login" and "Pages API" products to the app.</li>
                <li>In Graph API Explorer, select your app, then your Page, and grant it pages_show_list, pages_manage_posts, and pages_read_engagement.</li>
                <li>Generate the token there and paste it above — Social Manager uses it once to fetch your Page's own token, then stores that instead.</li>
              </ol>
            )}
          </>
        )}
      </div>

      {/* Gemini key */}
      <div className="card page-card">
        <div className="settings-block-head">
          <h3>Gemini API key</h3>
          <TallyDot status={profile?.geminiApiKey ? 'live' : 'idle'} />
        </div>
        <p className="field-hint" style={{ margin: '6px 0 14px' }}>
          Powers the AI agent — content ideas, captions, and image generation, all on Google's free tier.
        </p>
        <div className="field">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="Paste your Gemini API key"
            />
            <button className="btn btn-primary" onClick={saveGeminiKey} disabled={!geminiKey.trim()}>
              {geminiSaved ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        </div>
        <button className="link-toggle" onClick={() => setShowGeminiGuide((v) => !v)}>
          {showGeminiGuide ? 'Hide' : 'How do I get a key?'}
        </button>
        {showGeminiGuide && (
          <ol className="guide-list">
            <li>Go to aistudio.google.com and sign in with any Google account.</li>
            <li>Click "Get API key" → "Create API key" — no billing required for the free tier.</li>
            <li>Copy the key and paste it above. Free tier covers text and image generation; video (Veo) needs billing enabled, so it isn't part of Social Manager yet.</li>
          </ol>
        )}
      </div>

      <div className="card page-card">
        <div className="settings-block-head">
          <h3>Profile</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <span className="sidebar-avatar" style={{ fontSize: 28 }}>{profile?.avatar}</span>
          <span>{profile?.name}</span>
        </div>
      </div>
    </div>
  );
}
