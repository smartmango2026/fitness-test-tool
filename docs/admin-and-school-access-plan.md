# Admin And School Access Plan

This document records the current planning direction for account administration,
school membership, school normalization, audit logs, and QR-code login. The first
implementation target should be the isolated `/e2e/` environment before enabling
anything in production.

## Goals

- Keep ordinary teacher workflows simple enough that teachers do not fall back to
  paper records.
- Support school-level account administrators who can help teachers with account
  access.
- Support system administrators who can manage all accounts and assign school
  account administrators.
- Keep school data flexible because unknown schools may use the system later.
- Preserve enough audit history to answer who changed an account or school
  relationship.

## Role Model

Use stable string values in Firestore and centralized `const` objects in code.
Do not scatter magic strings across UI, Firestore helpers, and rules.

Recommended role constants:

```ts
export const ROLE = {
  TEACHER: "teacher",
  SCHOOL_ACCOUNT_ADMIN: "schoolAccountAdmin",
  SYSTEM_ADMIN: "systemAdmin",
} as const;
```

Roles should behave like permission bundles:

- `teacher`: manages their own files.
- `schoolAccountAdmin`: manages account status and password reset links for
  teachers in assigned schools.
- `systemAdmin`: can view all accounts, assign school account administrators,
  and manage school records.

Avoid checking raw role strings everywhere. Prefer centralized helpers such as
`canViewSchoolUsers`, `canCreatePasswordResetLink`, and
`canAssignSchoolAccountAdmin` so role behavior can change later without hunting
through the whole app.

## Data Model

Recommended Firestore shape:

```text
users/{uid}
  username: string
  displayNickname?: string
  globalRoles?: ["systemAdmin"]
  disabled?: boolean

schools/{schoolId}
  name: string
  normalizedName: string
  status: "active" | "merged" | "archived"
  canonicalSchoolId?: string

schools/{schoolId}/members/{uid}
  uid: string
  usernameSnapshot: string
  displayNameSnapshot?: string
  role: "teacher" | "schoolAccountAdmin"
  status: "active" | "inactive"
  createdAt
  updatedAt
  createdByUid
  updatedByUid
```

`status` and audit logs are separate concepts:

- `status` answers the current state, such as whether a teacher is currently
  active in a school.
- `auditLogs` answer what happened historically, who did it, and when.

Do not model "former teacher" as a role. Leaving a school should be represented
as `status: "inactive"` while the role remains the last meaningful role in that
school relationship.

## Audit Logs

Audit logs should be structured so later admin pages can filter them.

Recommended shape:

```text
auditLogs/{logId}
  type:
    "schoolMemberRoleChanged"
    "schoolMemberStatusChanged"
    "passwordResetLinkCreated"
    "loginQrUsed"
  actorUid: string
  targetUid?: string
  schoolId?: string
  before?: object
  after?: object
  createdAt
```

Common queries that should remain possible:

- Who assigned a school account administrator?
- Who disabled or reactivated a teacher?
- Which account reset links were generated for a school?
- Which QR login pass was used, and when?

## Password Reset

Firebase Auth does not expose user passwords, and the system should never try to
store or display them.

The safe admin flow is:

1. An authorized administrator creates a password reset link.
2. The teacher opens the link and sets a new password.
3. The system records who created the reset link and when.

This should be implemented through Cloud Functions or another backend using the
Firebase Admin SDK. It should not be implemented only in the GitHub Pages
frontend.

## Permanent QR Login

Permanent QR login is acceptable for ordinary teacher accounts because the data
sensitivity is currently low and reducing login friction is a real product need.
However, the QR pass must be revocable, traceable, and not reversible from the
database.

Recommended shape:

```text
loginPasses/{passId}
  uid: string
  tokenHash: string
  status: "active" | "revoked"
  label: string
  createdAt
  createdByUid
  lastUsedAt
  lastUsedDevice?: object
```

Recommended flow:

1. Generate a long random token.
2. Put only the raw token in the QR URL.
3. Store only `tokenHash` in Firestore.
4. The frontend sends the raw token to a Cloud Function.
5. The Cloud Function verifies hash and status.
6. The Cloud Function creates a Firebase custom token for the target user.
7. The frontend calls `signInWithCustomToken`.

The QR URL should look like:

```text
https://example.com/login-pass?p=<long-random-token>
```

If a user is already logged in and scans another teacher's QR code, the UI should
show a clear confirmation before switching accounts.

Do not enable permanent QR login for `systemAdmin` accounts in the first
version. Consider password login or short-lived QR passes for admin accounts.

## School Names And Canonical Schools

Do not automatically create a formal `schools/{schoolId}` record every time a
teacher types an unknown school name. That can create duplicate schools such as:

```text
小太陽森林幼兒園
小太陽森林
小太陽森林幼稚園
小太陽 森林幼兒園
```

For custom input, first store a snapshot on the file:

```text
schoolId: ""
schoolNameSnapshot: "小太陽森林幼兒園"
schoolInputSnapshot: "小太陽森林幼兒園"
```

After an administrator verifies the school, create a formal school record with a
Firestore-generated ID:

```text
schools/{schoolId}
  name: "小太陽森林幼兒園"
  normalizedName: "小太陽森林幼兒園"
  status: "active"
```

## School Aliases And Merges

If two school records later turn out to represent the same real school, keep a
canonical link instead of deleting history.

Example:

```text
schools/{mainSchoolId}
  name: "小太陽森林幼兒園"
  status: "active"

schools/{aliasSchoolId}
  name: "小太陽森林"
  status: "merged"
  canonicalSchoolId: "{mainSchoolId}"
```

For typed aliases:

```text
schoolAliases/{aliasId}
  aliasName: "小太陽森林"
  normalizedAliasName: "小太陽森林"
  canonicalSchoolId: "{mainSchoolId}"
  status: "active"
  createdAt
  createdByUid
```

When a teacher enters a known alias, the system can automatically resolve it to
the canonical school while still preserving the original input snapshot if
needed.

## E2E Rollout

The next implementation work should happen in `/e2e/` first:

1. Add role constants and permission helper functions.
2. Add `globalRoles` support for the two test system administrator accounts.
3. Add school membership data structures.
4. Add audit log writes for admin actions.
5. Prototype password reset link creation through Cloud Functions.
6. Prototype permanent QR login for teacher accounts only.
7. Add E2E tests before enabling the feature in production.

## E2E Seed Accounts

The following production test accounts are intended to be copied into the E2E
Firebase project and used as future system administrator test accounts:

```text
0926994595
teacher01
```

The copy operation should not move or delete production data. It creates or reuses
the matching E2E Firebase Auth users, then copies `users/{uid}` and nested user
subcollections from production to E2E. Because Firebase Auth UIDs are different
between projects, the script rewrites known source UIDs to their matching E2E
UIDs while copying.

The copy script is:

```text
scripts/copy-users-to-e2e.mjs
```

Run it by passing credentials through an environment variable. Do not commit
passwords or put them in this document.

```powershell
$env:COPY_E2E_USERS_JSON='[{"username":"<username>","password":"<password>"}]'
pnpm run copy:e2e-users
Remove-Item Env:COPY_E2E_USERS_JSON
```

During this copy, the target E2E user profile receives:

```text
globalRoles: ["systemAdmin"]
```

This is for E2E development of the future administration features only. Do not
treat this as a production authorization rollout until Firestore rules, Cloud
Functions, and admin UI flows have been reviewed.
