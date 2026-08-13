import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { publishToPage, schedulePost } from '../services/facebook';
import {
  suggestContentIdeas,
  generateCaptions,
  generateCaptionsFromTopic,
  generateAutoPostFromTopic,
  suggestImagePrompt,
  TONE_OPTIONS,
  IMAGE_ASPECT_OPTIONS,
} from '../services/gemini';
import { generateImageSmart, IMAGE_PROVIDER_OPTIONS } from '../services/imageProviders';
import { uploadGeneratedImage } from '../services/storage';
import { savePost, watchSavedTexts, saveText, deleteSavedText } from '../services/content';
import { applyMarkdownBold } from '../lib/text-format';
import PostPreviewModal from '../components/post-preview-modal';
import WebAiBridgeModal from '../components/web-ai-bridge-modal';
import CaptionField from '../components/caption-field';

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
const MAX_TOPICS = 8;

export default function CreatePost() {
  const { user, profile, updateProfile } = useAuth();
  const location = useLocation();
  const draftToEdit = location.state?.draft;
  const pages = profile?.pages || [];
  const geminiKey = profile?.geminiApiKey;

  const [selectedPageId, setSelectedPageId] = useState(draftToEdit?.fbPageId || null);
  const fb = pages.find((p) => p.pageId === selectedPageId) || pages[0] || null;

  const [mode, setMode] = useState('manual'); // 'manual' | 'ai'
  const [caption, setCaption] = useState(draftToEdit?.caption || '');
  const [imageDataUrl, setImageDataUrl] = useState(draftToEdit?.imageDataUrl || null);
  const [imageBase64, setImageBase64] = useState(
    draftToEdit?.imageDataUrl ? draftToEdit.imageDataUrl.split(',')[1] : null
  );
  const [editingId, setEditingId] = useState(draftToEdit?.id || null);
  const [showPreview, setShowPreview] = useState(false);
  const [savedTexts, setSavedTexts] = useState([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [postResult, setPostResult] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    return watchSavedTexts(user.uid, setSavedTexts);
  }, [user]);

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setImageDataUrl(dataUrl);
      setImageBase64(dataUrl.split(',')[1]);
    };
    reader.readAsDataURL(file);
  };

  const handlePost = async () => {
    if (!fb) throw new Error('Connect a Facebook Page first, in Connect profile.');
    const res = await publishToPage({
      pageId: fb.pageId,
      pageAccessToken: fb.pageAccessToken,
      message: caption,
      imageBase64,
    });
    await savePost(
      user.uid,
      { caption, imageDataUrl: imageDataUrl || null, status: 'posted', fbPostId: res.id, fbPageId: fb.pageId },
      editingId
    );
    setShowPreview(false);
    setPostResult('posted');
  };

  const handleSaveDraft = async () => {
    await savePost(
      user.uid,
      { caption, imageDataUrl: imageDataUrl || null, status: 'draft', fbPageId: fb?.pageId || null },
      editingId
    );
    setShowPreview(false);
    setPostResult('draft');
  };

  if (postResult) {
    return (
      <div className="page">
        <div className="card page-card empty-card">
          <div className="empty-card-icon">{postResult === 'posted' ? '✓' : '✎'}</div>
          <h3>{postResult === 'posted' ? 'Posted to your page' : 'Saved as draft'}</h3>
          <p className="field-hint" style={{ margin: '6px 0 16px' }}>
            {postResult === 'posted'
              ? 'Your post is live on Facebook.'
              : 'Pick it back up any time from the broadcast log.'}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link to="/log" className="btn btn-ghost">View broadcast log</Link>
            <button
              className="btn btn-accent"
              onClick={() => {
                setCaption('');
                setImageDataUrl(null);
                setImageBase64(null);
                setEditingId(null);
                setPostResult(null);
              }}
            >
              Create another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Create post</h1>
          <p className="field-hint">{fb ? `Publishing to ${fb.name}` : 'Connect a page to publish'}</p>
        </div>
        {pages.length > 1 && (
          <select
            value={fb?.pageId || ''}
            onChange={(e) => setSelectedPageId(e.target.value)}
            style={{ maxWidth: 220 }}
          >
            {pages.map((p) => (
              <option key={p.pageId} value={p.pageId}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="tab-strip">
        <button className={`tab-btn ${mode === 'manual' ? 'tab-btn-active' : ''}`} onClick={() => setMode('manual')}>
          Create manually
        </button>
        <button className={`tab-btn ${mode === 'ai' ? 'tab-btn-active' : ''}`} onClick={() => setMode('ai')}>
          Create with AI agent
        </button>
      </div>

      <div className="composer-grid">
        <div className="composer-main">
          {mode === 'manual' ? (
            <ManualComposer
              caption={caption}
              setCaption={setCaption}
              imageDataUrl={imageDataUrl}
              onFileChange={onFileChange}
              fileRef={fileRef}
              onClearImage={() => {
                setImageDataUrl(null);
                setImageBase64(null);
              }}
            />
          ) : (
            <AiComposer
              geminiKey={geminiKey}
              user={user}
              profile={profile}
              updateProfile={updateProfile}
              fb={fb}
              caption={caption}
              setCaption={setCaption}
              imageDataUrl={imageDataUrl}
              setImageDataUrl={setImageDataUrl}
              setImageBase64={setImageBase64}
              onSaveText={(t) => user && saveText(user.uid, t)}
            />
          )}

          {mode === 'manual' && (
            <div className="library-toggle">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowLibrary((v) => !v)}>
                {showLibrary ? 'Hide saved text' : `Saved text (${savedTexts.length})`}
              </button>
              {caption.trim() && (
                <button className="btn btn-ghost btn-sm" onClick={() => user && saveText(user.uid, caption)}>
                  💾 Save this caption
                </button>
              )}
            </div>
          )}

          {mode === 'manual' && showLibrary && (
            <div className="library-list">
              {savedTexts.length === 0 && <p className="field-hint">No saved captions yet.</p>}
              {savedTexts.map((t) => (
                <div key={t.id} className="library-item">
                  <span>{t.text}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setCaption(t.text)}>Use</button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteSavedText(user.uid, t.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {mode === 'manual' && (
            <button
              className="btn btn-accent btn-block"
              style={{ marginTop: 18 }}
              disabled={!caption.trim() && !imageDataUrl}
              onClick={() => setShowPreview(true)}
            >
              Preview post
            </button>
          )}
        </div>

        <div className="composer-side">
          <div className="card side-preview">
            <div className="field-hint" style={{ marginBottom: 10, fontWeight: 600 }}>Live preview</div>
            <div className="fb-preview fb-preview-compact">
              <div className="fb-preview-head">
                <img
                  src={fb?.avatar || 'https://placehold.co/40x40/e3e0d6/5b5f70?text=FB'}
                  alt=""
                  className="fb-preview-avatar"
                />
                <div>
                  <div className="fb-preview-name">{fb?.name || 'Your Page'}</div>
                  <div className="fb-preview-meta mono">Just now · 🌐</div>
                </div>
              </div>
              <div className="fb-preview-caption">
                {caption || <span className="field-hint">Your caption will appear here</span>}
              </div>
              {imageDataUrl && (
                <div className="fb-preview-image-wrap">
                  <img src={imageDataUrl} alt="" className="fb-preview-image" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showPreview && (
        <PostPreviewModal
          page={fb}
          caption={caption}
          imageDataUrl={imageDataUrl}
          onClose={() => setShowPreview(false)}
          onPost={handlePost}
          onSaveDraft={handleSaveDraft}
        />
      )}
    </div>
  );
}

function ManualComposer({ caption, setCaption, imageDataUrl, onFileChange, fileRef, onClearImage }) {
  return (
    <div className="card page-card">
      <CaptionField label="What's on your mind?" value={caption} onChange={setCaption} rows={6} placeholder="Write your post…" />
      <div className="field">
        <label>Photo</label>
        {imageDataUrl ? (
          <div className="image-preview-row">
            <img src={imageDataUrl} alt="" className="image-preview-thumb" />
            <button className="btn btn-ghost btn-sm" onClick={onClearImage}>Remove</button>
          </div>
        ) : (
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>+ Add photo</button>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} style={{ display: 'none' }} />
      </div>
    </div>
  );
}

/* ================= AI agent ================= */

function AiComposer({ geminiKey, user, profile, updateProfile, fb, caption, setCaption, imageDataUrl, setImageDataUrl, setImageBase64, onSaveText }) {
  const [aiMode, setAiMode] = useState('quick'); // 'quick' | 'autopilot'

  if (!geminiKey) {
    return (
      <div className="card page-card empty-card">
        <div className="empty-card-icon">✦</div>
        <h3>Add a Gemini API key</h3>
        <p className="field-hint" style={{ margin: '6px 0 16px' }}>
          The AI agent needs a free Gemini API key to suggest content and write captions (this part is genuinely
          free — no billing needed). Images don't need a key at all: they use a free provider by default, or you
          can generate them yourself in the Gemini/ChatGPT web apps.
        </p>
        <Link to="/settings" className="btn btn-accent">Add key in Connect profile</Link>
      </div>
    );
  }

  return (
    <div className="card page-card ai-agent-card">
      <div className="ai-agent-head">
        <span className="ai-agent-badge">✦ AI agent</span>
        <p className="field-hint" style={{ marginTop: 6 }}>
          Trendy, humanized captions built for how people actually scroll Facebook — pick a voice, and let it write.
        </p>
      </div>

      <div className="guide-tabs ai-mode-tabs">
        <button className={`guide-tab-btn ${aiMode === 'quick' ? 'guide-tab-btn-active' : ''}`} onClick={() => setAiMode('quick')}>
          Quick create
        </button>
        <button className={`guide-tab-btn ${aiMode === 'autopilot' ? 'guide-tab-btn-active' : ''}`} onClick={() => setAiMode('autopilot')}>
          Auto-pilot ✨
        </button>
      </div>

      {aiMode === 'quick' ? (
        <QuickCreate
          geminiKey={geminiKey}
          caption={caption}
          setCaption={setCaption}
          imageDataUrl={imageDataUrl}
          setImageDataUrl={setImageDataUrl}
          setImageBase64={setImageBase64}
          onSaveText={onSaveText}
        />
      ) : (
        <AutoPilot geminiKey={geminiKey} user={user} profile={profile} updateProfile={updateProfile} fb={fb} />
      )}
    </div>
  );
}

function ToneControls({ tone, setTone, emojiLevel, setEmojiLevel, includeHashtags, setIncludeHashtags }) {
  return (
    <div className="tone-controls-row">
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Voice</label>
        <select value={tone} onChange={(e) => setTone(e.target.value)}>
          {TONE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Emoji</label>
        <select value={emojiLevel} onChange={(e) => setEmojiLevel(e.target.value)}>
          <option value="none">None</option>
          <option value="tasteful">Tasteful</option>
          <option value="expressive">Expressive</option>
        </select>
      </div>
      <label className="checkbox-row tone-controls-checkbox">
        <input type="checkbox" checked={includeHashtags} onChange={(e) => setIncludeHashtags(e.target.checked)} />
        Hashtags
      </label>
    </div>
  );
}

function QuickCreate({ geminiKey, caption, setCaption, imageDataUrl, setImageDataUrl, setImageBase64, onSaveText }) {
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('trendy');
  const [includeHashtags, setIncludeHashtags] = useState(true);
  const [emojiLevel, setEmojiLevel] = useState('tasteful');

  const [ideas, setIdeas] = useState([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [selectedAngle, setSelectedAngle] = useState(null);

  const [captionOptions, setCaptionOptions] = useState([]);
  const [loadingCaptions, setLoadingCaptions] = useState(false);

  const [imagePrompt, setImagePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [imageProvider, setImageProvider] = useState('free');
  const [imageProviderUsed, setImageProviderUsed] = useState(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [suggestingPrompt, setSuggestingPrompt] = useState(false);
  const [bridgeProvider, setBridgeProvider] = useState(null); // 'gemini' | 'chatgpt' | null
  const [showBridgeOptions, setShowBridgeOptions] = useState(false); // Update #6 — collapsed by default
  const [error, setError] = useState('');

  // Update #5 — the topic IS the prompt: generate a caption straight from it
  // (no angle step needed), and offer a "polished" version with a few key
  // words bolded, alongside the plain one.
  const [topicResult, setTopicResult] = useState(null); // { plain, polished }
  const [loadingTopicCaption, setLoadingTopicCaption] = useState(false);
  const [captionVersion, setCaptionVersion] = useState('polished'); // 'plain' | 'polished'

  const runGenerateFromTopic = async () => {
    if (!topic.trim()) return;
    setError('');
    setLoadingTopicCaption(true);
    setTopicResult(null);
    setIdeas([]);
    setSelectedAngle(null);
    setCaptionOptions([]);
    try {
      const result = await generateCaptionsFromTopic(topic, geminiKey, { tone, includeHashtags, emojiLevel });
      setTopicResult(result);
      setCaptionVersion('polished');
      setCaption(applyMarkdownBold(result.polished || result.plain));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingTopicCaption(false);
    }
  };

  const runSuggest = async () => {
    if (!topic.trim()) return;
    setError('');
    setLoadingIdeas(true);
    setIdeas([]);
    setSelectedAngle(null);
    setCaptionOptions([]);
    try {
      const result = await suggestContentIdeas(topic, geminiKey);
      setIdeas(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingIdeas(false);
    }
  };

  const runCaptions = async (angle) => {
    setSelectedAngle(angle);
    setError('');
    setLoadingCaptions(true);
    setCaptionOptions([]);
    try {
      const brief = `${topic} — angle: ${angle.title}. ${angle.description}`;
      const result = await generateCaptions(brief, geminiKey, { tone, includeHashtags, emojiLevel });
      setCaptionOptions(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingCaptions(false);
    }
  };

  const runSuggestImagePrompt = async () => {
    const context = caption.trim() || (selectedAngle ? `${topic} — ${selectedAngle.title}` : topic);
    if (!context.trim()) return;
    setError('');
    setSuggestingPrompt(true);
    try {
      const p = await suggestImagePrompt(context, geminiKey);
      if (p) setImagePrompt(p);
    } catch (e) {
      setError(e.message);
    } finally {
      setSuggestingPrompt(false);
    }
  };

  const runImage = async () => {
    if (!imagePrompt.trim()) return;
    setError('');
    setLoadingImage(true);
    try {
      const { base64, mimeType, provider, fallbackFrom } = await generateImageSmart(imagePrompt, {
        provider: imageProvider,
        geminiKey,
        aspectRatio,
      });
      setImageBase64(base64);
      setImageDataUrl(`data:${mimeType};base64,${base64}`);
      setImageProviderUsed({ provider, fallbackFrom });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingImage(false);
    }
  };

  const handleBridgeCapture = ({ base64, mimeType, dataUrl, label }) => {
    setError('');
    setImageBase64(base64);
    setImageDataUrl(dataUrl || `data:${mimeType};base64,${base64}`);
    setImageProviderUsed({ provider: 'web', label });
  };

  return (
    <>
      <div className="ai-block">
        <div className="field">
          <label>1. What's the topic? (this is your prompt)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runGenerateFromTopic()}
              placeholder="e.g. weekend cafe special, or a full sentence describing the post"
            />
            <button
              className="btn btn-accent"
              onClick={runGenerateFromTopic}
              disabled={loadingTopicCaption || !topic.trim()}
              title="Write the caption straight from this topic"
            >
              {loadingTopicCaption ? 'Writing…' : '✨ Generate caption'}
            </button>
          </div>
          <p className="field-hint" style={{ marginTop: 6 }}>
            Type exactly what you want the post to be about — it's used as the actual writing prompt, not just a
            keyword. Or, use <button type="button" className="link-toggle" style={{ display: 'inline', padding: 0 }} onClick={runSuggest} disabled={loadingIdeas || !topic.trim()}>
              {loadingIdeas ? 'thinking…' : 'a few angle ideas'}
            </button> first if you'd rather pick a specific hook.
          </p>
        </div>

        <ToneControls
          tone={tone}
          setTone={setTone}
          emojiLevel={emojiLevel}
          setEmojiLevel={setEmojiLevel}
          includeHashtags={includeHashtags}
          setIncludeHashtags={setIncludeHashtags}
        />

        {topicResult && (
          <div className="caption-options" style={{ marginTop: 12 }}>
            <div className="guide-tabs ai-mode-tabs">
              <button
                className={`guide-tab-btn ${captionVersion === 'plain' ? 'guide-tab-btn-active' : ''}`}
                onClick={() => {
                  setCaptionVersion('plain');
                  setCaption(topicResult.plain);
                }}
              >
                Plain
              </button>
              <button
                className={`guide-tab-btn ${captionVersion === 'polished' ? 'guide-tab-btn-active' : ''}`}
                onClick={() => {
                  setCaptionVersion('polished');
                  setCaption(applyMarkdownBold(topicResult.polished || topicResult.plain));
                }}
              >
                ✦ Polished (bold)
              </button>
              <button className="btn btn-ghost btn-sm" onClick={runGenerateFromTopic} disabled={loadingTopicCaption}>
                🔁 Regenerate
              </button>
            </div>
            <p className="field-hint" style={{ marginTop: 6 }}>
              {captionVersion === 'polished'
                ? 'A few key words are bolded with real Unicode bold characters, so they actually render bold on Facebook.'
                : 'Plain version, no emphasis. Edit freely below either way.'}
            </p>
          </div>
        )}

        {ideas.length > 0 && (
          <div className="idea-grid">
            {ideas.map((idea, i) => (
              <button
                key={i}
                className={`idea-card ${selectedAngle?.title === idea.title ? 'idea-card-active' : ''}`}
                onClick={() => runCaptions(idea)}
              >
                <div className="idea-card-title">
                  {idea.title}
                  {idea.trending && <span className="trend-badge">🔥 Trending</span>}
                </div>
                <div className="field-hint">{idea.description}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedAngle && (
        <div className="ai-block">
          <div className="caption-step-head">
            <label className="field-label-standalone" style={{ marginBottom: 0 }}>2. Pick a caption</label>
            {!loadingCaptions && captionOptions.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => runCaptions(selectedAngle)}>🔁 Regenerate</button>
            )}
          </div>
          {loadingCaptions ? (
            <p className="field-hint">Writing trendy captions…</p>
          ) : (
            <div className="caption-options">
              {captionOptions.map((c, i) => (
                <div key={i} className={`caption-option ${caption === c ? 'caption-option-active' : ''}`}>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{c}</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => setCaption(c)}>Use this</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => onSaveText(c)}>💾 Save</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="ai-block">
        <div className="field">
          <label>3. Generate an image (optional)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              placeholder="Describe the image you want…"
            />
            <button
              className="btn btn-ghost"
              onClick={runSuggestImagePrompt}
              disabled={suggestingPrompt || (!caption.trim() && !topic.trim())}
              title="Suggest a prompt based on your caption"
            >
              {suggestingPrompt ? '…' : '✨ Suggest'}
            </button>
          </div>
          <div className="image-gen-row">
            <select value={imageProvider} onChange={(e) => setImageProvider(e.target.value)} title="Image AI provider">
              {IMAGE_PROVIDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} title="Image shape">
              {IMAGE_ASPECT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={runImage} disabled={loadingImage || !imagePrompt.trim()}>
              {loadingImage ? 'Generating…' : imageDataUrl ? '🔁 Regenerate' : 'Generate'}
            </button>
          </div>
        </div>

        <div className="field" style={{ marginTop: 10 }}>
          <button type="button" className="link-toggle" onClick={() => setShowBridgeOptions((v) => !v)}>
            {showBridgeOptions ? 'Hide advanced option' : 'Advanced: bring in an image from Gemini / ChatGPT instead'}
          </button>
          {showBridgeOptions && (
            <>
              <p className="field-hint" style={{ marginTop: 6, marginBottom: 8 }}>
                The Generate button above already creates images without ever leaving this page. This option is only
                for when you specifically want Gemini's or ChatGPT's own web app quality — those sites block being
                embedded directly (their own security setting, not something Social Manager can change), so they
                open in a small docked window next to this one instead of a full new tab; you generate there, then
                paste the image straight back in below.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setBridgeProvider('gemini')}
                  disabled={!imagePrompt.trim()}
                >
                  ✦ Open Gemini
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setBridgeProvider('chatgpt')}
                  disabled={!imagePrompt.trim()}
                >
                  ⌘ Open ChatGPT
                </button>
              </div>
            </>
          )}
        </div>

        {bridgeProvider && (
          <WebAiBridgeModal
            provider={bridgeProvider}
            prompt={imagePrompt}
            onCapture={handleBridgeCapture}
            onClose={() => setBridgeProvider(null)}
          />
        )}
        {imageDataUrl && (
          <div className="image-preview-row">
            <img src={imageDataUrl} alt="" className="image-preview-thumb" />
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setImageDataUrl(null);
                setImageBase64(null);
                setImageProviderUsed(null);
              }}
            >
              Remove
            </button>
          </div>
        )}
        {imageProviderUsed && (
          <p className="field-hint" style={{ marginTop: 6 }}>
            {imageProviderUsed.provider === 'web'
              ? `Brought in from the ${imageProviderUsed.label} web app.`
              : imageProviderUsed.provider === 'free'
              ? imageProviderUsed.fallbackFrom
                ? `Generated with the free provider — Gemini couldn't (${imageProviderUsed.fallbackFrom}).`
                : 'Generated with the free provider (no API key needed).'
              : 'Generated with Gemini.'}
          </p>
        )}
      </div>

      <div className="field">
        <label>Final caption (edit freely)</label>
        <CaptionField value={caption} onChange={setCaption} rows={4} />
      </div>

      {error && <div className="field-error">{error}</div>}
    </>
  );
}

/* ---------- Auto-pilot: multi-topic recurring generation ---------- */

function AutoPilot({ geminiKey, user, profile, updateProfile, fb }) {
  const saved = profile?.aiAutopilot || {};

  const [topics, setTopics] = useState(saved.topics || []);
  const [topicInput, setTopicInput] = useState('');
  const [tone, setTone] = useState(saved.tone || 'trendy');
  const [includeHashtags, setIncludeHashtags] = useState(saved.includeHashtags !== false);
  const [emojiLevel, setEmojiLevel] = useState(saved.emojiLevel || 'tasteful');
  const [includeImages, setIncludeImages] = useState(saved.includeImages !== false);
  const [imageAspectRatio, setImageAspectRatio] = useState(saved.imageAspectRatio || '1:1');
  const [imageProvider, setImageProvider] = useState(saved.imageProvider || 'free');
  const [postsPerTopic, setPostsPerTopic] = useState(saved.postsPerTopic || 3);

  const [intervalPreset, setIntervalPreset] = useState(
    saved.intervalHours && INTERVAL_PRESETS.some((p) => p.hours === saved.intervalHours) ? saved.intervalHours : 6
  );
  const [customHours, setCustomHours] = useState(
    saved.intervalHours && !INTERVAL_PRESETS.some((p) => p.hours === saved.intervalHours) ? saved.intervalHours : 2
  );
  const intervalHours = intervalPreset === 'custom' ? Number(customHours) || MIN_CUSTOM_HOURS : intervalPreset;
  const [postFirstNow, setPostFirstNow] = useState(saved.postFirstNow !== false);

  const [running, setRunning] = useState(false);
  // Update #4 — the queue is now a real, editable list: built up-front from
  // topics (state 'pending'), reorderable by drag, deletable before it runs.
  // Anything deleted here is spliced out and can never be posted.
  const [queue, setQueue] = useState([]);
  const [error, setError] = useState('');
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const totalPosts = topics.length * postsPerTopic;

  const addTopic = () => {
    const raw = topicInput.trim();
    if (!raw) return;
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    setTopics((prev) => {
      const next = [...prev];
      for (const p of parts) {
        if (next.length >= MAX_TOPICS) break;
        if (!next.some((t) => t.toLowerCase() === p.toLowerCase())) next.push(p);
      }
      return next;
    });
    setTopicInput('');
  };

  const removeTopic = (t) => setTopics((prev) => prev.filter((x) => x !== t));

  // Build (or top up) the queue from the current topic list, without
  // disturbing any items already sitting in the queue (pending, running, or
  // finished) — this is what lets "Generate & schedule" be run again later
  // to add more posts on top of an existing queue instead of replacing it.
  const buildQueueFromTopics = () => {
    const slots = [];
    for (let r = 0; r < postsPerTopic; r++) {
      for (const t of topics) slots.push(t);
    }
    const additions = slots.map((t, i) => ({
      id: `topic-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      topic: t,
      caption: '',
      imageUrl: null,
      state: 'pending',
      source: 'topic',
    }));
    setQueue((prev) => [...prev, ...additions]);
    return additions;
  };

  const deleteFromQueue = (id) => {
    // Only items that haven't started yet can be removed — once something
    // is scheduled/posted it's already live and belongs to the broadcast log.
    setQueue((prev) => prev.filter((q) => q.id !== id || !['pending'].includes(q.state)));
  };

  const handleDragStart = (id) => (e) => {
    setDragIndex(queue.findIndex((q) => q.id === id));
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (index) => (e) => {
    e.preventDefault();
    if (queue[index]?.state !== 'pending') return;
    setDragOverIndex(index);
  };
  const handleDrop = (index) => (e) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (dragIndex === null || dragIndex === index) return;
    if (queue[dragIndex]?.state !== 'pending' || queue[index]?.state !== 'pending') {
      setDragIndex(null);
      return;
    }
    setQueue((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragIndex(null);
  };

  const runAutopilot = async () => {
    if (!fb) {
      setError('Connect a Facebook Page first, in Connect profile.');
      return;
    }
    if (topics.length === 0 && queue.every((q) => q.state !== 'pending')) {
      setError('Add at least one topic to auto-post about.');
      return;
    }
    setError('');
    setRunning(true);

    if (user) {
      updateProfile({
        aiAutopilot: {
          topics,
          tone,
          includeHashtags,
          emojiLevel,
          includeImages,
          imageAspectRatio,
          imageProvider,
          postsPerTopic,
          intervalHours,
          postFirstNow,
        },
      }).catch(() => {});
    }

    // If the queue is empty (first run), build it from the topic list. If
    // there's already a queue (e.g. items merged in from a sheet, or a
    // previous run's leftovers), just work through whatever is pending —
    // this is what makes re-running "top up" the existing queue instead of
    // wiping it.
    const workQueue = queue.length > 0 ? queue : buildQueueFromTopics();

    const nowSec = Math.floor(Date.now() / 1000);
    const intervalSec = Math.round(intervalHours * 3600);
    const recentByTopic = {};
    let scheduleSteps = 0;
    let immediateUsed = false;

    for (let i = 0; i < workQueue.length; i++) {
      const item = workQueue[i];
      if (item.state !== 'pending') continue; // skip anything already run, deleted, or mid-flight

      const { id, topic } = item;
      setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, state: 'writing' } : q)));

      try {
        const recentAngles = recentByTopic[topic] || [];
        const post = await generateAutoPostFromTopic({ topic, tone, includeHashtags, emojiLevel, recentAngles }, geminiKey);
        if (!post || !post.caption) throw new Error('The AI agent did not return a usable post — it will skip this slot.');
        recentByTopic[topic] = [...recentAngles, post.angle].filter(Boolean).slice(-5);

        // Update #5 — post with real Unicode bold applied from the polished version.
        const finalCaption = applyMarkdownBold(post.polishedCaption || post.caption);

        let imageUrl = item.imageUrl || null;

        // Update #7 — image is generated automatically for every post, and
        // the queue row shows a live thumbnail preview the moment it's ready.
        if (includeImages && !imageUrl && post.imagePrompt) {
          setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, state: 'image', caption: finalCaption, angle: post.angle } : q)));
          try {
            const { base64, mimeType } = await generateImageSmart(post.imagePrompt, {
              provider: imageProvider,
              geminiKey,
              aspectRatio: imageAspectRatio,
            });
            imageUrl = await uploadGeneratedImage(user.uid, base64, mimeType);
            // Show the preview immediately, before scheduling.
            setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, imageUrl, state: 'preview' } : q)));
          } catch (imgErr) {
            console.warn('Image generation failed, continuing without image:', imgErr);
          }
        }

        const isImmediate = postFirstNow && !immediateUsed;
        setQueue((prev) =>
          prev.map((q) => (q.id === id ? { ...q, state: 'scheduling', caption: finalCaption, angle: post.angle, imageUrl } : q))
        );

        if (isImmediate) {
          immediateUsed = true;
          const res = await publishToPage({
            pageId: fb.pageId,
            pageAccessToken: fb.pageAccessToken,
            message: finalCaption,
            imageUrl: imageUrl || undefined,
          });
          await savePost(user.uid, {
            caption: finalCaption,
            imageUrl: imageUrl || null,
            status: 'posted',
            fbPostId: res.id,
            fbPageId: fb.pageId,
            source: 'ai-autopilot',
            topic,
            angle: post.angle || null,
          });
          setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, state: 'posted' } : q)));
        } else {
          scheduleSteps += 1;
          const publishAt = nowSec + scheduleSteps * intervalSec;
          if (publishAt - nowSec > MAX_SCHEDULE_SECONDS) {
            setQueue((prev) =>
              prev.map((q) =>
                q.id === id
                  ? { ...q, state: 'failed', message: "Beyond Facebook's 75-day scheduling limit — lower the count or shorten the interval." }
                  : q
              )
            );
            continue;
          }
          const res = await schedulePost({
            pageId: fb.pageId,
            pageAccessToken: fb.pageAccessToken,
            message: finalCaption,
            publishTimeUnix: publishAt,
            imageUrl: imageUrl || undefined,
          });
          await savePost(user.uid, {
            caption: finalCaption,
            imageUrl: imageUrl || null,
            status: 'scheduled',
            fbPostId: res.id,
            fbPageId: fb.pageId,
            scheduledAt: publishAt * 1000,
            source: 'ai-autopilot',
            topic,
            angle: post.angle || null,
          });
          setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, state: 'scheduled', scheduledFor: publishAt * 1000 } : q)));
        }
      } catch (e) {
        setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, state: 'failed', message: e.message } : q)));
      }
    }

    setRunning(false);
  };

  const pendingCount = queue.filter((q) => q.state === 'pending').length;
  const finished = !running && queue.length > 0 && queue.every((q) => q.state === 'posted' || q.state === 'scheduled' || q.state === 'failed');

  return (
    <div>
      <div className="ai-block">
        <div className="field">
          <label>Topics to auto-post about</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTopic();
                }
              }}
              placeholder="e.g. Agriculture — press Enter to add"
              disabled={running}
            />
            <button className="btn btn-ghost" onClick={addTopic} disabled={running || !topicInput.trim()}>Add</button>
          </div>
          {topics.length > 0 && (
            <div className="chip-row">
              {topics.map((t) => (
                <span key={t} className="chip">
                  {t}
                  {!running && (
                    <button type="button" onClick={() => removeTopic(t)} aria-label={`Remove ${t}`}>✕</button>
                  )}
                </span>
              ))}
            </div>
          )}
          <p className="field-hint">
            Add as many topics as you like — Agriculture, weekend specials, fitness tips… each post in the queue
            rotates through them with a fresh angle every time. You can also build the queue first with{' '}
            <button type="button" className="link-toggle" style={{ display: 'inline', padding: 0 }} onClick={buildQueueFromTopics} disabled={running || topics.length === 0}>
              + Add to queue
            </button>{' '}
            without running it yet, so you can reorder or trim it first.
          </p>
        </div>

        <ToneControls
          tone={tone}
          setTone={setTone}
          emojiLevel={emojiLevel}
          setEmojiLevel={setEmojiLevel}
          includeHashtags={includeHashtags}
          setIncludeHashtags={setIncludeHashtags}
        />

        <div className="image-gen-row">
          <label className="checkbox-row" style={{ marginTop: 0 }}>
            <input type="checkbox" checked={includeImages} onChange={(e) => setIncludeImages(e.target.checked)} disabled={running} />
            Generate a matching AI image for every post
          </label>
          {includeImages && (
            <>
              <select
                value={imageProvider}
                onChange={(e) => setImageProvider(e.target.value)}
                disabled={running}
                title="Image AI provider"
              >
                {IMAGE_PROVIDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select
                value={imageAspectRatio}
                onChange={(e) => setImageAspectRatio(e.target.value)}
                disabled={running}
                title="Image shape"
              >
                {IMAGE_ASPECT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </>
          )}
        </div>
        {includeImages && (
          <p className="field-hint" style={{ marginTop: 6 }}>
            Images generate automatically in-app as each post runs — no new tabs, and each one shows a preview
            thumbnail in the queue below the moment it's ready.
          </p>
        )}
      </div>

      <div className="ai-block">
        <label className="field-label-standalone">Posting schedule</label>
        <div className="schedule-settings-grid">
          <div className="field">
            <label>Posts per topic</label>
            <input
              type="number"
              min={1}
              max={10}
              value={postsPerTopic}
              onChange={(e) => setPostsPerTopic(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              disabled={running}
            />
          </div>
          <div className="field">
            <label>Post every</label>
            <select
              value={intervalPreset}
              onChange={(e) => setIntervalPreset(e.target.value === 'custom' ? 'custom' : Number(e.target.value))}
              disabled={running}
            >
              {INTERVAL_PRESETS.map((p) => (
                <option key={p.label} value={p.hours}>{p.label}</option>
              ))}
            </select>
          </div>
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
              disabled={running}
            />
          </div>
        )}
        <label className="checkbox-row">
          <input type="checkbox" checked={postFirstNow} onChange={(e) => setPostFirstNow(e.target.checked)} disabled={running} />
          Post the first one right away, then space out the rest
        </label>
        <p className="field-hint" style={{ marginTop: 10 }}>
          {topics.length > 0
            ? `${totalPosts} post${totalPosts === 1 ? '' : 's'} will be written and queued.`
            : 'Add a topic to see how many posts this creates.'}{' '}
          Scheduled posts publish straight from Facebook's own servers — they go out on time even if you close
          this tab.
        </p>
      </div>

      <button
        className="btn btn-accent btn-block"
        disabled={running || (topics.length === 0 && pendingCount === 0) || !fb}
        onClick={runAutopilot}
      >
        {running
          ? 'Generating & scheduling…'
          : queue.length > 0
          ? `Generate & schedule ${pendingCount || totalPosts} post${(pendingCount || totalPosts) === 1 ? '' : 's'}`
          : `Generate & schedule ${totalPosts || ''} post${totalPosts === 1 ? '' : 's'}`}
      </button>
      {!fb && <p className="field-error" style={{ marginTop: 8 }}>Connect a Facebook Page first, in Connect profile.</p>}
      {error && <div className="field-error" style={{ marginTop: 10 }}>{error}</div>}

      {queue.length > 0 && (
        <div className="ai-block" style={{ marginTop: 22, borderTop: '1px dashed var(--line)', paddingTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label className="field-label-standalone" style={{ margin: 0 }}>Queue ({queue.length})</label>
            <p className="field-hint" style={{ margin: 0 }}>Drag ⋮⋮ to reorder · ✕ to delete before it runs</p>
          </div>
          <div className="post-list" style={{ marginTop: 10 }}>
            {queue.map((q, idx) => {
              let label = 'Waiting…';
              let cls = 'idle';
              if (q.state === 'writing') { label = 'Writing caption…'; cls = 'warn'; }
              else if (q.state === 'image') { label = 'Generating image…'; cls = 'warn'; }
              else if (q.state === 'preview') { label = 'Image ready — scheduling next…'; cls = 'warn'; }
              else if (q.state === 'scheduling') { label = 'Scheduling…'; cls = 'warn'; }
              else if (q.state === 'posted') { label = 'Posted ✓'; cls = 'live'; }
              else if (q.state === 'scheduled') { label = `Scheduled · ${new Date(q.scheduledFor).toLocaleString()}`; cls = 'ok'; }
              else if (q.state === 'failed') { label = 'Failed'; cls = 'warn'; }
              else if (q.state === 'pending') { label = q.source === 'sheet' ? 'From sheet · waiting' : 'Waiting…'; cls = 'idle'; }

              const draggable = q.state === 'pending';

              return (
                <div
                  key={q.id}
                  className="card post-row"
                  draggable={draggable}
                  onDragStart={handleDragStart(q.id)}
                  onDragOver={handleDragOver(idx)}
                  onDrop={handleDrop(idx)}
                  onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                  style={{
                    opacity: dragIndex !== null && queue[dragIndex]?.id === q.id ? 0.5 : 1,
                    background: dragOverIndex === idx ? 'var(--bg-2)' : undefined,
                    cursor: draggable ? 'grab' : 'default',
                  }}
                >
                  {draggable && <span style={{ marginRight: 6, opacity: 0.5 }}>⋮⋮</span>}
                  {q.imageUrl ? (
                    <img src={q.imageUrl} alt="" className="post-row-thumb" />
                  ) : (
                    <div className="post-row-thumb sheet-row-thumb-empty" />
                  )}
                  <div className="post-row-text">
                    <strong style={{ marginRight: 6 }}>{q.topic}</strong>
                    {q.caption ? q.caption.split('\n')[0] : <span className="field-hint">…</span>}
                  </div>
                  <span className={`badge badge-${cls}`}>{label}</span>
                  {draggable && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginLeft: 6 }}
                      onClick={() => deleteFromQueue(q.id)}
                      aria-label="Remove from queue"
                      title="Delete — this will never be posted"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {queue.some((q) => q.state === 'failed' && q.message) && (
            <div className="field-error" style={{ marginTop: 10 }}>
              {queue.find((q) => q.state === 'failed' && q.message)?.message}
            </div>
          )}
          {finished && (
            <p className="field-hint" style={{ marginTop: 14 }}>
              Done — check the <Link to="/log">broadcast log</Link> for full status, or add more topics and run
              Auto-pilot again any time to top up the queue.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
