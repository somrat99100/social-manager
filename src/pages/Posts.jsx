import { useApp } from '../context/AppContext';
import PostCard from '../components/PostCard';

export default function Posts() {
  const { posts } = useApp();

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto w-full">
      <header className="mb-6">
        <div className="text-xs font-mono tracking-widest uppercase" style={{ color: 'var(--amber)' }}>Broadcast log</div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold mt-1">All broadcasts</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Everything you've published or scheduled, across every connected page.
        </p>
      </header>

      {posts.length === 0 ? (
        <div className="text-sm rounded-xl border p-8 text-center" style={{ background: 'var(--panel)', borderColor: 'var(--hairline)', color: 'var(--text-dim)' }}>
          Nothing broadcast yet. Open a Facebook page and create your first post.
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => <PostCard key={post.id} post={post} />)}
        </div>
      )}
    </div>
  );
}
