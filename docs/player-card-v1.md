# 974Darts Player Card V1

## Integration and activation

The existing public profile at `app/frontend/app/players/[player_id]/page.tsx` gets a **Créer ma carte** link when `PLAYER_CARD_ENABLED=true` and the canonical profile is public. It opens `/players/{canonical-id}/card` through a native `<a>`: a complete document navigation is required for camera permissions. The original `season` query is preserved, including an omitted filter so the backend retains its existing default-season selection.

Set `PLAYER_CARD_ENABLED=true` **at build time and runtime in validation**. Next.js compiles the document security headers at build time. The default is disabled in every environment, including production. An enabled runtime with a disabled build does not acquire the camera exception. The page and GET data endpoint independently check activation; hiding the link is not the access control.

The frontend Dockerfile accepts `PLAYER_CARD_ENABLED` as a build argument. Production Compose passes the same setting from its environment to the build and the running frontend; both default to `false`. Persist `PLAYER_CARD_ENABLED=true` in `/etc/974darts/production.env` when activating an authorized production release, then rebuild and recreate **only** the frontend with that env file. An existing image built without activation must be rebuilt to obtain camera headers. `PLAYER_CARD_PREVIEW` remains a development-only switch and is unnecessary in production.

The new endpoint `/api/player-card/{id}?season=2027` reads the existing Python dashboard endpoint, checks `public_profile === true`, strips unrelated/private/internal identity fields, and returns only card information plus available filters. Non-public profiles receive 403, unavailable data 503, invalid filters 400, missing players/disabled feature 404. Responses use `private, no-store`. There are no database writes, privileged browser keys, migrations or photo uploads. Exporting a public profile is a public read operation; it does not establish ownership or confer profile-editing rights.

## Statistics and scope

`lib/player-card/server.ts` reads `/api/v1/players/{id}/dashboard?season_id=...`, exactly the source used by the existing profile and `PlayerStatisticsEngine`. Canonical resolution remains the backend's responsibility. No name search, independent aggregation, averaging of averages, tournament mixing or doubles/singles remapping is introduced.

The optional `/api/v1/competitions` catalog supplies the current championship label and available 2026–2029 filters, plus `all`, consistent with `PlayerSeasonFilter`. The profile has no separate competition dropdown; this version consequently does not invent one. Season labels are the actual backend labels. `all` retains the source's career scope. No exact calendar bounds are invented where the source only certifies a season.

The adapter retains average, First 9, finish and the source's score categories verbatim. Legs won / played are validated integers; the rate is computed only for a positive denominator with `won <= played`. Missing, invalid and non-finite values become a dash; valid zero stays zero. Without data all metrics remain unavailable. Scores are unavailable when the quality metadata reports no underlying scoring rows, even if a daily/profile fallback contains other statistics.

The current dashboard contract has **no portrait, nickname or defined best-average record**. These are not inferred from names, recent-match maxima or the demo. Production cards use the public display name, initials and a dash for best average. Extending these sources is future work. There is no existing verified portrait update flow reused in this implementation, so no **also use as profile photo** option or persistence is offered.

## Rendering and themes

`lib/player-card/render.ts` paints a deterministic Canvas composition. Publication is 1080 × 1350; Story is 1080 × 1920 with a centered portrait and rearranged hierarchy. The PNG has these physical dimensions regardless of devicePixelRatio. The rendered PNG itself is the preview, download and share file: there is no separate screenshot/export layout. It contains neither UI controls nor IDs/contact information.

The snapshot includes the public data, theme, format, photo/crop and actual generation timestamp. Fonts and images are decoded before encoding. A request revision invalidates old exports; stale asynchronous responses/render completions are discarded. French formatting uses `fr-FR`, dates and filenames use `Indian/Reunion`.

Essential Story content is kept within approximately y=180…1640, x=64…1016. The remaining lower area is decoration. These margins are design conventions, not a guarantee about every social application's UI.

`themes.ts` defines Fournaise, Neige and neutral tokens independently of data/layout. Existing decorative banners from `public/team-themes` are reused. Identity and numbers are code-rendered text. No logo is invented. Selecting Neige on a Fournaise player changes scenery and colors, never the affiliation. An unavailable decorative banner falls back to a procedural background with an explicit message.

