# Castle Grooves: history search and queue API proposal

2026-09-06 · **Proposal for review; not an implemented or approved runtime contract.**

The first working milestone is: **find a previously played song using a remembered requester or evening, recognize it through nearby plays, then queue several songs while keeping search, selection and scroll position.** The backend remains responsible for authorization, historical identity, track resolution and queue mutation.

The [source-backed data audit](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/docs/dashboard/HISTORY_DATA_AUDIT.md) establishes the current limitations. Actual stored coverage remains unknown: both existing Influx configurations refused the read-only connection probe. No sample below represents a real stored record; all names, IDs, titles, dates, counts and receipts are illustrative.

## 1. Proposed decisions and scope

1. Return **play events**, labelled “Started” / “Requested by.” Search title and artist together, combine requester and calendar clues, and expose nearby events. Defer track-grouped rankings and listening-duration metrics.
2. Use **America/Toronto** as the provisional UI timezone, with an explicit IANA timezone in every time-filtered request. UTC instants remain the storage/interchange basis.
3. Give tracks, historical plays and queue occurrences separate identities. Preserve existing and migrated metadata; resolve a historical recording exactly or report why it cannot be replayed. Do not silently choose the first text search result or an automatic mirror.
4. Use a small, immutable, bounded search snapshot for stable pages. A timestamp cutoff alone cannot freeze this database: buffered writes and later imports can insert records behind that cutoff.
5. Use one backend enqueue operation for one or many selected plays, with ordered per-item outcomes and retry receipts. Proposed Add preserves pause; proposed Queue next inserts without interruption. **These behaviour changes require agreement before implementation.**
6. Initially read current and migrated records in `song_play`. Expose that dataset boundary explicitly; do not claim unmigrated `song` records are included. A read-only legacy adapter can follow if the coverage audit finds it necessary for the user's remembered songs.

Do not add a replacement database, provider, recommendation engine, saved collections, aggregate-chart API, per-play listener claims or lifecycle telemetry in this slice. Recording acknowledgement and identity correctness are prerequisites, not a mandate to redesign all analytics.

