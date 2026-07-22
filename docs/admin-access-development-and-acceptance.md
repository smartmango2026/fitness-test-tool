# Admin Access Phased Development And Acceptance Plan

This document converts `docs/admin-and-school-access-plan.md` into a smaller
first-version development and acceptance plan.

The first admin UI should not be a full back-office system. It should be a simple
maintenance panel with two cards:

```text
Admin dashboard
  Card 1: user filters
  Card 2: user table
  Detail panel: selected user details and account actions
```

The implementation target is `/e2e/` first. Production rollout should happen
only after rules, Cloud Functions, and acceptance tests are reviewed.

## Operating Rules

- Develop against `/e2e/` and `fitness-test-tool-e2e` first.
- Keep admin UI hidden from ordinary teachers.
- Use stable `data-testid` selectors for acceptance tests.
- Do not implement password reset or QR login only in frontend code.
- Keep acceptance tests skipped by default until actively implementing admin
  features.

## Entry Point

The admin entry should live in the account menu, not in the main teacher workflow
tabs.

```text
Account menu
  Account settings
  Admin dashboard
  Issue report
  Sign out
```

Only `systemAdmin` and `schoolAccountAdmin` should see the admin entry.

Stable selector contract:

```text
admin-entry
admin-dashboard
```

The selector name should describe the function, not the UI form. Do not name it
`admin-tab`, because the entry may later move from a tab to an account menu,
sidebar, or route.

## Acceptance Test Entry

Acceptance script:

```text
tests/e2e/admin-access.acceptance.spec.ts
```

Documentation/safe mode:

```powershell
pnpm run test:e2e:admin-acceptance
```

Active mode:

```powershell
$env:RUN_ADMIN_ACCEPTANCE = "1"
$env:ADMIN_ACCEPTANCE_USER = "<system-admin-username>"
$env:ADMIN_ACCEPTANCE_PASSWORD = "<system-admin-password>"
pnpm run test:e2e:admin-acceptance
Remove-Item Env:RUN_ADMIN_ACCEPTANCE
Remove-Item Env:ADMIN_ACCEPTANCE_USER
Remove-Item Env:ADMIN_ACCEPTANCE_PASSWORD
```

Do not commit credentials.

## Phase 0: E2E Baseline

### Development

- Keep `/e2e/` connected to `fitness-test-tool-e2e`.
- Keep Firestore rules and indexes deployable through:

```powershell
pnpm run firebase:e2e:rules
```

- Keep copied system administrator test accounts available in E2E through:

```powershell
pnpm run copy:e2e-users
```

### Acceptance

- `pnpm run test:e2e:ready` passes.
- E2E data remains isolated from production.
- Seeded admin test users have `globalRoles: ["systemAdmin"]` in E2E.

## Phase 1: Admin Entry And Two-Card Dashboard

### Development

- Add centralized role constants and permission helpers.
- Show `admin-entry` only to `systemAdmin` and `schoolAccountAdmin`.
- Clicking `admin-entry` opens `admin-dashboard`.
- The dashboard contains exactly the first-version maintenance structure:

```text
admin-user-filter-card
admin-user-table-card
admin-user-detail-panel
```

### Acceptance

- A system administrator can open the admin dashboard.
- The dashboard shows the current role and scope.
- The dashboard shows a filter card.
- The dashboard shows a user table card.

Expected selectors:

```text
admin-entry
admin-dashboard
admin-current-user-role
admin-scope-summary
admin-user-filter-card
admin-user-table-card
```

## Phase 2: User Filtering

### Development

The first filter card should stay small:

```text
keyword: username / display name / school
school: all or scoped school options
status: all / active / inactive
```

Role filtering can be added later if needed, but it is not required for the first
admin UI.

### Acceptance

- System administrators can filter across all users.
- School account administrators can only filter within assigned schools.
- The filter result updates the user table.

Expected selectors:

```text
admin-user-keyword-input
admin-user-school-filter
admin-user-status-filter
admin-user-search-button
admin-user-result-count
```

## Phase 3: User Table And Detail Panel

### Development

The user table should show basic account information and one action button.

Columns:

```text
username
display name
school / branch
role
status
last login
action: view
```

Do not put many account actions directly in the table. Keep the table readable,
especially on mobile.

