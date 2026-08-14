import { useEffect, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { fetchManagedPages, exchangeForLongLivedToken } from '../services/facebook';
import {
  requestAuthorizationCode,
  exchangeCodeForTokens,
  fetchOwnChannel,
  oauthRedirectUri,
} from '../services/youtube';
import TallyDot from '../components/tally-dot';

function genId() {
  return `tok_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function Settings() {
  const { profile, updateProfile } = useAuth();
  const connectedPages = profile?.pages || [];

  const [userToken, setUserToken] = useState('');
  const [connectAppCredId, setConnectAppCredId] = useState(null);
  const [foundPages, setFoundPages] = useState([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [fbError, setFbError] = useState('');
  const [showFbGuide, setShowFbGuide] = useState(false);
  const [showConnectForm, setShowConnectForm] = useState(false);

  // Update #9 — support saving MORE THAN ONE Facebook token (e.g. one per
  // Facebook app/account you manage Pages with). Each saved token remembers
  // which Pages it grants access to, so refreshing/updating a token can
  // reconnect every one of its Pages in a single click, instead of having
  // to hunt them down and click "Reconnect" on each one individually.
  const savedTokens = profile?.fbUserTokens || [];
  const [showAddTokenForm, setShowAddTokenForm] = useState(false);
  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [newTokenValue, setNewTokenValue] = useState('');
  const [newTokenAppCredId, setNewTokenAppCredId] = useState(null);
  const [savingToken, setSavingToken] = useState(false);
  const [tokenActionError, setTokenActionError] = useState('');
  const [reconnectingId, setReconnectingId] = useState(null);
  const [reconnectResult, setReconnectResult] = useState(null); // { id, count }

  // One-time migration: fold the old single `fbUserToken` field into the
  // new `fbUserTokens` list, so anyone upgrading from before this update
  // doesn't lose their saved token.
  useEffect(() => {
    if (!profile) return;
    if (profile.fbUserToken && (!profile.fbUserTokens || profile.fbUserTokens.length === 0)) {
      const migrated = [{
        id: genId(),
        label: 'Facebook token',
        token: profile.fbUserToken,
        pageIds: connectedPages.map((p) => p.pageId),
        savedAt: Date.now(),
      }];
      updateProfile({ fbUserTokens: migrated, fbUserToken: '' }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const [geminiKey, setGeminiKey] = useState(profile?.geminiApiKey || '');
  const [geminiSaved, setGeminiSaved] = useState(false);
  const [geminiError, setGeminiError] = useState('');
  const [showGeminiGuide, setShowGeminiGuide] = useState(false);
  const [hasFbApp, setHasFbApp] = useState(false);

  const [driveKey, setDriveKey] = useState(profile?.driveApiKey || '');
  const [driveSaved, setDriveSaved] = useState(false);
  const [driveError, setDriveError] = useState('');
  const [showDriveGuide, setShowDriveGuide] = useState(false);

  // YouTube — OAuth Client ID/Secret pasted once, then a popup consent flow
  // exchanges an authorization code for a refresh_token that's stored on the
  // profile (same trust model as the Facebook App ID/Secret above).
  const youtube = profile?.youtube || null;
  const [ytClientId, setYtClientId] = useState(youtube?.clientId || '');
  const [ytClientSecret, setYtClientSecret] = useState(youtube?.clientSecret || '');
  const [showYtCredsForm, setShowYtCredsForm] = useState(false);
  const [ytCredsSaved, setYtCredsSaved] = useState(false);
  const [showYtGuide, setShowYtGuide] = useState(false);
  const [ytConnecting, setYtConnecting] = useState(false);
  const [ytError, setYtError] = useState('');
  const hasYtCreds = Boolean((youtube?.clientId || '').trim() && (youtube?.clientSecret || '').trim());

  const saveYtCreds = async () => {
    setYtError('');
    try {
      await updateProfile({ youtube: { ...(youtube || {}), clientId: ytClientId.trim(), clientSecret: ytClientSecret.trim() } });
      setYtCredsSaved(true);
      setTimeout(() => setYtCredsSaved(false), 2500);
    } catch (e) {
      console.error('Failed to save YouTube OAuth credentials:', e);
      setYtError('Could not save those. Please try again.');
    }
  };

  const connectYoutube = async () => {
    const clientId = (youtube?.clientId || ytClientId).trim();
    const clientSecret = (youtube?.clientSecret || ytClientSecret).trim();
    if (!clientId || !clientSecret) {
      setYtError('Add your OAuth Client ID and Secret first.');
      return;
    }
    setYtError('');
    setYtConnecting(true);
    try {
      const code = await requestAuthorizationCode(clientId);
      const tokens = await exchangeCodeForTokens(code, clientId, clientSecret);
      const channel = await fetchOwnChannel(tokens.accessToken);
      await updateProfile({
        youtube: {
          clientId,
          clientSecret,
          refreshToken: tokens.refreshToken,
          accessToken: tokens.accessToken,
          expiresAt: tokens.expiresAt,
          ...channel,
          connectedAt: Date.now(),
        },
      });
      setShowYtCredsForm(false);
    } catch (e) {
      console.error('Failed to connect YouTube:', e);
      setYtError(e.message);
    } finally {
      setYtConnecting(false);
    }
  };

  const disconnectYoutube = async () => {
    if (!confirm('Disconnect this YouTube channel? You can reconnect any time.')) return;
    await updateProfile({ youtube: { clientId: youtube?.clientId || '', clientSecret: youtube?.clientSecret || '' } });
  };

  // Update #12 — "reconnect again and again" was happening because tokens
  // were never actually extended to be long-lived, despite the guide below
  // claiming they were. A token pasted straight from Graph API Explorer is
  // short-lived (~1-2 hours), and Page tokens fetched from it inherit that
  // same short lifetime — so both the Page token AND the app's ability to
  // check post status died within a couple of hours of connecting.
  // With an App ID + Secret (from the same developer app used to generate
  // the token), every token gets exchanged for Facebook's long-lived
  // version (~60 days, and Page tokens derived from it effectively never
  // expire) automatically before it's used or saved.
  //
  // Update #13 — more than one Facebook App ID/Secret can be saved. Pages
  // often come from different Facebook developer apps/accounts, and a
  // token can only be extended by the app it was actually generated on —
  // using the wrong App ID/Secret pair fails the exchange. Each saved token
  // now remembers which App credential entry to use.
  const fbApps = profile?.fbApps || [];
  const hasAppCreds = fbApps.length > 0;

  // One-time migration: fold the old single fbAppId/fbAppSecret fields into
  // the new fbApps list so nobody upgrading loses their saved credentials.
  useEffect(() => {
    if (!profile) return;
    if ((profile.fbAppId || '').trim() && (!profile.fbApps || profile.fbApps.length === 0)) {
      const migrated = [{
        id: genId(),
        label: 'Default',
        appId: profile.fbAppId.trim(),
        appSecret: (profile.fbAppSecret || '').trim(),
        createdAt: 0,
      }];
      updateProfile({ fbApps: migrated, fbAppId: '', fbAppSecret: '' }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const [showAddAppForm, setShowAddAppForm] = useState(false);
  const [newAppLabel, setNewAppLabel] = useState('');
  const [newAppId, setNewAppId] = useState('');
  const [newAppSecret, setNewAppSecret] = useState('');
  const [appCredsError, setAppCredsError] = useState('');
  const [editingAppId, setEditingAppId] = useState(null);
  const [editingAppIdValue, setEditingAppIdValue] = useState('');
  const [editingAppSecretValue, setEditingAppSecretValue] = useState('');

  const addAppCreds = async () => {
    setAppCredsError('');
    if (!newAppId.trim() || !newAppSecret.trim()) return;
    try {
      const entry = {
        id: genId(),
        label: newAppLabel.trim() || `App ${fbApps.length + 1}`,
        appId: newAppId.trim(),
        appSecret: newAppSecret.trim(),
        createdAt: Date.now(),
      };
      await updateProfile({ fbApps: [...fbApps, entry] });
      setNewAppLabel('');
      setNewAppId('');
      setNewAppSecret('');
      setShowAddAppForm(false);
    } catch (e) {
      console.error('Failed to save Facebook App credentials:', e);
      setAppCredsError('Could not save those. Please try again.');
    }
  };

  const updateAppCreds = async (appEntry) => {
    setAppCredsError('');
    if (!editingAppIdValue.trim() || !editingAppSecretValue.trim()) return;
    try {
      const next = fbApps.map((a) =>
        a.id === appEntry.id ? { ...a, appId: editingAppIdValue.trim(), appSecret: editingAppSecretValue.trim() } : a
      );
      await updateProfile({ fbApps: next });
      setEditingAppId(null);
    } catch (e) {
      console.error('Failed to update Facebook App credentials:', e);
      setAppCredsError('Could not save those. Please try again.');
    }
  };

  const removeAppCreds = async (appEntry) => {
    const usedBy = savedTokens.filter((t) => t.appCredId === appEntry.id);
    if (!confirm(`Remove "${appEntry.label}"?${usedBy.length > 0 ? ` ${usedBy.length} saved token(s) using it will stop auto-extending until you pick a different app for them.` : ''}`)) return;
    try {
      await updateProfile({ fbApps: fbApps.filter((a) => a.id !== appEntry.id) });
    } catch (e) {
      console.error('Failed to remove Facebook App credentials:', e);
    }
  };

  // Runs a pasted token through the long-lived exchange using a specific
  // saved App credential entry (falls back to the only saved entry when
  // there's just one, or to the entry the token was originally saved
  // against). Never blocks the connect flow if the exchange fails — falls
  // back to the raw token and just flags that it's short-lived.
  const extendToken = async (rawToken, appCredId) => {
    const app = fbApps.find((a) => a.id === appCredId) || fbApps[0] || null;
    if (!app) return { token: rawToken, extended: false, appCredId: appCredId || null };
    try {
      const longLived = await exchangeForLongLivedToken(rawToken, app.appId, app.appSecret);
      return { token: longLived, extended: true, appCredId: app.id };
    } catch (e) {
      return {
        token: rawToken,
        extended: false,
        appCredId: app.id,
        warning: `Connected, but couldn't extend this token's lifetime with "${app.label}" (${e.message}) — it may expire sooner than usual.`,
      };
    }
  };

  // Upserts a batch of Facebook-fetched pages into the connected pages list
  // (matched by pageId) without touching any other connected pages.
  const mergePagesIntoProfile = async (fbPages) => {
    const next = [...connectedPages];
    for (const p of fbPages) {
      const idx = next.findIndex((c) => c.pageId === p.id);
      const entry = {
        pageId: p.id,
        pageAccessToken: p.accessToken,
        name: p.name,
        avatar: p.avatar,
        fanCount: p.fanCount,
        connectedAt: idx === -1 ? Date.now() : next[idx].connectedAt,
      };
      if (idx === -1) next.push(entry);
      else next[idx] = entry;
    }
    await updateProfile({ pages: next });
    return next;
  };

  const findPages = async (tokenOverride) => {
    const token = (tokenOverride ?? userToken).trim();
    if (!token) return;
    setFbError('');
    setLoadingPages(true);
    setFoundPages([]);
    try {
      const { token: workingToken, warning } = await extendToken(token, connectAppCredId);
      const result = await fetchManagedPages(workingToken);
      if (result.length === 0) setFbError('That token worked, but no Pages were found for it.');
      else if (warning) setFbError(warning);
      setFoundPages(result);
    } catch (e) {
      setFbError(e.message);
    } finally {
      setLoadingPages(false);
    }
  };

  // Update #9 — save a NEW token to the list (doesn't touch any other saved
  // token) and immediately connect every Page it grants access to, in one
  // step — no need to click "Connect" once per Page.
  const addToken = async () => {
    const token = newTokenValue.trim();
    if (!token) return;
    setTokenActionError('');
    setSavingToken(true);
    try {
      const { token: workingToken, warning, appCredId } = await extendToken(token, newTokenAppCredId);
      const result = await fetchManagedPages(workingToken);
      if (result.length === 0) {
        setTokenActionError('That token worked, but no Pages were found for it.');
        return;
      }
      await mergePagesIntoProfile(result);
      const entry = {
        id: genId(),
        label: newTokenLabel.trim() || `Token ${savedTokens.length + 1}`,
        token: workingToken,
        pageIds: result.map((p) => p.id),
        appCredId: appCredId || null,
        savedAt: Date.now(),
      };
      await updateProfile({ fbUserTokens: [...savedTokens, entry] });
      setNewTokenLabel('');
      setNewTokenValue('');
      setNewTokenAppCredId(null);
      setShowAddTokenForm(false);
      if (warning) setTokenActionError(warning);
      setReconnectResult({ id: entry.id, count: result.length });
      setTimeout(() => setReconnectResult(null), 3500);
    } catch (e) {
      setTokenActionError(e.message);
    } finally {
      setSavingToken(false);
    }
  };

  // Update #9 — the core ask: after a token is refreshed/updated, every Page
  // that token manages reconnects in one click, instead of reconnecting
  // Pages one at a time.
  const reconnectAllForToken = async (tokenEntry) => {
    setTokenActionError('');
    setReconnectingId(tokenEntry.id);
    try {
      const { token: workingToken, warning } = await extendToken(tokenEntry.token, tokenEntry.appCredId);
      const result = await fetchManagedPages(workingToken);
      if (result.length === 0) {
        setTokenActionError(`"${tokenEntry.label}" didn't return any Pages — it may have expired. Update it below.`);
        return;
      }
      await mergePagesIntoProfile(result);
      // Keep this token's known page list current, in case Pages were
      // added/removed on the Facebook side since it was last used.
      const nextTokens = savedTokens.map((t) =>
        t.id === tokenEntry.id ? { ...t, token: workingToken, pageIds: result.map((p) => p.id) } : t
      );
      await updateProfile({ fbUserTokens: nextTokens });
      if (warning) setTokenActionError(warning);
      setReconnectResult({ id: tokenEntry.id, count: result.length });
      setTimeout(() => setReconnectResult(null), 3500);
    } catch (e) {
      setTokenActionError(`Could not refresh "${tokenEntry.label}": ${e.message}`);
    } finally {
      setReconnectingId(null);
    }
  };

  const [editingTokenId, setEditingTokenId] = useState(null);
  const [editingTokenValue, setEditingTokenValue] = useState('');

  // Update the raw token string for an existing saved entry (e.g. after
  // Facebook expires it) and immediately reconnect all of its Pages.
  const updateTokenValue = async (tokenEntry) => {
    const token = editingTokenValue.trim();
    if (!token) return;
    setTokenActionError('');
    setReconnectingId(tokenEntry.id);
    try {
      const { token: workingToken, warning } = await extendToken(token, tokenEntry.appCredId);
      const result = await fetchManagedPages(workingToken);
      if (result.length === 0) {
        setTokenActionError('That token worked, but no Pages were found for it.');
        return;
      }
      await mergePagesIntoProfile(result);
      const nextTokens = savedTokens.map((t) =>
        t.id === tokenEntry.id ? { ...t, token: workingToken, pageIds: result.map((p) => p.id) } : t
      );
      await updateProfile({ fbUserTokens: nextTokens });
      setEditingTokenId(null);
      setEditingTokenValue('');
      if (warning) setTokenActionError(warning);
      setReconnectResult({ id: tokenEntry.id, count: result.length });
      setTimeout(() => setReconnectResult(null), 3500);
    } catch (e) {
      setTokenActionError(e.message);
    } finally {
      setReconnectingId(null);
    }
  };

  const removeToken = async (tokenEntry) => {
    if (!confirm(`Remove "${tokenEntry.label}"? Its Pages will stay connected until they're manually disconnected — you just won't be able to one-click reconnect them with this token anymore.`)) return;
    try {
      await updateProfile({ fbUserTokens: savedTokens.filter((t) => t.id !== tokenEntry.id) });
    } catch (e) {
      console.error('Failed to remove token:', e);
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

  // One click to connect every Page found for the token currently pasted
  // into the "Add another page" form above, instead of one click per Page.
  const connectAllFoundPages = async () => {
    if (foundPages.length === 0) return;
    setFbError('');
    try {
      await mergePagesIntoProfile(foundPages);
      const rawToken = userToken.trim();
      if (rawToken) {
        const { token: workingToken, appCredId } = await extendToken(rawToken, connectAppCredId);
        const alreadySaved = savedTokens.some((t) => t.token === workingToken || t.token === rawToken);
        if (!alreadySaved) {
          const entry = {
            id: genId(),
            label: `Token ${savedTokens.length + 1}`,
            token: workingToken,
            pageIds: foundPages.map((p) => p.id),
            appCredId: appCredId || null,
            savedAt: Date.now(),
          };
          await updateProfile({ fbUserTokens: [...savedTokens, entry] });
        }
      }
      setFoundPages([]);
      setUserToken('');
      setConnectAppCredId(null);
      setShowConnectForm(false);
    } catch (e) {
      console.error('Failed to connect pages:', e);
      setFbError('Could not save those connections. Please try again.');
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

        {/* Update #12/#13 — App credentials, used to keep tokens from expiring.
            More than one can be saved since different Pages often come from
            different Facebook developer apps/accounts. */}
        <div className={`app-creds-box ${hasAppCreds ? 'app-creds-box-ok' : ''}`}>
          <div className="app-creds-box-head">
            <span>
              {hasAppCreds ? '✓ Tokens are set to stay connected' : '⚠ Tokens expire in ~1-2 hours right now'}
            </span>
            {hasAppCreds && <span className="badge badge-ok">{fbApps.length} saved</span>}
          </div>
          <p className="field-hint" style={{ margin: '6px 0 0' }}>
            {hasAppCreds
              ? "Every token gets extended to Facebook's long-lived version (~60 days, Page tokens effectively don't expire) automatically when you connect or reconnect. Save one App ID/Secret per Facebook app you generate tokens from."
              : 'Add a Facebook App ID + Secret (from the developer app you use to generate a token below), and Social Manager will automatically extend every token so you stop needing to reconnect so often. Add more than one if your Pages come from different Facebook apps or accounts.'}
          </p>

          {fbApps.length > 0 && (
            <div className="token-list" style={{ marginTop: 10 }}>
              {fbApps.map((a) => {
                const isEditing = editingAppId === a.id;
                return (
                  <div key={a.id} className="token-row">
                    <div className="token-row-top">
                      <span className="token-row-label">{a.label}</span>
                    </div>
                    {isEditing ? (
                      <div style={{ marginTop: 8 }}>
                        <div className="field">
                          <label>App ID</label>
                          <input value={editingAppIdValue} onChange={(e) => setEditingAppIdValue(e.target.value)} placeholder="e.g. 1234567890123456" />
                        </div>
                        <div className="field">
                          <label>App Secret</label>
                          <input type="password" value={editingAppSecretValue} onChange={(e) => setEditingAppSecretValue(e.target.value)} placeholder="From Settings → Basic on your Facebook app" />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-primary btn-sm" onClick={() => updateAppCreds(a)} disabled={!editingAppIdValue.trim() || !editingAppSecretValue.trim()}>
                            Save
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditingAppId(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="field-hint mono token-row-value">App ID: {a.appId}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => { setEditingAppId(a.id); setEditingAppIdValue(a.appId); setEditingAppSecretValue(a.appSecret); }}
                          >
                            Edit
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => removeAppCreds(a)}>Remove</button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!showAddAppForm ? (
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setShowAddAppForm(true)}>
              + Add {fbApps.length > 0 ? 'another' : ''} App ID / Secret
            </button>
          ) : (
            <div style={{ marginTop: 10 }}>
              <div className="field">
                <label>Label (optional)</label>
                <input value={newAppLabel} onChange={(e) => setNewAppLabel(e.target.value)} placeholder="e.g. Agriculture app" />
              </div>
              <div className="field">
                <label>App ID</label>
                <input value={newAppId} onChange={(e) => setNewAppId(e.target.value)} placeholder="e.g. 1234567890123456" />
              </div>
              <div className="field">
                <label>App Secret</label>
                <input
                  type="password"
                  value={newAppSecret}
                  onChange={(e) => setNewAppSecret(e.target.value)}
                  placeholder="From Settings → Basic on your Facebook app"
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={addAppCreds} disabled={!newAppId.trim() || !newAppSecret.trim()}>
                  Save
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setShowAddAppForm(false); setNewAppLabel(''); setNewAppId(''); setNewAppSecret(''); setAppCredsError(''); }}
                >
                  Cancel
                </button>
              </div>
              <p className="field-hint" style={{ marginTop: 8 }}>
                Find both on <strong>developers.facebook.com/apps → your app → Settings → Basic</strong>. This
                stays in your private profile and is only ever used to extend your own tokens.
              </p>
              {appCredsError && <div className="field-error" style={{ marginTop: 6 }}>{appCredsError}</div>}
            </div>
          )}
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
                <button className="btn btn-primary" onClick={() => findPages()} disabled={loadingPages || !userToken.trim()}>
                  {loadingPages ? 'Looking…' : 'Find pages'}
                </button>
              </div>
              {fbApps.length > 1 && (
                <div style={{ marginTop: 8 }}>
                  <label>App credentials to extend this token with</label>
                  <select value={connectAppCredId || ''} onChange={(e) => setConnectAppCredId(e.target.value || null)}>
                    {fbApps.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <p className="field-hint" style={{ marginTop: 6 }}>
                This token gets saved once it works, so you won't need to paste it again — reconnect or refresh its
                Pages from the "Saved tokens" list below any time.
              </p>
              {fbError && <div className="field-error">{fbError}</div>}
            </div>

            {foundPages.length > 0 && (
              <>
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
                {foundPages.length > 1 && (
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={connectAllFoundPages}>
                    ⚡ Connect all {foundPages.length} pages at once
                  </button>
                )}
              </>
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

        {/* Update #9 — multiple saved tokens, each one-click reconnectable */}
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Saved tokens {savedTokens.length > 0 ? `(${savedTokens.length})` : ''}</span>
          </label>
          <p className="field-hint" style={{ margin: '4px 0 10px' }}>
            Save more than one token — handy if different Pages come through different Facebook apps or accounts.
            Updating a token and clicking "Reconnect all pages" refreshes every Page it manages in one click.
          </p>

          {savedTokens.length > 0 && (
            <div className="token-list">
              {savedTokens.map((t) => {
                const isEditing = editingTokenId === t.id;
                const isBusy = reconnectingId === t.id;
                const justDone = reconnectResult?.id === t.id;
                const tokenPageCount = t.pageIds?.length || 0;
                return (
                  <div key={t.id} className="token-row">
                    <div className="token-row-top">
                      <span className="token-row-label">{t.label}</span>
                      <span className="badge badge-ok">
                        {tokenPageCount} page{tokenPageCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    {fbApps.length > 1 && (
                      <div className="field-hint" style={{ marginTop: 2 }}>
                        App: {fbApps.find((a) => a.id === t.appCredId)?.label || 'Not set — using the first saved app'}
                      </div>
                    )}
                    <div className="field-hint mono token-row-value">
                      {t.token.slice(0, 20)}…{t.token.slice(-8)}
                    </div>
                    {isEditing ? (
                      <div style={{ marginTop: 8 }}>
                        <textarea
                          value={editingTokenValue}
                          onChange={(e) => setEditingTokenValue(e.target.value)}
                          placeholder="Paste the updated token"
                          style={{ minHeight: 56, fontFamily: 'monospace', fontSize: 12 }}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => updateTokenValue(t)}
                            disabled={isBusy || !editingTokenValue.trim()}
                          >
                            {isBusy ? 'Updating…' : 'Update & reconnect all pages'}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => { setEditingTokenId(null); setEditingTokenValue(''); }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => reconnectAllForToken(t)}
                          disabled={isBusy}
                        >
                          {isBusy ? 'Reconnecting…' : justDone ? `✓ Reconnected ${reconnectResult.count}` : '↻ Reconnect all pages'}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => { setEditingTokenId(t.id); setEditingTokenValue(t.token); }}
                        >
                          Update token
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => removeToken(t)}>Remove</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!showAddTokenForm ? (
            <button className="btn btn-ghost btn-sm" style={{ marginTop: savedTokens.length > 0 ? 12 : 0 }} onClick={() => setShowAddTokenForm(true)}>
              + Save a{savedTokens.length > 0 ? 'nother' : ''} token
            </button>
          ) : (
            <div style={{ marginTop: 10 }}>
              <div className="field">
                <label>Label (optional)</label>
                <input
                  value={newTokenLabel}
                  onChange={(e) => setNewTokenLabel(e.target.value)}
                  placeholder="e.g. Agriculture app"
                />
              </div>
              <div className="field">
                <label>Facebook token</label>
                <textarea
                  value={newTokenValue}
                  onChange={(e) => setNewTokenValue(e.target.value)}
                  placeholder="Paste the token here"
                  style={{ minHeight: 56, fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>
              {fbApps.length > 1 && (
                <div className="field">
                  <label>App credentials to extend this token with</label>
                  <select value={newTokenAppCredId || ''} onChange={(e) => setNewTokenAppCredId(e.target.value || null)}>
                    {fbApps.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={addToken} disabled={savingToken || !newTokenValue.trim()}>
                  {savingToken ? 'Saving…' : 'Save & connect its pages'}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setShowAddTokenForm(false); setNewTokenLabel(''); setNewTokenValue(''); setNewTokenAppCredId(null); setTokenActionError(''); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {tokenActionError && <div className="field-error" style={{ marginTop: 8 }}>{tokenActionError}</div>}
        </div>

        <button className="link-toggle" onClick={() => setShowFbGuide((v) => !v)}>
          {showFbGuide ? 'Hide guide' : 'How do I get a token?'}
        </button>
        {showFbGuide && (
              <div className="guide-panel">
                <p className="field-hint" style={{ margin: '2px 0 10px', fontWeight: 600 }}>
                  Takes about 5 minutes. Add your App ID and Secret in the box above so Social Manager can
                  extend tokens automatically — after that, reconnecting is rare.
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
                    Paste it into the box above and click <strong>Find pages</strong>.{' '}
                    {hasAppCreds
                      ? "Since you've added your App ID/Secret above, Social Manager automatically exchanges this for your Page's own long-lived token — no need to visit the Access Token Debugger or convert anything yourself."
                      : 'Add your App ID and App Secret in the box above first (from Settings → Basic on this same app) so Social Manager can automatically exchange this for a long-lived token — otherwise it (and the Page token built from it) expires in about an hour and you\'ll need to repeat this often.'}
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

      {/* YouTube connect */}
      <div className="card page-card">
        <div className="settings-block-head">
          <h3>YouTube channel</h3>
          <TallyDot status={youtube?.refreshToken ? 'live' : 'idle'} />
        </div>
        <p className="field-hint" style={{ margin: '6px 0 14px' }}>
          Lets you upload videos manually or from a Google Sheet, straight from this browser —
          uploads stream directly to YouTube, so there's no size limit besides your own connection.
        </p>

        {youtube?.refreshToken ? (
          <div className="channel-card" style={{ marginBottom: 12 }}>
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
              <button className="btn btn-ghost btn-sm" onClick={connectYoutube} disabled={ytConnecting}>
                {ytConnecting ? 'Reconnecting…' : 'Reconnect'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={disconnectYoutube}>Disconnect</button>
            </div>
          </div>
        ) : (
          <div className={`app-creds-box ${hasYtCreds ? 'app-creds-box-ok' : ''}`}>
            <div className="app-creds-box-head">
              <span>{hasYtCreds ? '✓ OAuth credentials on file' : '⚠ No OAuth credentials yet'}</span>
              {hasYtCreds && <span className="badge badge-ok">Configured</span>}
            </div>
            <p className="field-hint" style={{ margin: '6px 0 0' }}>
              {hasYtCreds
                ? 'Credentials are saved — click Connect to sign in with Google and pick the channel to publish to.'
                : 'Add an OAuth Client ID + Secret from Google Cloud Console once (guide below), then connect your channel.'}
            </p>
            {!showYtCredsForm ? (
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setShowYtCredsForm(true)}>
                {hasYtCreds ? 'Update Client ID / Secret' : '+ Add Client ID / Secret'}
              </button>
            ) : (
              <div style={{ marginTop: 10 }}>
                <div className="field">
                  <label>OAuth Client ID</label>
                  <input value={ytClientId} onChange={(e) => setYtClientId(e.target.value)} placeholder="e.g. 1234-abc.apps.googleusercontent.com" />
                </div>
                <div className="field">
                  <label>OAuth Client secret</label>
                  <input
                    type="password"
                    value={ytClientSecret}
                    onChange={(e) => setYtClientSecret(e.target.value)}
                    placeholder="From the same OAuth Client on Google Cloud Console"
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={saveYtCreds} disabled={!ytClientId.trim() || !ytClientSecret.trim()}>
                    {ytCredsSaved ? 'Saved ✓' : 'Save'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setShowYtCredsForm(false); setYtClientId(youtube?.clientId || ''); setYtClientSecret(youtube?.clientSecret || ''); setYtError(''); }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {hasYtCreds && (
          <button className="btn btn-accent" style={{ marginTop: 12 }} onClick={connectYoutube} disabled={ytConnecting}>
            {ytConnecting ? 'Connecting…' : youtube?.refreshToken ? 'Reconnect channel' : 'Connect YouTube channel'}
          </button>
        )}
        {ytError && <div className="field-error" style={{ marginTop: 8 }}>{ytError}</div>}

        <button className="link-toggle" onClick={() => setShowYtGuide((v) => !v)}>
          {showYtGuide ? 'Hide guide' : 'How do I get a Client ID / Secret?'}
        </button>
        {showYtGuide && (
          <div className="guide-panel">
            <p className="field-hint" style={{ margin: '2px 0 10px', fontWeight: 600 }}>
              Takes about 5 minutes, free — no billing required for this usage level.
            </p>
            <ol className="guide-list">
              <li>
                Go to <strong>console.cloud.google.com</strong>, sign in, and create a new project
                (or reuse the one your Gemini/Drive keys live in).
              </li>
              <li>
                Search for <strong>YouTube Data API v3</strong> and click <strong>Enable</strong>.
              </li>
              <li>
                Go to <strong>APIs & Services → OAuth consent screen</strong>. Choose{' '}
                <strong>External</strong>, fill in an app name + your email, and under{' '}
                <strong>Test users</strong> add your own Google account (the one that owns your
                YouTube channel). This keeps the app in "Testing" mode, which is fine — it never
                needs Google's review for personal use like this.
              </li>
              <li>
                Go to <strong>APIs & Services → Credentials → + Create Credentials → OAuth client
                ID</strong>. Application type: <strong>Web application</strong>.
              </li>
              <li>
                Under <strong>Authorized JavaScript origins</strong>, add{' '}
                <code>{window.location.origin}</code>. Under <strong>Authorized redirect
                URIs</strong>, add <code>{oauthRedirectUri()}</code> exactly. Click Create.
              </li>
              <li>
                Copy the <strong>Client ID</strong> and <strong>Client secret</strong> shown, paste
                them into the boxes above, click <strong>Save</strong>, then <strong>Connect
                YouTube channel</strong> and approve access with the Google account from step 3.
              </li>
            </ol>
            <p className="field-hint" style={{ marginTop: 10 }}>
              <strong>"Access blocked: app not verified":</strong> means the Google account you're
              signing in with wasn't added as a Test user in step 3 — go back and add it.
            </p>
            <p className="field-hint">
              <strong>Large videos:</strong> uploads stream in chunks straight from your browser to
              YouTube, so file size isn't limited by this app — only by your own upload speed and
              keeping the tab open until it finishes.
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
          Powers the AI agent's content ideas and captions. Image generation uses this too when it can, and
          automatically falls back to a free, no-key image provider if Gemini's image quota isn't available.
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
          Optional. Needed if a sheet's Image Link column ever points at a Drive <strong>folder</strong>{' '}
          instead of a single image, so Social Manager can list every image inside it and post them
          together — a single Drive file link works automatically without this. Also used to
          auto-detect a sheet's real title and tab names on the Post from Google Sheet page (needs the{' '}
          <strong>Google Sheets API</strong> enabled too — see the guide below).
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
                and click <strong>Enable</strong>. Repeat the same search-and-enable for{' '}
                <strong>Google Sheets API</strong> if you want sheet titles/tabs auto-detected too.
              </li>
              <li>
                Go to <strong>APIs & Services → Credentials</strong>, click{' '}
                <strong>+ Create Credentials → API key</strong>. A key appears immediately.
              </li>
              <li>
                Click <strong>Edit API key</strong> (or find it in the credentials list and click it)
                and, under <strong>API restrictions</strong>, choose <strong>Restrict key</strong> and
                check <strong>Google Drive API</strong> (and <strong>Google Sheets API</strong> if you
                enabled it). This keeps the key from being usable for anything else if it ever leaks.
                Save.
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
