import { useState } from 'react';
import { ExternalLink, BookOpen, CircleCheck, TriangleAlert, Mail } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { toneOptions } from '../lib/mockData';
import GuideModal from '../components/GuideModal';

const FB_STEPS = [
  {
    text: 'Open the Graph API Explorer and sign in with the Facebook account that manages your Page.',
  },
  {
    text: 'Under "Meta App", pick any app from the dropdown — or click "Create App" if the list is empty (free, takes under a minute, no review needed for this).',
  },
  {
    text: 'Click "User or Page" and select the Page you want to connect from the list.',
  },
  {
    text: 'Under "Permissions", add these four scopes:',
    copy: 'pages_show_list,pages_read_engagement,pages_manage_posts,pages_read_user_content',
    note: 'Search each one in the permissions box and check it — they won\'t all show by default.',
  },
  {
    text: 'Click "Generate Access Token", then approve the permissions popup for your Page.',
  },
  {
    text: 'Copy the token that appears in the box at the top of the page.',
    note: 'This token expires in about an hour. That\'s fine for testing — just come back and regenerate it when it stops working.',
  },
  {
    text: 'Paste it into the "Facebook access token" field below and hit Save.',
  },
];

const GEMINI_STEPS = [
  { text: 'Open Google AI Studio and sign in with your Gmail account.' },
  { text: 'Click "Create API key", then choose an existing Google Cloud project or let it create one for you.' },
  { text: 'Copy the key that\'s generated — it starts with "AIza".' },
  { text: 'Paste it into the "Gemini API key" field below and hit Save.' },
  {
    text: 'Note: signing in with Gmail alone doesn\'t grant API access — Google requires this separate key step even though you\'re using the same account.',
    note: 'The Gmail field above is just so the app can show whose account is connected — the key is what actually authorizes requests.',
  },
];

function Field({ label, help, action, children }) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <label className="text-sm font-medium">{label}</label>
        {action}
      </div>
      {help && <p className="text-xs mb-2" style={{ color: 'var(--text-dim)' }}>{help}</p>}
      {children}
    </div>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      className="focus-ring w-full rounded-lg border px-3 py-2.5 text-sm"
      style={{ background: 'var(--panel)', borderColor: 'var(--hairline)', color: 'var(--text-primary)' }}
    />
  );
}

