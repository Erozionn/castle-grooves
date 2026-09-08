# Castle Grooves history data audit

Audit date: 2026-09-06. Scope: source audit and API design for “find a previously played song using a person or evening, then queue several songs without losing browsing context.” No runtime implementation, bot startup, queue mutation, database write, migration, or commit was performed. The shared UI working plan remains unchanged.

**Recommendation:** build searchable play history and exact historical replay before charts. Fix recording acknowledgement and history query semantics as part of that first implementation. Do not interpret a recorded start as a completed listen or a requester as a listener.

Companion: [reviewable API proposal](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/docs/dashboard/HISTORY_API_PROPOSAL.md).

## 1. Evidence and source provenance

The isolated worktree contains the substantial uncommitted backend work, including `dashboard/`, `contracts/`, `tests/`, and `lib/PlayerController.ts`. Its base commit is `746c557f144908ab425edf275a02aac796557dbb`; findings use the working files, not just that commit. SHA-256 comparisons against the read-only reference checkout at `E:/Personal_Repos/castle-grooves` are recorded in [source-verification.json](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/docs/dashboard/source-verification.json).

All audited application, contract, history, migration, dashboard, and test files match the reference byte for byte. `package.json` differs only in formatting/line endings after normalization. `docker-compose.dev.yml` differs: the original additionally disables the Lavalink development health check. The original configuration was consulted for environment context; it was not copied over the worktree. Existing changes in both checkouts were preserved. No source repair was needed before this audit.

Evidence labels used below:

- **Source verified:** directly observed in current files; a potential data consequence is not proof it occurred in storage.
- **Dependency verified:** checked in the installed Influx JS client 1.35.0 source map in the reference checkout, or the linked official Flux documentation.
- **Stored-data verified:** none. Both configured connections failed before any aggregate query ran.

## 2. Stored coverage: unavailable, not empty

The standalone [read-only helper](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/scripts/auditHistoryReadOnly.mjs) read only the existing Influx configuration from `.env.dev` and `.env.prod`. It imported no application module. Both `/health` probes returned `ECONNREFUSED`, at `2026-09-06T22:36:03.970Z` and `2026-09-06T22:36:25.652Z`, respectively. This establishes that the configured endpoints were unreachable from this task environment; it does not establish that a production database is offline. Docker's read-only container listing also failed: its configuration was inaccessible and the default engine pipe was absent. No service was started.

| Question | Result |
| --- | --- |
| Earliest/latest retained play | Unknown |
| Number of starts; unique tracks/requesters | Unknown |
| Daily/monthly gaps or recording outages | Unknown |
| Missing/invalid metadata rates | Unknown |
| Retention policy and actual oldest retained data | Unknown |
| Legacy migration completeness, overlap, or duplicates | Unknown |
| Current source hash split/collision frequency | Unknown |
| Live writer/client version, clock accuracy, or query latency | Unknown |

The helper is deliberately bounded: each request has an 8-second timeout and a 256-KiB response cap; aggregate coverage is restricted to `[2000-01-01T00:00:00Z, audit time)`, with missing-field checks restricted to the final 30 days. It permits only health/bucket reads and fixed read-only Flux queries. It never prints credentials, configuration values, track metadata, requester identities, or server error bodies. Its aggregate branches are **prepared but unverified against Influx** because connectivity failed. Syntax and the connection-failure path were checked with Node 22.15.0.

When an existing database becomes reachable, run from this worktree:

```powershell
node --preserve-symlinks-main --preserve-symlinks scripts/auditHistoryReadOnly.mjs E:/Personal_Repos/castle-grooves/.env.dev
```

Choose the configuration for the intended existing database. The flags avoid this Windows sandbox's entrypoint realpath restriction. No environment file should be copied into the report or repository.

Follow-up read-only checks, before calling history complete:

1. Verify the bucket and retention; get earliest/latest and counts separately for `song_play.songTitle` and legacy `song.playing=true`. Anchor-field counts are proxies for logical plays: separately count pivoted logical records so malformed records without that anchor are not hidden. Never count all field rows as plays.
2. Inspect monthly counts over the explicit coverage window, then daily counts around suspected gaps. An absent bucket means no observed records, not a proven outage. Compare liveness telemetry only over overlapping periods; do not fill unknown coverage with invented activity.
3. In bounded monthly windows, reconstruct points using complete tags plus full timestamp. Count missing/empty fields, invalid JSON, implausible duration units, placeholder artists/requesters, conflicting identifiers/URLs/sources, and malformed URLs. The helper's recent check catches missing fields and `{}` only; JSON validity and historical rates need this additional pass.
4. Count distinct exact `(source, identifier)` and recognized canonical URL identities; measure multiple hashes per canonical track and multiple canonical tracks per hash. Count unknown identities separately. Preserve identifier case.
5. Compare legacy starts to their expected migrated point using the migration's hash algorithm, timestamp conversion and metadata; report unmatched/ambiguous matches. Equal totals alone do not prove migration completeness. Check timestamps earlier than the helper's lower bound separately if retention or source evidence warrants it.
6. Audit voice-event continuity and bot uptime before considering room reconstruction. Until then, per-play membership remains unknown.

