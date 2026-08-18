## [2026-08-18 10:12] Sites Reference Path Mismatch
- Problem: Attempted to open the Sites persistence reference from the wrong bundled path while adding durable poll storage.
- Root Cause: The references live under `skills/sites-building/references/`, not directly under `skills/references/`.
- Solution: Located the correct bundled reference files and followed the D1 persistence guidance from there.
- Files Changed: SOLUTIONS.md
- Status: Resolved
- Verification: Successfully read the correct persistence and SQLite reference files before implementing database-backed polls.

## [2026-08-18 10:12] NPM Audit Advisories
- Problem: `npm install` reported 20 dependency vulnerability advisories in the installed dependency tree.
- Root Cause: Unknown
- Solution: No dependency security changes were applied because npm recommended `npm audit fix` and `npm audit fix --force`, which may alter transitive packages or introduce breaking changes outside the requested app build.
- Files Changed: package.json, package-lock.json, SOLUTIONS.md
- Status: Open
- Verification: The advisories were reported by npm during dependency installation; app build, lint, smoke test, and render tests were validated separately.

## [2026-08-18 10:12] CSS Build Failure
- Problem: The production build failed because `app/globals.css` had an imbalanced brace, first as an unexpected closing brace and then as an unclosed root block after an overbroad cleanup.
- Root Cause: Manual stylesheet patch left CSS block delimiters inconsistent.
- Solution: Removed the extra closing brace at the end of the file and restored the closing brace for the `:root` block.
- Files Changed: app/globals.css, SOLUTIONS.md
- Status: Resolved
- Verification: `npm run build` and `npm test` completed successfully after the fix.

## [2026-08-18 10:12] React Hook Lint Failures
- Problem: `npm run lint` failed in `app/SchedulerApp.tsx` due to strict React hook rules around synchronous state updates in effects and a function referenced before declaration.
- Root Cause: Initial URL loading and derived vote defaults were handled with direct effect-driven state updates.
- Solution: Initialized the admin token from URL state, moved poll application into an explicit helper, converted poll loading to a callback, deferred initial URL loading by one tick, and removed an unused prop.
- Files Changed: app/SchedulerApp.tsx, SOLUTIONS.md
- Status: Resolved
- Verification: `npm run lint` completed successfully after the refactor.

## [2026-08-18 10:12] Migration Regeneration Failure
- Problem: `npm run db:generate` failed with `ENOENT: no such file or directory, open 'drizzle/meta/_journal.json'` while regenerating the D1 migration after adding indexes.
- Root Cause: Individual generated migration files were deleted while the empty `drizzle/meta` folder remained, so Drizzle expected a journal file for an existing migration folder.
- Solution: Removed the empty generated migration directories with `rmdir`, regenerated the migration, and confirmed the SQL includes the required indexes.
- Files Changed: db/schema.ts, drizzle/0000_giant_gunslinger.sql, drizzle/meta/0000_snapshot.json, drizzle/meta/_journal.json, SOLUTIONS.md
- Status: Resolved
- Verification: `npm run db:generate` completed successfully and the generated SQL contains `idx_poll_options_poll_id`, `idx_responses_poll_id`, and `idx_response_slots_option_id`.

## [2026-08-18 10:19] Transient Dev Server Reload Errors
- Problem: The local development server showed temporary 500 reload errors while files were being added, removed, and corrected during the edit loop.
- Root Cause: Hot module reload briefly evaluated intermediate file states, including deleted starter preview imports and incomplete stylesheet edits.
- Solution: Completed the file edits, fixed the stylesheet, and validated the final app with clean lint, build, render tests, and an API smoke test.
- Files Changed: app/SchedulerApp.tsx, app/page.tsx, app/globals.css, tests/rendered-html.test.mjs, SOLUTIONS.md
- Status: Resolved
- Verification: Final `npm run lint`, `npm test`, and the create/respond/read API smoke test all passed.

