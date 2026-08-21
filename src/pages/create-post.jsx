import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { publishToPage, schedulePost } from '../services/facebook';
import {
  generateCaptionsFromTopic,
  generateAutoPostFromTopic,
  suggestImagePrompt,
  regenerateCaption as regenerateCaptionAI,
  addPromoTextToImage,
  TONE_OPTIONS,
  IMAGE_ASPECT_OPTIONS,
} from '../services/gemini';
import { generateImageSmart, IMAGE_PROVIDER_OPTIONS } from '../services/imageProviders';
import { uploadGeneratedImage } from '../services/storage';
import { savePost, watchSavedTexts, saveText, deleteSavedText, watchPosts } from '../services/content';
import { fetchImageBlob } from '../services/sheets';
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

  const [mode, setMode] = useState('manual'); // 'manual' | 'ai' | 'from-previous'
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
  const [allPosts, setAllPosts] = useState([]);
  const [selectedPreviousPost, setSelectedPreviousPost] = useState(null);
  const [previousPostQueue, setPreviousPostQueue] = useState([]);
  const [queueInterval, setQueueInterval] = useState('2'); // hours
  const [isPostingQueue, setIsPostingQueue] = useState(false);
  const [queueProgress, setQueueProgress] = useState(0);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    return watchSavedTexts(user.uid, setSavedTexts);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return watchPosts(user.uid, setAllPosts);
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
          <p className="field-hint">
            {fb ? (
              <span className="publishing-to-chip">
                {fb.avatar && <img src={fb.avatar} alt="" className="publishing-to-avatar" />}
                Publishing to <strong>{fb.name}</strong>
              </span>
            ) : (
              'Connect a page to publish'
            )}
          </p>
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
        <button className={`tab-btn ${mode === 'from-previous' ? 'tab-btn-active' : ''}`} onClick={() => setMode('from-previous')}>
          From previous posts
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
          ) : mode === 'ai' ? (
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
          ) : (
            <FromPreviousComposer
              allPosts={allPosts.filter(p => (p.platform || 'facebook') === 'facebook' && p.status === 'posted')}
              selectedPost={selectedPreviousPost}
              setSelectedPost={setSelectedPreviousPost}
              caption={caption}
              setCaption={setCaption}
              imageDataUrl={imageDataUrl}
              setImageDataUrl={setImageDataUrl}
              setImageBase64={setImageBase64}
              geminiKey={geminiKey}
              onClearImage={() => {
                setImageDataUrl(null);
                setImageBase64(null);
              }}
              onAddToQueue={(post) => {
                setPreviousPostQueue([...previousPostQueue, { ...post, id: `${Date.now()}-${Math.random()}` }]);
                setCaption('');
                setImageDataUrl(null);
                setImageBase64(null);
                setSelectedPreviousPost(null);
              }}
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

          {mode !== 'from-previous' ? (
            <button
              className="btn btn-accent btn-block"
              style={{ marginTop: 18 }}
              disabled={!caption.trim() && !imageDataUrl}
              onClick={() => setShowPreview(true)}
            >
              Preview post
            </button>
          ) : (
            <>
              <div style={{ marginTop: 18 }}>
                {previousPostQueue.length > 0 && (
                  <div>
                    <div style={{ marginBottom: 12, fontSize: '0.9rem' }}>
                      <strong>{previousPostQueue.length} posts in queue</strong>
                      <div className="field-hint">Posts will be scheduled every {queueInterval} hours</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <select value={queueInterval} onChange={(e) => setQueueInterval(e.target.value)} style={{ flex: 1 }}>
                        <option value="0.5">Every 30 minutes</option>
                        <option value="1">Every 1 hour</option>
                        <option value="2">Every 2 hours</option>
                        <option value="4">Every 4 hours</option>
                        <option value="6">Every 6 hours</option>
                        <option value="12">Every 12 hours</option>
                        <option value="24">Every 24 hours</option>
                      </select>
                    </div>
                    <button
                      className="btn btn-success btn-block"
                      disabled={isPostingQueue || previousPostQueue.length === 0}
                      onClick={async () => {
                        if (!fb) throw new Error('Connect a Facebook Page first.');
                        setIsPostingQueue(true);
                        const interval = parseFloat(queueInterval) * 60 * 60 * 1000;
                        for (let i = 0; i < previousPostQueue.length; i++) {
                          const post = previousPostQueue[i];
                          try {
                            const scheduleTime = Date.now() + interval * (i + 1);
                            await schedulePost({
                              pageId: fb.pageId,
                              pageAccessToken: fb.pageAccessToken,
                              message: post.caption,
                              imageBase64: post.imageDataUrl?.split(',')[1] || null,
                              scheduledAt: new Date(scheduleTime),
                            });
                            await savePost(user.uid, {
                              caption: post.caption,
                              imageDataUrl: post.imageDataUrl || null,
                              status: 'scheduled',
                              scheduledAt: scheduleTime,
                              fbPageId: fb.pageId,
                            });
                            setQueueProgress(i + 1);
                          } catch (err) {
                            console.error('Failed to schedule post:', err);
                          }
                        }
                        setPreviousPostQueue([]);
                        setQueueProgress(0);
                        setIsPostingQueue(false);
                        setPostResult('scheduled');
                      }}
                      style={{ marginBottom: 12 }}
                    >
                      {isPostingQueue ? `Posting (${queueProgress}/${previousPostQueue.length})...` : '📤 Post all'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="composer-side">
          {mode === 'from-previous' && previousPostQueue.length > 0 ? (
            <div className="card side-preview">
              <div className="side-preview-label">Queue ({previousPostQueue.length} posts)</div>
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {previousPostQueue.map((post, idx) => (
                  <div key={post.id} style={{ padding: 8, borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}>
                    <div style={{ marginBottom: 6, fontWeight: 'bold' }}>Post {idx + 1}</div>
                    {post.imageDataUrl && (
                      <img src={post.imageDataUrl} alt="" style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 4, marginBottom: 6 }} />
                    )}
                    <div style={{ color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                      {post.caption?.substring(0, 60)}...
                    </div>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        setPreviousPostQueue(previousPostQueue.filter(p => p.id !== post.id));
                      }}
                      style={{ marginTop: 6, width: '100%' }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card side-preview">
              <div className="side-preview-label">Live preview</div>
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
          )}
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
          <button className="btn btn-ghost photo-drop-btn" onClick={() => fileRef.current?.click()}>
            <span className="photo-drop-icon">🖼</span>
            <span>+ Add photo</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} style={{ display: 'none' }} />
      </div>
    </div>
  );
}

/* ================= AI agent ================= */

function AiComposer({ geminiKey, user, profile, updateProfile, fb, caption, setCaption, imageDataUrl, setImageDataUrl, setImageBase64, onSaveText }) {
  const [aiMode, setAiMode] = useState('quick'); // 'quick' | 'autopilot'

  return (
    <div className="card page-card ai-agent-card">
      <div className="ai-agent-head">
        <span className="ai-agent-badge">✦ AI agent</span>
        <p className="field-hint" style={{ marginTop: 6 }}>
          Trendy, humanized captions built for how people actually scroll Facebook — write with ChatGPT, Gemini,
          or generate instantly in-app.
        </p>
      </div>

      <div className="guide-tabs ai-mode-tabs">
        <button className={`guide-tab-btn ${aiMode === 'quick' ? 'guide-tab-btn-active' : ''}`} onClick={() => setAiMode('quick')}>
          Create a post
        </button>
        <button className={`guide-tab-btn ${aiMode === 'autopilot' ? 'guide-tab-btn-active' : ''}`} onClick={() => setAiMode('autopilot')}>
          Auto-generate several ✨
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
      ) : !geminiKey ? (
        <div className="card page-card empty-card" style={{ marginTop: 14 }}>
          <div className="empty-card-icon">✦</div>
          <h3>Add a Gemini API key</h3>
          <p className="field-hint" style={{ margin: '6px 0 16px' }}>
            Auto-generating several posts at once needs a free Gemini API key, since it writes and researches in
            the background without you sitting in a ChatGPT/Gemini chat for each one.
          </p>
          <Link to="/settings" className="btn btn-accent">Add key in Connect profile</Link>
        </div>
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

/** Prompt sent into the docked ChatGPT/Gemini web app to write the caption there. */
function buildCaptionBridgePrompt(brief, { tone, includeHashtags, emojiLevel }) {
  const toneLabel = TONE_OPTIONS.find((t) => t.value === tone)?.label || 'Friendly & warm';
  return `Write one Facebook caption for a page post. Brief: "${brief}"

Voice: ${toneLabel}. ${emojiLevel === 'none' ? 'No emojis.' : emojiLevel === 'expressive' ? 'Use emojis freely and naturally.' : 'Use a few tasteful emojis.'} ${includeHashtags ? 'End with 3-5 relevant hashtags.' : 'No hashtags.'}

Make it sound like a real page owner, not an AI: a punchy hook in the first line (Facebook truncates after that), short natural paragraph breaks, and one clear low-friction call to action at the end. Reply with ONLY the finished caption text, ready to paste straight into Facebook — no preamble, no options, no quotation marks around it.`;
}

/**
 * Create a single post: a linear 3-step flow.
 *   1. Write the caption — from a brief, using ChatGPT, Gemini, or an
 *      instant in-app generator (all three write the same kind of trendy,
 *      humanized Facebook caption; pick whichever you prefer).
 *   2. Suggest & generate a matching image, again via ChatGPT, Gemini, or
 *      an instant free generator.
 *   3. Preview & post — handled by the shared button/modal in CreatePost().
 */
function QuickCreate({ geminiKey, caption, setCaption, imageDataUrl, setImageDataUrl, setImageBase64, onSaveText }) {
  const [brief, setBrief] = useState('');
  const [tone, setTone] = useState('trendy');
  const [includeHashtags, setIncludeHashtags] = useState(true);
  const [emojiLevel, setEmojiLevel] = useState('tasteful');

  const [writingInstant, setWritingInstant] = useState(false);
  const [captionBridge, setCaptionBridge] = useState(null); // 'gemini' | 'chatgpt' | null
  const [captionSource, setCaptionSource] = useState(null); // { label } once a caption has been written

  const [imagePrompt, setImagePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [suggestingPrompt, setSuggestingPrompt] = useState(false);
  const [generatingInstantImage, setGeneratingInstantImage] = useState(false);
  const [imageBridge, setImageBridge] = useState(null); // 'gemini' | 'chatgpt' | null
  const [imageSource, setImageSource] = useState(null); // { label } once an image has been brought in

  const [error, setError] = useState('');

  const writeCaptionInstant = async () => {
    if (!brief.trim()) return;
    if (!geminiKey) {
      setError('Add a free Gemini API key in Connect profile to use Instant, or write with ChatGPT/Gemini above instead.');
      return;
    }
    setError('');
    setWritingInstant(true);
    try {
      const result = await generateCaptionsFromTopic(brief, geminiKey, { tone, includeHashtags, emojiLevel });
      setCaption(applyMarkdownBold(result.polished || result.plain));
      setCaptionSource({ label: 'Instant' });
    } catch (e) {
      setError(e.message);
    } finally {
      setWritingInstant(false);
    }
  };

  const handleCaptionBridgeCapture = ({ text, label }) => {
    setError('');
    setCaption(text);
    setCaptionSource({ label });
  };

  const suggestTheImagePrompt = async () => {
    const context = caption.trim() || brief;
    if (!context.trim()) return;
    setError('');
    setSuggestingPrompt(true);
    try {
      if (geminiKey) {
        const p = await suggestImagePrompt(context, geminiKey);
        if (p) setImagePrompt(p);
      } else {
        // No Gemini key for the suggestion call either — fall back to
        // using the caption/brief itself as a reasonable starting prompt.
        setImagePrompt(context.slice(0, 160));
      }
    } catch (e) {
      setImagePrompt(context.slice(0, 160));
      setError(e.message);
    } finally {
      setSuggestingPrompt(false);
    }
  };

  // Once a caption exists, auto-suggest a matching image prompt so step 2
  // is never a blank box staring back at the person.
  useEffect(() => {
    if (captionSource && !imagePrompt.trim()) {
      suggestTheImagePrompt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionSource]);

  const generateInstantImage = async () => {
    if (!imagePrompt.trim()) return;
    setError('');
    setGeneratingInstantImage(true);
    try {
      const { base64, mimeType, provider, fallbackFrom } = await generateImageSmart(imagePrompt, {
        provider: 'free',
        geminiKey,
        aspectRatio,
      });
      setImageBase64(base64);
      setImageDataUrl(`data:${mimeType};base64,${base64}`);
      setImageSource({ label: fallbackFrom ? `Instant (${provider})` : 'Instant' });
    } catch (e) {
      setError(e.message);
    } finally {
      setGeneratingInstantImage(false);
    }
  };

  const handleImageBridgeCapture = ({ base64, mimeType, dataUrl, label }) => {
    setError('');
    setImageBase64(base64);
    setImageDataUrl(dataUrl || `data:${mimeType};base64,${base64}`);
    setImageSource({ label });
  };

  return (
    <>
      {/* Step 1 — write the caption */}
      <div className="ai-block">
        <div className="field">
          <label>1. What's the post about?</label>
          <textarea
            rows={3}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Describe the post — a topic, an offer, an update, a story… write as much or as little as you like."
          />
        </div>

        <ToneControls
          tone={tone}
          setTone={setTone}
          emojiLevel={emojiLevel}
          setEmojiLevel={setEmojiLevel}
          includeHashtags={includeHashtags}
          setIncludeHashtags={setIncludeHashtags}
        />

        <div className="field" style={{ marginTop: 10 }}>
          <label>Write the caption with</label>
          <div className="ai-provider-row">
            <button
              className="btn btn-ghost ai-provider-btn"
              onClick={() => setCaptionBridge('chatgpt')}
              disabled={!brief.trim()}
            >
              ⌘ ChatGPT
            </button>
            <button
              className="btn btn-ghost ai-provider-btn"
              onClick={() => setCaptionBridge('gemini')}
              disabled={!brief.trim()}
            >
              ✦ Gemini
            </button>
            <button
              className="btn btn-accent ai-provider-btn"
              onClick={writeCaptionInstant}
              disabled={!brief.trim() || writingInstant}
              title={geminiKey ? 'Write instantly, without leaving this page' : 'Needs a free Gemini API key'}
            >
              {writingInstant ? 'Writing…' : '⚡ Instant'}
            </button>
          </div>
          <p className="field-hint" style={{ marginTop: 6 }}>
            ChatGPT and Gemini open in a small docked window — you copy the caption it writes back in. Instant
            writes it right here, using your free Gemini API key.
          </p>
        </div>

        {captionBridge && (
          <WebAiBridgeModal
            provider={captionBridge}
            prompt={buildCaptionBridgePrompt(brief, { tone, includeHashtags, emojiLevel })}
            kind="text"
            onCapture={handleCaptionBridgeCapture}
            onClose={() => setCaptionBridge(null)}
          />
        )}

        {caption.trim() && (
          <div className="field" style={{ marginTop: 12 }}>
            <div className="caption-step-head">
              <label className="field-label-standalone" style={{ marginBottom: 0 }}>
                Caption {captionSource ? `— written with ${captionSource.label}` : ''}
              </label>
              {caption.trim() && (
                <button className="btn btn-ghost btn-sm" onClick={() => onSaveText(caption)}>💾 Save</button>
              )}
            </div>
            <CaptionField value={caption} onChange={setCaption} rows={5} />
          </div>
        )}
      </div>

      {/* Step 2 — matching image, once there's a caption to match */}
      {caption.trim() && (
        <div className="ai-block">
          <div className="field">
            <label>2. Suggest & generate a matching image</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Image prompt…"
              />
              <button
                className="btn btn-ghost btn-sm"
                onClick={suggestTheImagePrompt}
                disabled={suggestingPrompt}
                title="Suggest a prompt based on your caption"
              >
                {suggestingPrompt ? '…' : '✨ Re-suggest'}
              </button>
            </div>
            <p className="field-hint" style={{ marginTop: 6 }}>
              Eye-catching, on-brand images get shared more — this prompt is built to pair with your caption above.
              Edit it freely, then generate.
            </p>
          </div>

          <div className="field">
            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} title="Image shape" style={{ maxWidth: 180 }}>
              {IMAGE_ASPECT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="ai-provider-row">
            <button
              className="btn btn-ghost ai-provider-btn"
              onClick={() => setImageBridge('chatgpt')}
              disabled={!imagePrompt.trim()}
            >
              ⌘ ChatGPT
            </button>
            <button
              className="btn btn-ghost ai-provider-btn"
              onClick={() => setImageBridge('gemini')}
              disabled={!imagePrompt.trim()}
            >
              ✦ Gemini
            </button>
            <button
              className="btn btn-accent ai-provider-btn"
              onClick={generateInstantImage}
              disabled={!imagePrompt.trim() || generatingInstantImage}
              title="Generate instantly with a free provider, no key needed"
            >
              {generatingInstantImage ? 'Generating…' : imageDataUrl ? '⚡ Regenerate' : '⚡ Instant'}
            </button>
          </div>

          {imageBridge && (
            <WebAiBridgeModal
              provider={imageBridge}
              prompt={imagePrompt}
              kind="image"
              onCapture={handleImageBridgeCapture}
              onClose={() => setImageBridge(null)}
            />
          )}

          {imageDataUrl && (
            <div className="image-preview-row" style={{ marginTop: 10 }}>
              <img src={imageDataUrl} alt="" className="image-preview-thumb" />
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setImageDataUrl(null);
                  setImageBase64(null);
                  setImageSource(null);
                }}
              >
                Remove
              </button>
            </div>
          )}
          {imageSource && (
            <p className="field-hint" style={{ marginTop: 6 }}>Brought in with {imageSource.label}.</p>
          )}
        </div>
      )}

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

/* ================= From Previous Posts ================= */

function FromPreviousComposer({
  allPosts,
  selectedPost,
  setSelectedPost,
  caption,
  setCaption,
  imageDataUrl,
  setImageDataUrl,
  setImageBase64,
  geminiKey,
  onClearImage,
  onAddToQueue,
}) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showPostList, setShowPostList] = useState(true);
  const [regenerateCaption, setRegenerateCaption] = useState(false);
  const [regenerateImage, setRegenerateImage] = useState(false);
  // The overlay text to stamp onto the post's existing photo (e.g. a promo
  // code banner). Defaults to a placeholder example only in the input's
  // `placeholder` attribute — it stays blank until the person types one.
  const [promoText, setPromoText] = useState('');

  const handleSelectPost = (post) => {
    setSelectedPost(post);
    setCaption(post.caption || '');
    // A post saved from a sheet-import or auto-pilot run may only have a
    // remote imageUrl (no imageDataUrl). Falling back to it here means the
    // preview/edit flow below still has something to show and to edit,
    // instead of silently treating the post as image-less.
    setImageDataUrl(post.imageDataUrl || post.imageUrl || null);
    setImageBase64(post.imageDataUrl ? post.imageDataUrl.split(',')[1] : null);
    setShowPostList(false);
  };

  const [regenerateError, setRegenerateError] = useState('');

  // Turns whatever image reference we currently have (a data: URL already
  // in memory, or a remote URL from the original post) into the raw
  // base64 + mime type Gemini's image-edit call needs.
  const resolveSourceImage = async () => {
    const current = imageDataUrl || selectedPost?.imageDataUrl || selectedPost?.imageUrl;
    if (!current) throw new Error('This post has no image to edit — add one first.');
    if (current.startsWith('data:')) {
      const mimeMatch = /^data:([^;]+);base64,/.exec(current);
      return { base64: current.split(',')[1], mimeType: mimeMatch?.[1] || 'image/png' };
    }
    // Remote URL (e.g. Cloudinary/Sheets-sourced image) — download it into
    // the browser first, same helper used by sheet-import for the same
    // reason (some hosts block server-side fetches but allow browser ones).
    const blob = await fetchImageBlob(current);
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read that image.'));
      reader.onloadend = () => {
        const result = reader.result || '';
        const mimeMatch = /^data:([^;]+);base64,/.exec(result);
        resolve({ base64: result.split(',')[1] || '', mimeType: mimeMatch?.[1] || blob.type || 'image/png' });
      };
      reader.readAsDataURL(blob);
    });
  };

  // BUG FIX — every call in here had its arguments in the wrong order (and
  // one used a signature that doesn't exist), so "Regenerate" was silently
  // calling Gemini with the API key in the topic slot and the caption in
  // the API-key slot, failing the request every time and leaving the
  // caption/image untouched with no visible error. That's fixed below.
  //
  // Image regeneration now also does what was actually wanted here: it
  // takes the SAME photo already on the post and edits it in place to add
  // a large promo-text overlay, instead of generating an unrelated new
  // image from a text description.
  const regenerateWithAI = async () => {
    if (!selectedPost || !geminiKey) return;
    setIsRegenerating(true);
    setRegenerateError('');
    try {
      if (regenerateCaption && caption.trim()) {
        // Rewrite the existing caption as a fresh variation — same topic
        // and roughly the same length — rather than treating it as a
        // brief to expand into a brand-new, longer post.
        const rewritten = await regenerateCaptionAI(caption, geminiKey, { tone: 'engaging' });
        if (rewritten) setCaption(rewritten);
      }
      if (regenerateImage) {
        if (!promoText.trim()) {
          setRegenerateError('Enter the promo text to add to the image first (e.g. "Promo code: ABCDEF").');
        } else {
          const { base64: sourceBase64, mimeType: sourceMime } = await resolveSourceImage();
          const { base64, mimeType } = await addPromoTextToImage(sourceBase64, sourceMime, promoText, geminiKey);
          if (base64) {
            setImageBase64(base64);
            setImageDataUrl(`data:${mimeType};base64,${base64}`);
          }
        }
      }
    } catch (err) {
      console.error('Failed to regenerate:', err);
      setRegenerateError(err.message || 'Could not regenerate. Please try again.');
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="card page-card">
      {showPostList ? (
        <>
          <div style={{ marginBottom: 16 }}>
            <label className="field-label-standalone">Select a previous post to regenerate</label>
            <p className="field-hint">Choose any posted content to use as a starting point</p>
          </div>
          {allPosts.length === 0 ? (
            <p className="field-hint">No previous posts found. Create and post some content first!</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allPosts.slice(0, 20).map((post) => (
                <div
                  key={post.id}
                  onClick={() => handleSelectPost(post)}
                  style={{
                    padding: 12,
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  className="hoverable"
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    {(post.imageDataUrl || post.imageUrl) && (
                      <img
                        src={post.imageDataUrl || post.imageUrl}
                        alt=""
                        style={{ width: 50, height: 50, borderRadius: 4, objectFit: 'cover' }}
                      />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {new Date(post.createdAt?.toMillis?.() || post.createdAt || 0).toLocaleDateString()}
                      </div>
                      <div style={{ marginTop: 4, fontSize: '0.9rem' }}>
                        {(post.caption || '(no caption)').substring(0, 80)}...
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPostList(true)}>
              ← Back to posts
            </button>
          </div>

          <div className="field">
            <label>Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={6}
              style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)' }}
              placeholder="Edit the caption…"
            />
          </div>

          <div className="field">
            <label>Image</label>
            {imageDataUrl ? (
              <div className="image-preview-row">
                <img src={imageDataUrl} alt="" className="image-preview-thumb" />
                <button className="btn btn-ghost btn-sm" onClick={onClearImage}>Remove</button>
              </div>
            ) : (
              <div className="field-hint">No image selected</div>
            )}
          </div>

          <div style={{ background: 'var(--bg-2)', padding: 12, borderRadius: 6, marginBottom: 12 }}>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={regenerateCaption}
                onChange={(e) => setRegenerateCaption(e.target.checked)}
                disabled={isRegenerating}
              />
              Regenerate caption with AI
            </label>
            <label className="checkbox-row" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={regenerateImage}
                onChange={(e) => setRegenerateImage(e.target.checked)}
                disabled={isRegenerating || !geminiKey}
              />
              Add promo text to this post's image {!geminiKey && '(requires Gemini API key)'}
            </label>
            {regenerateImage && (
              <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
                <label>Promo text</label>
                <input
                  value={promoText}
                  onChange={(e) => setPromoText(e.target.value)}
                  placeholder="Promo code: ABCDEF"
                  disabled={isRegenerating}
                />
                <p className="field-hint" style={{ marginTop: 4 }}>
                  Keeps the post's existing photo as-is and stamps this text onto it as a large, legible
                  banner — it doesn't generate a new, unrelated image.
                </p>
              </div>
            )}
            {(regenerateCaption || regenerateImage) && (
              <button
                className="btn btn-sm btn-info"
                onClick={regenerateWithAI}
                disabled={isRegenerating || (regenerateImage && !promoText.trim())}
                style={{ marginTop: 8, width: '100%' }}
              >
                {isRegenerating ? '✨ Regenerating...' : '✨ Regenerate'}
              </button>
            )}
            {regenerateError && <div className="field-error" style={{ marginTop: 8 }}>{regenerateError}</div>}
          </div>

          <button
            className="btn btn-success btn-block"
            onClick={() => onAddToQueue({ caption, imageDataUrl })}
            disabled={!caption.trim()}
          >
            + Add to queue
          </button>
        </>
      )}
    </div>
  );
}
