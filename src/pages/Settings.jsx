import { useState } from 'react';
import { useAuth } from '../context/auth-context';
import { fetchManagedPages } from '../services/facebook';
import TallyDot from '../components/tally-dot';

export default function Settings() {
  const { profile, updateProfile } = useAuth();
  const connectedPages = profile?.pages || [];

  const [userToken, setUserToken] = useState('');
  const [foundPages, setFoundPages] = useState([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [fbError, setFbError] = useState('');
  const [showFbGuide, setShowFbGuide] = useState(false);
  const [showConnectForm, setShowConnectForm] = useState(false);

  const [geminiKey, setGeminiKey] = useState(profile?.geminiApiKey || '');
  const [geminiSaved, setGeminiSaved] = useState(false);
  const [geminiError, setGeminiError] = useState('');
  const [showGeminiGuide, setShowGeminiGuide] = useState(false);
  const [hasFbApp, setHasFbApp] = useState(false);

  const [driveKey, setDriveKey] = useState(profile?.driveApiKey || '');
  const [driveSaved, setDriveSaved] = useState(false);
  const [driveError, setDriveError] = useState('');
  const [showDriveGuide, setShowDriveGuide] = useState(false);

  const findPages = async () => {
    if (!userToken.trim()) return;
    setFbError('');
    setLoadingPages(true);
    setFoundPages([]);
    try {
      const result = await fetchManagedPages(userToken.trim());
      if (result.length === 0) setFbError('That token worked, but no Pages were found for it.');
      setFoundPages(result);
    } catch (e) {
      setFbError(e.message);
    } finally {
      setLoadingPages(false);
    }
  };

  const connectPage = async (page) => {
    try {
      const next = connectedPages.filter((p) => p.pageId !== page.id);
      next.push({
        pageId: page.id,
        pageAccessToken: page.accessToken,
        name: page.name,
        avatar: page.avatar,
        fanCount: page.fanCount,
        connectedAt: Date.now(),
      });
      await updateProfile({ pages: next });
      setFoundPages((prev) => prev.filter((p) => p.id !== page.id));
      setUserToken('');
      setShowConnectForm(false);
    } catch (e) {
      console.error('Failed to save connected page:', e);
      setFbError('Could not save that connection. Please try again.');
    }
  };

  const disconnectPage = async (pageId) => {
    try {
      await updateProfile({ pages: connectedPages.filter((p) => p.pageId !== pageId) });
    } catch (e) {
      console.error('Failed to disconnect page:', e);
      setFbError('Could not disconnect right now. Please try again.');
    }
  };

  const saveGeminiKey = async () => {
    setGeminiError('');
    try {
      await updateProfile({ geminiApiKey: geminiKey.trim() });
      setGeminiSaved(true);
      setTimeout(() => setGeminiSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save Gemini key:', e);
      setGeminiError('Could not save the key. Please try again.');
    }
  };

  const saveDriveKey = async () => {
    setDriveError('');
    try {
      await updateProfile({ driveApiKey: driveKey.trim() });
      setDriveSaved(true);
      setTimeout(() => setDriveSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save Drive API key:', e);
      setDriveError('Could not save the key. Please try again.');
    }
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
          <h3>Facebook Pages</h3>
          <TallyDot status={connectedPages.length > 0 ? 'live' : 'idle'} />
        </div>

        {connectedPages.length > 0 && (
          <div className="page-pick-list" style={{ marginTop: 12 }}>
            {connectedPages.map((fb) => (
              <div key={fb.pageId} className="channel-card">
                <img src={fb.avatar} alt="" className="channel-card-avatar" />
                <div className="channel-card-info">
                  <div className="channel-card-name">{fb.name}</div>
                  <div className="field-hint mono">
                    {fb.fanCount != null ? `${fb.fanCount.toLocaleString()} followers` : 'Connected'}
                  </div>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => disconnectPage(fb.pageId)}>
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        )}

        {showConnectForm || connectedPages.length === 0 ? (
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

            {foundPages.length > 0 && (
              <div className="page-pick-list">
                {foundPages.map((p) => {
                  const alreadyConnected = connectedPages.some((c) => c.pageId === p.id);
                  return (
                    <div key={p.id} className="page-pick-row">
                      <img src={p.avatar} alt="" className="channel-card-avatar" />
                      <div className="channel-card-info">
                        <div className="channel-card-name">{p.name}</div>
                        <div className="field-hint mono">
                          {p.fanCount != null ? `${p.fanCount.toLocaleString()} followers` : ''}
                        </div>
                      </div>
                      <button className="btn btn-accent btn-sm" onClick={() => connectPage(p)}>
                        {alreadyConnected ? 'Reconnect' : 'Connect'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {connectedPages.length > 0 && (
              <button
                className="link-toggle"
                onClick={() => {
                  setShowConnectForm(false);
                  setUserToken('');
                  setFoundPages([]);
                  setFbError('');
                }}
              >
                Cancel
              </button>
            )}
          </>
        ) : (
          <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setShowConnectForm(true)}>
            + Add another page
          </button>
        )}

        <button className="link-toggle" onClick={() => setShowFbGuide((v) => !v)}>
          {showFbGuide ? 'Hide guide' : 'How do I get a token?'}
        </button>
        {showFbGuide && (
              <div className="guide-panel">
                <p className="field-hint" style={{ margin: '2px 0 10px', fontWeight: 600 }}>
                  Takes about 5 minutes. You only need to do this once — after that, Social Manager
                  stores your Page's own token and reconnecting is rare.
                </p>

                <div className="guide-tabs">
                  <button
                    type="button"
                    className={`guide-tab-btn ${!hasFbApp ? 'guide-tab-btn-active' : ''}`}
                    onClick={() => setHasFbApp(false)}
                  >
                    I need to create an app
                  </button>
                  <button
                    type="button"
                    className={`guide-tab-btn ${hasFbApp ? 'guide-tab-btn-active' : ''}`}
                    onClick={() => setHasFbApp(true)}
                  >
                    I already have a Facebook app
                  </button>
                </div>

                <ol className="guide-list">
                  {hasFbApp ? (
                    <>
                      <li>
                        Go to <strong>developers.facebook.com/apps</strong> and log in with the Facebook
                        account that manages the app. Click on the app you already created for a
                        previous project — no need to make a new one, any app you own works fine here.
                      </li>
                      <li>
                        Check the toggle near the top of the dashboard: if it says{' '}
                        <strong>Development</strong> instead of <strong>Live</strong>, switch it to{' '}
                        <strong>Live</strong> now. This matters — posts published through an app still in
                        Development mode are only visible to that app's own Admins/Developers/Testers, not
                        to the public or your Page's followers. Going Live may ask you to fill in a{' '}
                        <strong>Privacy Policy URL</strong>, an <strong>App Icon</strong>, and a{' '}
                        <strong>Category</strong> under Settings → Basic first — any simple hosted page
                        works for the privacy policy.
                      </li>
                    </>
                  ) : (
                    <>
                      <li>
                        Go to <strong>developers.facebook.com/apps</strong> and log in with the Facebook
                        account that is an admin of your Page. Click <strong>Create App</strong>.
                      </li>
                      <li>
                        When asked what type of app, choose <strong>Business</strong> (or{' '}
                        <strong>Other</strong> if Business isn't offered). Give it any name.
                      </li>
                      <li>
                        Before generating a token, go to <strong>Settings → Basic</strong> and fill in a{' '}
                        <strong>Privacy Policy URL</strong>, an <strong>App Icon</strong>, and a{' '}
                        <strong>Category</strong>, then switch the toggle near the top of the dashboard
                        from <strong>Development</strong> to <strong>Live</strong>. This step is easy to
                        skip but it's essential — posts published while the app is still in Development
                        mode are only visible to the app's own Admins/Developers/Testers, never to the
                        public. Because you're only publishing to Pages you personally administer, this
                        needs Standard Access, not a full Facebook App Review, so it's quick.
                      </li>
                    </>
                  )}
                  <li>
                    From your app's dashboard, open <strong>Tools → Graph API Explorer</strong> in the
                    left menu (or go directly to <strong>developers.facebook.com/tools/explorer</strong>).
                  </li>
                  <li>
                    At the top of the Explorer, make sure the <strong>Meta App</strong> dropdown shows the
                    right app — it doesn't default to it automatically, especially if you have more than
                    one app from past projects.
                  </li>
                  <li>
                    Click <strong>Get Token → Get User Access Token</strong>. A permissions popup opens —
                    check these four boxes: <strong>pages_show_list</strong>, <strong>pages_read_engagement</strong>,{' '}
                    <strong>pages_manage_posts</strong>, and <strong>pages_manage_metadata</strong>. Leave
                    everything else unchecked.{' '}
                    {hasFbApp && "If a previous project already left some of these checked, that's fine — just make sure none of the four are missing."}
                  </li>
                  <li>
                    Click <strong>Generate Access Token</strong>, then log in and click{' '}
                    <strong>Continue as [your name]</strong> to approve the permissions.
                  </li>
                  <li>
                    A token now appears in the <strong>Access Token</strong> field near the top of the
                    Explorer. Click inside it, select all, and copy it.
                  </li>
                  <li>
                    Paste it into the box above and click <strong>Find pages</strong>. Social Manager
                    exchanges this token for your Page's own long-lived Page Access Token automatically —
                    you don't need to visit the Access Token Debugger or do any conversion yourself.
                  </li>
                  <li>Pick your Page from the list that appears and click <strong>Connect</strong>.</li>
                </ol>

                {hasFbApp && (
                  <p className="field-hint" style={{ marginTop: 10 }}>
                    <strong>Using an old app is completely safe</strong> — Social Manager only ever reads
                    your own token from it, and one app can be reused across as many personal projects
                    and Pages as you like.
                  </p>
                )}
                <p className="field-hint" style={{ marginTop: 10 }}>
                  <strong>Common snag:</strong> if "Find pages" says no pages were found, it usually means
                  the token was generated without one of the four permissions above, or the Facebook
                  account you logged in with isn't an admin of the Page — go back and re-check the boxes.
                </p>
                <p className="field-hint">
                  <strong>Posts not showing up publicly?</strong> This almost always means the app is
                  still in <strong>Development</strong> mode. Posts made through a dev-mode app are only
                  visible to that app's own Admins/Developers/Testers — not your followers or the public.
                  Switch the app to <strong>Live</strong> (Settings → Basic, then the toggle near the top
                  of the dashboard) and reconnect.
                </p>
                <p className="field-hint">
                  <strong>Token expiry:</strong> the token you paste above is short-lived, but Social
                  Manager only uses it once to fetch your Page's own token, which typically lasts
                  around 60 days. If posting ever starts failing with an auth error, just repeat these
                  steps to reconnect.
                </p>
              </div>
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
          {geminiError && <div className="field-error">{geminiError}</div>}
        </div>
        <button className="link-toggle" onClick={() => setShowGeminiGuide((v) => !v)}>
          {showGeminiGuide ? 'Hide guide' : 'How do I get a key?'}
        </button>
        {showGeminiGuide && (
          <div className="guide-panel">
            <p className="field-hint" style={{ margin: '2px 0 10px', fontWeight: 600 }}>
              Takes about 1 minute. No credit card needed for the free tier.
            </p>
            <ol className="guide-list">
              <li>
                Go to <strong>aistudio.google.com</strong> and sign in with any Google account.
              </li>
              <li>
                If it's your first visit, accept Google's Generative AI Additional Terms of Service
                and confirm your region when prompted.
              </li>
              <li>
                In the left sidebar, click <strong>Get API key</strong>, then click{' '}
                <strong>Create API key</strong>.
              </li>
              <li>
                Choose to create the key in a <strong>new Google Cloud project</strong> (recommended for
                a personal tool like this — keeps it separate from anything else) or pick an existing
                project if you already have one.
              </li>
              <li>
                Copy the key right away — it's a string starting with <strong>AIza…</strong>. You can
                always come back to AI Studio to copy it again later if needed.
              </li>
              <li>Paste it into the box above and click <strong>Save</strong>.</li>
            </ol>
            <p className="field-hint" style={{ marginTop: 10 }}>
              <strong>Free tier limits:</strong> generous enough for personal posting — roughly 10
              requests per minute and a few hundred per day on the text model, fewer for image
              generation. Exact numbers are shown on your own AI Studio dashboard and can change, so
              check there if you ever hit a rate-limit error.
            </p>
            <p className="field-hint">
              <strong>Video isn't included:</strong> Gemini's free tier covers text and image
              generation only — video (Veo) requires billing enabled on the linked Cloud project, so
              it isn't part of Social Manager's AI agent yet.
            </p>
            <p className="field-hint">
              <strong>If a key stops working:</strong> Google now blocks old, unused, unrestricted keys
              after a period of inactivity (shown as "Blocked" in AI Studio). If that happens, just
              create a new key with the same steps above and paste it in — free and instant.
            </p>
          </div>
        )}
      </div>

      <div className="card page-card">
        <div className="settings-block-head">
          <h3>Google Drive API key</h3>
          <TallyDot status={profile?.driveApiKey ? 'live' : 'idle'} />
        </div>
        <p className="field-hint" style={{ margin: '6px 0 14px' }}>
          Optional — only needed if a sheet's Image Link column ever points at a Drive{' '}
          <strong>folder</strong> instead of a single image, so Social Manager can list every image
          inside it and post them together. A single Drive file link works automatically without this.
        </p>
        <div className="field">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="password"
              value={driveKey}
              onChange={(e) => setDriveKey(e.target.value)}
              placeholder="Paste your Google Drive API key"
            />
            <button className="btn btn-primary" onClick={saveDriveKey} disabled={!driveKey.trim()}>
              {driveSaved ? 'Saved ✓' : 'Save'}
            </button>
          </div>
          {driveError && <div className="field-error">{driveError}</div>}
        </div>
        <button className="link-toggle" onClick={() => setShowDriveGuide((v) => !v)}>
          {showDriveGuide ? 'Hide guide' : 'How do I get a key?'}
        </button>
        {showDriveGuide && (
          <div className="guide-panel">
            <p className="field-hint" style={{ margin: '2px 0 10px', fontWeight: 600 }}>
              Takes about 2 minutes, free — no billing required for this usage level.
            </p>
            <ol className="guide-list">
              <li>
                Go to <strong>console.cloud.google.com</strong> and sign in. Pick an existing project
                from the top bar (the same one your Gemini key lives in is fine) or create a new one.
              </li>
              <li>
                In the search bar at the top, search for <strong>Google Drive API</strong>, open it,
                and click <strong>Enable</strong>.
              </li>
              <li>
                Go to <strong>APIs & Services → Credentials</strong>, click{' '}
                <strong>+ Create Credentials → API key</strong>. A key appears immediately.
              </li>
              <li>
                Click <strong>Edit API key</strong> (or find it in the credentials list and click it)
                and, under <strong>API restrictions</strong>, choose <strong>Restrict key</strong> and
                check only <strong>Google Drive API</strong>. This keeps the key from being usable for
                anything else if it ever leaks. Save.
              </li>
              <li>Copy the key and paste it into the box above, then click <strong>Save</strong>.</li>
            </ol>
            <p className="field-hint" style={{ marginTop: 10 }}>
              <strong>The folder still needs to be public:</strong> in Drive, right-click the folder →{' '}
              <strong>Share</strong> → <strong>General access</strong> → <strong>Anyone with the
              link</strong> → <strong>Viewer</strong>. Same requirement as the sheet itself.
            </p>
            <p className="field-hint">
              <strong>"Drive API key was rejected":</strong> almost always means the Google Drive API
              hasn't been enabled for the project the key belongs to — go back to step 2.
            </p>
          </div>
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
