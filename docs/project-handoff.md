# Project Handoff

## Project Overview

This project is a lightweight `React + Vite` web app for managing student fitness test data.

The current direction is:

- The web app is the main editing surface
- Excel is used for backup, transfer, and export
- The app is deployable on GitHub Pages
- The UI is gradually moving toward spreadsheet-style editing
- The PDF/report workflow is being prototyped inside an A4 canvas page

Recent maintenance has focused on:

- mobile spreadsheet readability
- sheet zoom and sticky-column behavior
- simplifying the roster page into a smaller operational version
- adding a dedicated `/debug` page for sheet parameter tuning

## Core Stack

- `React 19`
- `Vite`
- `TypeScript`
- `Firebase Auth`
- `Cloud Firestore`
- `Apache ECharts`
- `SheetJS / xlsx`
- `jsPDF`
- `Playwright`

## Main Files

- `src/App.tsx`
  - Main application shell
  - Tab navigation
  - Most current page-level logic still lives here
  - Coordinates auth, cloud files, sharing, friends, diagnostics, spreadsheets, and reports
  - This is the highest-risk file for future changes

- `src/services/firebase.ts` / `src/services/firebase-config.ts`
  - Firebase app initialization
  - Runtime-aware production vs `/e2e/` Firebase config selection

- `src/features/auth/firebase-auth.ts`
  - Username/password wrapper around Firebase Auth

- `src/features/files/cloud-files.ts`
  - Firestore persistence for owned files and shared file indexes
  - Stores records, roster entries, school snapshots, sharing metadata, and archive status

- `src/features/friends/friendships.ts`
  - Firestore user profile, friend request, friend list, and QR invite helpers

- `src/features/diagnostics/diagnostics.ts`
  - Problem report flow
  - Browser action logs
  - Screenshot upload references and report history

- `src/features/reports/RadarChart.tsx`
  - Interactive radar chart used in the analysis page

- `src/features/reports/A4CanvasBoard.tsx`
  - A4 report/canvas prototype
  - Can place text blocks and image blocks
  - Renders selected student radar data into the A4 page
  - Exports a real PDF through `jsPDF`

- `src/features/reports/excel.ts`
  - Excel export/import logic
  - Visible sheet for users
  - Hidden `_system` sheet stores embedded JSON

- `src/services/storage.ts`
  - Legacy/local browser storage persistence
  - Still useful as compatibility context, but cloud files are now the main persistence model

- `src/domain/sample-data.ts`
  - Default example data

- `src/domain/types.ts`
  - Shared project data types

- `src/features/debug/debug-settings.ts`
  - Debug-only sheet tuning parameters stored in `localStorage`

- `src/features/debug/DebugPage.tsx`
  - Dedicated debug page UI

- `debug/index.html`
  - Secondary Vite entry for the `/debug/` route

- `src/styles.css`
  - Global styling for the app

## Current Data Model

The app currently stores:

- Auth/profile data
  - Firebase Auth users
  - User profile documents at `users/{uid}`
  - Profile fields include username, display nickname, school, and school branch

- `rosterName`
  - Class name, currently defaulting to `星星班`

- `testDate`
  - Shared test date for the whole dataset

- `rosterEntries`
  - Roster rows with:
    - `studentName`
    - `height`
    - `weight`

- `records`
  - Full test records with:
    - `studentName`
    - `height`
    - `weight`
    - `studentGradeLabel`
    - `item1 ~ item6`
    - optional split fields such as `item6Left` / `item6Right`
    - `comment`
    - `testDate`

- Cloud files
  - Owned files live under `users/{ownerUid}/files/{fileId}`
  - Shared file recipient indexes live under `users/{recipientUid}/sharedFiles/{ownerUid__fileId}`
  - Each cloud file stores a full `AppData` snapshot plus summary metadata

- Friends and sharing
  - Friend requests live in top-level `friendRequests`
  - Friend invite links live in top-level `friendInvites`
  - Friend records live under `users/{uid}/friends/{friendUid}`

- Diagnostics
  - Problem reports live in top-level `diagnosticReports`
  - Public status lookup lives in `diagnosticReportStatuses`
  - User-visible references also live under `users/{uid}/diagnosticReports`
  - System and login logs live in `systemLogs` and `loginLogs`

## Current Tabs

- `編輯名冊`
  - Spreadsheet-style roster editor
  - Supports:
    - click-to-edit
    - paste from Google Sheets / Excel
    - `Enter` / `Shift + Enter` navigation
    - auto-select current cell content on focus
    - frozen first two columns (`#` and `姓名`)
    - capped internal sheet viewport with vertical scrolling
  - Includes columns:
    - `#`
    - `姓名`
    - `身高`
    - `體重`
  - Also includes:
    - class size input
    - apply-size action
    - warning before shrinking the roster when data may be removed

- `測驗項目`
  - Single-column score editing view
  - Focuses on one fitness item at a time
  - Now uses the same spreadsheet viewport / zoom model as the other table pages

- `檢視能力分析`
  - Interactive radar chart page
  - Includes student selector

