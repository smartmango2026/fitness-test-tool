# Development History

This document records staged releases and major implementation milestones. It is intentionally separate from `README.md`, which should stay focused on the current project state.

## Staged Releases

### `v0.3.0` (`9107e9d`)

- Moved deployment and active maintenance to `smartmango2026/fitness-test-tool`
- Switched GitHub Pages to GitHub Actions deployment
- Connected the app to the new Firebase project `fitness-test-tool-42789`
- Added account management basics, friend list groundwork, and report/debug cleanup
- Adjusted landing flow and file sorting defaults

### `v0.4.0` (`a5c043a`)

- Added report score mapping based on configurable ability rules
- Hid the old analysis tab and consolidated report viewing into `檢視報表`
- Refined radar chart rendering, report debug URL workflow, and report summary layout
- Added auto-generated `老師觀察與鼓勵` content and improved its readability

### `v0.5.0` (`974533d`)

- Moved files to Firebase cloud storage and removed the local-file editing path
- Added manual save mode for cloud files instead of auto-uploading every edit
- Restored the last opened cloud file after login or page reload, with fallback to the newest created file
- Added the association logo to the app header

### `v0.6.0` (`581a9c0`)

- Added file ownership and shared editing through Firestore-backed sharing metadata
- Added self nickname and per-friend custom nickname support
- Simplified collaborator management to `select friend -> share`, showing nickname-only recipients

## Post-`v0.6.0` Main Branch Changes

### `e1cee41`

- Improved mobile report interactions
- Restored normal page scrolling when touching the report canvas on mobile
- Added tap-to-open report image preview with pinch zoom and pan

### `356c2aa`

- Added documentation for recent development history and architecture orientation

## Feature Milestone Summary

### Authentication and Accounts

- Username/password UX backed by Firebase Auth
- Cloud user profile stored at `users/{uid}`
- Support for self nickname and per-friend custom nickname

### Friends

- Firestore-backed friend relationships and friend requests
- QR invite flow for adding friends
- Friend display name priority:
  1. custom friend nickname
  2. friend self nickname
  3. username

### Files and Collaboration

- Cloud files stored under `users/{ownerUid}/files/{fileId}`
- Shared editing tracked through top-level `fileShares`
- Last opened file persisted per user as `{ fileId, ownerUid }`
- Manual save flow instead of per-edit auto upload

### Reports

- Report radar chart and summary convert raw values through ability rule ranges
- Report debug URL workflow:
  - `?debug=report&seat=1`
  - `?debug=report&record=<recordId>`
  - `?debug=report&file=<cloudFileId>&seat=1`
  - `?debug=report&file=<cloudFileId>&record=<recordId>`
- Auto-generated `老師觀察與鼓勵`
- Mobile-friendly report preview interactions