## 3. Recording and meaning of a play

**Source verified.** `MusicQueue` emits `playerStart` when Lavalink emits `start`; the play handler calls `addSong(queue.isPlaying, track, requester)`. The V2 writer accepts only `playing=true`. The queue-finish handler's `addSong(false)` is ignored. Thus this records track starts, including starts that may soon be skipped or fail. It has no completed-listen, actual elapsed listening, skip reason, end timestamp, or durable playback-event ID. The in-memory queue history is a separate list capped at 50 and is not the database. Sources: [MusicQueue.ts:157](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/lib/MusicQueue.ts:157), [playSong.ts:10](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/components/events/playSong.ts:10), [songFinish.ts:25](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/components/events/songFinish.ts:25), [songHistoryV2.ts:685](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/songHistoryV2.ts:685).

Recording can be skipped for missing text-channel metadata, missing title/author, or missing requester. A radio/recommendation is not necessarily an intentional request by the attributed person; the schema has no request-origin field. There is no application-level deduplication of repeated start notifications. These are coverage risks, not measured loss or duplication rates.

**Important acknowledgement defect.** `writeApi()` creates a fresh client and writer every call. `addSong` calls `writeApi().writePoint(point)`, then calls `writeApi().close()` on a different, empty writer. Its “Write successful” log and cache invalidation acknowledge the wrong buffer. The installed JS client normally flushes buffered writes after 60 seconds, so this does **not** imply all plays are lost; it means persistence is delayed and not confirmed by that promise, with a loss risk on process termination. `addBotStateChange`, the old writer, and voice activity use the same pattern. The newer observability helper correctly uses one writer instance. Sources: [InfluxDb.ts:29](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/hooks/InfluxDb.ts:29), [songHistoryV2.ts:733](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/songHistoryV2.ts:733), [recordActivity.ts:35](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/recordActivity.ts:35), [observability.ts:35](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/observability.ts:35). Dependency evidence: reference `node_modules/@influxdata/influxdb-client/dist/index.js.map`, embedded `src/options.ts:141`, `src/impl/WriteApiImpl.ts:320`, `src/InfluxDB.ts:76`.

**Development-write guard is presence based.** `!process.env.ENABLE_DB_WRITES_IN_DEV` considers the nonempty string `"false"` enabled. Development Compose defaults the variable to `false`, so that configuration does not enforce the intended write protection. Voice activity has no development guard at all. Proposed correction is exact boolean parsing and a consistent write gate; no flag or source was changed here. Sources: [songHistoryV2.ts:686](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/songHistoryV2.ts:686), [observability.ts:33](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/observability.ts:33), [original development Compose:12](E:/Personal_Repos/castle-grooves/docker-compose.dev.yml:12).

## 4. History query correctness, pagination and errors

