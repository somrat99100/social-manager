import { AppProvider, useApp } from './context/AppContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import FacebookPages from './pages/FacebookPages';
import PageAnalytics from './pages/PageAnalytics';
import Posts from './pages/Posts';
import Settings from './pages/Settings';
import { LayoutGrid, Send, UserCog } from 'lucide-react';

const VIEWS = {
  dashboard: Dashboard,
  'facebook-pages': FacebookPages,
  'page-analytics': PageAnalytics,
  posts: Posts,
  settings: Settings,
};

const MOBILE_NAV = [
  { key: 'dashboard', icon: LayoutGrid, label: 'Console' },
  { key: 'posts', icon: Send, label: 'Broadcasts' },
  { key: 'settings', icon: UserCog, label: 'Profile' },
];

function Shell() {
  const { view, navigate } = useApp();
  const Screen = VIEWS[view.name] || Dashboard;

  return (
    <div className="flex h-screen" style={{ background: 'var(--ink)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <Screen />
        </main>
        <nav
          className="md:hidden flex items-center justify-around border-t py-2 fixed bottom-0 left-0 right-0"
          style={{ background: 'var(--panel)', borderColor: 'var(--hairline)' }}
        >
          {MOBILE_NAV.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => navigate(key)}
              className="focus-ring flex flex-col items-center gap-0.5 px-4 py-1 text-xs"
              style={{ color: view.name === key ? 'var(--amber)' : 'var(--text-dim)' }}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
