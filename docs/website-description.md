# Website Description for Estimation

This project is not a simple brochure site or a one-page CRUD demo. It is a domain-specific operational web system for kindergarten physical fitness testing, with real business rules, cloud data, sharing, reporting, and mobile usage considerations.

## Product Purpose

The system is used by kindergarten teachers and school staff to:

- create and manage class files
- maintain student rosters
- record physical fitness test results
- convert raw scores into ability scores by grade-specific rules
- generate visual reports and PDFs
- share files with other teachers for collaborative editing
- add friends through QR / barcode invite flows
- use the system on both desktop and mobile devices

## Why This Is More Complex Than a Typical Website

The site already contains multiple subsystems that interact with each other:

- authentication and user profile management
- friend relationships and friend requests
- file ownership and shared editing
- grade-specific scoring rules
- mixed-age class handling
- PDF/report generation
- mobile-specific interaction tuning
- logging and diagnostics

This makes it closer to a small custom management system or vertical SaaS prototype than to a normal marketing site.

## Major Functional Areas

### 1. Authentication and Account System

- Firebase Authentication is used under a username/password experience
- user profiles are stored in Firestore
- users can set their own display nickname
- each user can also assign custom nicknames to friends

This means the system already has account-level identity logic beyond basic login/logout.

### 2. Friend System

- users can send and receive friend requests
- outgoing requests can be cancelled
- incoming requests can be accepted or rejected
- QR / barcode invite flow is supported
- invite links open a dedicated invite page rather than only a modal
- invite UI has feedback states and short-term client-side traces for debugging

This is a real social / relational feature set, not just a contact list.

### 3. Cloud File System

- each user owns cloud files under their own account
- users can create, switch, archive, and manage multiple files
- last opened file is restored automatically
- file lists and current-file behavior are integrated into the main workflow

The site is no longer a local-only tool; it behaves like a persistent cloud workspace.

### 4. File Sharing and Collaborative Editing

The project supports shared editing between teachers.

Current structure:

- owner files live under `users/{ownerUid}/files/{fileId}`
- shared recipients have an index under `users/{recipientUid}/sharedFiles/{ownerUid__fileId}`
- owner files contain `sharedWith`

This means the project already includes:

- ownership logic
- recipient indexing
- shared file visibility
- collaborative access management

This area has already gone through real bug fixing and data-model evolution, which is usually a sign of production-style complexity.

### 5. Roster and Test Data Management

The app includes separate work areas for:

- file editing
- student roster management
- metric-by-metric batch entry
- report table editing
- final report preview

The workflow is structured for practical teacher usage rather than generic data entry.

### 6. Grade and Scoring Rules

The site supports these class labels:

- 幼幼班
- 小班
- 中班
- 大班
- 混齡班

It also supports configurable ability-rule profiles that can be assigned to different grades.

This is important because the scoring system is not hardcoded to one static rule set.

### 7. Mixed-Age Class Logic

Mixed-age classes are one of the more advanced features:

- each student can carry their own grade
- the system decides which rule set applies per student
- younger and older students in the same class can use different test items and scoring rules
- reports and summaries adapt per student

This is a real business-rule complexity multiplier.

### 8. Reporting and PDF Output

The reporting system includes:

- A4 report layout
- radar chart rendering
- six-item performance summary
- PDF export
- PNG/debug rendering workflow
- auto-generated observation and encouragement text

The report UI has already been iteratively tuned, including:

- radar label positioning
- summary alignment
- logo/header placement
- mobile preview behavior

So this is not a basic export button on top of raw data; it is a custom report engine.

### 9. Mobile Optimization

The project has already required specific mobile work, including:

- responsive tab treatments
- file-center mobile layout changes
- sheet zoom choices
- canvas scrolling and image preview behavior
- mobile report preview interactions

This means mobile usability is a real part of scope, not an afterthought.

### 10. Experimental and Maintenance Pages

The project includes:

- `/lab/` for experimental UI and feature work
- `/debug/` for ability-rule maintenance

This increases delivery value because the project already has dedicated surfaces for safe iteration and maintenance.

### 11. Logging and Diagnostics

The project has:

- top-level `systemLogs`
- phased logging such as `started`, `completed`, and `failed`
- frontend issue reporting and load checkpoints
- invite trace feedback for debugging request flows

This is operational tooling, not just end-user UI.

## Technical Complexity Summary

From an estimation perspective, this project should be treated as:

- a custom operational web application
- with cloud persistence
- relational features
- collaborative workflows
- rule-based scoring
- reporting / export logic
- mobile adaptation
- maintenance surfaces

It should **not** be priced as:

- a static website
- a simple admin template
- a one-screen Firebase demo

## Estimation Notes for Other Sessions

If another session is estimating this website, it should account for:

- business-rule complexity
- mixed-age logic
- dynamic scoring rules
- shared editing architecture
- friend / invite workflows
- report rendering and PDF generation
- mobile layout tuning
- debugging and support tooling
- Firebase data consistency risk

## One-Line Summary

This website is a real kindergarten fitness testing management system with cloud files, sharing, reporting, mixed-age rule handling, and mobile usability work; it is much closer to a small custom SaaS-style system than to a normal website.
