# todo-app

Simple static todo app (HTML / CSS / JS). This repository contains a minimal front-end single-page todo application.

**Purpose:**
- Provide a small demo todo app for local use or study.

**Quick Start:**
- Open `index.html` in your browser.

**Project Structure:**

- `index.html`: Main HTML file.
- `css/styles.css`: Styles.
- `js/app.js`: Application logic.

## Auto-generated Project Index

The section below is maintained automatically by `scripts/update-readme.js`.
Do not edit the content between the AUTO-GENERATED markers — run the update script instead.

<!-- AUTO-GENERATED:START -->

_(run `npm run update-readme` to populate this section)_

<!-- AUTO-GENERATED:END -->

## How to update the README


```powershell
npm run update-readme
```


```powershell
# set repo to use the provided hooks folder once (run from repo root)
git config core.hooksPath hooks
# make the hook executable if using Git Bash or WSL
# on Windows with native Git for Windows, hooks should run as-is
```

After enabling the hook the script will run on each commit and `README.md` will be updated and staged.

Server-backed storage (store JSON inside the project directory)

If you want tasks persisted to a JSON file inside the project instead of browser `localStorage`, run the included Node server which serves the site and stores tasks in `data/tasks.json`:

```powershell
cd E:\todo-app
npm install
npm start
# open http://localhost:3000 in your browser
```

Notes:
- When the server is running the frontend will detect it and attempt to sync: it will pull tasks from `/api/tasks` on first load and then POST the full task list to `/api/sync` after changes (best-effort).
- The server stores tasks at `data/tasks.json` in the project directory. This file can be backed up or committed to source control if you want versioned history.
- The server is optional — if it is not running the app will continue to use `localStorage`.

## Notes

- The update script only modifies the portion between the AUTO-GENERATED markers so you can keep custom docs above or below.
- If you want a different format, edit `scripts/update-readme.js`.
# Daily Tasks — Todo Webapp

Simple static webapp to manage daily tasks with checkboxes and `localStorage` persistence.

Features
- Add tasks
- Toggle complete/incomplete with checkbox
- Edit tasks (double-click title or click ✏️)
- Delete tasks
- Filter: All / Active / Completed
- Clear completed tasks
- Tasks persist in browser `localStorage`
 - Calendar view: click any date in the calendar to see tasks for that day. The app defaults to showing today's tasks on load.
 - Each day shows a small task count on the calendar; navigate months with the ◀ / ▶ buttons.

Files
- `index.html` — main page
- `css/styles.css` — styles
- `js/app.js` — frontend logic

Run locally
- Option A: Open directly
  - Double-click `index.html` in your file explorer and open in a browser.

- Option B: Start a simple HTTP server (recommended for full feature parity)
  - PowerShell (Python 3):

```powershell
cd path\to\todo-app
python -m http.server 8000; Start-Process http://localhost:8000
```

  - Or install `serve` (Node):

```powershell
cd path\to\todo-app
npm install -g serve; serve -s .
```

Notes
- Tasks are stored only in your browser on this machine; there is no server-side sync.
- If you want sync across devices, I can add a simple backend (optional).

- Data retention: tasks older than 1 year (365 days) are automatically removed on app load. This keeps the local storage compact; export or sync if you need long-term archives.

Want next?
- Add due dates, priority, or categories
- Add user authentication and remote sync
- Export/import tasks as JSON

If you'd like any of the above, tell me which feature to add next.