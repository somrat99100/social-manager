import { useState } from 'react';

/** Shows how one sheet row will look as a Facebook post, with the caption editable before approval. */
export default function SheetRowModal({ row, page, onClose, onSave }) {
  const [caption, setCaption] = useState(row.caption);
  const [imgError, setImgError] = useState(false);

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Row {row.rowNumber} preview</h3>
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
          <div className="fb-preview-caption">{caption || <span className="field-hint">No caption in this row</span>}</div>
          {row.imageUrl && !imgError && (
            <div className="fb-preview-image-wrap">
              <img src={row.imageUrl} alt="Post visual" className="fb-preview-image" onError={() => setImgError(true)} />
            </div>
          )}
          {row.imageUrl && imgError && (
            <div className="field-error" style={{ marginBottom: 10 }}>
              Couldn't load this image link. It may not be a direct, publicly viewable image URL.
            </div>
          )}
          <div className="fb-preview-actions">
            <span>👍 Like</span>
            <span>💬 Comment</span>
            <span>↗ Share</span>
          </div>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>Caption (edit before approving)</label>
          <textarea rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} />
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button
            className="btn btn-accent"
            onClick={() => {
              onSave(caption);
              onClose();
            }}
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
