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

## [2026-08-18 18:34] Render Test Copy Drift
- Problem: `npm test` failed because the server-rendered shell test still expected the old one-page copy: `Find a meeting time`, `Launch poll`, and `Candidate times`.
- Root Cause: The app shell was redesigned around separate create/respond entry points and renamed available time language, but the test assertions were not updated with the product copy.
- Solution: Updated the render test to assert the new home screen copy: `Find the best time to meet, once or every week`, `Create a scheduling poll`, and `Respond to a poll`.
- Files Changed: tests/rendered-html.test.mjs, SOLUTIONS.md
- Status: Resolved
- Verification: `npm test` completed successfully after the assertion update.

## [2026-08-18 18:38] Weekly Time Row Clipping
- Problem: Browser verification showed the weekly available-time row fit the panel but clipped the native time input text and longer labels such as `Wednesday lunch-ish`.
- Root Cause: The three-column weekly grid reserved too little space for the browser's native time control and the label input.
- Solution: Rebalanced the weekly grid columns and set a minimum width for `input[type="time"]` inside weekly available-time rows.
- Files Changed: app/globals.css, SOLUTIONS.md
- Status: Resolved
- Verification: Browser checks at 1280px and 390px showed no horizontal overflow, no controls outside the viewport, and readable weekly time rows.

## [2026-08-18 18:38] Browser Verification Script Mismatches
- Problem: Two browser verification commands failed during local UI checks: one used an unsupported `networkidle` wait state, and another redeclared a persistent REPL variable.
- Root Cause: The browser wrapper differed from the documented wait-state support, and the Node REPL keeps top-level bindings between commands.
- Solution: Re-ran the checks with the supported `load` wait state and reusable `globalThis` bindings.
- Files Changed: SOLUTIONS.md
- Status: Resolved
- Verification: Subsequent desktop and mobile browser checks completed successfully.

## [2026-08-18 19:13] Static Pages Workflow Confusion
- Problem: The GitHub Pages entry point and README still described the static workaround with response packets, imports, GitHub issues, and publish-result controls after the real app had moved to direct response saving.
- Root Cause: The earlier GitHub Pages fallback remained documented and user-facing even though the product direction returned to the full-stack app.
- Solution: Replaced the Pages entry point with a project hub that links to the real app and updated the README to explain that GitHub Pages is static while the full-stack build is the actual scheduling product.
- Files Changed: README.md, docs/index.html, docs/styles.css, SOLUTIONS.md
- Status: Resolved
- Verification: `rg` found none of the confusing workflow phrases in README.md, docs/index.html, app/SchedulerApp.tsx, or tests/rendered-html.test.mjs; `node --check docs/app.js`, `npm run lint`, and `npm test` completed successfully.

## [2026-08-18 19:15] Owner-Only Preview Access
- Problem: The deployed Sites URL returned HTTP 401 to an unauthenticated request, which means it works as a private preview but is not yet suitable for attendee links.
- Root Cause: The site access policy is `custom` with only the owner account allowed.
- Solution: Deployed the current version privately and identified that switching to a public/shared deployment requires explicit user approval.
- Files Changed: SOLUTIONS.md
- Status: Open
- Verification: `curl -I -L https://gatherround-scheduler.atropea677558.chatgpt.site` returned HTTP 401; `get_site` reported `access_mode: custom` and `external_visitor_count: 0`.

## [2026-08-18 19:15] Sites Remote Verification Auth
- Problem: A final `git ls-remote sites` verification failed with `could not read Username` because the Sites remote requires per-command authentication.
- Root Cause: The command was run without the short-lived Sites `http.extraHeader` credential.
- Solution: Re-ran the remote check with the Sites bearer auth header.
- Files Changed: SOLUTIONS.md
- Status: Resolved
- Verification: Authenticated `git ls-remote` confirmed both `origin/main` and `sites/main` at `14f914ad13f4cf0ce6e9845d057ee4a8c8961668`.

## [2026-08-19 16:24] Sites Reference Path Mismatch
- Problem: The first attempt to read Sites persistence, SQLite, and authentication reference docs failed with `No such file or directory`.
- Root Cause: The references are nested under `skills/sites-building/references/`, not directly under `skills/references/`.
- Solution: Located the bundled reference files and read the correct persistence, SQLite, and authentication docs before implementing ownership changes.
- Files Changed: SOLUTIONS.md
- Status: Resolved
- Verification: Correct reference files were read successfully from `skills/sites-building/references/`.

