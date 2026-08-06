import { useRef, useState } from 'react';
import { Image as ImageIcon, Sparkles, Sheet, Loader2, X, Wand2, UploadCloud, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { toneOptions, mockGenerateCaptions } from '../lib/mockData';
import {
  generateCaptionsWithGemini,
  suggestPromptFromTitle,
  generateImageWithGemini,
  editImageWithGemini,
  fileToBase64,
} from '../lib/gemini';
import { parseCsv } from '../lib/csv';
import PostPreviewModal from '../components/PostPreviewModal';

const SUB_TABS = [
  { key: 'manual', label: 'Manual', icon: ImageIcon },
  { key: 'ai', label: 'AI Generate', icon: Sparkles },
  { key: 'bulk', label: 'Bulk Upload', icon: Sheet },
];

export default function CreatePost() {
  const { settings, profile, selectedPage } = useApp();
  const [subTab, setSubTab] = useState('manual');

  const [caption, setCaption] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [scheduleAt, setScheduleAt] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // AI tab state — captions
  const [aiTitle, setAiTitle] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [tone, setTone] = useState(profile.voice || 'Professional');
  const [hashtagCount, setHashtagCount] = useState(3);
  const [aiCaptions, setAiCaptions] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [suggestingPrompt, setSuggestingPrompt] = useState(false);

  // AI tab state — image generation
  const [aiImages, setAiImages] = useState([]);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState(null);

  // AI tab state — image editing
  const [editSourceFile, setEditSourceFile] = useState(null);
  const [editSourcePreview, setEditSourcePreview] = useState(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editResult, setEditResult] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState(null);

  // Bulk tab state
  const [bulkRows, setBulkRows] = useState([]);
  const fileInputRef = useRef(null);

  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleSuggestPrompt() {
    if (!aiTitle.trim()) return;
    setSuggestingPrompt(true);
    setAiError(null);
    try {
      if (settings.geminiKey) {
        const suggested = await suggestPromptFromTitle({
          apiKey: settings.geminiKey, title: aiTitle, profile,
        });
        setAiPrompt(suggested);
      } else {
        await new Promise((r) => setTimeout(r, 400));
        const context = profile.niche ? ` for ${profile.niche}` : '';
        setAiPrompt(
          `A clean, high-contrast social media image about "${aiTitle}"${context}. ` +
          `Bright, welcoming lighting, friendly and approachable style, clear focal point, no clutter.`
        );
      }
    } catch (err) {
      setAiError(err.message);
    } finally {
      setSuggestingPrompt(false);
    }
  }

  async function handleGenerateCaptions() {
    setAiLoading(true);
    setAiError(null);
    try {
      const basis = aiPrompt || aiTitle;
      if (settings.geminiKey) {
        const results = await generateCaptionsWithGemini({
          apiKey: settings.geminiKey, prompt: basis, tone, hashtagCount,
        });
        setAiCaptions(profile.defaultHashtags
          ? results.map((c) => (c.includes('#') ? c : `${c} #${profile.defaultHashtags.split(',').map((h) => h.trim()).join(' #')}`))
          : results);
      } else {
        await new Promise((r) => setTimeout(r, 500));
        setAiCaptions(mockGenerateCaptions(basis, tone));
      }
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  }

  async function handleGenerateImage() {
    const prompt = aiPrompt || aiTitle;
    if (!prompt.trim()) return;
    setImageLoading(true);
    setImageError(null);
    try {
      if (settings.geminiKey) {
        const images = await generateImageWithGemini({ apiKey: settings.geminiKey, prompt });
        setAiImages(images);
      } else {
        await new Promise((r) => setTimeout(r, 600));
        setAiImages([`https://picsum.photos/seed/${encodeURIComponent(prompt)}/600/600`]);
      }
    } catch (err) {
      setImageError(err.message);
    } finally {
      setImageLoading(false);
    }
  }

  function applyAiCaption(text) {
    setCaption(text);
    setSubTab('manual');
  }

  function applyAiImage(url) {
    setImagePreview(url);
    setSubTab('manual');
  }

  function handleEditSourceUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditSourceFile(file);
    setEditSourcePreview(URL.createObjectURL(file));
    setEditResult(null);
    setEditError(null);
  }

  async function handleApplyEdit() {
    if (!editSourceFile || !editPrompt.trim()) return;
    setEditLoading(true);
    setEditError(null);
    try {
      if (!settings.geminiKey) {
        throw new Error('Image editing needs a Gemini API key — add one in Profile setup.');
      }
      const { base64, mimeType } = await fileToBase64(editSourceFile);
      const images = await editImageWithGemini({
        apiKey: settings.geminiKey, prompt: editPrompt, imageBase64: base64, mimeType,
      });
      setEditResult(images[0]);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  }

  async function handleCsvUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setBulkRows(parseCsv(text));
  }

  const canPreview = caption.trim().length > 0 || imagePreview;

  return (
    <div className="p-6 md:p-8">
      <div className="flex gap-1 mb-5 rounded-lg p-1 w-fit" style={{ background: 'var(--panel-raised)' }}>
        {SUB_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className="focus-ring flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              background: subTab === key ? 'var(--ink)' : 'transparent',
              color: subTab === key ? 'var(--text-primary)' : 'var(--text-dim)',
            }}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {subTab === 'manual' && (
        <div className="max-w-xl space-y-4">
          <div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 2000))}
              placeholder="What's happening on this page?"
              rows={5}
              className="focus-ring w-full rounded-xl border p-4 text-sm resize-none"
              style={{ background: 'var(--panel)', borderColor: 'var(--hairline)', color: 'var(--text-primary)' }}
            />
            <div className="text-xs text-right mt-1" style={{ color: 'var(--text-dim)' }}>
              {caption.length}/2000
            </div>
          </div>

          {imagePreview ? (
            <div className="relative w-fit">
              <img src={imagePreview} alt="" className="rounded-xl max-h-56 object-cover" />
              <button
                onClick={() => setImagePreview(null)}
                className="focus-ring absolute -top-2 -right-2 w-6 h-6 rounded-full grid place-items-center"
                style={{ background: 'var(--panel-raised)' }}
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <label
              className="focus-ring flex items-center gap-2 justify-center border border-dashed rounded-xl py-6 text-sm cursor-pointer"
              style={{ borderColor: 'var(--hairline)', color: 'var(--text-dim)' }}
            >
              <ImageIcon size={16} /> Add a photo or video
              <input type="file" accept="image/*,video/*" className="hidden" onChange={handleImageUpload} />
            </label>
          )}

          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-dim)' }}>
              Schedule (optional)
            </label>
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="focus-ring rounded-lg border px-3 py-2 text-sm"
              style={{ background: 'var(--panel)', borderColor: 'var(--hairline)', color: 'var(--text-primary)' }}
            />
          </div>

          <button
            disabled={!canPreview}
            onClick={() => setShowPreview(true)}
            className="focus-ring px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--amber)', color: '#0B0E13' }}
          >
            Preview post
          </button>
        </div>
      )}

      {subTab === 'ai' && (
        <div className="max-w-xl space-y-8">
          {!settings.geminiKey && (
            <p className="text-xs -mb-4" style={{ color: 'var(--text-dim)' }}>
              No Gemini key set — this whole tab is running on templates and placeholder images.
              Add a free-tier key in Profile setup for real captions, prompt suggestions, and images.
            </p>
          )}

          {/* Step 1: title → full prompt (or write your own) */}
          <div className="space-y-3">
            <div className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>1. Give it a title, or write your own prompt</div>
            <div className="flex gap-2">
              <input
                value={aiTitle}
                onChange={(e) => setAiTitle(e.target.value)}
                placeholder="e.g. Exam routine reminder for Ashraful sir's class"
                className="focus-ring flex-1 rounded-lg border px-3 py-2.5 text-sm"
                style={{ background: 'var(--panel)', borderColor: 'var(--hairline)', color: 'var(--text-primary)' }}
              />
              <button
                onClick={handleSuggestPrompt}
                disabled={!aiTitle.trim() || suggestingPrompt}
                className="focus-ring shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                style={{ background: 'var(--panel-raised)', color: 'var(--text-primary)' }}
              >
                {suggestingPrompt ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                Suggest prompt
              </button>
            </div>

            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="…or skip the title and describe the post directly. This is what actually drives captions and the image below — edit it freely."
              rows={3}
              className="focus-ring w-full rounded-xl border p-3 text-sm resize-none"
              style={{ background: 'var(--panel)', borderColor: 'var(--hairline)', color: 'var(--text-primary)' }}
            />
            {aiError && <p className="text-xs" style={{ color: 'var(--negative)' }}>{aiError}</p>}
          </div>

          {/* Step 2: captions */}
          <div className="space-y-3">
            <div className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>2. Generate captions</div>
            <div className="flex flex-wrap gap-3">
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="focus-ring rounded-lg border px-3 py-2 text-sm"
                style={{ background: 'var(--panel)', borderColor: 'var(--hairline)', color: 'var(--text-primary)' }}
              >
                {toneOptions.map((t) => <option key={t}>{t}</option>)}
              </select>
              <select
                value={hashtagCount}
                onChange={(e) => setHashtagCount(Number(e.target.value))}
                className="focus-ring rounded-lg border px-3 py-2 text-sm"
                style={{ background: 'var(--panel)', borderColor: 'var(--hairline)', color: 'var(--text-primary)' }}
              >
                {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} hashtags</option>)}
              </select>
              <button
                onClick={handleGenerateCaptions}
                disabled={(!aiPrompt.trim() && !aiTitle.trim()) || aiLoading}
                className="focus-ring flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                style={{ background: 'var(--amber)', color: '#0B0E13' }}
              >
                {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Generate captions
              </button>
            </div>

            {aiCaptions.length > 0 && (
              <div className="space-y-2">
                {aiCaptions.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => applyAiCaption(c)}
                    className="focus-ring w-full text-left text-sm rounded-lg border p-3 transition-colors hover:border-[var(--amber)]"
                    style={{ background: 'var(--panel)', borderColor: 'var(--hairline)' }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Step 3: image generation */}
          <div className="space-y-3">
            <div className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>3. Generate an image from the prompt above</div>
            <button
              onClick={handleGenerateImage}
              disabled={(!aiPrompt.trim() && !aiTitle.trim()) || imageLoading}
              className="focus-ring flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
              style={{ background: 'var(--panel-raised)', color: 'var(--text-primary)' }}
            >
              {imageLoading ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
              {aiImages.length > 0 ? 'Regenerate image' : 'Generate image'}
            </button>
            {imageError && <p className="text-xs" style={{ color: 'var(--negative)' }}>{imageError}</p>}

            {aiImages.length > 0 && (
              <div className={aiImages.length > 1 ? 'grid grid-cols-2 gap-2' : 'w-fit'}>
                {aiImages.map((url, i) => (
                  <button key={i} onClick={() => applyAiImage(url)} className="focus-ring rounded-lg overflow-hidden border block" style={{ borderColor: 'var(--hairline)' }}>
                    <img src={url} alt="" className="w-full max-w-xs h-56 object-cover" />
                  </button>
                ))}
              </div>
            )}
            {aiImages.length > 0 && (
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Tap an image to use it for this post.</p>
            )}
          </div>

          {/* Step 4: edit an existing image */}
          <div className="space-y-3 pt-2 border-t" style={{ borderColor: 'var(--hairline)' }}>
            <div className="text-xs font-medium pt-5" style={{ color: 'var(--text-dim)' }}>Or edit a photo you already have</div>

            {editSourcePreview ? (
              <div className="relative w-fit">
                <img src={editSourcePreview} alt="" className="rounded-lg max-h-40 object-cover" />
                <button
                  onClick={() => { setEditSourceFile(null); setEditSourcePreview(null); setEditResult(null); }}
                  className="focus-ring absolute -top-2 -right-2 w-6 h-6 rounded-full grid place-items-center"
                  style={{ background: 'var(--panel-raised)' }}
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <label
                className="focus-ring flex items-center gap-2 justify-center border border-dashed rounded-xl py-5 text-sm cursor-pointer"
                style={{ borderColor: 'var(--hairline)', color: 'var(--text-dim)' }}
              >
                <UploadCloud size={16} /> Upload a photo to edit
                <input type="file" accept="image/*" className="hidden" onChange={handleEditSourceUpload} />
              </label>
            )}

            {editSourcePreview && (
              <>
                <div className="flex gap-2">
                  <input
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="Describe the edit — e.g. add a warm sunset glow, remove the background clutter"
                    className="focus-ring flex-1 rounded-lg border px-3 py-2.5 text-sm"
                    style={{ background: 'var(--panel)', borderColor: 'var(--hairline)', color: 'var(--text-primary)' }}
                  />
                  <button
                    onClick={handleApplyEdit}
                    disabled={!editPrompt.trim() || editLoading}
                    className="focus-ring shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                    style={{ background: 'var(--amber)', color: '#0B0E13' }}
                  >
                    {editLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Apply edit
                  </button>
                </div>
                {editError && <p className="text-xs" style={{ color: 'var(--negative)' }}>{editError}</p>}
                {editResult && (
                  <div className="space-y-2">
                    <img src={editResult} alt="" className="rounded-lg max-h-56 object-cover" />
                    <button
                      onClick={() => applyAiImage(editResult)}
                      className="focus-ring px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ background: 'var(--panel-raised)', color: 'var(--text-primary)' }}
                    >
                      Use this edited image
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {subTab === 'bulk' && (
        <div className="max-w-2xl space-y-4">
          <div
            className="rounded-xl border p-4 text-xs leading-relaxed"
            style={{ background: 'var(--panel)', borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}
          >
            Upload a CSV with these columns: <span className="font-mono">caption, image_url, video_url, hashtags, scheduled_at, tone</span>.
            Leave <span className="font-mono">caption</span> blank to have AI fill it in from the tone column.
          </div>

          <label
            className="focus-ring flex items-center gap-2 justify-center border border-dashed rounded-xl py-6 text-sm cursor-pointer"
            style={{ borderColor: 'var(--hairline)', color: 'var(--text-dim)' }}
          >
            <Sheet size={16} /> Choose CSV file
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          </label>

          {bulkRows.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>
                {bulkRows.length} rows parsed — review before publishing
              </div>
              {bulkRows.map((row, i) => (
                <div key={i} className="rounded-lg border p-3 flex gap-3 items-start" style={{ background: 'var(--panel)', borderColor: 'var(--hairline)' }}>
                  {row.image_url && <img src={row.image_url} alt="" className="w-12 h-12 rounded-md object-cover shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{row.caption || <span style={{ color: 'var(--text-dim)' }}>(AI will generate — tone: {row.tone || 'Professional'})</span>}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                      {row.hashtags && `#${row.hashtags.split(',').join(' #')} · `}
                      {row.scheduled_at || 'Post immediately'}
                    </div>
                  </div>
                </div>
              ))}
              <button
                className="focus-ring px-5 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: 'var(--amber)', color: '#0B0E13' }}
              >
                Preview all & schedule
              </button>
            </div>
          )}
        </div>
      )}

      {showPreview && (
        <PostPreviewModal
          page={selectedPage}
          caption={caption}
          imagePreview={imagePreview}
          scheduleAt={scheduleAt}
          onClose={() => setShowPreview(false)}
          onPublished={() => {
            setShowPreview(false);
            setCaption('');
            setImagePreview(null);
            setScheduleAt('');
          }}
        />
      )}
    </div>
  );
}