Default associations use **exact IDs**. The official roster IDs `pdc-fournaise` and `pdc-neige` are supported, alongside the database IDs verified from the live public [2026 championship](https://974darts.re/championships/2026) on 11 October 2026:

| Team | Verified database ID | Theme |
| --- | --- | --- |
| PDC Fournaise | `87719ebb-183e-43ac-a96a-5bf4c657939b` | Fournaise |
| PDC Neige | `4a3849c5-3096-4443-87e0-9ce5fd248a46` | Neige |

New season-specific or other validation database IDs can be explicitly configured; roster slugs are never assumed to equal database UUIDs:

```sh
PLAYER_CARD_THEME_BINDINGS='{"teams":{"ACTUAL_FOURNAISE_TEAM_ID":"fournaise","ACTUAL_NEIGE_TEAM_ID":"neige"},"clubs":{}}'
```

Replace the placeholders with verified IDs from the validation dashboard, not team names. Unknown IDs resolve to the club's explicit theme binding, then neutral. No official club-color field exists in the inspected dashboard contract, so unmapped clubs use neutral. Incorrect configuration fails the data request rather than matching a name heuristically.

To add a theme, extend `ThemeId`, the typed registry, and its tokens/local authorized texture; associate verified team/club IDs. Keep the renderer and source adapter shared.

## Photos and camera

Photos remain transient in the browser. JPEG, PNG and WebP imports are checked by MIME, file signature, size, decode and dimensions. The default limit is 10 MiB; `PLAYER_CARD_MAX_PHOTO_MB` permits 1–20 MiB. Inputs below 64 px, above 40 megapixels or above 16000 px on one axis are rejected. Native decoding applies EXIF orientation; Canvas normalization downsizes the long side to at most 1600 px and emits PNG without EXIF/GPS metadata. HEIC/HEIF is explicitly unsupported with a JPEG alternative. Object URLs are released.

Zoom and horizontal/vertical position define a normalized square crop used identically by the crop preview and both card formats. A validated local photo can be recropped. Cancel leaves the previous photo intact; initials remove it. The current data source supplies no profile-photo option because no photo exists in that contract.

Camera is opened only after **Prendre une photo**. Requests use `audio:false` and prefer the front camera. The editor permits switching facing mode, capture, retake, validation and cancellation. Front video is mirrored for framing; the captured image retains its natural orientation. Every track is stopped after capture, close, cancellation, visibility loss, pagehide/unmount and late permission completion. Denial, absent/busy camera and insecure/incompatible browsers retain import as the alternative.

`next.config.ts` keeps camera/microphone/geolocation disabled globally. When activated, only `/players/:player_id/card` adds camera `(self)` and `media-src 'self' blob:`. The gated development preview has the same policy. The original `/admin/vision` camera, workers and screen-wake-lock exception is unchanged. `deploy/Caddyfile` is a reverse proxy and defines no conflicting permission headers. Validation tests check served headers and document navigation; no live deployment configuration was changed.

## Share and download

A File is fully encoded before either action becomes available. The click calls `navigator.canShare({files})` and `navigator.share` without waiting for a new render. Unsupported sharing offers the independent PNG download. Cancellation is silent and does not trigger download. Completing the native share sheet is not represented as social publication. Download filenames use the public player name, source period, format and local generation date; browser behavior determines the actual download destination.

## Development preview and tests

The isolated development fixture is only reachable when both `PLAYER_CARD_ENABLED=true` and `PLAYER_CARD_PREVIEW=true`, with `NODE_ENV !== production`. It has NICO / DataMan, ND initials, the supplied historical figures, the exact demonstration warning and **Historique partagé — période à préciser**. It never supplies fallback production data or changes a real player record.

```sh
cd app/frontend
npm ci --no-audit --no-fund
PLAYER_CARD_ENABLED=true PLAYER_CARD_PREVIEW=true npm run dev
# Open http://localhost:3000/player-card-preview
# /player-card-preview?view=profile: demo profile launcher
# /player-card-preview?partial=1: partial-data case
# /player-card-preview?long=1: long-name case
npm test
npm run build
```

The added `npm run test:player-card` is part of the normal test command. It exercises source/identity mapping, filters, rate validation, missing/zero data, public authorization, fixture isolation, themes, photo validation/crop, stream lifetime, sharing and the complete permission matrix. Existing Jeux/Vision/control/release suites remain enabled. The old Vision assertion was scoped to its own exception; the new matrix checks that the default configuration still authorizes only Vision.

Optional real-browser integration suite (Playwright is a validation-runtime prerequisite, not a production dependency):

```sh
PLAYWRIGHT_MODULE_PATH=/path/to/playwright \
CHROMIUM_EXECUTABLE_PATH=/path/to/chromium \
PLAYER_CARD_QA_OUTPUT=/tmp/player-card-qa \
node scripts/test-player-card-browser.mjs
```

It starts its own localhost Next.js and synthetic read-only backend, exports and checks PNG dimensions, captures desktop/mobile views, exercises import/crop, sharing fallbacks/cancellation, simulated camera capture/denial/late cleanup, direct/full document navigation, permissions, private-profile denial and source-error retry. It never uses production credentials or user photos. `CHROMIUM_EXECUTABLE_PATH` may be omitted with a standard Playwright browser installation.

## Remaining validation and deployment

Actual phone hardware, iPhone/Safari/WebKit behavior, native mobile share sheets, photo-library save destination and the deployed reverse-proxy response remain manual checks. Browser emulation and fake camera are not physical-phone tests. The environment's standard Playwright browser download was unavailable; Chromium validation uses a temporary runtime outside the repository. No browser package was added to application dependencies.

Before any separately authorized deployment: verify actual team UUID associations, exercise staging with build/runtime activation, compare live public profile values, test a real iPhone and Android (portrait import/rotation, capture, cancellation and file sharing), and inspect the staging response headers. Activate production only through the project's release process. The implementation/review phase did not merge, deploy, change secrets, restart live containers, run remote migrations or write production data. A subsequent production authorization permits the frontend release; it does not require a database migration, photo upload, backend restart or Caddy change.

After updating `/opt/974darts/current` to the verified merged commit and saving the non-secret activation setting, use:

```bash
docker compose --env-file /etc/974darts/production.env -f deploy/compose.yaml build frontend
docker compose --env-file /etc/974darts/production.env -f deploy/compose.yaml up -d --no-deps --wait --wait-timeout 180 frontend
curl -fsS https://974darts.re/api/health
```

Check a public profile for **Créer ma carte**, then its card page for HTTP 200 and `Permissions-Policy: camera=(self), microphone=(), geolocation=()`. The home page must still deny camera, and `/player-card-preview` must return 404. Check native photo capture and file sharing on a real phone after release. Rollback is a frontend image built from the previous verified commit (with activation off); rebuild and recreate only that service. Reverting the runtime flag alone hides the feature but does not remove camera headers compiled into an enabled image.
