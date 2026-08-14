import { useState } from 'react';
import { checkEngagementBait } from '../lib/engagement-bait';

export default function PostPreviewModal({ page, caption, imageDataUrl, onClose, onPost, onSaveDraft }) {
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const baitWarning = checkEngagementBait(caption);

  const handlePost = async () => {
    setError('');
    setPosting(true);
    try {
      await onPost();
    } catch (e) {
      setError(e.message || 'Something went wrong publishing that post.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Preview</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="fb-preview">
          <div className="fb-preview-head">
            <img
              src={page?.avatar || 'https://placehold.co/40x40/e3e0d6/5b5f70?text=FB'}
              alt=""
              className="fb-preview-avatar"
            />
            <div>
              <div className="fb-preview-name">{page?.name || 'Your Page'}</div>
              <div className="fb-preview-meta mono">Just now · 🌐</div>
            </div>
          </div>
          <div className="fb-preview-caption">{caption || <span className="field-hint">No caption yet</span>}</div>
          {imageDataUrl && (
            <div className="fb-preview-image-wrap">
              <img src={imageDataUrl} alt="Post visual" className="fb-preview-image" />
            </div>
          )}
          <div className="fb-preview-actions">
            <span>👍 Like</span>
            <span>💬 Comment</span>
            <span>↗ Share</span>
          </div>
        </div>

        {baitWarning && <div className="field-warning" style={{ marginTop: 12 }}>⚠ {baitWarning}</div>}
        {error && <div className="field-error" style={{ marginTop: 12 }}>{error}</div>}

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onSaveDraft} disabled={posting}>
            Save as draft
          </button>
          <button className="btn btn-accent" onClick={handlePost} disabled={posting}>
            {posting ? 'Posting…' : 'Post to page'}
          </button>
        </div>
      </div>
    </div>
  );
}
