import { Radio, LayoutGrid, Send, UserCog } from 'lucide-react';
import { useApp } from '../context/AppContext';

const navItems = [
  { key: 'dashboard', label: 'Console', icon: LayoutGrid },
  { key: 'posts', label: 'Broadcasts', icon: Send },
  { key: 'settings', label: 'Profile setup', icon: UserCog },
];

export default function Sidebar() {
  const { view, navigate, usingLiveData } = useApp();

  return (
    <aside
      className="hidden md:flex flex-col w-60 shrink-0 border-r"
      style={{ borderColor: 'var(--hairline)', background: 'var(--panel)' }}
    >
      <div className="px-5 py-6 flex items-center gap-2">
        <Radio size={20} color="var(--amber)" />
        <span className="font-display font-semibold text-lg tracking-tight">SocialFlow</span>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navItems.map(({ key, label, icon: Icon }) => {
          const active = view.name === key;
          return (
            <button
              key={key}
              onClick={() => navigate(key)}
              className="focus-ring w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
              style={{
                background: active ? 'var(--panel-raised)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              <Icon size={17} />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t" style={{ borderColor: 'var(--hairline)' }}>
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-dim)' }}>
          <span
            className={`inline-block w-2 h-2 rounded-full ${usingLiveData ? 'led-live' : ''}`}
            style={{ background: usingLiveData ? 'var(--positive)' : 'var(--text-dim)' }}
          />
          {usingLiveData ? 'Live Facebook data' : 'Demo data — add a token in Profile setup'}
        </div>
      </div>
    </aside>
  );
}
