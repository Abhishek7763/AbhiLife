# AbhiLife Architecture Contract

## Purpose

AbhiLife is a private personal improvement system for a single user. Its job is to help move from raw thoughts to real goals, goals to plans, plans to next actions, and execution to a durable life history.

## Product rules

1. Daily use must stay simpler than the internal system.
2. No artificial life percentage or XP score is required.
3. Raw thoughts are not automatically goals.
4. Goals, habits, maintenance, unwanted habits, tasks, notes and reviews are separate concepts.
5. Missed actions are diagnostic information, not punishment.
6. Historical daily records must be preserved rather than overwritten by later summaries.
7. AI may assist later, but the core app must work without AI or internet access.

## Technical rules

### Application

- HTML + CSS + JavaScript
- Vite build
- Capacitor Android wrapper
- Android is the primary personal runtime
- Vercel/web build is secondary for preview and testing

### Personal data

- Personal data must never be committed to GitHub.
- Browser localStorage/IndexedDB must not become the master persistence layer.
- Primary data target: a user-owned Android `Documents/AbhiLife` location accessed through the native storage layer.
- Structured data: versioned JSON.
- Attachments: stored in original formats and referenced by structured records.
- Every data object must be migratable between schema versions.

### Safety

- Critical writes must use validation and recovery/snapshot strategy.
- A portable `.abhilife` full backup is part of the target architecture.
- Restoring or reconnecting existing data must be possible on a replacement phone.
- Application updates must not silently reset personal records.

## Target data flow

```text
Thought
  -> Goal Investigation
  -> Real Goal / Someday / Drop
  -> Strategy
  -> Milestones
  -> Weekly Actions
  -> Next Action
  -> Today
  -> Done / Partial / Missed / Skipped
  -> Review
  -> Replanning
  -> Permanent History
```

## Build sequence

1. Foundation and build verification
2. Data contracts and filesystem specification
3. Android folder/storage adapter
4. Safe-write and recovery engine
5. Life departments and Inbox
6. Goal investigation and goal definition
7. Goal breakdown and action planning
8. Today and Day Rescue
9. Habits, maintenance and unwanted-habit diagnosis
10. Weekly/monthly reviews
11. 365-day history, search and timeline
12. Backup/restore and data-health tools
13. Android polish
14. Rule-based intelligence
15. Optional AI assistance
16. Long-term stability audit

## Current foundation

Foundation v0.1 is intentionally non-persistent in the web preview. Native persistence will only be enabled after the Android storage contract is implemented and tested.
