import { useState } from 'react';
import { ArrowLeft, TrendingUp, Users, Eye, Heart } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { useApp } from '../context/AppContext';
import { mockAnalyticsByPage } from '../lib/mockData';
import CreatePost from './CreatePost';
import PagePosts from './PagePosts';

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: 'var(--panel)', borderColor: 'var(--hairline)' }}>
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-dim)' }}>
        <Icon size={14} /> {label}
      </div>
      <div className="font-mono text-xl font-medium mt-1.5">{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: 'var(--positive)' }}>{sub}</div>}
    </div>
  );
}

const TABS = ['Analytics', 'Posts', 'Create Post'];

export default function PageAnalytics() {
  const { selectedPage, navigate } = useApp();
  const [tab, setTab] = useState('Analytics');

  if (!selectedPage) {
    navigate('facebook-pages');
    return null;
  }

  const data = mockAnalyticsByPage[selectedPage.id] || mockAnalyticsByPage.mock_page_1;

  return (
    <div className="max-w-4xl mx-auto w-full">
      <div className="p-6 md:p-8 pb-0">
        <button
          onClick={() => navigate('facebook-pages')}
          className="focus-ring flex items-center gap-1.5 text-sm mb-6"
          style={{ color: 'var(--text-muted)' }}
        >
          <ArrowLeft size={15} /> All pages
        </button>

        <div className="flex items-center gap-4 mb-6">
          <img
            src={selectedPage.picture}
            alt=""
            className="w-14 h-14 rounded-full object-cover"
            style={{ background: 'var(--panel-raised)' }}
          />
          <div>
            <h1 className="font-display text-2xl font-semibold">{selectedPage.name}</h1>
            <div className="text-sm" style={{ color: 'var(--text-dim)' }}>
              {selectedPage.category} · {selectedPage.followers?.toLocaleString()} followers
            </div>
          </div>
        </div>

        <div className="flex gap-1 border-b" style={{ borderColor: 'var(--hairline)' }}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="focus-ring px-4 py-2.5 text-sm font-medium relative"
              style={{ color: tab === t ? 'var(--text-primary)' : 'var(--text-dim)' }}
            >
              {t}
              {tab === t && (
                <span className="absolute left-0 right-0 -bottom-px h-0.5" style={{ background: 'var(--amber)' }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === 'Analytics' && (
        <div className="p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Eye} label="Reach today" value={data.reach.today.toLocaleString()} sub={`+${data.followerGrowth}% followers`} />
            <StatCard icon={TrendingUp} label="Engagement rate" value={`${data.engagementRate}%`} />
            <StatCard icon={Users} label="Reach this week" value={data.reach.week.toLocaleString()} />
            <StatCard icon={Heart} label="Page views" value={data.pageViews.toLocaleString()} />
          </div>

          <div className="rounded-xl border p-5" style={{ background: 'var(--panel)', borderColor: 'var(--hairline)' }}>
            <div className="text-sm font-medium mb-3">Reach, last 7 days</div>
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.trend}>
                  <XAxis dataKey="day" stroke="var(--text-dim)" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'var(--panel-raised)', border: '1px solid var(--hairline)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: 'var(--text-muted)' }}
                  />
                  <Line type="monotone" dataKey="reach" stroke="var(--fb)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl border p-5" style={{ background: 'var(--panel)', borderColor: 'var(--hairline)' }}>
              <div className="text-sm font-medium mb-3">Engagement breakdown</div>
              <div className="space-y-2">
                {data.breakdown.map((b) => (
                  <div key={b.name} className="flex items-center gap-3">
                    <span className="text-xs w-20 shrink-0" style={{ color: 'var(--text-dim)' }}>{b.name}</span>
                    <div className="flex-1 h-2 rounded-full" style={{ background: 'var(--panel-raised)' }}>
                      <div
                        className="h-2 rounded-full"
                        style={{ width: `${Math.min(100, (b.value / data.breakdown[0].value) * 100)}%`, background: 'var(--fb)' }}
                      />
                    </div>
                    <span className="font-mono text-xs w-10 text-right">{b.value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t space-y-2" style={{ borderColor: 'var(--hairline)' }}>
                {data.recentInteractions.map((i, idx) => (
                  <div key={idx} className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{i.name}</span> {i.action} · {i.time}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border p-5" style={{ background: 'var(--panel)', borderColor: 'var(--hairline)' }}>
              <div className="text-sm font-medium mb-3">Top performing posts</div>
              <div className="space-y-3">
                {data.topPosts.map((p) => (
                  <div key={p.id} className="flex gap-3">
                    <img src={p.thumb} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs truncate">{p.caption}</div>
                      <div className="text-xs font-mono mt-1" style={{ color: 'var(--text-dim)' }}>
                        {p.likes} likes · {p.comments} comments · {p.shares} shares
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--hairline)' }}>
                <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-dim)' }}>Audience</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.audience.age.map((a) => (
                    <span key={a.name} className="text-xs font-mono px-2 py-1 rounded-md" style={{ background: 'var(--panel-raised)' }}>
                      {a.name}: {a.value}%
                    </span>
                  ))}
                </div>
                <div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                  Top locations: {data.audience.topLocations.join(', ')} · Best times: {data.audience.bestTimes.join(', ')}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'Posts' && <PagePosts />}
      {tab === 'Create Post' && <CreatePost />}
    </div>
  );
}
