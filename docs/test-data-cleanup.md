# Test Data Cleanup Checks

This document records the first cleanup safety mechanism for E2E and future
production smoke tests.

## Current Script

```bash
pnpm cleanup:check
```

Default behavior:

- Project: `e2e` alias from `.firebaserc` (`fitness-test-tool-e2e`)
- Prefixes: `e2e_`, `prod_smoke_`, `test_cleanup_`
- Checks Firestore with index-friendly marker queries by default.
- Exports Firebase Auth users through Firebase CLI and checks test prefixes in
  UID, email, and display name.
- Does not delete or modify data.

Exit codes:

- `0`: clean; no matching test data found and scan completed.
- `1`: script or permission error.
- `2`: matching test data remains, or deep Firestore scan was truncated.

## Common Commands

Check E2E:

```bash
pnpm cleanup:check -- --project e2e
```

Check production explicitly:

```bash
pnpm cleanup:check -- --project default --prefix prod_smoke_
```

Check one exact run:

```bash
pnpm cleanup:check -- --project default --test-run-id prod_smoke_20260726_001
```

Skip Firebase Auth export when only Firestore needs to be checked:

```bash
pnpm cleanup:check -- --project e2e --skip-auth
```

Run legacy deep scan for older data that does not have test markers:

```bash
pnpm cleanup:check -- --project e2e --deep-scan --max-documents 20000
```

Machine-readable output:

```bash
pnpm cleanup:check -- --project e2e --json
```

## Cleanup Contract

Future tests that write data should use a stable, searchable marker:

- Username prefixes: `e2e_` for E2E, `prod_smoke_` for production smoke tests.
- Every Firestore document written by a test should include:
  - `isTestData: true`
  - `testDataPrefix: "e2e_" | "prod_smoke_" | "test_cleanup_"`
  - `testRunId: "<stable run id>"`
  - `createdByTest: "<test suite or script name>"`
- File names, roster names, log usernames, Auth emails, and QR pass target
  usernames should preserve the same prefix.
- Cleanup scripts should remove data by the same prefix contract.

## Fast Query Mode Versus Deep Scan

Fast mode is the default. It uses Firestore `runQuery` against known collection
root collections and marker fields such as `isTestData`, `testDataPrefix`, and
`testRunId`. This is the mode intended for production smoke tests. It avoids
collection-group queries so the check does not require extra Firestore indexes.

Fast mode only proves cleanup for data that follows the marker contract. Older
test data that only contains username prefixes may not be found by fast mode.

Deep scan is for auditing old data that did not follow the marker contract. It
recursively lists documents and searches text values for prefixes, so it can be
slow and may be truncated by `--max-documents`.

The check script must remain read-only. Destructive cleanup should be implemented
as a separate explicit command.

## Manual Feature-Validation Accounts

Accounts used by people to inspect a feature are not E2E-run accounts. In the E2E
Firebase project they use friendly, school-based usernames such as
`wenshan_teacher_01`, and carry `isManualValidationAccount: true` plus
`accountPurpose: "manual-feature-validation"`. They deliberately do **not** use
the `e2e_` prefix and are excluded from E2E cleanup by default.

The current starter set can be previewed without making changes:

```bash
pnpm seed:manual-school-accounts
```

Apply the six legacy-account renames and add teachers 2–3 for each school only
after reviewing the preview:

```bash
pnpm seed:manual-school-accounts -- --apply
```