## 2. Endpoint surface and compatibility

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/history/plays` | Filtered chronological play history with immutable pages and exact matched count for that snapshot. |
| `GET /api/v1/history/requesters` | Find historical requesters by remembered name, including people absent from the room or no longer in the guild. |
| `GET /api/v1/history/plays/{playId}/context` | A bounded before/after view, independent of the original text/requester filters. |
| `POST /api/v1/queue/enqueues` | Submit an ordered batch of 1–50 historical plays; one item is the direct Add/Next action. |
| `GET /api/v1/queue/enqueues/{operationId}?instanceId=…` | Recover pending or completed per-item outcomes after a slow resolution or lost response. |

Existing `/api/v1/history`, external-music `/api/v1/search`, and current queue/player routes retain their shapes. Correct the `24h` alias and surfaced history failures deliberately, with regression checks. The new UI uses the new history endpoints. Exact historical replay needs a separate resolver policy from the current general search/mirror behaviour ([API:194](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/api/index.ts:194), [MusicManager:145](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/lib/MusicManager.ts:145)).

Add `instanceId`, `queueId` and `queueRevision` to authoritative dashboard state. Keep existing `revision` for state snapshots; queueRevision advances only for structural queue/current-occurrence changes. Update the OpenAPI/AsyncAPI definitions and generate frontend types together. Propose contract version `1.1.0`; current schemas contain literal `1.0.0`, so negotiate or deploy the compatible UI before switching version literals. Old routes are not silently replaced. New enqueue responses reference the existing state stream and do not require a second queue store in the UI.

## 3. Authorization and dataset boundary

Retain the existing Discord session cookie, allowlisted viewer/DJ/admin role evaluation, configured guild membership checks, allowed mutation Origin and backend authority ([dashboard/auth.ts](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/dashboard/auth.ts), [permissions.ts](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/dashboard/permissions.ts)). All roles may browse; only DJ/admin may enqueue. Snapshots and operation receipts are scoped to the authenticated user and authorized dataset. IDs are references, never authorization capabilities.

`song_play` has no guild tag. Before enabling real history, the server needs a verified, explicit mapping from its configured bucket/dataset to this guild. If that assertion cannot be made, return `503 HISTORY_SCOPE_UNVERIFIED`, not a cross-guild list. This is a real-data release gate, not a request for a new authentication system. New writers should capture guild identity in the next implementation while the read adapter handles the verified legacy dataset; do not silently relabel unknown legacy points.

Enqueue checks a fresh guild member and voice state before resolution and again at commit: the actor must remain in the bot's voice channel, or in the chosen voice channel when creating an idle queue. No client-supplied requester identity is accepted. The new occurrence is requested by the acting user; the historical requester remains on the historical event. Existing permission policy for remove/reorder/player controls stays unchanged.

No raw Influx query, Lavalink encoded data, serialized provider blob or arbitrary replay URL is accepted from the browser. The backend resolves only its authorized historical references. `Cache-Control: private, no-store` applies to these history and operation responses; server snapshot storage is independent of HTTP caching.

## 4. Identities and normalized play shape

| Identity | Meaning and stability |
| --- | --- |
| `trackId` | Versioned opaque ID derived from a validated canonical source recording. First choice: exact `(source namespace, provider identifier)`; normalize the known source alias only, preserve identifier case. Use a full collision-resistant digest or encoded canonical key, never the 8-character `songHash`. Metadata edits do not change it. |
| `playId` | Versioned, authenticated opaque encoding of the dataset, measurement, complete sorted tag set and exact stored timestamp. It resolves independently of a search snapshot and survives a server restart when the ID-signing key is stable. It identifies one stored point, not one title or one queue item. Signing-key rotation must preserve old validation keys for supported IDs. |
| `queueItemId` | A fresh UUID for each new queue occurrence, including intentional repeats of the same track. Never reuse a historical or previous queue item's ID. |
| `snapshotId` / cursor | Short-lived browsing references; they do not define track or play identity. |
| `operationId` | A client UUID identifying one enqueue intent and all retries of its exact request. |

Canonicalization order: trusted source/identifier fields → validated provider identifier from a recognized track URL → validated serialized metadata. Use field and URL agreement checks, not blind precedence when two valid identifiers conflict. Normalize known YouTube watch/short-link forms to the same case-sensitive video ID and remove playlist/timestamp parameters for an individual replay. Do not lowercase URL paths or merge live/remix/alternate uploads by title. For supported sources without extractable identifiers, a validated canonical single-track URL can form a weaker source/URL identity. If a later adapter can strengthen it, maintain an explicit alias rather than changing a published identity silently.

Current and migrated `song_play` points with the same validated source identifier get the same `trackId` despite different `songHash` values. Different play timestamps remain different events. For conflicting metadata or no trustworthy replay locator, preserve the event, use an event-scoped fallback track ID, set `identityKind: "unresolved"`, and mark it unqueueable. `{}` and malformed serialization do not become fabricated YouTube tracks. Empty/placeholder metadata becomes null; old formatted durations are parsed only when their units/format are known, otherwise null. Artwork is optional and not proof of availability.

Each `HistoryPlay` contains these required keys (nullable values as specified):

```json
{
  "playId": "p1_demoA",
  "playedAt": "2026-08-29T01:14:00.123456789Z",
  "eventKind": "track_start",
  "track": {
    "trackId": "t1_demoA",
    "identityKind": "source_identifier",
    "source": "youtube",
    "sourceIdentifier": "ExAmPleA001",
    "title": "Moon Arcade",
    "artist": "Example Ensemble",
    "durationMs": 241000,
    "uri": "https://www.youtube.com/watch?v=ExAmPleA001",
    "artworkUrl": null,
    "replay": { "status": "unchecked", "reason": null }
  },
  "requester": {
    "id": "100000000000000001",
    "usernameAtPlay": "Mira",
    "avatarUrlAtPlay": null
  },
  "local": {
    "date": "2026-08-28",
    "time": "21:14:00",
    "utcOffset": "-04:00",
    "weekday": 5,
    "filterDate": "2026-08-28"
  },
  "metadataIssues": [],
  "dataset": "song_play"
}
```

`playedAt` preserves available fractional precision, including nanoseconds; never round it through `Date` to generate IDs or sorting keys. `eventKind` describes this writer's start record, not an inferred completion. `title`, `artist`, `sourceIdentifier`, `durationMs`, `uri`, `artworkUrl`, and requester display fields may be null. `source` may be `unknown`; `requester` may be null for malformed historical data. Display “Unknown requester/track” without synthesizing an identity. `metadataIssues` uses stable codes such as `MISSING_TITLE`, `DURATION_UNKNOWN`, `IDENTITY_CONFLICT` or `INVALID_SERIALIZED_METADATA`.

`identityKind` is `source_identifier | source_url | unresolved`. Replay status is `unchecked | unavailable | unsupported | metadata_incomplete`. `unchecked` means a safe locator exists but current provider availability is unknown. History reads must not perform one network lookup per row. Resolver success is still not a guarantee the audio will play later. Error reason is null or a stable code, never a raw provider error.

## 5. History search: filters and time rules

First-page requests accept:

| Parameter | Contract |
| --- | --- |
| `timezone` | Required valid IANA zone; UI proposes `America/Toronto`. Unsupported/invalid names return 400. Never use the host/browser zone implicitly. |
| `q` | Optional 1–200 trimmed Unicode characters. Case-insensitive literal partial-word matching across normalized title and artist; all whitespace-separated tokens must occur in either field. Normalize Unicode consistently. No regex syntax. Minor typo tolerance is deferred; do not market the first version as fuzzy search. |
| `requesterIds` | Optional comma-separated exact Discord IDs, maximum 20, OR within this filter. Includes historical people absent today. `requesterUnknown=true` selects missing identity and is mutually exclusive with IDs. |
| `sources` | Optional comma-separated normalized source namespaces, maximum 10; OR within the filter. `unknown` is a valid explicit source filter. |
| `from`, `to` | Optional paired RFC3339 instants with `Z` or explicit offsets, start inclusive and end exclusive. Offset-less datetimes are invalid. |
| `dateFrom`, `dateTo` | Alternative paired local ISO dates in `timezone`, first inclusive, second exclusive. Mutually exclusive with `from/to`. Presets resolve to concrete dates before fetching. |
| `weekdays` | Optional comma-separated ISO weekdays 1=Monday through 7=Sunday; OR within the filter. |
| `timeFrom`, `timeTo` | Optional paired local `HH:mm`, a half-open window. End before start means crossing midnight; equal endpoints are invalid (omit both for all day). |
| `order` | `desc` (default) or `asc`, by `(exact playedAt, playId)` with a deterministic bytewise tie-break. Changing order creates a new snapshot. |
| `limit` | Integer 1–100, default 50. Invalid values return 400; do not silently clamp them. |

All different filter types combine with AND. With no date/instant bounds, default to the last 30×24 hours ending at snapshot creation, and echo the resolved instants. Maximum requested span is 10 years; larger or over-budget searches return a narrowing error. A wide requested period is not a claim that data exists throughout it.

For a non-wrapping time window, date and weekday refer to the event's local calendar date. For a wrapping window such as `22:00–02:00`, times after midnight and before 02:00 belong to the **previous evening's filterDate**. Date and weekday predicates apply to that filterDate. `local.date` always remains the actual calendar date. Thus Friday evening includes Saturday 01:30, but Saturday evening does not accidentally include it. For local date pruning, scan through the overnight tail after `dateTo` midnight and then apply filterDate predicates; do not truncate that tail. Absolute `from/to` always constrain the real instant, even with a wrapping window.

DST rules: repeated fall-back local times match both distinct UTC events and display their different offsets; nonexistent spring-forward times produce no invented event. A calendar day is bounded by local midnights, not a fixed 24-hour subtraction. Filtering, context labels and future chart buckets must share this implementation. No hard-coded UTC-4/UTC-5 offset.

Example first-page request (encoded as a normal URL by the client):

```http
GET /api/v1/history/plays?timezone=America%2FToronto&q=moon&requesterIds=100000000000000001&dateFrom=2026-08-28&dateTo=2026-08-30&weekdays=5,6&timeFrom=18:00&timeTo=02:00&order=desc&limit=1
```

The response envelope contains the full `HistoryPlay` objects defined above. This example uses a compact but complete record:

```json
{
  "contractVersion": "1.1.0",
  "timezone": "America/Toronto",
  "filters": {
    "q": "moon",
    "requesterIds": ["100000000000000001"],
    "requesterUnknown": false,
    "sources": [],
    "dateFrom": "2026-08-28",
    "dateTo": "2026-08-30",
    "from": null,
    "to": null,
    "weekdays": [5, 6],
    "timeFrom": "18:00",
    "timeTo": "02:00",
    "order": "desc"
  },
  "snapshot": {
    "id": "hs_demo1",
    "capturedAt": "2026-09-06T22:00:00Z",
    "expiresAt": "2026-09-06T22:10:00Z"
  },
  "coverage": {
    "datasets": ["song_play"],
    "legacySongIncluded": false,
    "completeness": "unknown",
    "earliestVerifiedPlayAt": null,
    "latestVerifiedPlayAt": null
  },
  "items": [
    {
      "playId": "p1_demoA",
      "playedAt": "2026-08-29T01:14:00.123456789Z",
      "eventKind": "track_start",
      "track": {
        "trackId": "t1_demoA",
        "identityKind": "source_identifier",
        "source": "youtube",
        "sourceIdentifier": "ExAmPleA001",
        "title": "Moon Arcade",
        "artist": "Example Ensemble",
        "durationMs": 241000,
        "uri": "https://www.youtube.com/watch?v=ExAmPleA001",
        "artworkUrl": null,
        "replay": { "status": "unchecked", "reason": null }
      },
      "requester": { "id": "100000000000000001", "usernameAtPlay": "Mira", "avatarUrlAtPlay": null },
      "local": { "date": "2026-08-28", "time": "21:14:00", "utcOffset": "-04:00", "weekday": 5, "filterDate": "2026-08-28" },
      "metadataIssues": [],
      "dataset": "song_play"
    }
  ],
  "counts": { "totalMatchedPlays": 137, "exact": true },
  "page": { "limit": 1, "returned": 1, "hasMore": true, "nextCursor": "hc_demo2" }
}
```

`totalMatchedPlays` is the number of all matching logical play events in this frozen read result before pagination. `page.returned` is only this page's length. Neither is total listening minutes or distinct tracks. Retention/missing recording limits remain visible even when this query count is exact. Unknown coverage must not be reported as `0` or “all history.” A healthy empty result returns items `[]`, exact count `0`, `hasMore:false`, and `nextCursor:null` with the same coverage envelope.

## 6. Stable pages, bounds and freshness

Continuation request:

```http
GET /api/v1/history/plays?cursor=hc_demo2
```

The opaque authenticated cursor binds snapshot ID, user/dataset, normalized filters, timezone, order, page size and the last ordering key. Continuation accepts only cursor; mixing fresh filters or a limit returns 400. Repeating a cursor returns the same page. Expiry or restart returns `410 HISTORY_SNAPSHOT_EXPIRED`, never silently restarts at page one. Tampering returns `400 INVALID_CURSOR`; another user's snapshot returns 404. A cursor is not an offset into a changing database.

Smallest strong implementation on the existing store: materialize the normalized matching events once into a bounded in-memory snapshot, sort by `(timestamp, playId)`, and serve key-based pages from it for 10 minutes. Copy immutable row values, not live references. This freezes membership, ordering, metadata and matched count even while new writes, late writes or retention changes occur. Snapshot capture is a successful read, not a transactional snapshot of all database writes at one global nanosecond; `capturedAt` denotes read completion. Only the returned materialized set is frozen.

Provisional budgets, to validate against real counts: maximum 10,000 matches and 8 MiB per snapshot; at most 50,000 candidate logical events decoded per search; 3 active snapshots per user; 64 MiB total; 8 seconds per history query. Push safe time/tag predicates down, reconstruct complete point identity, apply text/metadata predicates before output limiting, and detect candidate or match overflow with one extra event. Never scan only the newest 100 and call that complete search. Enforce byte/row budgets while streaming, not after an unbounded `collectRows()` allocation.

Overflow returns `422 HISTORY_QUERY_TOO_BROAD` asking for a narrower person/date/text filter, with no partial “exact” count. Capacity pressure returns `429 HISTORY_BUSY` with `Retry-After`; do not silently evict unexpired snapshots being browsed. Budgets are proposed starting values, not measured capacity or latency promises. If real history cannot fit a useful query, revisit indexed search or persistent snapshots as a separate design decision.

A fresh first-page request always performs a fresh authoritative read; it does not reuse the current five-minute menu cache. Repair writer acknowledgement, then invalidate any new first-page cache only on confirmed persistence. Existing snapshots remain stable intentionally. Show “Results as of …” and a Refresh action; refreshing creates a new snapshot while preserving filters and selected stable track/play IDs. Initial freshness can use an explicit refresh and a 30-second background check of the first page that offers updated results without replacing active browsing. Only while that view is open; this is product polling, not an automation task. A later history-changed event should signal confirmed persistence, not merely `playerStart`.

## 7. Finding a requester and surrounding plays

Requester lookup is needed to turn a remembered name into stable IDs without requiring that person to be currently present:

```http
GET /api/v1/history/requesters?q=mir&timezone=America%2FToronto&dateFrom=2026-01-01&dateTo=2026-09-07&limit=20
```

Accept `q` as a literal case-insensitive name fragment, the same paired date/instant bounds, timezone, and limit 1–50. With no explicit bounds, requester lookup searches the last 10 years (or the shorter verified retained period), rather than the play list's default 30 days; echo those bounds. Search distinct historical IDs and recorded names, not only the current Discord cache. Name matches are OR across known aliases; labels use the latest valid recorded name in the selected period, with user ID as disambiguation. Do not infer that two names are two people or that equal names are one person. Missing-ID plays remain available through `requesterUnknown`.

```json
{
  "timezone": "America/Toronto",
  "snapshot": { "id": "hr_demo1", "capturedAt": "2026-09-06T22:00:00Z", "expiresAt": "2026-09-06T22:10:00Z" },
  "items": [
    { "id": "100000000000000001", "displayName": "Mira", "matchedName": "Mira", "avatarUrl": null, "nameBasis": "recorded_history" }
  ],
  "counts": { "totalMatchedRequesters": 1, "exact": true },
  "page": { "limit": 20, "returned": 1, "hasMore": false, "nextCursor": null }
}
```

Requester continuation uses `?cursor=…` only, the same immutable-snapshot/expiry rules and candidate/time budgets, and a 1,000-requester result cap. Echo normalized filters and the same `coverage` object as history in the actual schema; those two common objects are omitted from the lookup example for brevity. Do not expose a listener score or preference claim here.

Context request:

```http
GET /api/v1/history/plays/p1_demoA/context?timezone=America%2FToronto&before=1&after=1&radiusMinutes=360
```

`before/after` are integers 0–20, default 5; radius is 1–360 minutes, default 360 on each side. Resolve the authorized anchor and fetch adjacent events in the **same verified dataset**, irrespective of original q/requester/day filters. Include the anchor. Sort ascending with the same full-precision tie-break. No session or room-membership inference is made. An absent/removed anchor is `404 HISTORY_PLAY_NOT_FOUND`; expired browsing does not itself invalidate a stable play ID.

Create a separate frozen context snapshot when opened. Neighbors may include late-arriving rows visible at this later read; the parent search snapshot stays unchanged. No pagination is needed for this bounded view. The client can widen before/after within the documented caps or open a new date search.

```json
{
  "timezone": "America/Toronto",
  "anchorPlayId": "p1_demoA",
  "snapshot": { "id": "hx_demo1", "capturedAt": "2026-09-06T22:01:00Z", "expiresAt": "2026-09-06T22:11:00Z" },
  "radiusMinutes": 360,
  "counts": { "beforeReturned": 1, "afterReturned": 1 },
  "truncated": { "before": false, "after": false },
  "orderedPlayIds": ["p1_demoB", "p1_demoA", "p1_demoC"],
  "gaps": [
    { "fromPlayId": "p1_demoB", "toPlayId": "p1_demoA", "elapsedMs": 240000, "showBreak": false },
    { "fromPlayId": "p1_demoA", "toPlayId": "p1_demoC", "elapsedMs": 2700000, "showBreak": true }
  ]
}
```

For readability, the example shows `orderedPlayIds`; the actual response **also requires `items: HistoryPlay[]` in exactly that order and the common coverage object**. Each gap is elapsed start-to-start time, not silence or listening duration. `showBreak` is a presentation hint for gaps of at least 30 minutes; display the elapsed time even for shorter gaps. `truncated` means more events exist within the bounded radius than requested, not that records beyond the radius belong to the same evening. Missing recording coverage stays unknown. Closing context returns to the unchanged parent result and scroll anchor.

## 8. Single and bulk enqueue contract

Request, after obtaining authoritative queue context from `/api/v1/state`:

```http
POST /api/v1/queue/enqueues
Content-Type: application/json
Origin: <the existing allowed dashboard origin>
```

```json
{
  "operationId": "7286cb73-28a8-433d-a763-33c49efdf640",
  "issuedAt": "2026-09-06T22:02:00Z",
  "instanceId": "5fbe7e50-47da-44f3-8ff1-5d9b463f9eb3",
  "expectedQueueId": "c8b749db-501b-4707-85e9-d7d9d7c3de9c",
  "placement": "append",
  "items": [
    { "clientItemId": "selection-B", "playId": "p1_demoB" },
    { "clientItemId": "selection-A", "playId": "p1_demoA" },
    { "clientItemId": "selection-C", "playId": "p1_demoC" }
  ]
}
```

All shown top-level keys are required. `expectedQueueId` may be null for no queue; it identifies a queue lifecycle, not an ordering version. `placement` is `append | next`. For `next`, also require `afterQueueItemId`, the current occurrence's ID, or null only if there is no current track. The append variant rejects that extra key. Items must be 1–50 entries in the intended visible selection order, each with a unique clientItemId (1–64 characters) and valid authorized play ID. Retain the existing 32-KiB JSON body cap. The server rejects unknown request fields and malformed IDs; it never converts this action into a playlist expansion or text search.

An optional `expectedQueueRevision` enforces compare-and-set when a caller needs it. Default append rebases onto the newest ordering of the **same queue lifecycle** at commit, preserving other DJs' work. A replaced queue ID, changed voice channel, stale next anchor, or explicit revision mismatch rejects the entire batch before insertion. The backend reports current queue context for recovery; it does not overwrite current state with the submitted snapshot.

One selected song uses exactly this request with one item. Each submitted item intentionally means one new queue occurrence, including repeated track IDs; the backend does not silently skip an already queued song. The UI normally selects tracks by stable trackId to avoid accidentally selecting the same recording through repeated history rows, and offers an explicit Queue again action for deliberate repeats. Request retries are deduplicated by operationId, not by trackId.

### Placement and failure semantics proposed for review

| Player at commit | Add (`append`) | Queue next (`next`) |
| --- | --- | --- |
| Playing | Append successful items after existing upcoming tracks. Current audio/position unchanged. | Insert successful items as an ordered block immediately after the current occurrence, before upcoming tracks. Current audio/position unchanged. |
| Paused current track | Same append, keep current track, position and pause. | Same ordered insertion, keep current track, position and pause. |
| No current track / idle | Append; create/connect queue if necessary and start the earliest pending track. | Insert before pending tracks; start the earliest pending track. |

No skipping, seeking or resuming a paused current track is part of either action. Idle auto-start preserves the current product expectation but is a separate effect reported as `playbackStart: pending | requested | failed | not_needed`. “Queued” confirms admission, not audible playback. If connection/start fails after queue admission, keep accepted occurrences for recovery, report the start failure, and do not tell the client to re-enqueue those items. There is no immediate-play option in this endpoint.

Resolve each locator through a backend exact-recording policy before mutation. Confirm the returned source/identifier (or approved canonical URL identity) matches the requested historical recording. Block conflicting identity, unsupported providers, deleted/private tracks and mirror-only resolution with explicit item codes. Do not fall back to title/artist or choose a YouTube replacement for a historical Spotify identity without a separate explicit selection workflow. Distinguish permanent unavailable results from provider timeout/unavailability; never label a network timeout “deleted.” No provider access is performed by this design task.

Resolution failures are per-item: successful items form one atomic ordered insertion block; failed items retain their selection. Batch-level authorization, voice, lifecycle, revision or next-anchor failures admit **zero** items. Resolve at most three tracks concurrently, with a proposed 5-second per-item and 30-second operation resolution deadline; items not resolved by the deadline get a retryable timeout outcome. These are proposed bounds to tune, not measured service promises.

### Operation receipts and retries

Register the operation under `(guild/dataset, authenticated user, instanceId, operationId)` before asynchronous work. Canonicalize/hash the entire payload, including item order and issuedAt. A duplicate with the same payload reuses the same operation/result; a duplicate with a different payload returns `409 IDEMPOTENCY_CONFLICT`. X-Request-Id remains diagnostic and is not the idempotency key.

Return 202 after validation/registration; the UI keeps browsing while resolution runs:

```json
{
  "operationId": "7286cb73-28a8-433d-a763-33c49efdf640",
  "instanceId": "5fbe7e50-47da-44f3-8ff1-5d9b463f9eb3",
  "status": "resolving",
  "statusUrl": "/api/v1/queue/enqueues/7286cb73-28a8-433d-a763-33c49efdf640?instanceId=5fbe7e50-47da-44f3-8ff1-5d9b463f9eb3",
  "receiptExpiresAt": "2026-09-07T22:02:00Z"
}
```

GET the status URL (initially every second, backing off to five seconds) until completed/failed, or retry the exact POST if its response was lost. A completed status is HTTP 200:

```json
{
  "operationId": "7286cb73-28a8-433d-a763-33c49efdf640",
  "instanceId": "5fbe7e50-47da-44f3-8ff1-5d9b463f9eb3",
  "status": "completed",
  "outcome": "partial",
  "receiptExpiresAt": "2026-09-07T22:02:00Z",
  "counts": { "requested": 3, "queued": 2, "failed": 1 },
  "results": [
    { "clientItemId": "selection-B", "playId": "p1_demoB", "status": "queued", "queueItemId": "94dfaab2-a656-4d0c-85bf-c68647fdf4d1", "trackId": "t1_demoB" },
    { "clientItemId": "selection-A", "playId": "p1_demoA", "status": "queued", "queueItemId": "3156d805-b509-4009-89e3-aad4a3c59c97", "trackId": "t1_demoA" },
    { "clientItemId": "selection-C", "playId": "p1_demoC", "status": "failed", "error": { "code": "TRACK_UNAVAILABLE", "message": "This recording is no longer available.", "retryable": false } }
  ],
  "playbackStart": "not_needed",
  "stateVersion": {
    "instanceId": "5fbe7e50-47da-44f3-8ff1-5d9b463f9eb3",
    "queueId": "c8b749db-501b-4707-85e9-d7d9d7c3de9c",
    "queueRevision": 43,
    "revision": 108
  }
}
```

Results always follow request order. Terminal outcome is `all_queued | partial | none_queued`; counts reconcile with results. `status:failed` is reserved for an operation-level failure, contains the stable error envelope, no admitted items, and current stateVersion when available. A valid batch in which every item is unresolvable is `completed/none_queued`. After registration, logical failures are reported by the status resource; initial request validation/authorization failures use their ordinary HTTP status. POST replay returns 202 if pending or 200 with the terminal receipt if completed/failed.

Admission results, queue IDs and counts are immutable once committed. `playbackStart` is a separate last-known effect: it may advance from pending to requested/failed after admission, and stateVersion may advance with it. While playbackStart is pending, the client may continue status reads until it settles (maximum 15 seconds), then rely on the authoritative state/error notice. A delayed or failed start never changes an admitted item to “not queued” or authorizes an automatic re-enqueue. End this follow-up at the stated bound with a visible playback-status uncertainty if the transport cannot confirm the effect.

For the existing single-process authority, keep receipts for 24 hours in that process, without early eviction; reject new operation registrations with 429 if capacity is exhausted. Initial registration requires issuedAt within five minutes of serverTime. Duplicate lookup precedes this age check, so a registered operation can be retried for its receipt lifetime. If an operation is unknown and issuedAt is older than five minutes, reject `409 OPERATION_EXPIRED`; do not treat an old retry as a new intent. Rate/size limits also apply to receipt creation.

`instanceId` is a fresh UUID each backend boot, returned by state. Any old-instance POST or status lookup returns `409 INSTANCE_CHANGED`; an automatic retry must not substitute the new instanceId or operationId. The client explains that the prior outcome cannot be recovered and refreshes state before a deliberate new user action. An unknown status ID in the current instance returns 404; retry the original still-valid POST, not a new intent. This gives at-most-once admission for a valid request within the current process/receipt scope, **not crash-durable exactly-once playback**. A durable receipt ledger is a later option if restart recovery becomes a requirement; no new persistence is assumed here.

Under the controller's guild mutation chain, perform final authorization/voice/context checks, assign fresh queue IDs, install the successful block, and record the terminal admission receipt without an intervening await. Publish state and perform any idle start after that local commit; subscriber or playback failures must not erase an admission receipt. Resolution occurs outside that critical section so long provider calls do not freeze normal controls. All structural mutations, including end-of-track advancement, radio refills and Discord controls, must advance the same queue revision and obey the same synchronous commit discipline. Existing full reorder additionally requires an exact permutation check and expectedQueueRevision; stale destructive queue edits return conflict rather than replacing concurrent additions.

After completion, remove only successful tracks from the active selection. Retain failed ones with their item errors. Retrying failed items deliberately creates a new operation with only those items. Preserve filters, cursor pages, context and scroll; reconcile the persistent queue from state snapshots. If local state is older than receipt stateVersion, fetch `/api/v1/state`. On a new instanceId, reset the old numeric revision baseline before accepting snapshots.

## 9. Error vocabulary

Retain `{ "error": { "code", "message", "requestId" } }`; add optional `retryable` and structured `details` for field errors, current queue context or refresh guidance. Sanitize messages; credentials, Flux text and provider response bodies never enter the browser error. Example:

```json
{
  "error": {
    "code": "HISTORY_UNAVAILABLE",
    "message": "History could not be loaded. Try again shortly.",
    "requestId": "f0f41f3a-a9c6-447c-89da-a5d5a8d716d4",
    "retryable": true
  }
}
```

| Status / scope | Codes and meaning |
| --- | --- |
| 400 | `INVALID_HISTORY_FILTER`, `INVALID_TIMEZONE`, `INVALID_CURSOR`, `INVALID_ENQUEUE`: malformed inputs, contradictory bounds, duplicate clientItemIds; no mutation. |
| 401 / 403 | Existing `UNAUTHENTICATED` / `FORBIDDEN`; role/session/guild/origin failure. |
| 404 | `HISTORY_PLAY_NOT_FOUND`, `OPERATION_NOT_FOUND`; never imply another user's reference is accessible. |
| 409 | `VOICE_CHANNEL_REQUIRED`, `VOICE_CHANNEL_MISMATCH`, `QUEUE_CHANGED`, `NEXT_ANCHOR_CHANGED`, `QUEUE_REVISION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `INSTANCE_CHANGED`, `OPERATION_EXPIRED`. New enqueue endpoint uses these meanings; existing routes need not change status mappings. |
| 410 | `HISTORY_SNAPSHOT_EXPIRED`; preserve UI state and offer a fresh search. |
| 422 | `HISTORY_QUERY_TOO_BROAD`; narrow the query, no partial success disguised as all results. |
| 429 | `HISTORY_BUSY`, `ENQUEUE_BUSY`; bounded capacity, with Retry-After. |
| 503 / 504 | `HISTORY_UNAVAILABLE` / `HISTORY_TIMEOUT`, or `HISTORY_SCOPE_UNVERIFIED` (503, not retryable until configuration is verified). Never convert these to an empty success. |
| Item failure | `TRACK_UNAVAILABLE`, `TRACK_UNSUPPORTED`, `TRACK_METADATA_INCOMPLETE`, `TRACK_IDENTITY_MISMATCH`, `TRACK_REQUIRES_ALTERNATIVE`, `TRACK_RESOLUTION_TIMEOUT`, `TRACK_PROVIDER_UNAVAILABLE`, `HISTORY_PLAY_NOT_FOUND`. Only transient resolution/provider failures are automatically eligible for a deliberate item retry. |

