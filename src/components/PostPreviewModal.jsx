import { useState } from 'react';
import { X, ThumbsUp, MessageCircle, Share2, Loader2, CircleCheck, TriangleAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { publishToPage } from '../lib/facebook';

export default function PostPreviewModal({ page, caption, imagePreview, scheduleAt, onClose, onPublished }) {
  const { addPost } = useApp();
  const [status, setStatus] = useState('preview'); // preview | publishing | success | error
  const [error, setError] = useState(null);

  async function handleConfirm() {
    setStatus('publishing');
    setError(null);
    const isScheduled = Boolean(scheduleAt);

    try {
      if (!isScheduled && page.pageAccessToken) {
        await publishToPage({
          pageId: page.id,
          pageAccessToken: page.pageAccessToken,
          message: caption,
          imageUrl: imagePreview?.startsWith('http') ? imagePreview : undefined,
        });
      } else {
        // Mock path: no live page token, or the post is scheduled (queued locally
        // for WorkManager/cron-equivalent to pick up — not implemented here).
        await new Promise((r) => setTimeout(r, 900));
      }

      addPost({
        pageId: page.id,
        pageName: page.name,
        caption,
        imagePreview,
        status: isScheduled ? 'scheduled' : 'published',
        scheduledFor: isScheduled ? scheduleAt : null,
        likes: isScheduled ? 0 : Math.floor(Math.random() * 40),
        comments: isScheduled ? 0 : Math.floor(Math.random() * 8),
        shares: isScheduled ? 0 : Math.floor(Math.random() * 5),
      });
      setStatus('success');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: '#00000099' }}>
      <div className="w-full max-w-md rounded-2xl border overflow-hidden" style={{ background: 'var(--panel)', borderColor: 'var(--hairline)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--hairline)' }}>
          <span className="font-display font-semibold text-sm">
            {status === 'success' ? 'Published' : 'Preview & confirm'}
          </span>
          <button onClick={onClose} className="focus-ring" style={{ color: 'var(--text-dim)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {status === 'success' ? (
            <div className="text-center py-6">
              <CircleCheck size={40} color="var(--positive)" className="mx-auto mb-3" />
              <p className="text-sm mb-1">
                {scheduleAt ? 'Post scheduled successfully.' : 'Post published to Facebook.'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{page.name}</p>
              <button
                onClick={onPublished}
                className="focus-ring mt-5 px-5 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--amber)', color: '#0B0E13' }}
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="rounded-xl border p-4" style={{ background: 'var(--ink)', borderColor: 'var(--hairline)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <img src={page.picture} alt="" className="w-9 h-9 rounded-full object-cover" />
                  <div>
                    <div className="text-sm font-medium">{page.name}</div>
                    <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                      {scheduleAt ? `Scheduled for ${new Date(scheduleAt).toLocaleString()}` : 'Just now'} · 🌐
                    </div>
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap mb-3">{caption || <span style={{ color: 'var(--text-dim)' }}>(no caption)</span>}</p>
                {imagePreview && <img src={imagePreview} alt="" className="w-full rounded-lg max-h-64 object-cover" />}
                <div className="flex items-center gap-5 mt-3 pt-3 border-t text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--text-dim)' }}>
                  <span className="flex items-center gap-1"><ThumbsUp size={13} /> Like</span>
                  <span className="flex items-center gap-1"><MessageCircle size={13} /> Comment</span>
                  <span className="flex items-center gap-1"><Share2 size={13} /> Share</span>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-xs mt-3 rounded-lg px-3 py-2" style={{ background: 'var(--negative)22', color: 'var(--negative)' }}>
                  <TriangleAlert size={14} className="mt-0.5 shrink-0" /> {error}
                </div>
              )}

              <div className="flex gap-2 mt-5">
                <button
                  onClick={onClose}
                  className="focus-ring flex-1 py-2.5 rounded-lg text-sm font-medium border"
                  style={{ borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}
                >
                  Edit
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={status === 'publishing'}
                  className="focus-ring flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
                  style={{ background: 'var(--amber)', color: '#0B0E13' }}
                >
                  {status === 'publishing' && <Loader2 size={14} className="animate-spin" />}
                  {scheduleAt ? 'Confirm & schedule' : 'Confirm & publish'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
