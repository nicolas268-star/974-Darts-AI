# 974Darts Player Card V1

## Integration and activation

The existing public profile at `app/frontend/app/players/[player_id]/page.tsx` gets a **Créer ma carte** link when `PLAYER_CARD_ENABLED=true` and the canonical profile is public. It opens `/players/{canonical-id}/card` through a native `<a>`: a complete document navigation is required for camera permissions. The original `season` query is preserved, including an omitted filter so the backend retains its existing default-season selection.

Set `PLAYER_CARD_ENABLED=true` **at build time and runtime in validation**. Next.js compiles the document security headers at build time. The default is disabled in every environment, including production. An enabled runtime with a disabled build does not acquire the camera exception. The page and GET data endpoint independently check activation; hiding the link is not the access control.

The frontend Dockerfile accepts `PLAYER_CARD_ENABLED` as a build argument. Production Compose passes the same setting from its environment to the build and the running frontend; both default to `false`. Persist `PLAYER_CARD_ENABLED=true` in `/etc/974darts/production.env` when activating an authorized production release, then rebuild and recreate **only** the frontend with that env file. An existing image built without activation must be rebuilt to obtain camera headers. `PLAYER_CARD_PREVIEW` remains a development-only switch and is unnecessary in production.

The new endpoint `/api/player-card/{id}?season=2027` reads the existing Python dashboard endpoint, checks `public_profile === true`, strips unrelated/private/internal identity fields, and returns only card information plus available filters. Non-public profiles receive 403, unavailable data 503, invalid filters 400, missing players/disabled feature 404. Responses use `private, no-store`. There are no database writes, privileged browser keys, migrations or photo uploads. Exporting a public profile is a public read operation; it does not establish ownership or confer profile-editing rights.

## Statistics and scope

`lib/player-card/server.ts` reads `/api/v1/players/{id}/dashboard?season_id=...`, exactly the source used by the existing profile and `PlayerStatisticsEngine`. Canonical resolution remains the backend's responsibility. No name search, independent aggregation, averaging of averages, tournament mixing or doubles/singles remapping is introduced.

The optional `/api/v1/competitions` catalog supplies the current championship label and available 2026–2029 filters, plus `all`, consistent with `PlayerSeasonFilter`. The profile has no separate competition dropdown; this version consequently does not invent one. Season labels are the actual backend labels. `all` retains the source's career scope. No exact calendar bounds are invented where the source only certifies a season.

The adapter retains average, First 9, best/average finish, legs won/played and the source's score categories (80+, 100+, 140+, 170+, 180 and no score) verbatim. Legs won / played are validated integers; the rate is computed only for a positive denominator with `won <= played`. Missing, invalid and non-finite values become a dash; valid zero stays zero. Without data all metrics remain unavailable. Scores are unavailable when the quality metadata reports no underlying scoring rows, even if a daily/profile fallback contains other statistics. Score categories retain their existing dashboard semantics; no threshold totals are recomputed.

The current dashboard contract has **no portrait, nickname or defined best-average record**. These are not inferred from names, recent-match maxima or the demo. Production cards use the public display name, initials and a dash for best average. Extending these sources is future work. There is no existing verified portrait update flow reused in this implementation, so no **also use as profile photo** option or persistence is offered.

## Selectable statistics

The customization panel lists fourteen KPI checkboxes with their current public values. Up to twelve can be selected; the initial seven reproduce the V1 selection and **Réinitialiser les KPI** restores them. Selecting none is supported. Unavailable metrics, including best average until the source defines it, display a dash when selected. These settings remain local to the open studio and survive changes of format, theme, photo and season; they are not saved to a player profile.

`lib/player-card/metrics.ts` owns the typed whitelist, labels, formatting and measured grid. Unsupported IDs and duplicates are discarded, canonical order is stable, and the renderer also enforces the twelve-metric limit. The grid adapts from one to three rows without overlapping the footer. Unchecked metrics are absent from the actual prepared PNG, which is shared by the preview, download and native share actions.

## Rendering and themes

`lib/player-card/render.ts` paints a deterministic Canvas composition. Publication is 1080 × 1350; Story is 1080 × 1920. The round presentation retains the original portrait hierarchy. **Photo en grand** places an imported/captured photo on the right and identity on the left, with the selected statistics underneath, in both formats. Without a photo the original initials presentation remains available. The PNG has these physical dimensions regardless of devicePixelRatio. The rendered PNG itself is the preview, download and share file: there is no separate screenshot/export layout. It contains neither UI controls nor IDs/contact information.

The snapshot includes the public data, theme, format, selected KPI IDs, photo presentation/crop and actual generation timestamp. Fonts and images are decoded before encoding. A request revision invalidates old exports; stale asynchronous responses/render completions are discarded. French formatting uses `fr-FR`, dates and filenames use `Indian/Reunion`.

Essential Story content is kept within approximately y=180…1640, x=64…1016. The remaining lower area is decoration. These margins are design conventions, not a guarantee about every social application's UI.

`themes.ts` defines six selectable themes independently of data/layout: Fournaise, Neige, 3 Brasseurs, Kaz A Darts, TDC Tampon and neutral 974Darts. Existing decorative banners from `public/team-themes` are reused for Fournaise, Neige and 3 Brasseurs. The new club palettes follow the existing team pages: turquoise/copper for 3B, blue/red/yellow for Kaz, green/red/white on a dark background for TDC. Kaz/TDC use Canvas bands/rings and light glows; no new bitmap, logo or external font is generated or loaded. Identity and numbers are code-rendered text. Selecting another club's theme changes scenery and colors, never the player's affiliation, photo or selected statistics. An unavailable decorative banner falls back to a procedural background with an explicit message.