| Finding | Evidence and consequence |
| --- | --- |
| Only four relative ranges and at most 100 recent entries | [api/index.ts:220](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/api/index.ts:220) defaults to 25, clamps integer limits to 1–100, and returns only `items`. No filters for text/person/calendar time, cursor, total, or context. |
| `24h` actually falls back to 30 days | API passes `24h`; [getTimeRangeParams:280](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/songHistoryV2.ts:280) recognizes `daily`, not `24h`, and defaults unknown keys to `-30d`. |
| History pivot drops `source` | [buildSongQuery:364](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/songHistoryV2.ts:364) groups/pivots on `_time,songHash,requestedById`; `source` is outside the key and field columns. The API reads `item.source`, so serialization can omit a field the [contract requires:95](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/contracts/openapi.yaml:95). Same issue in the hour query. |
| Identity dimensions can collapse | Omitting source from the pivot key also merges otherwise distinct series sharing time/hash/requester. Sort is globally descending by `_time` after `group()`, but equal times have no tie-breaker. No stable event identity or paging continuation exists. |
| General top songs are not rankings | [builder:380](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/songHistoryV2.ts:380) takes last metadata by hash and assigns `playCount:1`; [wrapper:559](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/songHistoryV2.ts:559) shuffles. The pivot drops `_time` before sorting it, and no global `group()` precedes this branch's limit. It can fail and its limit is not a global top-N guarantee. |
| Actual user-top wrapper differs | [getUserTopSongs:581](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/songHistoryV2.ts:581) counts serialized rows in JS and sorts by count/recency. Do not attribute the unused `userTopSongs` builder's constant-count defect to this wrapper. It still groups by unstable hash, omits unserializable rows, and collects the full selected range. |
| Total-count helper returns one series | [builder:444](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/songHistoryV2.ts:444) counts title rows without ungrouping; [wrapper:659](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/songHistoryV2.ts:659) reads only the first returned count. It is not a server-wide total when multiple series exist. |
| Failed history appears empty | [getSongsPlayed:528](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/songHistoryV2.ts:528) catches configuration, timeout, and Flux failures and returns `[]`. Top/hour queries do similarly; total failures become zero. The API therefore returns 200 with empty history on these failures. |
| Contract validation is incomplete | Current tests cover schema parsing, sessions, permissions and state serialization, not history query execution or queue concurrency. The OpenAPI history response requires source and requester fields that can be absent/empty in historical rows. |

The pivot conclusions follow the documented output-column rules; the last/sort/limit concerns follow Flux's per-table semantics. These are source/dependency deductions, not live query results. References: [official pivot rules](https://docs.influxdata.com/flux/v0/stdlib/universe/pivot/), [Flux query semantics](https://docs.influxdata.com/influxdb/v2/query-data/flux/), [group ordering](https://docs.influxdata.com/flux/v0/stdlib/universe/group/).

`protectedRoute` supplies the existing error envelope, request IDs, session/guild checks and mutation-origin enforcement. Unexpected error messages currently flow into HTTP responses; the proposed history service should emit sanitized typed errors, preserve internal diagnostics under the request ID, and distinguish a healthy zero-row query from an unavailable service. Source: [api/index.ts:119](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/api/index.ts:119).

## 5. Metadata, identity and migration coverage

Current `song_play` tags are `songHash`, `requestedById`, and `source`. Fields include artist, title, combined title, URL, provider identifier, artwork, requester name/avatar, serialized track and declared duration in milliseconds. There is **no guild ID, voice-channel ID, verified listeners, queue item ID, or explicit event ID**. The dashboard API exposes only combined title, timestamp, URL, artwork, requester and the source affected by the pivot issue. It omits separate artist, duration and provider identity even when stored. Source: [writer:715](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/songHistoryV2.ts:715).

The authenticated API is configured for one guild, but the history query reads the whole configured bucket without a guild predicate. Source cannot prove that bucket contains only that guild. Before release, establish and record a trusted bucket-to-guild ownership assertion, or require an explicitly scoped dataset. Never infer historical guild/room from the requester's current membership.

| Identity/metadata issue | Interpretation |
| --- | --- |
| Current hash uses lowercase `author|title|identifier`, truncated MD5 (8 hex) | Metadata changes split a track; source is omitted; lowercasing can collapse distinct case-sensitive provider IDs. A short hash is not a replay identity. [Current hash:56](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/songHistoryV2.ts:56). |
| Migration hash uses lowercase `songTitle|songUrl` | The same recording can have different hashes across migrated and current plays. Group by validated source identity, not this hash. [Migration:39](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/scripts/migrateInfluxDB.ts:39). |
| Migration scans only the last 365 days by default | It is not evidence older records were converted. Dashboard reads only `song_play`; remaining `song` starts are invisible. [Migration:55](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/scripts/migrateInfluxDB.ts:55), [CLI:186](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/scripts/migrateInfluxDB.ts:186). |
| Migration reconstructs by timestamp alone | Distinct tagged records at one timestamp can overwrite each other's fields in its Map. It discards false/missing playing flags and records without combined title/requester. [Migration:72](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/scripts/migrateInfluxDB.ts:72). |
| Migration splits artist from combined text | Missing separator becomes `Unknown`; delimiter-based extraction is approximate. Defaults include empty ID/artwork, `youtube`, `Unknown`, `{}`, and zero duration. These are placeholders, not verified metadata. [Migration:44](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/scripts/migrateInfluxDB.ts:44), [point:127](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/scripts/migrateInfluxDB.ts:127). |
| Legacy duration conversion prefers `duration` over `durationMS` | A historical formatted duration string may be selected instead of numeric milliseconds; neither migration nor deserializer validates units. Audit raw variants before summing or displaying. [Migration:114](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/scripts/migrateInfluxDB.ts:114), [deserializer:135](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/songHistoryV2.ts:135). |
| Deserialization creates empty encoded track and defaults | Malformed JSON returns null, but `{}` still produces an empty track with source `youtube`. A successfully parsed object is not necessarily replayable. [Deserializer:96](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/songHistoryV2.ts:96). |

