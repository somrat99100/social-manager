import { useApp } from '../context/AppContext';
import PostCard from '../components/PostCard';

export default function PagePosts() {
  const { posts, selectedPage } = useApp();
  const pagePosts = posts.filter((p) => p.pageId === selectedPage?.id);

  return (
    <div className="p-6 md:p-8">
      {pagePosts.length === 0 ? (
        <div className="text-sm rounded-xl border p-8 text-center" style={{ background: 'var(--panel)', borderColor: 'var(--hairline)', color: 'var(--text-dim)' }}>
          No broadcasts yet for this page. Head to Create Post to publish your first one.
        </div>
      ) : (
        <div className="space-y-3">
          {pagePosts.map((post) => <PostCard key={post.id} post={post} />)}
        </div>
      )}
    </div>
  );
}
