// Fetches one pb.vision video's insights from production. Browser-safe by
// design (plain fetch, no node imports): the docs-site playground bundles
// this module, and src/sources/resolve.js layers caching and the
// filesystem source rules on top of it.

// discovers the aiEngineVersion segment of a video's insights URL (the
// public bucket denies anonymous object listing, so it can't be found
// client-side without this endpoint)
export const VERSION_ENDPOINT =
  'https://api-2o2klzx4pa-uc.a.run.app/video/ai_engine_version'
export const BUCKET = 'https://storage.googleapis.com/pbv-pro'
// engines ≤ 132 predate multi-session processing: their insights path has
// no session segment and only session 1 exists
const FIRST_SESSIONED_VERSION = 133

// endpoint errors carry JSON {code, message} (e.g. 404 for an unknown vid;
// 400 for never-processed / still-processing / failed videos)
async function endpointMessage (res) {
  const body = await res.text()
  try {
    const { message } = JSON.parse(body)
    if (typeof message === 'string') {
      return message
    }
  } catch {}
  return body === '' ? `HTTP ${res.status}` : body
}

/**
 * Fetches one game's insights JSON from production: the version-discovery
 * endpoint names the engine version, then the public bucket serves the file.
 * @param {object} ref a video reference (see parseVidSource)
 * @param {string} ref.vid the 12-character video id
 * @param {number} ref.sessionIdx 0-based session index within the video
 * @returns {Promise<object>} the parsed insights JSON
 * @throws {Error} when the pb.vision service rejects the vid (unknown /
 *   never processed / still processing / failed) or the requested session
 *   does not exist
 */
export async function fetchVidInsights ({ vid, sessionIdx }) {
  const res = await fetch(VERSION_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vid })
  })
  if (!res.ok) {
    throw new Error('cannot fetch this video\'s insights — ' +
      `the pb.vision service says (HTTP ${res.status}): ` +
      `${await endpointMessage(res)}`)
  }
  const { aiEngineVersion } = await res.json()
  const sessioned = aiEngineVersion >= FIRST_SESSIONED_VERSION
  const sessionNotFound = () =>
    new Error(`session ${sessionIdx + 1} not found for this video`)
  if (!sessioned && sessionIdx > 0) {
    throw sessionNotFound() // pre-133 videos only ever have one session
  }
  const url = `${BUCKET}/${vid}/${aiEngineVersion}` +
    (sessioned ? `/${sessionIdx}` : '') + '/insights.json'
  const insightsRes = await fetch(url)
  if (!insightsRes.ok) { // the bucket answers 404/403 for missing objects
    throw sessionNotFound()
  }
  return insightsRes.json()
}