## 10. Acceptance checks for the next implementation

These are meaningful release checks, not assertions that they were run during this design task. Use offline fixtures/fake player transports first; run read-only real-data comparison only once the database is reachable. Any write/integration test belongs in an explicitly disposable test database, never the live bucket.

| Check | Required observation |
| --- | --- |
| Person + evening recall | A requester absent from today's room can be found by a historical name; Friday-evening filtering finds their matching starts; neighboring plays reveal the intended track. Opening details and adding retain filters, scroll and selection. |
| Full search and counts | Fixture has over 100 events, repeated tracks, missing metadata and multiple series. All matching events across pages reconcile exactly with totalMatchedPlays; page length and distinct-track counts are never confused. A match older than the newest 100 is found. |
| Stable pagination | Several plays share a timestamp; some differ only below milliseconds or in source. Paginate, repeat the cursor, then insert a late historical fixture and a new start, alter metadata and expire source records. The existing snapshot remains identical with no duplicates/omissions. A fresh search can differ. |
| Query bounds | Candidate/match/byte/time budgets return typed errors, with no misleading partial exact count. Invalid arrays, Unicode text, quote/backslash/regex characters and malformed cursors cannot alter Flux logic. |
| Calendar boundaries | Toronto spring transition on 2026-03-08 and fall transition on 2026-11-01: local-day queries span 23/25 hours; both fall 01:30 events match and show distinct offsets. A 22:00–02:00 Friday filter includes Saturday 01:30 but excludes Saturday 02:00 and Thursday 23:00. |
| Migration identity | Same provider ID across two known hash formulas maps to one trackId but keeps separate playIds. Case-distinct provider IDs, alternate uploads and remixes remain distinct. Malformed JSON, `{}`, unknown durations and mismatched URLs remain visible and fail replay explicitly as appropriate. |
| Coverage/authentication | Unknown guild ownership blocks data exposure; viewers can browse but cannot enqueue; all new mutations reject wrong origin; old session/revoked role cannot fetch another user's snapshot/receipt. No listener inference appears. |
| Recording freshness | Fake writer confirms the writer holding the point is the one flushed/closed; cache freshness changes only after acknowledgement. `ENABLE_DB_WRITES_IN_DEV=false` does not permit writes. Simulated write failure does not claim success. |
| Add and Next | In playing and paused states, add/next never call skip/resume/seek or replace current audio. Bulk next inserts B,A in B,A order, not A,B. Idle auto-start failure preserves admitted IDs and reports the separate failure. |
| Exact unavailable track | A private/deleted historical recording reports its item failure; a different returned source ID or automatic mirror is not silently accepted. Other successful selections still queue in order. |
| Concurrent actors | While resolving a batch, another DJ/Discord action/radio refill modifies the queue. Append preserves it; stale next anchor or lifecycle rejects the batch with zero insertions. Stale reorder conflicts, and `[A,A]` is rejected for queue `[A,B]`. |
| Retry ambiguity | Drop POST response and repeat identical operation, including simultaneous duplicates: each successful item appears once. Changed payload under the same ID conflicts. Lost status response is recoverable. Restart/expired receipt produces explicit uncertainty, never silent re-enqueue. |
| UI reconciliation | WebSocket snapshots before/after receipt arrive out of order. UI uses instanceId/revision, fetches newer state when needed, retains unsuccessful selections, and does not reload or navigate away from history after queuing. |

## 11. Recommended first implementation slice

After agreement on the decisions above, implement one thin backend-to-UI flow: **requester/evening search → context → select three tracks → ordered Add with per-item results and preserved pause**. Include fixture coverage for identity, DST, paging, failures and concurrency. Expose Queue next from the same operation once its no-interruption semantics pass the same checks.

Start with writer/guard fixes, typed history errors and the read-only `song_play` normalization layer; establish dataset ownership and actual retained coverage. Then implement the history/requester/context contracts and bounded snapshots, followed by exact replay and enqueue receipts through PlayerController. Update contracts/types alongside each behaviour. Retain the existing authentication and live-state foundation.

The database connectivity limitation blocks real coverage/performance validation, not contract review or offline implementation. Aggregate charts, full legacy reconciliation, room rediscovery and richer listening telemetry should follow only when the first recall-and-queue journey is working on verified data. No runtime source, live queue, database, migration, contract YAML, or shared UI plan was changed by this proposal.
