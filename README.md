# Notes

Source for the web app I use to read and organize my own notes: PDFs, Markdown with Mermaid diagrams, HTML and text files. Star them, tag them, set a type of work, rank them by importance, and read them in the browser.

It runs on my server behind a login, so there is no public demo. The [notes](https://github.com/rohan-ahire1/notes) repo has a screenshot and more about how the server works, and it holds the built app.

This repo started as PDF Shelf, a static app on the Google Drive API. The old version is in the git history.

## How it works

- Notes are plain files in a folder. Subfolders show up as folders in the sidebar.
- Stars, tags, type and importance are kept in `.shelf.json` in that folder.
- "Move to trash" moves a file to `.trash/` in that folder.
- `server/server.mjs` (Node, no dependencies) serves the built app from `dist/`, the API under `/api` and the files under `/raw`. It has no login of its own and listens on `127.0.0.1`.
- The frontend is React and TypeScript, built with Vite. PDFs render with pdf.js, one page at a time as they come near the screen. Markdown goes through marked and DOMPurify, and HTML notes run in a sandboxed iframe.

## Run it locally

```bash
npm install
```

```bash
npm run build
```

```bash
NOTES_DIR=/tmp/notes node server/server.mjs
```

Open <http://127.0.0.1:8798>. Drag files onto the page or use "Add files".
