# SocialFlow — Unified Social Media Console (Web, Phase 1: Facebook)

A React + Vite web app for managing Facebook Pages from one dashboard: browse
connected pages, see per-page analytics, and create posts manually, with AI,
or in bulk from a CSV — with a preview-and-confirm step before anything
actually publishes.

Everything works end to end right now using realistic **demo data**. It
becomes fully live the moment you add your own credentials in **Profile
setup** — no code changes required.

## Run it

```bash
npm install
npm run dev
```

Then open the printed local URL (usually `http://localhost:5173`).

To build a static production bundle:

```bash
npm run build
npm run preview   # serve the built files locally
```

## Going from demo data to your real Facebook Pages

This app doesn't ship its own registered Facebook App with an OAuth login
button — a full "Login with Facebook" flow requires Meta Business
verification, a live HTTPS domain, and (for `pages_manage_posts`) an app
review. That's a separate, slower process from building the app itself.

Instead, **Profile setup** lets you paste a **User Access Token** generated from
[Graph API Explorer](https://developers.facebook.com/tools/explorer) with
these scopes:

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`
- `pages_read_user_content`

Once that token is saved, the app calls the real Graph API for:

- `GET /me/accounts` — your actual Pages, names, photos, follower counts
- `GET /{page-id}/posts` and `/insights` — real post and engagement data
- `POST /{page-id}/feed` or `/{page-id}/photos` — actually publishing

If the token is missing, expired, or a call fails for any reason, the app
falls back to demo pages automatically and shows why in the UI — it never
just breaks silently.

**Note:** Graph API Explorer tokens expire (short-lived tokens last about an
hour; you can extend to a ~60-day token from the same tool). For a
long-lived, production setup you'd register your own Facebook App and
implement the full OAuth + token-refresh flow described in the original
Android spec — this web app's `src/lib/facebook.js` is written so that swap
is a matter of where the token comes from, not how it's used.

## Going from templates to real AI generation

**Profile setup** has a field for a Gemini API key (get a free-tier one at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey), or tap the
Guide button next to the field for a full walkthrough). With a key saved,
the AI Generate tab in Create Post does four real things via
`src/lib/gemini.js`:

1. **Prompt suggestion** — type just a title and hit "Suggest prompt"; it
   calls Gemini to expand that into a full, detailed image-generation
   prompt, grounded in your business profile (niche, audience, voice) so
   the result actually fits your page instead of reading generic. You can
   also skip the title entirely and write your own prompt.
2. **Captions** — the prompt (or title, if you skipped writing one) drives
   3 caption options, with your profile's default hashtags appended
   automatically if none are already in the caption.
3. **Image generation** — calls `gemini-2.5-flash-image` ("Nano Banana")
   text-to-image, returning a real generated image from the same prompt.
4. **Image editing** — upload an existing photo, describe the edit, and the
   same model edits it and returns the result, ready to drop straight into
   the post.

Without a key, all four fall back to clearly-labeled template output
(placeholder captions and a Picsum photo) so the flow stays fully demoable —
except editing, which is real-API-only and says so plainly if no key is set.

**Note on the image model name:** `gemini-2.5-flash-image` is Google's
current free-tier image model as of this build, but names on the
image-preview line shift as Google promotes them out of preview. If image
calls start failing with a 404, check
[aistudio.google.com/apikey](https://aistudio.google.com/apikey) for the
current model name and update the `IMAGE_MODEL` constant at the top of
`src/lib/gemini.js`.

## Business profile → AI grounding

**Profile setup** also has a Business Profile section (page name, niche,
target audience, default brand voice, default hashtags) stored separately
from your API keys. This is what "Suggest prompt" and caption generation
read from — fill it in once and every AI-generated prompt or caption after
that is written with your actual audience and niche in mind, not a generic
default.

A "Google account email" field sits alongside the Gemini key purely for
display, to show whose account is connected — Google doesn't grant Gemini
API access from a Gmail sign-in alone, so the actual API key is still the
thing that authorizes requests (the same two-step reality as Facebook's
token flow above).

## What's built

- **Dashboard** — Facebook / Instagram / YouTube as channel cards. Facebook
  is live; the other two are marked "Coming soon" per your Phase 1 scope.
- **Facebook Pages list** — tap into the Facebook card to see connected
  pages (real or demo) with photo, category, followers, last post date.
- **Page analytics** — reach trend chart, engagement rate, engagement
  breakdown, recent interactions, top posts, and basic audience insights,
  scoped to whichever page you selected.
- **Create Post**, three tabs:
  - **Manual** — caption (2000-char counter), image/video upload, optional
    schedule date/time.
  - **AI Generate** — title-to-prompt suggestion (or write your own prompt),
    caption generation with tone + hashtag count, real image generation
    from the prompt, and image editing on an uploaded photo — any result
    drops straight into the Manual draft.
  - **Bulk Upload** — import a CSV (`caption, image_url, video_url,
    hashtags, scheduled_at, tone`) and preview every row before publishing.
- **Preview & Publish** — a Facebook-style preview card with an explicit
  Confirm step; only then does anything actually post.
- **Broadcasts** — a history of everything published or scheduled, across
  every connected page.
- **Profile setup** — business profile (name, niche, audience, voice,
  default hashtags) that grounds AI generation, plus Facebook token and
  Gemini key with step-by-step connection guides. All stored only in this
  browser's local storage.

## Project structure

```
src/
  components/   Sidebar, ChannelCard, PostCard, PostPreviewModal, GuideModal
  context/      AppContext — settings, profile, pages, posts, current view
  lib/          facebook.js (Graph API), gemini.js (captions, prompt
                suggestion, image gen/edit), mockData.js, csv.js
  pages/        Dashboard, FacebookPages, PageAnalytics, PagePosts,
                CreatePost, Posts, Settings (Profile setup)
```

## Design direction

The visual language is a broadcast-console theme — dark "control room"
palette, status LEDs for connected/live state, monospace numerals for
metrics — since the core idea of the app is monitoring and sending signals
across multiple channels from one panel.

## Next (Phase 2, per the original brief)

- Instagram Graph API + YouTube Data API integration behind the same
  `pages/` pattern
- Cross-platform scheduling and a content calendar view
- Comment moderation / reply-from-app
- Real image/video generation provider
- A small backend so API keys never touch the browser
