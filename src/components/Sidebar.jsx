import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import TallyDot from './tally-dot';

const navItems = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/create', label: 'Create post', icon: '✎' },
  { to: '/sheet-import', label: 'Post from sheet', icon: '▦' },
  { to: '/log', label: 'Broadcast log', icon: '▤' },
  { to: '/settings', label: 'Connect profile', icon: '⚙' },
];

export default function Sidebar({ mobileOpen, onClose }) {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const pages = profile?.pages || [];

  return (
    <>
      {mobileOpen && <div className="sidebar-scrim" onClick={onClose} />}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark">S</span>
          <span className="sidebar-brand-name">Social Manager</span>
        </div>

        <div className="sidebar-channel">
          <TallyDot status={pages.length > 0 ? 'live' : 'idle'} />
          {pages.length > 0 ? (
            <div className="sidebar-channel-info">
              <img src={pages[0].avatar} alt="" className="sidebar-channel-avatar" />
              <div>
                <div className="sidebar-channel-name">{pages[0].name}</div>
                <div className="sidebar-channel-sub mono">
                  {pages.length > 1 ? `+${pages.length - 1} more page${pages.length > 2 ? 's' : ''} · on air` : 'Facebook Page · on air'}
                </div>
              </div>
            </div>
          ) : (
            <div className="sidebar-channel-sub">No page connected</div>
          )}
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onClose}
              className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
            >
              <span className="sidebar-link-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-profile">
            <span className="sidebar-avatar">{profile?.avatar || '🧑'}</span>
            <span className="sidebar-profile-name">{profile?.name}</span>
          </div>
          <button
            className="sidebar-logout"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Log out
          </button>
        </div>
      </aside>
    </>
  );
}
