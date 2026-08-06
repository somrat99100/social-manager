import { ArrowLeft, ChevronRight, TriangleAlert, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function FacebookPages() {
  const { pages, navigate, setSelectedPageId, pagesError, usingLiveData } = useApp();

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto w-full">
      <button
        onClick={() => navigate('dashboard')}
        className="focus-ring flex items-center gap-1.5 text-sm mb-6"
        style={{ color: 'var(--text-muted)' }}
      >
        <ArrowLeft size={15} /> Console
      </button>

      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--fb)' }} />
          <h1 className="font-display text-2xl font-semibold">Facebook Pages</h1>
        </div>
        {!usingLiveData && (
          <button
            onClick={() => navigate('settings')}
            className="focus-ring shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--fb)', color: '#0B0E13' }}
          >
            <Plus size={14} /> Add account
          </button>
        )}
      </div>
      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
        {usingLiveData ? 'Pulled live from the Graph API.' : 'Showing demo pages — tap "Add account" to connect your real Page.'}
      </p>

      {pagesError && (
        <div
          className="mb-5 flex items-start gap-2 text-sm rounded-lg px-4 py-3"
          style={{ background: 'var(--negative)22', color: 'var(--negative)' }}
        >
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>Couldn't load live pages ({pagesError}). Showing demo data instead.</span>
        </div>
      )}

      <div className="space-y-3">
        {pages.map((page) => (
          <button
            key={page.id}
            onClick={() => {
              setSelectedPageId(page.id);
              navigate('page-analytics');
            }}
            className="focus-ring w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-colors hover:border-[var(--fb)]"
            style={{ background: 'var(--panel)', borderColor: 'var(--hairline)' }}
          >
            <img
              src={page.picture}
              alt=""
              className="w-12 h-12 rounded-full object-cover shrink-0"
              style={{ background: 'var(--panel-raised)' }}
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{page.name}</div>
              <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-dim)' }}>
                {page.category} · {page.followers.toLocaleString()} followers
              </div>
            </div>
            <div className="text-xs text-right shrink-0" style={{ color: 'var(--text-dim)' }}>
              Last post<br />{formatDate(page.lastPostAt)}
            </div>
            <ChevronRight size={18} color="var(--text-dim)" />
          </button>
        ))}
      </div>
    </div>
  );
}
