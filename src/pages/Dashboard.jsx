import ChannelCard from '../components/ChannelCard';
import { useApp } from '../context/AppContext';

export default function Dashboard() {
  const { pages, navigate } = useApp();

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto w-full">
      <header className="mb-8">
        <div className="text-xs font-mono tracking-widest uppercase" style={{ color: 'var(--amber)' }}>
          Control Room
        </div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold mt-1">Your channels</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Every platform you broadcast to, in one place. Pick a channel to see who's listening.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <ChannelCard
          name="Facebook"
          tagline="Pages · posts · insights"
          color="var(--fb)"
          connectedCount={pages.length}
          lastSync="2m ago"
          onOpen={() => navigate('facebook-pages')}
        />
        <ChannelCard
          name="Instagram"
          tagline="Feed & Reels"
          color="var(--ig-a)"
          connectedCount={0}
          disabled
        />
        <ChannelCard
          name="YouTube"
          tagline="Videos & Shorts"
          color="var(--yt)"
          connectedCount={0}
          disabled
        />
      </div>
    </div>
  );
}