Historical point identity must use the complete tag set and exact stored timestamp, separately from track identity. Influx identifies a point by measurement, tags and timestamp; overwrites cannot later be recovered merely by an API ID. [Official point identity](https://docs.influxdata.com/influxdb/v2/reference/faq/). Do not deduplicate separate starts solely because the title or timestamp matches.

Existing Discord history re-searches URI or title/author, takes the first result, and looks up selected entries by array index after regenerating the menu. Cache changes can change the meaning of that index; text fallback can select another recording. The music manager also resolves Spotify metadata to YouTube mirrors, and playback has a mirror fallback. Exact historical replay needs a dedicated resolution policy with no silent replacement. Sources: [history interaction:26](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/components/interactions/history.ts:26), [MusicManager.ts:145](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/lib/MusicManager.ts:145), [MusicManager.ts:320](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/lib/MusicManager.ts:320), [MusicQueue.ts:248](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/lib/MusicQueue.ts:248).

## 6. Timestamps, local time and freshness

Current points do not set an explicit timestamp. The installed client assigns its local clock when serializing the point, with nanosecond precision by default; this is not necessarily Lavalink's exact start instant. Migration explicitly calls `new Date(timeStr)`, preserving the UTC instant only to JavaScript's millisecond precision and losing finer fractional precision. History must preserve raw timestamp strings for identity and sorting, even if the UI displays seconds. Neither source nor this audit establishes host clock accuracy.

The hour recommendation query specifies neither `option location` nor a location argument, while recommendation input uses JavaScript `getHours()`/`getDay()` in the process timezone. Its modulo arithmetic also sends `stop:24` when the end wraps to zero. Flux documents inclusive integer hours 0–23, so that is not a sound basis for the proposed half-open, minute-precision windows. Sources: [hour query:462](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/songHistoryV2.ts:462), [recommendation inputs:108](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/spotifyRecommendations.ts:108), [official hourSelection](https://docs.influxdata.com/flux/v0/stdlib/universe/hourselection/), [date.hour](https://docs.influxdata.com/flux/v0/stdlib/date/hour/).

Grafana's day/hour panel explicitly selects America/Toronto, but the overall dashboard timezone is `browser`; other windows are not uniformly localized. Its ranking query really counts records, unlike the general helper, but still groups by legacy hash. Its recent-play limit is applied within retained series groups. Reuse query intent only after fixing grouping, identity and time semantics. Source: [listening recap template:5](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/grafana/dashboards/listening-recap.json.template:5) (panels at lines 81, 92, 113).

V2 queries cache for five minutes. Successful recording invalidates only `history-v2-monthly-34`; dashboard requests normally use 25 or 100 and other periods. Those results can remain stale for their TTL, in addition to writer visibility delay. Hour/top caches are not invalidated by new plays. Existing WebSocket messages update player state, not persisted-history freshness. Sources: [cache:165](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/songHistoryV2.ts:165), [invalidation:736](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/songHistoryV2.ts:736), [WebSocket implementation](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/dashboard/websocket.ts).

## 7. Requesters, voice activity and room scope

`requestedById` identifies the attributed requester. A saved name/avatar is historical metadata, not guaranteed to match the member's current display name. Ex-members may still be useful history filters.

`recordVoiceStateChange` records user/channel tags and a connected boolean on every voice-state update. It has no guild, explicit join/move/leave type, old/new channel pair, bot flag, listener state or initial membership snapshot. A move writes a connected event for the destination but no explicit departure for the old channel; mute/deafen changes can repeat a connection state. User/channel renames change tags. Events during downtime are absent. The handler runs before the primary-guild/bot filtering in `index.ts`. Along with the writer issue, these prevent confident historical room reconstruction. Sources: [recordActivity.ts:6](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/recordActivity.ts:6), [index.ts:279](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/index.ts:279).

Current dashboard state lists the queue's voice-channel members, including bots, and has no room when no queue exists. Runtime/playback snapshots supply useful operational signals but no per-play membership or completed-listen record. Sources: [state.ts:49](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/dashboard/state.ts:49), [observability.ts:19](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/observability.ts:19). Room rediscovery therefore belongs after this milestone.

## 8. Queue mutation semantics and authority

| Current behaviour | Milestone implication |
| --- | --- |
| HTTP Add calls `enqueueQuery`, resolves text or URL, expands playlists, and appends. If paused, it skips then resumes. | Proposed Add must append while preserving a paused current track. This is a behaviour change requiring review, not implemented here. [Controller:66](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/lib/PlayerController.ts:66). |
| Discord Queue next inserts at position zero, then skips/resumes when paused. No HTTP next action exists. | Proposed next inserts after the current track without interruption; bulk next preserves submitted order. [Controller:116](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/lib/PlayerController.ts:116). |
| `enqueueTrack` preserves pause for an existing queue, but re-searches if creating a queue. | Avoid assuming all existing Add entry points have the same semantics. Its voice-channel capture also occurs before entering the mutation chain. [Controller:96](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/lib/PlayerController.ts:96). |
| A promise chain serializes controller calls; state revisions publish on many low-level events and on successful operations. | Useful authority foundation, not an optimistic-concurrency guard or transaction. Revisions reset on restart; no request deduplication or mutation receipt exists. [Controller:253](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/lib/PlayerController.ts:253). |
| Playback end and radio code also mutate queues directly, outside that promise chain. | All queue structural changes need a common commit/revision discipline before promising deterministic concurrent batches. [MusicQueue:171](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/lib/MusicQueue.ts:171), [radio.ts:100](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/utils/radio.ts:100). |
| Queue IDs are assigned on admission, but an existing ID is reused. | A deliberate replay must get a new queue occurrence ID even when the track identity is unchanged. [MusicQueue:651](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/lib/MusicQueue.ts:651). |
| Reorder checks length and membership but not uniqueness of input IDs. | With queue `[A,B]`, input `[A,A]` passes and loses B. Add a true permutation check before exposing persistent reorder alongside bulk adds. [MusicQueue:554](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/lib/MusicQueue.ts:554). |
| Pause/resume/skip do not await Lavalink control promises. | A returned state is local acknowledgement, not verified remote playback success. Queue acceptance must remain distinct from audible playback. [MusicQueue:455](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/lib/MusicQueue.ts:455). |

Keep Discord session authentication, allowlisted viewer/DJ/admin roles, guild membership and mutation-origin checks. Enqueues require the actor in the bot's voice channel, or a voice channel from which an idle queue can be created. Existing remove/reorder/player controls require DJ/admin but do not impose the enqueue voice requirement; preserve that policy unless separately changed. Sources: [auth.ts](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/dashboard/auth.ts), [API mutations:181](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/api/index.ts:181). The legacy unauthenticated `/play` GET routes remain separate existing surfaces and must not be used by the new historical replay UI ([api/index.ts:229](C:/Users/alexa/.codex/worktrees/06f6/castle-grooves/api/index.ts:229)).

## 9. Priorities and release gates

**Needed first:** trustworthy writer acknowledgement and development guards; typed history failures; full metadata normalization; source-safe track and play IDs; an explicit guild/dataset boundary; title/artist/requester/date/day/time search with America/Toronto semantics; stable browsing snapshots and context; exact resolution; ordered single/bulk enqueues with pause preservation and retry receipts; correct queue permutation/concurrency handling.

**Later:** full-range ranking/heatmap/calendar/trend APIs, legacy raw-data reconciliation if unconverted history is found, room-based rediscovery, sessions, saved sets, completion/skip telemetry and listener observations. Fixing general rankings is necessary before shipping charts, but is not required to find and replay a known historical play.

The only external blocker to completing stored-data verification is a reachable existing Influx connection. Bucket ownership and retained coverage must be established before the real-data rollout. Source/contract work and offline fixtures can proceed. Queue behaviour, exact replay without automatic mirrors, snapshot limits and duplicate policy in the companion document are concrete proposals for the next agreement; this audit does not authorize their implementation.

## 10. Deliverable verification

The two Markdown documents' 8 JSON examples parse successfully; all 67 local source/document links exist and any linked line number is within the file. All 66 source fingerprints (33 audited paths in each checkout) still match the saved provenance manifest. The standalone helper passes Node syntax checking, and `git diff --check` passes. Runtime source and the existing YAML contracts were not edited. No bot build/start, live integration test, or migration was run; proposed API acceptance checks remain future implementation work. The helper's aggregate Flux branches remain unverified because neither database probe reached a server.
