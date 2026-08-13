# Social Manager — one control room for your Facebook pages

A personal AI assistant for running your Facebook Page(s): log in, connect your page once,
then create posts manually or let the AI agent suggest ideas, write captions, and generate
images — all on free tiers. Preview before you publish, and post now or save as a draft.

## What's built

- **Login + profile** — real accounts via Firebase Auth (email/password), simple one-time profile (name + avatar)
- **Connect profile** — paste a Facebook Page token once, Social Manager finds your pages and connects the one you pick
- **Home** — platform tabs (Facebook live, Instagram/YouTube reserved for later), shows your connected page with name + photo, recent activity
- **Create post**
  - **Manually** — caption + photo upload, live Facebook-style preview
  - **AI agent** — give it a topic, it suggests content angles, pick one, it writes 3 captions, pick/edit, describe an image, it generates one (Gemini's free image tier)
  - **Saved text** — save any caption (written or AI-generated) and reuse it later
  - Every post goes through a **preview** before you choose **Post now** or **Save as draft**
- **Post from Google Sheet** — connect a public sheet (`Caption` + `Image Link` columns), fetch its rows into a
  numbered, click-to-preview queue, pick a posting interval (30 min up to custom hours), and approve the batch.
  The first post can go out immediately; every post after that is scheduled directly on Facebook's own servers
  at `now + n × interval`, so they publish on time even if you close the browser. Image links can be direct
  URLs, single Google Drive files, or Drive folders (posted as one multi-photo post). Captions support
  **bold** text via a toolbar button or `**double asterisks**` in the sheet. See "Post from Google Sheet"
  below for the sheet-sharing requirement.
- **Broadcast log** — every draft and posted item, with "continue editing" for drafts
- **Settings** — manage your Facebook connection and Gemini API key, with built-in guides for getting both

## Why images only (no video, for now)

Google's Gemini free tier does **not** include video generation — the video model (Veo) requires
billing to be enabled, with no free quota. Everything else here (text suggestions, captions, and
image generation) runs on Gemini's free tier. If you turn on billing later, video generation can be
added as its own step in the AI agent flow.

## Setup (all free)

### 0. Lock the app to only you
Open `src/config/owner-config.js` and set `OWNER_EMAIL` to your own email address. With this set,
only that exact email can log in or sign up — anyone else who finds the site's URL and tries
to create an account is signed out immediately. Do this before deploying.

### 1. Firebase (login + storage)
1. Go to console.firebase.google.com and create a project (no billing needed, Spark plan).
2. Build -> Authentication -> Get started -> enable Email/Password.
3. Build -> Firestore Database -> Create database -> start in test mode (or production mode with the rules below).
4. Project settings -> General -> Your apps -> add a Web app -> copy the config object.
5. Paste it into `src/config/firebase-config.js`.

Recommended Firestore rules (personal, single-user data only readable/writable by its owner):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

### 2. Facebook Page token
Settings -> Connect profile has a built-in guide, in short:
1. developers.facebook.com -> create a free Business app.
2. Add the Facebook Login and Pages API products.
3. In Graph API Explorer, select your app + Page, grant pages_show_list, pages_manage_posts, pages_read_engagement, generate a token.
4. Paste it in Social Manager -> it fetches your Page's own token and stores that (not your personal token).

### 3. Gemini API key (AI agent)
Settings -> Gemini API key has a built-in guide, in short:
1. aistudio.google.com -> Get API key -> Create API key (no billing needed).
2. Paste it in Social Manager.

## Post from Google Sheet

Sidebar -> **Post from sheet**. This reads the sheet straight from your browser (no API key, no backend)
using Google's public CSV export, so it only works with sheets shared as **Anyone with the link — Viewer**.

1. In Google Sheets: **Share** -> **General access** -> **Anyone with the link** -> **Viewer**.
2. Put a header row on top. Columns named `Caption` (or `Text`/`Message`/`Content`) and `Image Link` (or
   `Image`/`Image URL`/`Photo`) are matched automatically, case-insensitive; if nothing matches, column A is
   used as the caption and column B as the image link. The image column needs a **direct, publicly viewable
   image URL** (ending in something like `.jpg`/`.png`, or a direct-view link) — Facebook fetches it server-side,
   so a Google Drive "share" link usually won't work unless it's a direct-view URL.
3. Paste the sheet's URL into Social Manager, optionally name a specific tab, and click **Fetch rows**. Rows
   show up numbered — click any row to open a full Facebook-style preview and edit its caption before approving.
4. Pick a posting interval and whether the first post should go out immediately. Click **Approve & schedule**.
5. Social Manager posts the first row right away (if selected) and hands every later row to Facebook's own
   `scheduled_publish_time`, spaced `interval × row position` apart. Because Facebook does the actual
   publishing on its own servers, the queue keeps going even if this tab is closed — there's no background
   process running in your browser. Facebook only allows scheduling 10 minutes to 75 days ahead; rows that
   would land past that window are marked failed so you can re-run the batch later.
6. Re-fetching the same sheet is safe — rows already sent (tracked by sheet + row number + loop) are marked
   "Already queued" and skipped automatically.
7. Once every row in the sheet has been posted or scheduled, the Approve button is replaced by **Repeat from
   the top**. Click it to start a new loop: every checked row is queued again from row 1, on the same interval,
   without touching or duplicating the previous loop's posts (each loop gets its own dedupe key, shown as
   "Loop 2", "Loop 3", etc. next to the row count). This is a manual step by design — nothing loops on its own
   in the background, since this is a client-only app with no server process to trigger it while the tab is
   closed.