Default associations use **exact IDs**. The official roster IDs `pdc-fournaise`, `pdc-neige`, `3bdc-ambre`, `3bdc-blonde`, `kaz-a`, `kaz-b`, `tdc-zarboutan` and `tdc-zarlor` are supported. Database IDs were verified from links on the live public [2026 championship](https://974darts.re/championships/2026) and [2027 championship](https://974darts.re/championships/2027) on 11 October 2026:

| Team | Verified database ID | Theme |
| --- | --- | --- |
| PDC Fournaise | `87719ebb-183e-43ac-a96a-5bf4c657939b` | Fournaise |
| PDC Neige | `4a3849c5-3096-4443-87e0-9ce5fd248a46` | Neige |
| 3BDC (2026) | `c16214bf-1ae3-48e2-a1d9-0bfd451f60a3` | 3 Brasseurs |
| 3B A(mbré) (2027) | `ea7206d1-bf26-48d1-ae8d-7213ef94884c` | 3 Brasseurs |
| 3B B(londe) (2027) | `9b85ca85-4c9a-4bb7-8d73-c92e19ae7de3` | 3 Brasseurs |
| Kazadarts A (2026) | `7f265d6f-7f40-4b83-b046-ace3663b5de4` | Kaz A Darts |
| Kazadarts B (2026) | `047a30ee-ad3d-472b-854e-2e5575c08bd1` | Kaz A Darts |
| Kaz A (2027) | `7e2f62a9-e0cc-490e-b8eb-bc19c1f182e3` | Kaz A Darts |
| Kaz B (2027) | `9e79f660-c8ca-411b-a5fd-5584e58f46b6` | Kaz A Darts |
| TDC (2026) | `7f8f200c-709c-4734-ba51-ffdc0c15563d` | TDC Tampon |
| TDC Zarboutan (2027) | `a6810fe2-6469-463e-bea7-65061727e92d` | TDC Tampon |
| TDC Zarlor (2027) | `311d3ddc-a7dc-4494-9252-03b736b501ce` | TDC Tampon |

New season-specific or other validation database IDs can be explicitly configured; roster slugs are never assumed to equal database UUIDs:

```sh
PLAYER_CARD_THEME_BINDINGS='{"teams":{"ACTUAL_FOURNAISE_TEAM_ID":"fournaise","ACTUAL_NEIGE_TEAM_ID":"neige"},"clubs":{}}'
```

Replace the placeholders with verified IDs from the validation dashboard, not team names. Unknown IDs resolve to the club's explicit theme binding, then neutral. No official club-color field exists in the inspected dashboard contract, so unmapped clubs use neutral. Incorrect configuration fails the data request rather than matching a name heuristically.

To add a theme, extend `ThemeId`, the typed registry, and its tokens/local authorized texture; associate verified team/club IDs. Keep the renderer and source adapter shared.

## Photos and camera

Photos remain transient in the browser. JPEG, PNG and WebP imports are checked by MIME, file signature, size, decode and dimensions. The default limit is 10 MiB; `PLAYER_CARD_MAX_PHOTO_MB` permits 1–20 MiB. Inputs below 64 px, above 40 megapixels or above 16000 px on one axis are rejected. Native decoding applies EXIF orientation; Canvas normalization downsizes the long side to at most 1600 px and emits PNG without EXIF/GPS metadata. HEIC/HEIF is explicitly unsupported with a JPEG alternative. Object URLs are released.

Zoom and horizontal/vertical position define a normalized square crop for **Portrait rond**, or a 4:5 crop for **Photo en grand**. The editor and both exports use the same source rectangle, without stretching the picture. Switching presentations keeps the local photo; it can be recropped. The large photo uses soft edge fades to blend into the existing theme. Its face and background remain those of the imported picture: no synthetic player, automatic background removal or replacement logo is introduced. Transparent PNG imports can provide an already isolated player. Cancel leaves the previous photo intact; initials remove it. The current data source supplies no profile-photo option because no photo exists in that contract.

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

The added `npm run test:player-card` is part of the normal test command. Its thirteen test groups exercise source/identity mapping, filters, rate validation, missing/zero data, public authorization, fixture isolation, themes, the KPI whitelist and grid for every selection size and format, square/4:5 crop geometry, stream lifetime, sharing and the complete permission matrix. Existing Jeux/Vision/control/release suites remain enabled. The old Vision assertion was scoped to its own exception; the new matrix checks that the default configuration still authorizes only Vision.

Optional real-browser integration suite (Playwright is a validation-runtime prerequisite, not a production dependency):

```sh
PLAYWRIGHT_MODULE_PATH=/path/to/playwright \
CHROMIUM_EXECUTABLE_PATH=/path/to/chromium \
PLAYER_CARD_QA_OUTPUT=/tmp/player-card-qa \
node scripts/test-player-card-browser.mjs
```

It starts its own localhost Next.js and synthetic read-only backend, exports and checks PNG dimensions, captures desktop/mobile views, checks unchecked KPI values are absent from the current export, tests zero/one/twelve selections and reset, exercises both photo presentations and crops, verifies the three added club themes in Publication/Story while preserving photo, KPI selection and original affiliation, checks automatic source-ID theme selection, sharing fallbacks/cancellation, simulated camera capture/denial/late cleanup, direct/full document navigation, permissions, private-profile denial and source-error retry. It never uses production credentials. By default it imports generated synthetic validation images; optionally set `PLAYER_CARD_REFERENCE_IMAGE` to an explicitly supplied local reference to produce review examples. Such a reference is never committed or uploaded by the application. `CHROMIUM_EXECUTABLE_PATH` may be omitted with a standard Playwright browser installation.

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
