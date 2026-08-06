import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { publishToPage } from '../services/facebook';
import { suggestContentIdeas, generateCaptions, generateImage } from '../services/gemini';
import { savePost, watchSavedTexts, saveText, deleteSavedText } from '../services/content';
import PostPreviewModal from '../components/post-preview-modal';

export default function CreatePost() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const draftToEdit = location.state?.draft;
  const fb = profile?.fb;
  const geminiKey = profile?.geminiApiKey;

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
      { caption, imageDataUrl: imageDataUrl || null, status: 'posted', fbPostId: res.id },
      editingId
    );
    setShowPreview(false);
    setPostResult('posted');
  };

  const handleSaveDraft = async () => {
    await savePost(user.uid, { caption, imageDataUrl: imageDataUrl || null, status: 'draft' }, editingId);
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
              caption={caption}
              setCaption={setCaption}
              imageDataUrl={imageDataUrl}
              setImageDataUrl={setImageDataUrl}
              setImageBase64={setImageBase64}
              onSaveText={(t) => user && saveText(user.uid, t)}
            />
          )}

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

          {showLibrary && (
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

          <button
            className="btn btn-accent btn-block"
            style={{ marginTop: 18 }}
            disabled={!caption.trim() && !imageDataUrl}
            onClick={() => setShowPreview(true)}
          >
            Preview post
          </button>
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
      <div className="field">
        <label>What's on your mind?</label>
        <textarea rows={6} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write your post…" />
      </div>
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

function AiComposer({ geminiKey, caption, setCaption, imageDataUrl, setImageDataUrl, setImageBase64, onSaveText }) {
  const [topic, setTopic] = useState('');
  const [ideas, setIdeas] = useState([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [selectedAngle, setSelectedAngle] = useState(null);

  const [captionOptions, setCaptionOptions] = useState([]);
  const [loadingCaptions, setLoadingCaptions] = useState(false);

  const [imagePrompt, setImagePrompt] = useState('');
  const [loadingImage, setLoadingImage] = useState(false);
  const [error, setError] = useState('');

  if (!geminiKey) {
    return (
      <div className="card page-card empty-card">
        <div className="empty-card-icon">✦</div>
        <h3>Add a Gemini API key</h3>
        <p className="field-hint" style={{ margin: '6px 0 16px' }}>
          The AI agent needs your free Gemini API key to suggest content, write captions, and generate images.
        </p>
        <Link to="/settings" className="btn btn-accent">Add key in Connect profile</Link>
      </div>
    );
  }

  const runSuggest = async () => {
    if (!topic.trim()) return;
    setError('');
    setLoadingIdeas(true);
    setIdeas([]);
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
      const result = await generateCaptions(brief, geminiKey);
      setCaptionOptions(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingCaptions(false);
    }
  };

  const runImage = async () => {
    if (!imagePrompt.trim()) return;
    setError('');
    setLoadingImage(true);
    try {
      const base64 = await generateImage(imagePrompt, geminiKey);
      setImageBase64(base64);
      setImageDataUrl(`data:image/png;base64,${base64}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingImage(false);
    }
  };

  return (
    <div className="card page-card">
      <div className="ai-block">
        <div className="field">
          <label>1. What's the topic?</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. weekend cafe special" />
            <button className="btn btn-primary" onClick={runSuggest} disabled={loadingIdeas || !topic.trim()}>
              {loadingIdeas ? 'Thinking…' : 'Suggest ideas'}
            </button>
          </div>
        </div>

        {ideas.length > 0 && (
          <div className="idea-grid">
            {ideas.map((idea, i) => (
              <button
                key={i}
                className={`idea-card ${selectedAngle?.title === idea.title ? 'idea-card-active' : ''}`}
                onClick={() => runCaptions(idea)}
              >
                <div className="idea-card-title">{idea.title}</div>
                <div className="field-hint">{idea.description}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedAngle && (
        <div className="ai-block">
          <label className="field-label-standalone">2. Pick a caption</label>
          {loadingCaptions ? (
            <p className="field-hint">Writing captions…</p>
          ) : (
            <div className="caption-options">
              {captionOptions.map((c, i) => (
                <div key={i} className={`caption-option ${caption === c ? 'caption-option-active' : ''}`}>
                  <p>{c}</p>
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
            <button className="btn btn-primary" onClick={runImage} disabled={loadingImage || !imagePrompt.trim()}>
              {loadingImage ? 'Generating…' : 'Generate'}
            </button>
          </div>
        </div>
        {imageDataUrl && (
          <div className="image-preview-row">
            <img src={imageDataUrl} alt="" className="image-preview-thumb" />
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setImageDataUrl(null);
                setImageBase64(null);
              }}
            >
              Remove
            </button>
          </div>
        )}
      </div>

      <div className="field">
        <label>Final caption (edit freely)</label>
        <textarea rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} />
      </div>

      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