## [2026-08-19 16:24] Organizer Polls Effect Lint Failure
- Problem: `npm run lint` failed because the new organizer poll loading effect called a state-updating async function directly from the effect body.
- Root Cause: React hook lint rules disallow synchronous effect-triggered state updates that can cascade renders.
- Solution: Deferred the organizer poll load through `window.setTimeout`, matching the existing deferred URL poll loading pattern.
- Files Changed: app/SchedulerApp.tsx, SOLUTIONS.md
- Status: Resolved
- Verification: `npm run lint` and `npm test` completed successfully.

## [2026-08-19 16:25] Bracketed API Path Git Add Failure
- Problem: The first `git add` command for the organizer ownership commit failed with `zsh: no matches found: app/api/polls/[id]/route.ts`.
- Root Cause: zsh treated `[id]` as a glob pattern because the path was not quoted.
- Solution: Re-ran the command with the bracketed path quoted.
- Files Changed: SOLUTIONS.md
- Status: Resolved
- Verification: The ownership changes were committed and pushed successfully after quoting the path.

## [2026-08-19 16:42] Status Update Treated As Blank Edit
- Problem: The close-responses smoke test failed with HTTP 400 because a status-only PATCH was interpreted as an edit with a blank poll title.
- Root Cause: The API route passed undefined edit fields into `updatePoll`, and the update helper treated the presence of those undefined properties as intentional blank values.
- Solution: Changed edit-field detection to require string values before applying title, description, organizer, or timezone updates.
- Files Changed: db/polls.ts, SOLUTIONS.md
- Status: Resolved
- Verification: The organizer workflow smoke test passed: edit before responses, locked option edit after response, close/reopen responses, response blocking while closed, and finalize.

## [2026-08-19 16:43] Bracketed API Path Diff Failure
- Problem: A `git diff` inspection command failed with `zsh: no matches found: app/api/polls/[id]/route.ts`.
- Root Cause: zsh treated `[id]` as a glob pattern because the path was not quoted.
- Solution: Re-ran the diff with the bracketed path quoted.
- Files Changed: SOLUTIONS.md
- Status: Resolved
- Verification: Quoted-path diff completed successfully.

## [2026-08-19 16:59] Git Committer Identity Warning
- Problem: `git commit` completed but warned that the committer name and email were auto-configured from the local machine account.
- Root Cause: Repository or global Git author identity has not been explicitly configured in this workspace.
- Solution: Documented the warning for follow-up; no app code change was required.
- Files Changed: SOLUTIONS.md
- Status: Open
- Verification: The poll screen polish commit completed successfully despite the warning.

## [2026-08-20 09:53] Bracketed API Path Read Failure
- Problem: A command to inspect `app/api/polls/[id]/route.ts` failed with `zsh: no matches found`.
- Root Cause: zsh treated `[id]` as a glob pattern because the path was not quoted.
- Solution: Re-ran the file read with the bracketed path quoted.
- Files Changed: SOLUTIONS.md
- Status: Resolved
- Verification: The quoted-path read completed successfully.

## [2026-08-20 09:56] Git Committer Identity Warning
- Problem: `git commit` completed but again warned that the committer name and email were auto-configured from the local machine account.
- Root Cause: Repository or global Git author identity has not been explicitly configured in this workspace.
- Solution: Documented the repeated warning for follow-up; no app behavior change was required.
- Files Changed: SOLUTIONS.md
- Status: Open
- Verification: The calendar invite commit completed successfully despite the warning.

## [2026-08-20 10:22] Sites Credential Request Transport Error
- Problem: The first request for a Sites source repository write credential failed with an HTTP transport error while publishing the calendar invite feature.
- Root Cause: Transient connection failure to the Sites MCP endpoint.
- Solution: Retried the credential request and continued the private deployment with the returned credential.
- Files Changed: SOLUTIONS.md
- Status: Resolved
- Verification: The retry succeeded, the source push completed, and the private deployment reported `succeeded`.

## [2026-08-20 10:22] Local Git Identity Warning Resolved
- Problem: Git repeatedly warned that commits were using an auto-configured local machine identity.
- Root Cause: Repository-level `user.name` and `user.email` were unset.
- Solution: Set the repository Git identity to `Ann Tropea <atropea@umbc.edu>`.
- Files Changed: SOLUTIONS.md
- Status: Resolved
- Verification: `git config user.name` and `git config user.email` now return explicit repository values.

## [2026-08-20 10:30] Build Dependency Deprecation Warning
- Problem: `npm test` completed successfully but the Vinext build emitted a Node `DEP0040` deprecation warning for the `punycode` module.
- Root Cause: Unknown; likely a transitive dependency in the current build toolchain.
- Solution: No code fix applied because the build and tests passed and the warning is outside the app feature path.
- Files Changed: SOLUTIONS.md
- Status: Open
- Verification: `npm run lint` and `npm test` both completed successfully.

