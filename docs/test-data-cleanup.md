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
- Checks Firestore recursively from root collections.
- Exports Firebase Auth users through Firebase CLI and checks test prefixes in
  UID, email, and display name.
- Does not delete or modify data.

Exit codes:

- `0`: clean; no matching test data found and scan completed.
- `1`: script or permission error.
- `2`: matching test data remains, or Firestore scan was truncated.

## Common Commands

Check E2E:

```bash
pnpm cleanup:check -- --project e2e
```

Check production explicitly:

```bash
pnpm cleanup:check -- --project default --prefix prod_smoke_
```

Skip Firebase Auth export when only Firestore needs to be checked:

```bash
pnpm cleanup:check -- --project e2e --skip-auth
```

Increase scan coverage:

```bash
pnpm cleanup:check -- --project e2e --max-documents 20000
```

Machine-readable output:

```bash
pnpm cleanup:check -- --project e2e --json
```

## Cleanup Contract

Future tests that write data should use a stable, searchable marker:

- Username prefixes: `e2e_` for E2E, `prod_smoke_` for production smoke tests.
- File names, roster names, log usernames, and QR pass target usernames should
  preserve the same prefix.
- Cleanup scripts should remove data by the same prefix contract.

The check script must remain read-only. Destructive cleanup should be implemented
as a separate explicit command.
