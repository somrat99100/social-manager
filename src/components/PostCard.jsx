import { Heart, MessageCircle, Share2, Clock, CircleCheck } from 'lucide-react';

export default function PostCard({ post }) {
  const isScheduled = post.status === 'scheduled';
  return (
    <div className="rounded-xl border p-4 flex gap-4" style={{ background: 'var(--panel)', borderColor: 'var(--hairline)' }}>
      {post.imagePreview && (
        <img src={post.imagePreview} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-xs font-mono px-2 py-0.5 rounded-full flex items-center gap-1"
            style={{
              background: isScheduled ? 'var(--amber)22' : 'var(--positive)22',
              color: isScheduled ? 'var(--amber)' : 'var(--positive)',
            }}
          >
            {isScheduled ? <Clock size={11} /> : <CircleCheck size={11} />}
            {isScheduled ? `Scheduled · ${new Date(post.scheduledFor).toLocaleString()}` : 'Published'}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{post.pageName}</span>
        </div>
        <div className="text-sm truncate">{post.caption}</div>
        <div className="flex items-center gap-4 mt-2 text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
          <span className="flex items-center gap-1"><Heart size={12} /> {post.likes ?? 0}</span>
          <span className="flex items-center gap-1"><MessageCircle size={12} /> {post.comments ?? 0}</span>
          <span className="flex items-center gap-1"><Share2 size={12} /> {post.shares ?? 0}</span>
        </div>
      </div>
    </div>
  );
}
