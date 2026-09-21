# Current Work — obsidian-gtd-matrix-tasks

## Objective
Add one-way Google Calendar projection for open Start-dated tasks while preserving Obsidian as the source of truth and preventing duplicate events across edits and devices.

## Status
Implementation committed and pushed to `origin/master` as `0bdc629` (`feat: add one-way Google Calendar sync`), and deployed locally as v1.1.0. Automated verification passes. Live Obsidian reload and real Google OAuth/API verification remain pending because this host exposes neither the Obsidian CLI nor native-app UI control, and OAuth credentials have not been created.

## Completed
- Added deterministic hidden-UUID identity, Google-safe event IDs, and private extended properties.
- Added private/busy fixed-time event generation (default 07:00, 30 minutes, selected calendar timezone).
- Added create/update/delete reconciliation with one-way overwrite semantics and no duplicate-on-rename behavior.
- Added 15-second debounced startup/change sync, manual Sync now, retry-safe pending/error status, and non-blocking failures.
- Added Google OAuth authorization-code flow using a personal Apps Script HTTPS callback and per-device Obsidian Secret Storage.
- Added writable-calendar loading/selection and retained-old-calendar boundary.
- Added Apps Script callback source and setup guide.
- Hid UUID comments from parsed descriptions and preserved them during inline renames.
- Bumped plugin to 1.1.0 and minimum Obsidian version to 1.11.4.

## Important Decisions
- Only open `🛫 Start` tasks sync; Due and Scheduled do not.
- Completing/cancelling/removing Start deletes the managed event.
- Every task overlaps at the fixed configured start time; no free/busy placement.
- Recurrence remains owned by Obsidian; only the current open occurrence syncs.
- Switching destination calendars does not clean the former calendar.
- Google device flow was rejected because its allowed scopes exclude Calendar; Apps Script relays the OAuth callback without storing tokens or Calendar data.

## Changed Files
- `src/calendar/*`
- `src/main.ts`, `src/settings-tab.ts`, `src/types.ts`, `src/parser.ts`
- `tests/calendar-*.test.ts`, `tests/google-*.test.ts`, `tests/parser.test.ts`
- `companion/google-oauth-callback/Code.gs`
- `docs/google-calendar-setup.md`
- `manifest.json`, `package.json`, `package-lock.json`

## Verification
- `vitest run`: 251/251 passed across 22 files.
- `tsc --noEmit`: passed.
- Production esbuild: passed.
- Deployed to `C:\Users\josef\Documents\2nd Brain\.obsidian\plugins\gtd-matrix-tasks`.
- Deployed manifest reports v1.1.0 / minAppVersion 1.11.4.

## Next
1. Reload GTD Matrix Tasks in Obsidian and confirm no runtime errors.
2. Follow `docs/google-calendar-setup.md` to create the personal Google Cloud OAuth client and Apps Script callback.
3. Connect on desktop, load/select the target calendar, and run Sync now.
4. Verify create, rename, Start-date change, completion deletion, manual Google deletion recovery, and no duplicates.
5. Connect once on mobile and repeat a smoke test.

## Blockers / Unknowns
- No Google OAuth credentials or live calendar were available, so external integration is not yet proven.
- Native Obsidian UI control and Obsidian CLI were unavailable, so live plugin reload/runtime error inspection is pending.