- `檢視總表`
  - Summary table for student records
  - Supports:
    - spreadsheet-like cell editing
    - `Enter` / `Shift + Enter` navigation
    - auto-select current cell content on focus
    - incomplete-only filter
    - frozen first column
    - capped internal sheet viewport with vertical scrolling
    - zoom controls

- `測試畫布`
  - A4 report prototype page
  - Includes:
    - text layers
    - image layers
    - selected student radar chart
    - PDF export

- `下載PDF`
  - Simpler PDF / Excel export area

## Spreadsheet Interaction Standard

This has become the current internal standard for spreadsheet-like components in this project.

When the user asks to "make this page like a spreadsheet" or "migrate into a spreadsheet", the expected default behavior is:

- click-to-edit cell behavior
- support pasting multi-row / multi-column content from Google Sheets or Excel
- `Enter` moves to the next row in the same column
- `Shift + Enter` moves to the previous row in the same column
- when focus moves into the next editable cell, the cell content is selected automatically for overwrite

This is already implemented in:

- roster editor
- summary table
- metric editor

Additional current spreadsheet conventions:

- sticky top row inside the sheet viewport
- frozen first column on summary-style sheets
- frozen first two columns on the roster sheet
- internal viewport height can be capped instead of letting the full table expand
- zoom options:
  - `符合頁寬`
  - `80%`
  - `90%`
  - `100%`
  - `110%`

## Debug Page

There is now a public debug route:

- `https://smartmango2026.github.io/fitness-test-tool/debug/`

Current debug controls:

- visible row count
- right-side scroll clamp padding
- frozen first-column width for summary sheets
- whether to show live debug values

Important limitations:

- settings are stored in browser `localStorage`
- settings are not shared across devices
- settings are not versioned
- this is a development aid, not a secure admin tool

## Excel Import / Export

Current Excel strategy:

- Visible worksheet is for user viewing/export
- Hidden `_system` worksheet stores embedded JSON
- Import trusts `_system` JSON rather than manually edited visible cells

Current visible export includes:

- class name
- test date
- student rows
- height
- weight
- six test items
- comment

## A4 Canvas / Report Status

The A4 page is currently a prototype, but already usable.

Current capabilities:

- fixed A4 portrait canvas
- editable text layers
- uploaded image layers
- selected student radar chart drawn into the canvas
- class name / test date / student summary rendered into the page
- real PDF file export using `jsPDF`

Current limitation:

- layout elements are still manually positioned
- no drag-and-drop placement yet
- no saved template system yet
- no direct insertion of chart as a movable layer yet; radar chart is currently part of the fixed report rendering

## Known Architectural Notes

- `src/App.tsx` is now doing a lot of work
  - tab orchestration
  - auth/session state
  - cloud file state and dirty-state prompting
  - friend and sharing workflows
  - diagnostic report submission
  - table editing behavior
  - roster editor logic
  - report page wiring
- It is the main next refactor target, but changes should be small and behavior-preserving

- Firebase is integrated
  - production entry `/` uses the production Firebase project
  - test entry `/e2e/` is intended to use a separate Firebase test project
  - keep `/e2e/` guards in tests to avoid writing automated data into production

- Do not start with a large Context rewrite
  - previous attempts to move auth/friend state into Context created build and integration issues
  - prefer extracting pure presentational components first
  - keep high-risk data flows in `App.tsx` until each flow has E2E coverage

Suggested future split:

- `src/features/roster/*`
- `src/features/table/*`
- `src/features/report/*`
- `src/features/account/*`
- `src/features/files/*`
- `src/features/friends/*`
- `src/features/diagnostics/*`
- shared spreadsheet behavior extracted into a reusable hook or helper

## Deployment

This repo is deployed through GitHub Pages using GitHub Actions.

Important notes:

- Repo: `https://github.com/smartmango2026/fitness-test-tool`
- Pages URL: `https://smartmango2026.github.io/fitness-test-tool/`
- The repo does **not** commit `dist/`
- GitHub Actions builds and deploys the site

## Local Development

Install:

```bash
pnpm install
```

Run dev server:

```bash
pnpm dev
```

Build:

```bash
pnpm build
```

Current local environment notes:

- `pnpm build` currently succeeds
- the main app bundle is still large and produces a Vite chunk-size warning
- do not commit `dist/`
- do not commit `tsconfig.app.tsbuildinfo`

## Handoff Notes For Another Machine

On another computer, the expected setup flow is:

1. Clone the repo
2. Run `pnpm install`
3. Run `pnpm dev`
4. Open the local Vite URL

If PDF export behaves unexpectedly on another machine, the first thing to verify is that dependencies were installed correctly, including `jspdf`.

## Recommended Next Steps

- Decide whether `/debug` should remain public, become read-only, move into code-only settings, or later become authenticated admin tooling
- Review which sheet tuning parameters should stay runtime-configurable
- Start Firebase integration only after agreeing on auth method, ownership model, and Firestore rules
- Refactor spreadsheet behavior into reusable helpers/hooks
- Allow drag-and-drop positioning on the A4 report canvas
- Make the radar chart on the A4 page configurable in position and size
- Add image resize handles instead of number-only controls
- Consider a saved report template system
- Consider exporting a polished fitness report per student
