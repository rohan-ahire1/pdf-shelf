# PDF Shelf

A small web app over Google Drive for organising PDF notes: star them, tag them, give each a type of work and an importance (1–5), then filter, search and sort.

- It only looks at **one Drive folder** you pick (and its subfolders). Files are never moved.
- **Stars** are Drive's own stars. **Tags, type and importance** are saved on each file in Drive, so they show up on any device you sign in from.
- Drop PDFs from your computer onto the page to upload them into the folder.
- No server and no database: the site is static and talks to Google Drive straight from your browser.

## One-time Google setup (about 5 minutes)

1. Go to <https://console.cloud.google.com/>, create a project (e.g. "PDF Shelf").
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform):
   - User type **External**, app name "PDF Shelf", your email as support and developer contact.
   - **Audience → Test users** → add your own Google account. Leave the app in **Testing** — that's fine for personal use.
4. **Clients → Create client** → type **Web application**.
   - **Authorized JavaScript origins**: add `http://localhost:5173` and `https://notes.rohanahire.com`.
   - No redirect URIs needed.
5. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).

When you first sign in Google will say the app isn't verified — click **Continue**; it's your own app.

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:5173>, paste the Client ID once, sign in, pick or create your notes folder.

## Hosting

Live at <https://notes.rohanahire.com> (GitHub Pages, served from the `gh-pages` branch).

- **DNS (one time):** at your domain provider add a `CNAME` record: name `notes`, value `rohan-ahire1.github.io`.
- **Deploy a new version:** `npm run deploy` (builds and pushes `dist/` to `gh-pages`).
- **Optional:** put `VITE_GOOGLE_CLIENT_ID=...` in `.env.local` before deploying so you don't have to paste it in each browser. (A Client ID is not a secret.)

## Notes

- Sign-in lasts about an hour per tab; after that it asks you to sign in again.
- The app asks for full Drive access because it needs to read PDFs you made outside the app. It only ever lists the folder you pick.
- Tags, type and importance are tied to this app's Client ID. If you make a new Client ID later, those labels won't carry over (stars will).