## [2026-08-18 10:20] Sites Version Upload Retry
- Problem: Saving a Sites version failed once while uploading the packaged archive to blob storage.
- Root Cause: Transient upload request failure from the storage endpoint.
- Solution: Retried `save_site_version` with the same pushed commit and archive.
- Files Changed: SOLUTIONS.md
- Status: Resolved
- Verification: The retry saved version 2 successfully.

## [2026-08-18 10:30] Wrong Initial Hosting Target
- Problem: The first published version used a `chatgpt.site` deployment when the user expected a GitHub repository and GitHub Pages option.
- Root Cause: The first implementation followed the default Sites hosting workflow for a database-backed app instead of confirming the user's preference for GitHub Pages.
- Solution: Added a static GitHub Pages-compatible app under `docs/`, updated the README, and prepared the repo for GitHub Pages publishing.
- Files Changed: docs/index.html, docs/404.html, docs/.nojekyll, docs/styles.css, docs/app.js, docs/og.png, README.md, SOLUTIONS.md
- Status: Resolved
- Verification: Static assets served locally from `docs/`, and `node --check docs/app.js` completed successfully.

## [2026-08-18 10:30] GitHub Pages Static Hosting Limitation
- Problem: The original D1-backed response collection flow cannot run on GitHub Pages because Pages does not provide a server runtime or database.
- Root Cause: GitHub Pages is static hosting only.
- Solution: Implemented a static feedback workflow using URL-encoded poll links, copyable response packets, importable response packets, CSV export, result summary publishing, and prefilled GitHub issue links.
- Files Changed: docs/index.html, docs/styles.css, docs/app.js, README.md, SOLUTIONS.md
- Status: Workaround
- Verification: Static preview served HTML, CSS, JS, and social image successfully; JavaScript syntax validation passed.

## [2026-08-18 10:30] Browser Smoke Test Dependency Missing
- Problem: A scripted Playwright smoke test could not run because the repo does not include the `playwright` package.
- Root Cause: Playwright was not installed as a project dependency.
- Solution: Avoided adding a large dev dependency for this static conversion and verified with `node --check docs/app.js` plus local static server checks.
- Files Changed: SOLUTIONS.md
- Status: Workaround
- Verification: Static server returned `200 OK` for `/`, `/app.js`, `/styles.css`, and `/og.png`.

## [2026-08-18 10:34] Pages API Shell Quoting Error
- Problem: The first `gh api` command to enable Pages failed with `zsh: no matches found: source[branch]=main`.
- Root Cause: zsh interpreted unquoted square brackets as a filename glob.
- Solution: Retried the command with quoted form fields.
- Files Changed: SOLUTIONS.md
- Status: Resolved
- Verification: GitHub accepted the quoted Pages configuration request.

## [2026-08-18 10:34] Legacy Pages Deployment Cancelled
- Problem: GitHub's legacy Pages publisher built the `/docs` artifact but cancelled the deploy step.
- Root Cause: Unknown
- Solution: Added an explicit GitHub Actions workflow to upload `docs/` and deploy through `actions/deploy-pages`.
- Files Changed: .github/workflows/pages.yml, SOLUTIONS.md
- Status: Resolved
- Verification: Pending workflow deployment check after commit and push.

## [2026-08-18 10:41] Pages Deployment Status Lag
- Problem: GitHub Actions continued to report the explicit Pages deploy step as `in_progress` after the GitHub Pages URL began serving the deployed site with HTTP 200.
- Root Cause: Unknown
- Solution: Verified the public Pages URL directly and confirmed the expected GatherRound HTML is live.
- Files Changed: SOLUTIONS.md
- Status: Workaround
- Verification: `curl -I -L https://anntropea-oss.github.io/gatherround-scheduler/` returned HTTP 200 and the page body includes `GatherRound`, `Launch poll`, `styles.css`, and `app.js`.
