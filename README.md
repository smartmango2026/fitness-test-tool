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

## E2E Test Entry

The app has a separate `/e2e/` entry for automated testing. It runs the same app code but is intended to connect to a separate Firebase test project.

To configure it locally, copy `.env.e2e.example` to `.env.local` and fill the `VITE_E2E_FIREBASE_*` values from the Firebase test project's Web app config. If those values are empty, `/e2e/` will show a warning and use a placeholder Firebase config so it does not silently write to production.

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

### Diagnostic Reports

Use the local script to read teacher-submitted issue reports from Firestore without asking Codex to query them manually.

```bash
pnpm reports
pnpm reports -- --details
pnpm reports -- --id <reportId> --details
pnpm reports -- --refresh
```

- The script reads Firebase CLI credentials from the local Firebase configstore.
- Run `pnpm dlx firebase-tools login` first if the local Firebase CLI session has expired.
- `--refresh` forces a short-lived access token refresh and updates the local Firebase CLI token cache.
- The default Firebase project is `fitness-test-tool-42789`; override with `FIREBASE_PROJECT_ID=<projectId>` if needed.

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

### Current Architecture Snapshot

- Authentication
  - Username/password UX backed by Firebase Auth
  - User profile document stored at `users/{uid}`

- Files
  - Owned files stored under `users/{ownerUid}/files/{fileId}`
  - Shared access tracked through:
    - owner file field `sharedWith`
    - recipient index `users/{recipientUid}/sharedFiles/{ownerUid__fileId}`
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

- System Logs
  - Important user actions are appended to top-level `systemLogs`
  - Logs use phased entries such as `started`, `completed`, and `failed`
  - Client-side failures before authentication or before Firestore is usable may still only exist in frontend diagnostics

## Experimental Page

- `/lab/` is a full experimental copy of the main app entry.
- Use it for trying new UI or workflow changes before copying stable changes back into the production entry.
- `/debug/` remains the ability-rules maintenance page, not the full app.

## Documents

- `docs/product-spec.md`: first-version product scope and feature rules
- `docs/excel-import-export.md`: Excel import/export contract and hidden JSON strategy
- `docs/implementation-notes.md`: suggested technical direction and phased rollout
- `docs/project-handoff.md`: current architecture, feature status, and handoff notes for continuing development on another machine
- `docs/development-history.md`: staged release history and major feature milestones
- `docs/time-estimate.md`: effort estimate and phased time breakdown based on commit history
- `docs/system-logs.md`: current `systemLogs` structure, event types, and limitations
- `docs/website-description.md`: description of the product scope and system complexity

## Current App Scope

The first version keeps the web app as the only official editing surface and includes a working prototype for:

- Users edit data in the web app
- Excel is used for viewing, backup, printing, and transfer
- Re-imported Excel files use embedded JSON as the source of truth
- Direct Excel edits are not part of the first-version workflow
- Local browser storage for simple persistence
- Radar chart analysis for a selected record