function SectionHeader({ eyebrow, title, sub }) {
  return (
    <header className="mb-5">
      <div className="text-xs font-mono tracking-widest uppercase" style={{ color: 'var(--amber)' }}>{eyebrow}</div>
      <h2 className="font-display text-lg font-semibold mt-1">{title}</h2>
      {sub && <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </header>
  );
}

function GuideButton({ onClick, color }) {
  return (
    <button
      onClick={onClick}
      className="focus-ring shrink-0 flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border"
      style={{ borderColor: 'var(--hairline)', color }}
    >
      <BookOpen size={12} /> Guide
    </button>
  );
}

export default function Settings() {
  const { settings, setSettings, profile, setProfile } = useApp();

  const [fbToken, setFbToken] = useState(settings.fbToken);
  const [geminiKey, setGeminiKey] = useState(settings.geminiKey);
  const [pageName, setPageName] = useState(profile.pageName);
  const [niche, setNiche] = useState(profile.niche);
  const [audience, setAudience] = useState(profile.audience);
  const [voice, setVoice] = useState(profile.voice);
  const [defaultHashtags, setDefaultHashtags] = useState(profile.defaultHashtags);
  const [googleEmail, setGoogleEmail] = useState(profile.googleEmail);

  const [saved, setSaved] = useState(false);
  const [openGuide, setOpenGuide] = useState(null); // 'facebook' | 'gemini' | null

  function handleSave() {
    setSettings({ fbToken: fbToken.trim(), geminiKey: geminiKey.trim() });
    setProfile({
      pageName: pageName.trim(),
      niche: niche.trim(),
      audience: audience.trim(),
      voice,
      defaultHashtags: defaultHashtags.trim(),
      googleEmail: googleEmail.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const fbConnected = Boolean(fbToken.trim());
  const geminiConnected = Boolean(geminiKey.trim());

  return (
    <div className="p-6 md:p-8 max-w-xl mx-auto w-full">
      <header className="mb-8">
        <div className="text-xs font-mono tracking-widest uppercase" style={{ color: 'var(--amber)' }}>Configuration</div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold mt-1">Profile setup</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Everything else in the app — AI prompt suggestions, caption tone, page data — pulls from
          what you set here. Fill in as much or as little as you like; blank fields just fall back
          to demo defaults.
        </p>
      </header>

      {/* Business profile — feeds AI generation everywhere else */}
      <SectionHeader
        eyebrow="Step 1"
        title="Business profile"
        sub="Used to ground AI-suggested prompts and captions so they actually fit your page, instead of reading generic."
      />

      <Field label="Page / business name" help="Shown across the app; defaults to your connected Facebook Page name if left blank.">
        <TextInput value={pageName} onChange={(e) => setPageName(e.target.value)} placeholder="e.g. Agri Student BD" />
      </Field>

      <Field label="Niche / what this page is about">
        <TextInput value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. Agriculture study resources for IUBAT students" />
      </Field>

      <Field label="Target audience">
        <TextInput value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. University agriculture students in Bangladesh" />
      </Field>

      <Field label="Default brand voice" help="Pre-selects the tone in Create Post → AI Generate.">
        <select
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          className="focus-ring w-full rounded-lg border px-3 py-2.5 text-sm"
          style={{ background: 'var(--panel)', borderColor: 'var(--hairline)', color: 'var(--text-primary)' }}
        >
          {toneOptions.map((t) => <option key={t}>{t}</option>)}
        </select>
      </Field>

      <Field label="Default hashtags" help="Comma-separated — appended as a starting point whenever AI generates a caption.">
        <TextInput value={defaultHashtags} onChange={(e) => setDefaultHashtags(e.target.value)} placeholder="AgriStudentBD, IUBAT, LetsHelpEachOther" />
      </Field>

      {/* Connected accounts */}
      <SectionHeader eyebrow="Step 2" title="Connected accounts" />

      <Field
        label="Google account email"
        help="Just for display — confirms whose account is connected. Doesn't grant API access by itself; see the Gemini key below."
      >
        <div className="relative">
          <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-dim)' }} />
          <input
            type="email"
            value={googleEmail}
            onChange={(e) => setGoogleEmail(e.target.value)}
            placeholder="you@gmail.com"
            className="focus-ring w-full rounded-lg border pl-9 pr-3 py-2.5 text-sm"
            style={{ background: 'var(--panel)', borderColor: 'var(--hairline)', color: 'var(--text-primary)' }}
          />
        </div>
      </Field>

      <Field
        label={
          <span className="flex items-center gap-2">
            Facebook access token
            {fbConnected && <CircleCheck size={14} color="var(--positive)" />}
          </span>
        }
        action={<GuideButton onClick={() => setOpenGuide('facebook')} color="var(--fb)" />}
        help={
          <>
            Needs scopes: pages_show_list, pages_read_engagement, pages_manage_posts,
            pages_read_user_content. Get one at{' '}
            <a
              href="https://developers.facebook.com/tools/explorer"
              target="_blank" rel="noreferrer"
              className="underline inline-flex items-center gap-1"
              style={{ color: 'var(--fb)' }}
            >
              Graph API Explorer <ExternalLink size={11} />
            </a>{' '}
            — or tap Guide above for the full walkthrough.
          </>
        }
      >
        <input
          type="password"
          value={fbToken}
          onChange={(e) => setFbToken(e.target.value)}
          placeholder="EAAG..."
          className="focus-ring w-full rounded-lg border px-3 py-2.5 text-sm font-mono"
          style={{ background: 'var(--panel)', borderColor: 'var(--hairline)', color: 'var(--text-primary)' }}
        />
      </Field>

      <Field
        label={
          <span className="flex items-center gap-2">
            Gemini API key
            {geminiConnected && <CircleCheck size={14} color="var(--positive)" />}
          </span>
        }
        action={<GuideButton onClick={() => setOpenGuide('gemini')} color="var(--amber)" />}
        help={
          <>
            Powers AI captions, prompt suggestions, image generation, and image editing in Create
            Post. Free tier key from{' '}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank" rel="noreferrer"
              className="underline inline-flex items-center gap-1"
              style={{ color: 'var(--amber)' }}
            >
              Google AI Studio <ExternalLink size={11} />
            </a>. Leave blank to see template captions and placeholder images instead.
          </>
        }
      >
        <input
          type="password"
          value={geminiKey}
          onChange={(e) => setGeminiKey(e.target.value)}
          placeholder="AIza..."
          className="focus-ring w-full rounded-lg border px-3 py-2.5 text-sm font-mono"
          style={{ background: 'var(--panel)', borderColor: 'var(--hairline)', color: 'var(--text-primary)' }}
        />
      </Field>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className="focus-ring px-5 py-2.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--amber)', color: '#0B0E13' }}
        >
          Save profile
        </button>
        {saved && <span className="text-xs" style={{ color: 'var(--positive)' }}>Saved</span>}
      </div>

      {!fbConnected && (
        <div
          className="mt-6 flex items-start gap-2 text-xs rounded-lg px-3 py-2.5"
          style={{ background: 'var(--amber-dim)55', color: 'var(--amber)' }}
        >
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          No Facebook token yet — the app is running entirely on demo data until you add one.
        </div>
      )}

      <p className="text-xs mt-8 leading-relaxed" style={{ color: 'var(--text-dim)' }}>
        Everything on this page is stored only in this browser's local storage — none of it is
        sent anywhere except directly to Facebook or Google's own APIs. For a shared or
        production deployment, proxy those calls through a small backend instead of calling them
        from the browser.
      </p>

      {openGuide === 'facebook' && (
        <GuideModal
          title="Connect a Facebook Page"
          accent="var(--fb)"
          intro="Takes about two minutes. You'll leave with a token that lets this app read your Page's insights and publish posts on your behalf."
          steps={FB_STEPS}
          link={{ href: 'https://developers.facebook.com/tools/explorer', label: 'Open Graph API Explorer' }}
          onClose={() => setOpenGuide(null)}
        />
      )}

      {openGuide === 'gemini' && (
        <GuideModal
          title="Get a Gemini API key"
          accent="var(--amber)"
          intro="Free, no credit card required. Powers every AI feature in Create Post — captions, prompt suggestions, image generation, and image editing."
          steps={GEMINI_STEPS}
          link={{ href: 'https://aistudio.google.com/apikey', label: 'Open Google AI Studio' }}
          onClose={() => setOpenGuide(null)}
        />
      )}
    </div>
  );
}
