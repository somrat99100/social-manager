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