Clicking view opens a detail panel.

Detail panel sections:

```text
Basic data
  username
  display name
  uid
  school / branch
  role
  status
  last login

Account actions
  create password reset link
  create permanent login QR
  revoke login QR
  activate / deactivate account

Recent records
  recent login
  recent QR login
  recent password reset
  recent admin action
```

### Acceptance

- The table lists users matching the active filter.
- Clicking view opens the selected user's detail panel.
- The detail panel shows the selected user's identity and status.
- Account action buttons are visible according to the actor's permissions.

Expected selectors:

```text
admin-user-table
admin-user-row
admin-user-open-detail-button
admin-user-detail-panel
admin-user-detail-username
admin-user-detail-uid
admin-user-detail-status
admin-user-detail-role
```

## Phase 4: Password Reset Link Flow

### Development

- Implement reset link creation through Cloud Functions or a backend using the
  Firebase Admin SDK.
- Do not display, store, or recover existing passwords.
- Write audit logs whenever a reset link is generated.

### Acceptance

- A system administrator can generate a reset link for any teacher.
- A school account administrator can generate a reset link only for teachers in
  assigned schools.
- The reset link result is visible in the user detail panel.
- An audit log records actor, target, and school context.

Expected selectors:

```text
admin-password-reset-button
admin-password-reset-result
admin-password-reset-copy-button
admin-user-recent-records
```

## Phase 5: Permanent Teacher QR Login

### Development

- Implement QR login through Cloud Functions and Firebase custom tokens.
- Store only a hash of the QR token.
- Allow permanent QR passes for ordinary teachers.
- Do not allow permanent QR passes for `systemAdmin` accounts in the first
  version.
- Record each QR login use.

### Acceptance

- An administrator can create a teacher QR login pass from the detail panel.
- The QR pass logs the teacher in.
- If another user is already logged in, the app asks for confirmation before
  switching accounts.
- The administrator can revoke the QR pass.
- Revoked QR passes cannot log in.
- QR login use appears in recent records.
- System administrator accounts cannot receive permanent QR login passes.

Expected selectors:

```text
admin-login-pass-create-button
admin-login-pass-result
admin-login-pass-revoke-button
login-pass-switch-confirm-dialog
login-pass-switch-confirm-button
login-pass-error-card
admin-user-recent-records
```

## Phase 6: School Alias And Canonical Resolution

### Development

This does not need a large school-management page in the first version. If alias
maintenance is needed early, expose it from the selected user or school context,
not as a separate complex admin area.

- Add `schoolAliases/{aliasId}` records.
- Resolve known aliases to canonical school records.
- Preserve original teacher input as a snapshot when useful.

### Acceptance

- A system administrator can create an alias for a school.
- A file using the alias resolves to the canonical school.
- The original input is retained for troubleshooting.
- Merged schools point to `canonicalSchoolId`.

Expected selectors:

```text
admin-school-alias-panel
admin-school-alias-input
admin-school-alias-save-button
admin-school-canonical-name
file-school-input-snapshot
```

## Phase 7: Production Readiness Review

### Acceptance

- All current E2E tests pass.
- Active admin acceptance tests pass in `/e2e/`.
- Manual review confirms production has no unintended admin entry points.
- Firestore rules and Cloud Functions enforce permissions server-side.
- A rollback plan exists before production release.

## Current E2E Implementation Status

The `/e2e/` implementation now includes the first-version admin UI shape:

- `admin-entry` in the account menu for E2E `systemAdmin` users.
- Two-card admin dashboard:
  - user filter card
  - user table card
- User detail panel with:
  - identity and status fields
  - password reset flow record creation
  - permanent QR login pass record creation and revocation
  - recent action feedback
- School alias record creation.
- Firestore rules for E2E admin reads/writes.
- Active acceptance coverage for phases 1 through 6.

Important boundary:

- Password reset currently creates an E2E reset-flow record and URL placeholder.
  A production-quality reset link still requires Cloud Functions or another
  backend using Firebase Admin SDK.
- Permanent QR login currently creates revocable hashed-token pass records and
  validates pass state from the URL. Actual Firebase Auth account switching still
  requires Cloud Functions to exchange the QR token for a Firebase custom token.
