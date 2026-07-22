# Admin Access Phased Development And Acceptance Plan

This document converts `docs/admin-and-school-access-plan.md` into a staged
development and acceptance plan. The target is to implement and verify the admin
features in `/e2e/` first, then decide when to promote the feature to production.

## Operating Rules

- Develop against `/e2e/` and `fitness-test-tool-e2e` first.
- Do not enable production admin controls until Firestore rules and Cloud
  Functions are reviewed.
- Keep production test accounts copied into E2E as test system administrators.
- Keep all new UI elements covered by stable `data-testid` selectors.
- Keep acceptance tests skipped by default until the target phase is being
  implemented.

## Acceptance Test Entry

The acceptance script is:

```text
tests/e2e/admin-access.acceptance.spec.ts
```

Run it in documentation mode:

```powershell
pnpm run test:e2e:admin-acceptance
```

By default, the suite is skipped so the current app does not fail before the
feature exists.

Run it as an active acceptance suite:

```powershell
$env:RUN_ADMIN_ACCEPTANCE = "1"
$env:ADMIN_ACCEPTANCE_USER = "<system-admin-username>"
$env:ADMIN_ACCEPTANCE_PASSWORD = "<system-admin-password>"
pnpm run test:e2e:admin-acceptance
Remove-Item Env:RUN_ADMIN_ACCEPTANCE
Remove-Item Env:ADMIN_ACCEPTANCE_USER
Remove-Item Env:ADMIN_ACCEPTANCE_PASSWORD
```

Do not commit passwords or put them in documentation.

## Phase 0: E2E Baseline

### Development

- Keep `/e2e/` connected to `fitness-test-tool-e2e`.
- Keep Firestore rules and indexes deployable through:

```powershell
pnpm run firebase:e2e:rules
```

- Keep seed system administrator accounts available in E2E through:

```powershell
pnpm run copy:e2e-users
```

### Acceptance

- `pnpm run test:e2e:ready` passes.
- E2E data remains isolated from production.
- Seeded admin test users have `globalRoles: ["systemAdmin"]` in E2E.

## Phase 1: Role Constants And Permission Helpers

### Development

- Add centralized role constants.
- Add permission helper functions.
- Avoid raw role checks scattered across React components.

Suggested helpers:

```text
hasSystemAdminRole(userProfile)
canViewAllUsers(actorProfile)
canViewSchoolUsers(actorProfile, schoolId)
canAssignSchoolAccountAdmin(actorProfile)
canCreatePasswordResetLink(actorProfile, targetUser)
canCreatePermanentLoginPass(actorProfile, targetUser)
```

### Acceptance

- System administrators can see admin navigation.
- Ordinary teachers cannot see admin navigation.
- The UI exposes the current admin scope clearly.

Expected selectors:

```text
admin-tab
admin-dashboard
admin-current-user-role
admin-permission-summary
```

## Phase 2: School Membership Data

### Development

- Add or prepare `schools/{schoolId}` records.
- Add `schools/{schoolId}/members/{uid}` membership documents.
- Store `role`, `status`, snapshots, and audit metadata.

### Acceptance

- A system administrator can create or select a school.
- A system administrator can add a teacher to a school.
- A system administrator can assign `schoolAccountAdmin`.
- An audit log records the assignment.

Expected selectors:

```text
admin-schools-panel
admin-school-create-button
admin-school-name-input
admin-school-save-button
admin-school-member-add-button
admin-school-member-username-input
admin-school-member-role-select
admin-school-member-save-button
admin-audit-log-list
```

## Phase 3: School Account Administrator Scope

### Development

- Let school account administrators view only assigned school members.
- Prevent school account administrators from viewing global user lists.
- Enforce the scope in Firestore rules or Cloud Functions, not only in UI.

### Acceptance

- A school account administrator can see teachers in their school.
- A school account administrator cannot see teachers from another school.
- A system administrator can still see all accounts.

Expected selectors:

```text
admin-user-search-input
admin-user-table
admin-user-row
admin-scope-badge
admin-denied-card
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
  their school.
- The reset link result is visible to the administrator.
- An audit log records actor, target, and school context.

Expected selectors:

```text
admin-password-reset-button
admin-password-reset-result
admin-password-reset-copy-button
admin-audit-log-list
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

- An administrator can create a teacher QR login pass.
- The QR pass logs the teacher in.
- If another user is already logged in, the app asks for confirmation before
  switching accounts.
- The administrator can revoke the QR pass.
- Revoked QR passes cannot log in.
- QR login use creates an audit log entry.
- System administrator accounts cannot receive permanent QR login passes.

Expected selectors:

```text
admin-login-pass-create-button
admin-login-pass-result
admin-login-pass-revoke-button
login-pass-switch-confirm-dialog
login-pass-switch-confirm-button
login-pass-error-card
```

## Phase 6: School Alias And Canonical Resolution

### Development

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

### Development

- Review Firestore rules and Cloud Functions authorization.
- Confirm admin UI does not expose production-only operations in `/e2e/`.
- Confirm audit logs are queryable.
- Confirm password reset and QR login are not implemented only in frontend code.

### Acceptance

- All current E2E tests pass.
- Active admin acceptance tests pass in `/e2e/`.
- Manual review confirms production has no unintended admin entry points.
- A rollback plan exists before production release.

