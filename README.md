# Fitness Test Tool

This folder contains a lightweight React + Vite project for managing student fitness test records, along with the planning documents used to shape the first version.

## Run the App

```bash
pnpm install --ignore-workspace
pnpm dev
```

Then open the local URL shown by Vite in the terminal.

## Open the Built App Directly

If you want to open the app without running a local dev server:

```bash
pnpm build
```

After that, open:

- `dist/index.html`

Do not open the source `index.html` in the project root. That file is the Vite entry page and expects a dev server or a built deployment target.

## GitHub Pages

This project now uses relative asset paths, so the built output is suitable for GitHub Pages and for opening `dist/index.html` locally.

## Agent Notes

Use this section as the fast orientation block for future maintenance agents.

### Repository

- Canonical remote: `origin`
- Canonical repo: `smartmango2026/fitness-test-tool`
- Archive remote: `archive`
- Archive repo: `falcon12400/fitness-test-tool`
- Primary branch for development: `main`

### Deployment

- GitHub Pages URL: `https://smartmango2026.github.io/fitness-test-tool/`
- Deployment mode: GitHub Actions only
- Deployment workflow file: `.github/workflows/deploy-pages.yml`
- Pages build type: `workflow`
- Allowed deployment branch for `github-pages` environment: `main`
- `gh-pages` still exists as a historical branch, but it is not the deployment source anymore

### Expected Workflow

- Make code changes on `main`
- Run `pnpm build` before pushing when deployment-related files change
- Push to `origin/main`
- GitHub Actions builds and deploys the site automatically

### Do Not Assume

- Do not assume GitHub Pages is deployed from the `gh-pages` branch
- Do not assume `falcon12400/fitness-test-tool` is the active publishing repo
- Do not change the Pages deployment model back to `legacy` unless explicitly requested

### Useful Commands

```bash
pnpm install --ignore-workspace
pnpm dev
pnpm build
git push origin main
gh run list -R smartmango2026/fitness-test-tool --workflow "Deploy GitHub Pages"
```

### Report Debug URLs

- Report-only debug mode is enabled by URL params, not by visible UI buttons
- Use `?debug=report` to force the app into report preview mode
- Preferred local example: `http://127.0.0.1:4173/?debug=report&seat=1`
- `seat=1` means the first student in the currently loaded dataset
- `record=<recordId>` targets one exact student record
- `file=<cloudFileId>` loads a specific Firebase cloud file before rendering the report
- Most precise form: `?debug=report&file=<cloudFileId>&record=<recordId>`
- Practical fallback: `?debug=report&file=<cloudFileId>&seat=1`
- Legacy `?id=1` is still accepted as a fallback alias for `seat=1`, but new work should prefer `seat`
- In debug mode, the app renders the report canvas directly so headless Chrome screenshots can be taken without navigating the normal UI

### Recent Development History

- `v0.3.0` (`9107e9d`)
  - Moved deployment and active maintenance to `smartmango2026/fitness-test-tool`
  - Switched GitHub Pages to GitHub Actions deployment
  - Connected the app to the new Firebase project `fitness-test-tool-42789`
  - Added account management basics, friend list UI groundwork, and report/debug cleanup
  - Adjusted landing flow and file sorting defaults

- `v0.4.0` (`a5c043a`)
  - Added report score mapping based on configurable ability rules
  - Hid the old analysis tab and consolidated report viewing into `檢視報表`
  - Refined radar chart rendering, report debug URL workflow, and report summary layout
  - Added auto-generated `老師觀察與鼓勵` content and improved its readability

- `v0.5.0` (`974533d`)
  - Moved files to Firebase cloud storage and removed the local-file editing path
  - Added manual save mode for cloud files instead of auto-uploading every edit
  - Restored the last opened cloud file after login or page reload, with fallback to the newest created file
  - Added the association logo to the app header

- `main` after `v0.5.0`
  - Added self nickname and per-friend custom nickname support
  - Added file ownership and shared editing through Firestore-backed sharing metadata
  - Simplified collaborator management to `select friend -> share`, showing nickname-only recipients
  - Improved mobile report interactions: normal page scroll over the report canvas, plus tap-to-open image preview with pinch zoom and pan

### Current Architecture Snapshot

- Authentication
  - Username/password UX backed by Firebase Auth
  - User profile document stored at `users/{uid}`

- Files
  - Owned files stored under `users/{ownerUid}/files/{fileId}`
  - Shared access tracked through top-level `fileShares`
  - Last opened file persisted per user in local storage as `{ fileId, ownerUid }`

- Friends
  - Friend relationships and friend requests live in Firestore
  - QR invite flow is enabled for adding friends
  - Display name priority is:
    1. custom friend nickname
    2. friend self nickname
    3. username

- Reports
  - Raw test values stay as teacher-entered values in roster/table/editor views
  - Report radar chart and summary convert raw values through ability rule ranges
  - Observation text is auto-generated from scored abilities

## Documents

- `docs/product-spec.md`: first-version product scope and feature rules
- `docs/excel-import-export.md`: Excel import/export contract and hidden JSON strategy
- `docs/implementation-notes.md`: suggested technical direction and phased rollout
- `docs/project-handoff.md`: current architecture, feature status, and handoff notes for continuing development on another machine

## Current App Scope

The first version keeps the web app as the only official editing surface and includes a working prototype for:

- Users edit data in the web app
- Excel is used for viewing, backup, printing, and transfer
- Re-imported Excel files use embedded JSON as the source of truth
- Direct Excel edits are not part of the first-version workflow
- Local browser storage for simple persistence
- Radar chart analysis for a selected record
