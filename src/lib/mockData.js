// Mock data used when no live Facebook access token is configured in Settings.
// Swap this out automatically once a real token + connected pages exist.

export const mockPages = [
  {
    id: 'mock_page_1',
    name: 'Agri Student BD',
    category: 'Education Website',
    picture: 'https://api.dicebear.com/7.x/shapes/svg?seed=agristudent&backgroundColor=1B2029',
    followers: 4820,
    lastPostAt: '2026-08-04T10:30:00Z',
  },
  {
    id: 'mock_page_2',
    name: 'Discount with Hot Offer',
    category: 'Shopping & Retail',
    picture: 'https://api.dicebear.com/7.x/shapes/svg?seed=hotoffer&backgroundColor=1B2029',
    followers: 1265,
    lastPostAt: '2026-08-02T15:00:00Z',
  },
];

export const mockAnalyticsByPage = {
  mock_page_1: {
    reach: { today: 812, week: 5420, month: 21870 },
    engagementRate: 6.4,
    followerGrowth: 3.1,
    pageViews: 940,
    breakdown: [
      { name: 'Likes', value: 412 },
      { name: 'Comments', value: 96 },
      { name: 'Shares', value: 58 },
    ],
    trend: [
      { day: 'Mon', reach: 620 }, { day: 'Tue', reach: 710 }, { day: 'Wed', reach: 590 },
      { day: 'Thu', reach: 880 }, { day: 'Fri', reach: 940 }, { day: 'Sat', reach: 1020 }, { day: 'Sun', reach: 812 },
    ],
    recentInteractions: [
      { name: 'Rafiul Islam', action: 'commented on your post', time: '12m ago' },
      { name: 'Sumaiya Akter', action: 'liked your photo', time: '38m ago' },
      { name: 'Tanvir Ahmed', action: 'shared your post', time: '1h ago' },
    ],
    topPosts: [
      { id: 'p1', caption: 'Summer 2026 exam routine is out — tap for the full schedule.', thumb: 'https://api.dicebear.com/7.x/shapes/svg?seed=post1&backgroundColor=23375E', likes: 214, comments: 38, shares: 22 },
      { id: 'p2', caption: '5 free tools every agriculture student should bookmark.', thumb: 'https://api.dicebear.com/7.x/shapes/svg?seed=post2&backgroundColor=23375E', likes: 178, comments: 21, shares: 14 },
    ],
    audience: {
      age: [
        { name: '18-24', value: 62 }, { name: '25-34', value: 24 }, { name: '35+', value: 14 },
      ],
      topLocations: ['Dhaka', 'Mymensingh', 'Chattogram'],
      bestTimes: ['8:00 PM', '9:30 PM'],
    },
  },
  mock_page_2: {
    reach: { today: 190, week: 1340, month: 4890 },
    engagementRate: 3.9,
    followerGrowth: 1.4,
    pageViews: 260,
    breakdown: [
      { name: 'Likes', value: 130 },
      { name: 'Comments', value: 12 },
      { name: 'Shares', value: 9 },
    ],
    trend: [
      { day: 'Mon', reach: 140 }, { day: 'Tue', reach: 160 }, { day: 'Wed', reach: 120 },
      { day: 'Thu', reach: 210 }, { day: 'Fri', reach: 230 }, { day: 'Sat', reach: 260 }, { day: 'Sun', reach: 190 },
    ],
    recentInteractions: [
      { name: 'Nabila Haque', action: 'liked your post', time: '2h ago' },
      { name: 'Kamrul Hasan', action: 'commented on your photo', time: '5h ago' },
    ],
    topPosts: [
      { id: 'p3', caption: 'Flash deal: 40% off ends tonight.', thumb: 'https://api.dicebear.com/7.x/shapes/svg?seed=post3&backgroundColor=3A2117', likes: 96, comments: 8, shares: 5 },
    ],
    audience: {
      age: [
        { name: '18-24', value: 38 }, { name: '25-34', value: 41 }, { name: '35+', value: 21 },
      ],
      topLocations: ['Dhaka', 'Gazipur'],
      bestTimes: ['7:00 PM', '10:00 PM'],
    },
  },
};

export const toneOptions = ['Professional', 'Casual', 'Funny', 'Inspirational', 'Educational'];

export function mockGenerateCaptions(prompt, tone) {
  const base = prompt?.trim() || 'your update';
  const templates = {
    Professional: [
      `We're pleased to share an update on ${base}. Read more below.`,
      `Here's what's new: ${base}. Let us know your thoughts.`,
      `An important update regarding ${base} — details inside.`,
    ],
    Casual: [
      `Hey everyone! Quick update on ${base} 👋`,
      `So this happened: ${base}. Thoughts?`,
      `Just dropping by to share ${base} with you all!`,
    ],
    Funny: [
      `Plot twist: ${base}. Nobody saw this coming 😂`,
      `Breaking news from our page: ${base}. You're welcome.`,
      `${base}... yeah, we said what we said.`,
    ],
    Inspirational: [
      `Every step counts. Today, that means ${base}. Keep going.`,
      `Growth looks like ${base}. Proud of this one.`,
      `Small moves, big impact: ${base}.`,
    ],
    Educational: [
      `Did you know? Here's what you should understand about ${base}.`,
      `Quick lesson: ${base}, explained simply.`,
      `Let's break down ${base} together.`,
    ],
  };
  return templates[tone] || templates.Professional;
}
