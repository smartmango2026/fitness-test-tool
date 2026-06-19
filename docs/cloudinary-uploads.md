# Cloudinary Upload Notes

This project uses Cloudinary for diagnostic report screenshots.

The cross-project SOP is stored outside this repository in the user's local SOP
folder. Keep long-term Cloudinary account and preset operations there, and keep
this repository document focused on project-specific integration notes.

## Current Cloudinary Settings

- Cloud name: `dvqmyafug`
- Upload preset: `fitness_test_tool_diagnostic_unsigned`
- Upload mode: unsigned browser upload
- Target folder: `diagnostic-reports`

The upload preset was created with Cloudinary Admin API credentials stored
locally in:

```text
C:\Users\user\.openclaw-dev\.env
```

Expected local variables:

```text
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Do not commit API keys or API secrets to this repository. The browser app should
only use `cloud_name` and `upload_preset`.

## Why Cloudinary Was Added

Firebase Storage uploads were tested from both local Vite and GitHub Pages. In
both cases the upload request failed before upload progress began:

- Local origin: `http://127.0.0.1:4173`
- Production origin: `https://smartmango2026.github.io`
- Failing endpoint: `https://firebasestorage.googleapis.com/v0/b/fitness-test-tool-42789.firebasestorage.app/o`
- Observed response: `404 Not Found` during the browser preflight/upload path

Plain diagnostic report submission still works through Firestore. The failure is
specific to screenshot file upload through Firebase Storage.

## Upload Preset Setup

The unsigned preset was created through the Cloudinary Admin API.

Preset name:

```text
fitness_test_tool_diagnostic_unsigned
```

Confirmed settings:

- `unsigned`: `true`
- Uploads are routed under `diagnostic-reports`

## Successful Upload Test

Unsigned upload test succeeded with:

- Public ID: `diagnostic-reports/wmqgmu56vceaiimi6kft`
- Secure URL: `https://res.cloudinary.com/dvqmyafug/image/upload/v1781504839/diagnostic-reports/wmqgmu56vceaiimi6kft.jpg`
- Format: `jpg`
- Size: `49,663 bytes`
- Dimensions: `582 x 1280`

## Browser Upload Shape

The frontend can upload screenshots without exposing secrets by posting form
data to:

```text
https://api.cloudinary.com/v1_1/dvqmyafug/image/upload
```

Required form fields:

```text
file=<image file>
upload_preset=fitness_test_tool_diagnostic_unsigned
```

Expected response fields to store in Firestore diagnostic reports:

- `public_id`
- `secure_url`
- `bytes`
- `format`
- `width`
- `height`
- `resource_type`

## Local Unsigned Upload Test

This is a secret-free test and should work from any local shell with Node 18+:

```js
const fs = require("node:fs");
const path = require("node:path");

const cloudName = "dvqmyafug";
const uploadPreset = "fitness_test_tool_diagnostic_unsigned";
const filePath = "D:/path/to/screenshot.jpg";

const form = new FormData();
const bytes = fs.readFileSync(filePath);
form.append("file", new Blob([bytes], { type: "image/jpeg" }), path.basename(filePath));
form.append("upload_preset", uploadPreset);

const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
  method: "POST",
  body: form,
});

const json = await response.json();
console.log(response.status, json.secure_url || json.error);
```

## Frontend Integration

Diagnostic report screenshots are uploaded from `src/features/diagnostics/diagnostics.ts` through the
Cloudinary unsigned upload endpoint, and the resulting Cloudinary metadata is
stored in the Firestore diagnostic report document.

The existing progress UI in `src/App.tsx` is still used. Cloudinary upload
progress is reported with `XMLHttpRequest.upload.onprogress`.
