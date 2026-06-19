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
- The site may later be used by schools that are not known to the team ahead of time.
- Existing files may not have school information, so the system must continue to support school-less files.

## Updated UX Direction: Combobox Instead Of Fixed List

The early implementation used a small fixed school list because the first known cases were controlled internally. After discussing possible use by unknown schools, a backend-only managed list may be too rigid.

The preferred next experiment is a hybrid input:

- The field looks like a normal text input.
- When the user types part of a school name, matching suggestions appear below the field.
- The user can select a known suggestion, such as `何嘉仁`, `吉的堡`, or `聰明動`.
- The user can also keep a custom typed school name if the school is not in the suggestion list.
- Known schools can still carry managed metadata later, such as logo URL, display name, or verified status.
- Unknown typed schools should be stored as text first and can be reviewed or normalized later.

This interaction is similar to a country selector where typing `Ta` may show `Taiwan`, but the product should not require every possible school to be registered by an admin before a teacher can create a file.

Recommended field behavior for the first prototype:

- Store `schoolNameSnapshot` as the safe, always-available value.
- Store `schoolId` only when the user picks a known managed school.
- If the user types a custom value, leave `schoolId` empty and preserve the text in `schoolNameSnapshot`.
- Keep the current fixed school options as suggestions, not as the only allowed answers.
- Add a lab page prototype before changing the formal teacher workflow.

Future maintenance ideas:

- Add duplicate detection for similar school names.
- Let admins merge or verify frequently used custom school names.
- Attach logos only to verified school records.
- Keep old file/report snapshots stable even if a school record is later merged or renamed.

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
