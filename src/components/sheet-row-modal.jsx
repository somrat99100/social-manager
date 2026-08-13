import { useState } from 'react';
import CaptionField from './caption-field';

/** Shows how one sheet row will look as a Facebook post, with the caption editable before approval. */
export default function SheetRowModal({ row, page, onClose, onSave }) {
  const [caption, setCaption] = useState(row.caption);
  const images = row.images && row.images.length > 0 ? row.images : row.imageUrl ? [row.imageUrl] : [];

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

          {images.length === 1 && <ImageWithFallback src={images[0]} />}
          {images.length > 1 && <MultiImageGrid images={images} />}

          {row.driveFolder && row.imageError && (
            <div className="field-error" style={{ marginBottom: 10 }}>
              {row.imageError}
            </div>
          )}
          {row.driveFolder && !row.imageError && images.length > 0 && (
            <div className="field-hint" style={{ marginBottom: 10 }}>
              From a Drive folder — {images.length} image{images.length === 1 ? '' : 's'} will post together.
            </div>
          )}

          <div className="fb-preview-actions">
            <span>👍 Like</span>
            <span>💬 Comment</span>
            <span>↗ Share</span>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <CaptionField label="Caption (edit before approving)" value={caption} onChange={setCaption} rows={4} />
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

function ImageWithFallback({ src }) {
  const [imgError, setImgError] = useState(false);
  if (imgError) {
    return (
      <div className="field-error" style={{ marginBottom: 10 }}>
        Couldn't load this image link. It may not be a direct, publicly viewable image URL.
      </div>
    );
  }
  return (
    <div className="fb-preview-image-wrap">
      <img src={src} alt="Post visual" className="fb-preview-image" onError={() => setImgError(true)} />
    </div>
  );
}

function MultiImageGrid({ images }) {
  const shown = images.slice(0, 4);
  const extra = images.length - shown.length;
  return (
    <div className={`fb-preview-image-grid fb-preview-image-grid-${shown.length}`}>
      {shown.map((src, i) => (
        <div key={src + i} className="fb-preview-image-grid-cell">
          <img
            src={src}
            alt=""
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden';
            }}
          />
          {i === shown.length - 1 && extra > 0 && (
            <div className="fb-preview-image-grid-more">+{extra}</div>
          )}
        </div>
      ))}
    </div>
  );
}