## [2026-08-20 10:45] Finalized Poll Response Form Visibility
- Problem: Finalized polls still displayed the attendee response form in a disabled state, and the route back to the main page was buried in the side panel.
- Root Cause: The UI relied on disabled controls for non-collecting polls and only exposed poll navigation through the share/admin side panel.
- Solution: Replaced the response form with a finalized/closed state panel when responses are not allowed, added a prominent `Main page` action to the poll header, and changed the side-panel organizer navigation to `My organizer polls`.
- Files Changed: app/SchedulerApp.tsx, app/globals.css, SOLUTIONS.md
- Status: Resolved
- Verification: `npm run lint` and `npm test` completed successfully.

## [2026-08-20 10:51] Poll Navigation UX Revision
- Problem: The prominent poll-header `Main page` button and finalized locked-state panel felt too heavy after review.
- Root Cause: Navigation was handled as page-specific UI instead of a consistent app-level control, and the finalized state duplicated information already present in the final-result banner.
- Solution: Added a slim global navigation bar with Home/Create/My polls/Respond actions, removed the poll-header `Main page` button, and stopped rendering any replacement response panel after finalization.
- Files Changed: app/SchedulerApp.tsx, app/globals.css, SOLUTIONS.md
- Status: Resolved
- Verification: `npm run lint`, `npm test`, and a no-match search for removed header/locked-result references completed successfully.

## [2026-08-20 11:36] Visualize Render Helper Missing
- Problem: An optional attempt to locate the visualize `render.py` helper failed because the expected scripts directory was not present in the installed visualize plugin path.
- Root Cause: Unknown; this plugin installation does not include the referenced helper at the documented location.
- Solution: Verified the visual identity fragment directly for forbidden escaped markup, document wrappers, network calls, and size instead of using the optional render helper.
- Files Changed: SOLUTIONS.md
- Status: Workaround
- Verification: The fragment sanity search returned no matches and `wc -c` confirmed the file is under 1 MB.

## [2026-08-20 11:56] Corporate Visual Identity
- Problem: The app still used the old GatherRound name and a soft blue/green corporate color scheme after the user selected the sharper option A identity.
- Root Cause: The selected visual identity had only been explored in a mockup, not applied to the production app, metadata, or public assets.
- Solution: Renamed the visible product to When/Now, applied the sharp editorial acid-utility palette and typography, refreshed the favicon and social preview image, and updated tests and public hub copy.
- Files Changed: app/SchedulerApp.tsx, app/globals.css, app/layout.tsx, docs/404.html, docs/app.js, docs/index.html, docs/styles.css, public/favicon.svg, public/og.png, README.md, tests/rendered-html.test.mjs, SOLUTIONS.md
- Status: Resolved
- Verification: `npm test` passed and the saved `public/og.png` was visually inspected.

## [2026-08-20 11:56] Initial Branding Patch Mismatch
- Problem: A combined multi-file patch for tests, favicon, docs, and README failed to apply.
- Root Cause: The README text included `calendar back-and-forth`, which did not exactly match the patch context.
- Solution: Split the update into smaller, exact patches and applied each affected file successfully.
- Files Changed: tests/rendered-html.test.mjs, public/favicon.svg, docs/404.html, docs/index.html, README.md, SOLUTIONS.md
- Status: Resolved
- Verification: Follow-up file reads confirmed the expected updated title, favicon markup, and README heading.

## [2026-08-20 11:56] Static Hub Stale CSS Variables
- Problem: The GitHub Pages CSS still referenced removed old palette variables such as `--mint`, `--mint-dark`, and `--blue`.
- Root Cause: The initial app theme pass updated the primary app CSS first and left older static hub styles partially migrated.
- Solution: Replaced the remaining static hub variable references with the new When/Now palette and hard-edge selected states.
- Files Changed: docs/styles.css, SOLUTIONS.md
- Status: Resolved
- Verification: A stale color/variable search returned no matches for the old palette references.

## [2026-08-20 11:58] Sites Source Push Authentication
- Problem: Pushing the validated source to the Sites remote failed with `fatal: could not read Username for 'https://git.chatgpt-team.site': Device not configured`.
- Root Cause: The configured Sites git remote did not include a current write credential.
- Solution: Requested a short-lived Sites source repository write credential and retried the push with a one-command HTTP auth header.
- Files Changed: SOLUTIONS.md
- Status: Resolved
- Verification: The authenticated `git push sites main` completed successfully.
