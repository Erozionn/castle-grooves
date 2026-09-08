#!/usr/bin/env node
// Standalone read-only audit. Never imports the bot, its writers, or migration code.
// Usage: node scripts/auditHistoryReadOnly.mjs <path-to-env-file>
// Outputs aggregate data only. Configuration, credentials and server error bodies stay private.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const envPath = process.argv[2];
if (!envPath || process.argv.length !== 3) {
  console.error('Usage: node scripts/auditHistoryReadOnly.mjs <path-to-env-file>');
  process.exit(2);
}
let config;
try { config = parseEnv(readFileSync(envPath, 'utf8')); }
catch { console.error('Configuration could not be read.'); process.exit(2); }
const keys = ['INFLUX_URL', 'INFLUX_TOKEN', 'INFLUX_ORG', 'INFLUX_BUCKET'];
if (keys.some(key => !config[key])) {
  console.log(JSON.stringify({ status: 'not-configured', missingKeys: keys.filter(key => !config[key]) }));
  process.exit(2);
}
let base;
try {
  base = new URL(config.INFLUX_URL);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error();
} catch { console.error('Unsupported database URL.'); process.exit(2); }
const startedAt = new Date().toISOString();
const stop = startedAt;
const start = '2000-01-01T00:00:00.000Z';
const recentStart = new Date(Date.parse(stop) - 30 * 86400000).toISOString();
const report = { auditedAt: startedAt, window: { start, stop, semantics: '[start, stop)' }, metadataWindow: { start: recentStart, stop }, timeoutPerRequestMs: 8000, responseByteCap: 262144, checks: [] };
const quote = value => JSON.stringify(value).replaceAll('${', '\\${');
const safeCodes = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE']);
async function request(path, method = 'GET', payload) {
  // Only these read-only API routes may be used; POST submits fixed Flux queries, never writes.
  if (!['/health', '/api/v2/buckets', '/api/v2/query'].includes(path)) throw new Error('UNSUPPORTED_PATH');
  const url = new URL(base);
  url.pathname = base.pathname.replace(/\/$/, '') + path;
  url.search = '';
  if (path === '/api/v2/query') url.searchParams.set('org', config.INFLUX_ORG);
  if (path === '/api/v2/buckets') { url.searchParams.set('org', config.INFLUX_ORG); url.searchParams.set('name', config.INFLUX_BUCKET); url.searchParams.set('limit', '1'); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { method, redirect: 'error', signal: controller.signal, headers: { Authorization: `Token ${config.INFLUX_TOKEN}`, Accept: path === '/api/v2/query' ? 'text/csv' : 'application/json', ...(payload ? { 'Content-Type': 'application/json' } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
    if (!response.ok) { await response.body?.cancel(); return { status: 'http-error', httpStatus: response.status }; }
    let bytes = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 262144) { controller.abort(); return { status: 'response-cap' }; }
      chunks.push(chunk);
    }
    return { status: 'ok', body: Buffer.concat(chunks).toString('utf8') };
  } catch (error) {
    const code = error?.cause?.code;
    return { status: controller.signal.aborted ? 'timeout' : 'connection-failed', code: safeCodes.has(code) ? code : 'REDACTED_TRANSPORT_ERROR' };
  } finally { clearTimeout(timer); }
}
function csvRows(csv) {
  // Parse annotated CSV including quoted cells; never emit raw server content.
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') { if (quoted && csv[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (c === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  let header = [], defaults = [];
  const output = [];
  for (const record of rows) {
    if (record[0] === '#default') { defaults = record; continue; }
    if (record[0]?.startsWith('#') || record.every(c => !c)) continue;
    if (record.includes('result') && record.includes('table')) { header = record; continue; }
    if (record.includes('error') || record.includes('reference')) throw new Error('QUERY_STREAM_ERROR');
    if (!header.length) throw new Error('INVALID_QUERY_RESPONSE');
    output.push(Object.fromEntries(header.map((key, i) => [key, record[i] || defaults[i] || ''])));
  }
  return output;
}
const health = await request('/health');
report.checks.push({ name: 'connectivity', status: health.status, ...(health.code ? { code: health.code } : {}), ...(health.httpStatus ? { httpStatus: health.httpStatus } : {}) });
if (health.status !== 'ok') { console.log(JSON.stringify(report, null, 2)); process.exit(1); }
const bucket = await request('/api/v2/buckets');
let bucketCheck = { name: 'retention', status: bucket.status, ...(bucket.httpStatus ? { httpStatus: bucket.httpStatus } : {}) };
if (bucket.status === 'ok') {
  try { bucketCheck = { name: 'retention', status: 'ok', rules: JSON.parse(bucket.body).buckets?.[0]?.retentionRules?.map(r => ({ type: r.type, everySeconds: r.everySeconds })) ?? null }; }
  catch { bucketCheck = { name: 'retention', status: 'invalid-response' }; }
}
report.checks.push(bucketCheck);
const anchor = measurement => `from(bucket: ${quote(config.INFLUX_BUCKET)}) |> range(start: time(v: ${quote(start)}), stop: time(v: ${quote(stop)})) |> filter(fn: (r) => r._measurement == "${measurement}" and r._field == "${measurement === 'song' ? 'playing' : 'songTitle'}") ${measurement === 'song' ? '|> filter(fn: (r) => r._value == true)' : ''} |> map(fn: (r) => ({r with _value: 1})) |> group(columns: ["_measurement"])`;
const queries = [
  ...['song_play', 'song'].map(measurement => [`${measurement}-coverage`, `data = ${anchor(measurement)}\ndata |> count() |> yield(name: "count")\ndata |> sort(columns: ["_time"]) |> limit(n: 1) |> keep(columns: ["_measurement", "_time"]) |> yield(name: "earliest")\ndata |> sort(columns: ["_time"], desc: true) |> limit(n: 1) |> keep(columns: ["_measurement", "_time"]) |> yield(name: "latest")`]),
  ...['song_play', 'song'].map(measurement => [`${measurement}-monthly-coverage`, `${anchor(measurement)} |> aggregateWindow(every: 1mo, fn: count, createEmpty: false) |> keep(columns: ["_measurement", "_time", "_value"])`]),
  ['recent-metadata', `from(bucket: ${quote(config.INFLUX_BUCKET)}) |> range(start: time(v: ${quote(recentStart)}), stop: time(v: ${quote(stop)})) |> filter(fn: (r) => r._measurement == "song_play") |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value") |> group() |> reduce(identity: {events: 0, missingTitle: 0, missingArtist: 0, missingUrl: 0, missingIdentifier: 0, missingRequester: 0, missingSource: 0, missingArtwork: 0, missingSerialized: 0, invalidDuration: 0}, fn: (r, accumulator) => ({ events: accumulator.events + 1, missingTitle: accumulator.missingTitle + (if not exists r.title or r.title == "" then 1 else 0), missingArtist: accumulator.missingArtist + (if not exists r.artist or r.artist == "" or r.artist == "Unknown" then 1 else 0), missingUrl: accumulator.missingUrl + (if not exists r.songUrl or r.songUrl == "" then 1 else 0), missingIdentifier: accumulator.missingIdentifier + (if not exists r.songIdentifier or r.songIdentifier == "" then 1 else 0), missingRequester: accumulator.missingRequester + (if not exists r.requestedById or r.requestedById == "" then 1 else 0), missingSource: accumulator.missingSource + (if not exists r.source or r.source == "" then 1 else 0), missingArtwork: accumulator.missingArtwork + (if not exists r.songThumbnail or r.songThumbnail == "" then 1 else 0), missingSerialized: accumulator.missingSerialized + (if not exists r.serializedTrack or r.serializedTrack == "" or r.serializedTrack == "{}" then 1 else 0), invalidDuration: accumulator.invalidDuration + (if not exists r.duration or r.duration <= 0 then 1 else 0) }))`],
];
const allowedColumns = new Set(['result', '_measurement', '_time', '_value', 'events', 'missingTitle', 'missingArtist', 'missingUrl', 'missingIdentifier', 'missingRequester', 'missingSource', 'missingArtwork', 'missingSerialized', 'invalidDuration']);
for (const [name, query] of queries) {
  const result = await request('/api/v2/query', 'POST', { query, type: 'flux', dialect: { annotations: ['datatype', 'group', 'default'] } });
  if (result.status !== 'ok') { report.checks.push({ name, status: result.status, ...(result.httpStatus ? { httpStatus: result.httpStatus } : {}), ...(result.code ? { code: result.code } : {}) }); continue; }
  try {
    const rows = csvRows(result.body).map(row => Object.fromEntries(Object.entries(row).filter(([key]) => allowedColumns.has(key))));
    // Every query projects only fixed names, counts and timestamps; no identity or track values.
    report.checks.push({ name, status: 'ok', rows });
  } catch { report.checks.push({ name, status: 'invalid-query-response' }); }
}
console.log(JSON.stringify(report, null, 2));