### Bold text in captions
Facebook has no rich-text formatting in posts — bold is faked the way most scheduling tools do it, by
swapping letters for their Unicode "mathematical bold" twins, which render bold everywhere as plain text.
Two ways to use it:
- **In the sheet itself:** wrap a word or phrase in `**double asterisks**` in the Caption column — it's
  converted to bold automatically the moment the sheet is fetched, and shows bold in the row preview.
- **While editing a caption** (row preview modal, or the manual/AI composer): select some text and click the
  **B** button above the textarea (or press Ctrl/Cmd+B). Click it again on the same selection to undo.

### Image links: direct URLs, Drive files, and Drive folders
The Image Link column now accepts three kinds of links:
- A **direct image URL** (ending in `.jpg`/`.png`/etc.) — used exactly as before.
- A **single Google Drive file link** (any of Drive's share-link formats) — converted to a direct-view link
  automatically, no setup needed. The file just needs to be shared as "Anyone with the link — Viewer".
- A **Google Drive folder link** — every image directly inside the folder becomes one multi-photo Facebook
  post (the same layout you get posting several photos by hand). This needs a **Google Drive API key**,
  added once in **Connect profile** (guide included there, ~2 minutes, free). The folder itself still needs
  to be shared as "Anyone with the link — Viewer".

## Run it

```bash
npm install
npm run dev
```

Build for deployment:
```bash
npm run build
```
The `dist/` folder is a static site — deploy it anywhere (Firebase Hosting, Netlify, Vercel, GitHub Pages).

## Notes on tokens

Facebook Page access tokens obtained this way are long-lived but not permanent — if posting
ever starts failing with an auth error, go back to Connect profile and reconnect with a fresh token.

## Security notes, honestly

This is a client-only app (no backend server), which has real limits worth knowing:

- **Owner lock** (`src/config/owner-config.js`) stops anyone else from creating an account or logging in.
  This is the main protection since the site itself is public at your GitHub Pages URL.
- **Firestore rules** (see above) stop any account that *did* somehow get in from reading another
  account's data. Set these even though only you should ever be logged in — defense in depth.
- **Your Facebook token and Gemini key are not in the public code or repo.** You paste them into
  Settings, and they're saved to your own private Firestore document, gated by the rules above.
- **They do pass through your own browser** when the app calls Facebook/Gemini, since there's no
  server to hide them behind — visible in your browser's Network tab while you're using the app,
  same as any client-only app with embedded keys. For a single-user personal tool this is a normal
  tradeoff. If you ever want it hardened further, the fix is routing those calls through a small
  serverless function (e.g. a free Cloudflare Worker or Firebase Cloud Function) that holds the
  keys server-side instead.
- If a key or token is ever exposed, both Facebook and Google let you revoke/regenerate at no cost.
