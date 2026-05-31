# Time Estimate

This document is a rough effort estimate based on Git commit timestamps. It is useful for retrospective review, but it is not a timesheet.

## Summary

- Lowest conservative estimate:
  - about `18` hours
- Most reasonable estimate:
  - about `30` to `35` hours
- Wide upper bound if each commit day is treated as one continuous work span:
  - about `72` hours

For practical discussion, the recommended summary is:

- Estimated total effort: **about 30 to 35 hours**

## Estimation Method

The estimate was derived from commit timestamps in this repository.

Three interpretations were compared:

1. Tight session estimate
   - If two commits were more than `2` hours apart, they were treated as different work sessions.
   - Result: about `17.7` hours

2. Reasonable session estimate
   - If two commits were more than `3` to `6` hours apart, they were treated as different work sessions.
   - Result: about `29.2` to `37.0` hours

3. Daily span estimate
   - For each active day, time was counted from the first commit to the last commit of that day.
   - Result: about `72.0` hours

Because the first method is too conservative and the third method overstates actual effort, the middle range is the best approximation.

## Phase Breakdown

### Phase 1: Setup and first prototype

- Date range:
  - `2026-04-22`
- Focus:
  - project setup
  - GitHub Pages
  - first editable views
  - initial roster / radar / export flow
- Estimated effort:
  - about `1.8` hours

Representative commits:

- `0df178d` Add files via upload
- `a6765c9` Set up fitness test tool and Pages deploy
- `c25e20f` Polish roster, radar, and Excel export UX

### Phase 2: Editing UX, A4 reports, debug work, and mobile table tuning

- Date range:
  - `2026-04-29` to `2026-04-30`
- Focus:
  - main menu rework
  - PDF / A4 report foundation
  - debug page
  - roster grid and spreadsheet behavior
  - zoom, frozen columns, viewport fixes
  - mobile table readability
- Estimated effort:
  - about `7.5` to `8` hours

Representative commits:

- `1e4ba89` Rework main menu flow and add PDF page
- `32c5b1b` Add A4 canvas test tab with PDF export
- `7934a43` Add A4 radar report canvas with PDF export
- `351afd3` Add debug settings page
- `0accf65` Restore roster fit zoom and enlarge text

### Phase 3: Report consolidation, auth, and file hub transition

- Date range:
  - `2026-05-20` to `2026-05-24`
  - with a smaller follow-up on `2026-05-29`
- Focus:
  - merge A4 workflow into report tab
  - streamline PDF viewing and export
  - add Firebase auth
  - switch to username-based login
  - add file hub and account tab
- Estimated effort:
  - about `5` to `7` hours

Representative commits:

- `b9a906e` Merge A4 canvas workflow into PDF tab
- `cd1fc21` Streamline PDF report viewer and class export
- `0ad9abc` Add Firebase email auth entry points
- `7142882` Use usernames for Firebase auth
- `35efddd` Add file hub page
- `10b2f5e` Refine account tab

### Phase 4: Firebase cloud migration, friends, sharing, reports, and mobile polish

- Date range:
  - `2026-05-30` to `2026-05-31`
- Focus:
  - switch to new Firebase project
  - Firestore-based friends and QR add-friend flow
  - cloud files and manual save flow
  - cloud ability settings
  - report score mapping and observation generation
  - radar / summary layout refinement
  - nickname support
  - shared editing
  - mobile report preview interactions
- Estimated effort:
  - about `15` to `18` hours

Representative commits:

- `a08c8ee` Update report tab and Firebase project
- `ff91d9d` Add Firestore friend invites and QR flow
- `393e52d` Add cloud ability settings and file updates
- `4f77687` Add report score mapping and manual cloud saves
- `74f6806` Refine report debug and radar layout
- `0bd54b6` Add friend nickname customization
- `581a9c0` Improve shared file collaborator picker
- `e1cee41` Improve mobile report preview interactions

## Daily Activity Snapshot

These numbers are commit-span snapshots, not exact working hours.

- `2026-04-22`
  - 6 commits
  - first commit `15:32`
  - last commit `17:19`
  - span `1.79` hours

- `2026-04-29`
  - 5 commits
  - first commit `22:01`
  - last commit `22:33`
  - span `0.53` hours

- `2026-04-30`
  - 30 commits
  - first commit `00:56`
  - last commit `23:17`
  - span `22.35` hours

- `2026-05-20`
  - 10 commits
  - first commit `15:16`
  - last commit `19:12`
  - span `3.93` hours

- `2026-05-24`
  - 5 commits
  - first commit `00:06`
  - last commit `20:30`
  - span `20.40` hours

- `2026-05-29`
  - 1 commit
  - single timestamp only

- `2026-05-30`
  - 2 commits
  - first commit `20:19`
  - last commit `21:31`
  - span `1.19` hours

- `2026-05-31`
  - 19 commits
  - first commit `00:02`
  - last commit `21:51`
  - span `21.81` hours

## Notes

- Commit gaps do not prove the developer was idle; some work may have happened before a commit was made.
- A long same-day span does not prove continuous work; it only shows the first and last recorded commit that day.
- This document should be treated as a retrospective estimate, not payroll-quality time tracking.
