# System Logs

This document describes the current `systemLogs` design used by the app.

## Purpose

`systemLogs` is the append-only event stream for important user actions:

- user registration
- sign-in / sign-out
- friend invite creation and friend request flow
- friend removal
- nickname updates
- file creation / open / save / archive
- file sharing / revoke sharing
- file metadata updates

It is not the source of truth for business state. Business state still lives in:

- `users/{uid}`
- `users/{ownerUid}/files/{fileId}`
- `users/{recipientUid}/sharedFiles/{ownerUid__fileId}`
- `users/{uid}/friends/{friendUid}`

## Collection

- Top-level collection: `systemLogs`

Each write creates a new document. Existing log documents are never updated or deleted by the app.

## Core Fields

Each log entry may contain:

- `operationId`
  - groups multiple phases of the same action
- `actionType`
  - event name such as `file_shared`
- `phase`
  - one of:
    - `started`
    - `completed`
    - `failed`
- `actorUid`
- `actorUsername`
- `actorDisplayName`
- `targetUid`
- `targetUsername`
- `ownerUid`
- `fileId`
- `fileName`
- `requestId`
- `inviteId`
- `message`
- `payload`
- `createdAt`

## Current Action Types

- `user_registered`
- `user_signed_in`
- `user_signed_out`
- `friend_invite_created`
- `friend_request_created`
- `friend_request_accepted`
- `friend_request_rejected`
- `friend_removed`
- `profile_nickname_updated`
- `friend_nickname_updated`
- `friend_nickname_reset`
- `file_created`
- `file_opened`
- `file_saved`
- `file_info_updated`
- `file_archived`
- `file_shared`
- `file_share_revoked`

## Important Limitation

Not every failure can reach `systemLogs`.

Examples:

- sign-in failure before authentication succeeds
- first-page boot failure before Firebase is usable
- client runtime failure before the log write path is available

Those cases should still be handled in the frontend through:

- visible error messages
- screenshot-friendly diagnostics
- optional local cache / localStorage debug records in future iterations

## Firestore Rules

Current behavior:

- signed-in users can read `systemLogs`
- signed-in users can create log entries
- only `started` / `completed` / `failed` phases are accepted
- update and delete are denied

## Design Intent

The current design favors:

- simple append-only writes
- low operational overhead
- readable troubleshooting history

It does not yet provide:

- server-side guaranteed logging
- immutable actor verification beyond current client auth context
- automatic cross-checking between logs and business state

If future scale or audit needs grow, the next likely step is moving critical multi-document actions to a backend flow and keeping `systemLogs` as the event record written from that flow.
