# PDF Shelf

**Organise your Google Drive PDF notes: star them, tag them, rank them, and find them fast.**

**Live:** <https://notes.rohanahire.com>

PDF Shelf is a small web app on top of Google Drive. You pick one Drive folder, and it shows every PDF inside it as a library you can star, tag, sort by type of work and rank by importance (1 to 5). There is no server and no database: the site is static and talks to the Google Drive API straight from your browser, and every label is saved on the file in your own Drive.

## Features

- **One folder, nothing moved.** It only looks at the Drive folder you pick (and its subfolders). Files stay where they are.
- **Stars** are Drive's own stars, so they match what you see in Drive.
- **Tags, type of work and importance** are stored on each file as Drive `appProperties`, so they follow you to any device you sign in from.
- **Smart views:** All PDFs, Starred, Most important (importance 4+), Unsorted (no type or tags yet), plus one view per type and per tag, each with a count.
- **Search and sort:** press `/` to search; sort by importance, last modified, created or name. Your sort choice is remembered.
- **Upload by drag and drop:** drop PDFs anywhere on the page (or use "Add PDFs") to upload them into the folder.
- **Folder picker:** search your Drive folders or create a new one; the choice is remembered in Drive itself.

## How it works

- **Sign-in** uses Google Identity Services' token flow in the browser (`src/auth.ts`). The access token lives in the tab's `sessionStorage` for up to an hour; there is no backend and no refresh token.
- **Data** goes through the Drive v3 REST API (`src/drive.ts`): list PDFs in the folder tree, update stars and `appProperties`, upload with multipart requests, and move files to Drive's trash.
- **UI** is a single React app (`src/App.tsx`) with a sidebar of views, a list, and a detail panel for editing tags, type and importance.

## Tech stack

- React 18 + TypeScript
- Vite
- Google Identity Services + Google Drive API v3
- Static hosting (deploy script publishes to GitHub Pages via `gh-pages`)

## Run locally

You need your own Google OAuth Client ID (free, about 5 minutes).

1. Go to <https://console.cloud.google.com/> and create a project (e.g. "PDF Shelf").
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **OAuth consent screen** (Google Auth Platform):
   - User type **External**, app name "PDF Shelf", your email as support and developer contact.
   - **Audience → Test users** → add your own Google account. Leaving the app in **Testing** is fine for personal use.
4. **Clients → Create client** → type **Web application**.
   - **Authorized JavaScript origins**: add `http://localhost:5173` (and your deployed URL, if any).
   - No redirect URIs needed.
5. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).

Then:

```bash
npm install
npm run dev
```

Open <http://localhost:5173>, paste the Client ID once, sign in, and pick or create your notes folder. The first time, Google warns that the app isn't verified; click **Continue**, since it's your own app.

Other scripts: `npm run build`, `npm run typecheck`, `npm run preview`.

## Deploy

```bash
npm run deploy   # builds and pushes dist/ to the gh-pages branch
```

Optionally put `VITE_GOOGLE_CLIENT_ID=...` in `.env.local` before building so visitors don't have to paste one. A Client ID is not a secret. For a custom domain, set it in `public/CNAME` and point a DNS `CNAME` record at `<user>.github.io`.

## Notes

- Sign-in lasts about an hour per tab; after that it asks you to sign in again.
- The app asks for full Drive access because it needs to read PDFs you created outside the app. It only ever lists the folder you pick.
- Tags, type and importance are tied to the Client ID that wrote them. With a new Client ID those labels won't carry over (stars will).
