# School Data And Report Logo Plan

## Purpose

This document records the planned direction for adding school data to the fitness test tool.

The immediate product need is to let exported student reports show a school's logo when a school wants branded reports. The broader data need is to support both ordinary teachers who usually belong to one school and studio teachers who may create files for many different schools.

This is a planning document only. It does not mean the feature has already been implemented.

## Current Context

- Teachers currently create fitness test files under their own account.
- Files already contain class-level data such as class name and test date.
- Reports currently use a general report template and do not know which school the file belongs to.
- Some accounts belong to Smart Sport / studio teachers, and those teachers may work with multiple schools.
- Some school teachers may only need one school as their default context.
- Existing files may not have school information, so the system must continue to support school-less files.

## Recommended Data Model

Treat school as an independent data entity instead of storing only free-text school names on files.

Suggested Firestore shape:

```text
schools/{schoolId}
  name: string
  shortName?: string
  reportDisplayName?: string
  logoUrl?: string
  logoStoragePath?: string
  status: "active" | "archived"
  createdAt: timestamp
  updatedAt: timestamp
```

Suggested user fields:

```text
users/{uid}
  username: string
  displayNickname?: string
  role?: "teacher" | "studioTeacher" | "admin"
  defaultSchoolId?: string
  schoolIds?: string[]
```

Suggested file fields:

```text
users/{uid}/files/{fileId}
  schoolId?: string
  schoolNameSnapshot?: string
  schoolLogoSnapshotUrl?: string
  className: string
  testDate: string
  records: FitnessRecord[]
```

## Why School Should Be Separate

Using a separate `schools` collection avoids common long-term problems:

- The same school name may be typed in several different ways.
- A logo may need to be updated once and reused across many files.
- A studio teacher may need to switch between many schools.
- A school may later need school-level settings, report names, or access control.
- Future admin screens can manage schools without editing every test file.

## Why Files Should Store A Snapshot

Each file should store both a reference and a snapshot when practical.

- `schoolId` keeps the file connected to the school entity.
- `schoolNameSnapshot` preserves the school name used when the file/report was created.
- `schoolLogoSnapshotUrl` preserves the logo used for that report version.

This prevents old reports from changing unexpectedly if a school later changes name or replaces its logo.

If the product decision changes and old reports should always use the latest logo, the report renderer can prefer live school data over the snapshot. For now, snapshot fields are safer for historical reports.

## User Types

### Ordinary School Teacher

- Usually belongs to one school.
- The file creation flow can default to `defaultSchoolId`.
- The teacher may not need to manually choose a school each time.

### Smart Sport / Studio Teacher

- May work across multiple schools.
- File creation should require choosing a school when more than one school is available.
- The selected school should be saved on the file.

### School-Less Or Test File

- `schoolId` can be empty.
- The report should use the generic report layout without school branding.
- This keeps current test files and old files compatible.

## Report Rendering Behavior

When generating a PDF report:

1. Read the current file.
2. If `schoolLogoSnapshotUrl` exists, use it.
3. Otherwise, if `schoolId` exists, optionally load the school and use `logoUrl`.
4. If no school logo exists, render the generic report template.
5. Show `schoolNameSnapshot`, `reportDisplayName`, or school `name` when available.

The report should still work if the school record is missing, archived, or temporarily unavailable.

## Suggested Implementation Phases

### Phase 1: Data Compatibility

- Add optional school fields to the file type.
- Keep all existing files valid without migration.
- Do not require school selection yet.
- Update the report renderer so missing school data falls back to the generic template.

### Phase 2: School Selection On File Creation

- Add a school field to the create/edit file flow.
- Allow empty school for test or generic files.
- For users with one school, default to that school.
- For users with multiple schools, make school selection obvious.

### Phase 3: School Collection And Admin Data

- Add `schools/{schoolId}` records.
- Add `schoolIds` and `defaultSchoolId` to users.
- Add a small admin/editor flow for creating and updating school names and logos.

### Phase 4: Logo Upload And Report Branding

- Allow uploading or assigning a school logo.
- Store logo URLs in the school record.
- Save school name/logo snapshots when creating or updating files.
- Render the logo in the PDF report.

### Phase 5: Permissions And Maintenance

- Decide who can create/edit school records.
- Decide whether studio teachers can see all schools or only assigned schools.
- Add validation and maintenance tools for duplicate schools.

## Open Decisions

- Should old reports always keep the original logo, or always show the newest school logo?
- Who is allowed to create schools?
- Can ordinary teachers edit their school logo, or only admins/studio staff?
- Should school data be global under `/schools`, or scoped under an organization if the app later supports multiple organizations?
- Should every file require a school once the feature is mature, or should generic files remain allowed?

## Recommended Near-Term Decision

For the first implementation, keep the feature optional and low-risk:

- Add optional `schoolId`, `schoolNameSnapshot`, and `schoolLogoSnapshotUrl` to files.
- Add a generic report fallback.
- Do not force migration of existing files.
- Do not require all teachers to choose a school yet.

This supports school-branded reports without blocking current workflows.
