import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { savePost } from '../services/content';
import {
  getValidAccessToken,
  buildVideoMetadata,
  uploadVideo,
  setThumbnail,
  YOUTUBE_CATEGORIES,
} from '../services/youtube';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function CreatePostYoutube() {
  const { user, profile, updateProfile } = useAuth();
  const youtube = profile?.youtube || null;
  const connected = Boolean(youtube?.refreshToken);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [categoryId, setCategoryId] = useState('22');
  const [privacyStatus, setPrivacyStatus] = useState('public');
  const [madeForKids, setMadeForKids] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { videoId, scheduled }
  const cancelledRef = useRef(false);
  const fileInputRef = useRef(null);

  const onPickFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setError('That file does not look like a video.');
      return;
    }
    setError('');
    setVideoFile(file);
  };

  const reset = () => {
    setTitle('');
    setDescription('');
    setTagsInput('');
    setPrivacyStatus('public');
    setScheduleAt('');
    setVideoFile(null);
    setThumbnailFile(null);
    setResult(null);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (!videoFile) { setError('Choose a video file first.'); return; }
    if (!title.trim()) { setError('Give the video a title.'); return; }
    setError('');
    setResult(null);
    setUploading(true);
    setProgress(0);
    cancelledRef.current = false;
    try {
      const accessToken = await getValidAccessToken(youtube, (fresh) =>
        updateProfile({ youtube: { ...youtube, accessToken: fresh.accessToken, expiresAt: fresh.expiresAt } })
      );

      const publishAt = scheduleAt ? new Date(scheduleAt).toISOString() : null;
      const metadata = buildVideoMetadata({
        title,
        description,
        tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
        categoryId,
        privacyStatus,
        publishAt,
        madeForKids,
      });

      const video = await uploadVideo({
        accessToken,
        file: videoFile,
        metadata,
        onProgress: setProgress,
        isCancelled: () => cancelledRef.current,
      });

      let thumbWarning = '';
      if (thumbnailFile && video?.id) {
        try {
          await setThumbnail(accessToken, video.id, thumbnailFile);
        } catch (e) {
          thumbWarning = e.message;
        }
      }

      await savePost(user.uid, {
        platform: 'youtube',
        title,
        caption: description,
        thumbnail: video?.snippet?.thumbnails?.default?.url || null,
        ytVideoId: video?.id || null,
        status: publishAt ? 'scheduled' : 'posted',
      });

      setResult({ videoId: video?.id, scheduled: !!publishAt, warning: thumbWarning });
      setVideoFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      console.error('YouTube upload failed:', e);
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  if (!connected) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>Upload video</h1>
            <p className="field-hint">Publish straight to YouTube.</p>
          </div>
        </div>
        <div className="card page-card empty-card">
          <div className="empty-card-icon">▶</div>
          <h3>No YouTube channel connected yet</h3>
          <p className="field-hint" style={{ margin: '6px 0 16px' }}>
            Connect your channel first — it only takes a few minutes.
          </p>
          <Link to="/settings" className="btn btn-accent">Connect profile</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Upload video</h1>
          <p className="field-hint">Publishing to {youtube.title}. Large files stream directly — keep this tab open until it finishes.</p>
        </div>
      </div>

      <div className="card page-card">
        {!videoFile ? (
          <div
            className={`dropzone ${dragActive ? 'dropzone-active' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => { e.preventDefault(); setDragActive(false); onPickFile(e.dataTransfer.files?.[0]); }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>Click to choose a video, or drag one in</p>
            <p className="field-hint" style={{ margin: '4px 0 0' }}>Any size — MP4, MOV, and most other video formats.</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              style={{ display: 'none' }}
              onChange={(e) => onPickFile(e.target.files?.[0])}
            />
          </div>
        ) : (
          <div className="dropzone-file">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{videoFile.name}</div>
              <div className="field-hint">{formatBytes(videoFile.size)}</div>
            </div>
            {!uploading && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setVideoFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                Change
              </button>
            )}
          </div>
        )}

        <div className="field" style={{ marginTop: 16 }}>
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="What's this video about?" />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description…" />
        </div>
        <div className="field">
          <label>Tags (comma separated)</label>
          <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. farming, tips, harvest" />
        </div>
        <div className="field">
          <label>Category</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {YOUTUBE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Visibility</label>
          <select value={privacyStatus} onChange={(e) => setPrivacyStatus(e.target.value)} disabled={!!scheduleAt}>
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="private">Private</option>
          </select>
        </div>
        <div className="field">
          <label>Schedule to go public later (optional)</label>
          <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
          <p className="field-hint" style={{ marginTop: 4 }}>
            The video still uploads now — YouTube just keeps it private until this time, then flips it public itself.
          </p>
        </div>
        <div className="field">
          <label>Custom thumbnail (optional)</label>
          <input type="file" accept="image/*" onChange={(e) => setThumbnailFile(e.target.files?.[0] || null)} />
          <p className="field-hint" style={{ marginTop: 4 }}>Requires your channel to be phone-verified on YouTube — skipped otherwise.</p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 16px' }}>
          <input type="checkbox" checked={madeForKids} onChange={(e) => setMadeForKids(e.target.checked)} />
          <span className="field-hint" style={{ margin: 0 }}>Made for kids</span>
        </label>

        {uploading && (
          <div style={{ margin: '4px 0 16px' }}>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <div className="field-hint">Uploading… {Math.round(progress * 100)}%</div>
          </div>
        )}

        {error && <div className="field-error" style={{ marginBottom: 12 }}>{error}</div>}

        {result && (
          <div className="card page-card" style={{ background: 'var(--accent-soft)', marginBottom: 16 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>
              {result.scheduled ? 'Uploaded — scheduled to go public.' : 'Uploaded and published.'}
            </p>
            {result.videoId && (
              <a href={`https://youtu.be/${result.videoId}`} target="_blank" rel="noreferrer" className="field-hint">
                youtu.be/{result.videoId}
              </a>
            )}
            {result.warning && <p className="field-error" style={{ marginTop: 6 }}>{result.warning}</p>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-accent" onClick={handleUpload} disabled={uploading || !videoFile}>
            {uploading ? 'Uploading…' : 'Upload to YouTube'}
          </button>
          {uploading ? (
            <button className="btn btn-ghost" onClick={() => { cancelledRef.current = true; }}>Cancel</button>
          ) : (
            <button className="btn btn-ghost" onClick={reset}>Reset</button>
          )}
        </div>
      </div>
    </div>
  );
}
