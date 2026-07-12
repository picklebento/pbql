// Resolves a query's FROM source strings for Node hosts (the CLI). Each
// source is interpreted by exactly one rule (D17):
//   1. vid-shaped ("83gyqyc10y8f" or "83gyqyc10y8f:2", session 1-based) —
//      a pb.vision video; its aiEngineVersion comes from the production
//      service and its insights from the public production bucket (a local
//      file named like a vid must be written "./…").
//   2. an existing file — one insights JSON (a local file is a whole game
//      at sessionIdx 0).
//   3. an existing directory — every *.json beneath it, recursively.
//   4. anything else — a glob pattern ("games/*.json").
import fs from 'node:fs'
import path from 'node:path'

import { parseVidSource } from './vid.js'

// discovers the aiEngineVersion segment of a video's insights URL (the
// public bucket denies anonymous object listing, so it can't be found
// client-side without this endpoint)
const VERSION_ENDPOINT =
  'https://api-2o2klzx4pa-uc.a.run.app/video/ai_engine_version'
const BUCKET = 'https://storage.googleapis.com/pbv-pro'
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

async function fetchVidGame ({ vid, sessionIdx }, source) {
  const res = await fetch(VERSION_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vid })
  })
  if (!res.ok) {
    throw new Error(`"${source}": cannot fetch this video's insights — ` +
      `the pb.vision service says (HTTP ${res.status}): ` +
      `${await endpointMessage(res)}`)
  }
  const { aiEngineVersion } = await res.json()
  const sessioned = aiEngineVersion >= FIRST_SESSIONED_VERSION
  const sessionNotFound = () => new Error(`"${source}": session ` +
    `${sessionIdx + 1} not found for this video`)
  if (!sessioned && sessionIdx > 0) {
    throw sessionNotFound() // pre-133 videos only ever have one session
  }
  const url = BUCKET + `/${vid}/${aiEngineVersion}` +
    (sessioned ? `/${sessionIdx}` : '') + '/insights.json'
  const insightsRes = await fetch(url)
  if (!insightsRes.ok) { // the bucket answers 404/403 for missing objects
    throw sessionNotFound()
  }
  return { vid, sessionIdx, insights: await insightsRes.json() }
}

function gameFromFile (file) {
  return {
    vid: path.basename(file).replace(/\.json$/, ''),
    sessionIdx: 0,
    insights: JSON.parse(fs.readFileSync(file, 'utf8'))
  }
}

/**
 * Resolves a query's FROM sources to insights games. Local paths resolve
 * synchronously; vid-shaped sources fetch from production (hence async).
 * @param {Array<string>} sources the query AST's source strings
 * @param {object} [options]
 * @param {string} [options.cwd] base for relative paths and globs
 *   (default: process.cwd())
 * @returns {Promise<Array<{vid: string, sessionIdx: number,
 *   insights: object}>>} one entry per game, in FROM order; vid is the
 *   file's basename without .json
 * @throws {Error} when a source matches nothing, the pb.vision service
 *   rejects the vid (unknown / never processed / still processing /
 *   failed), or the requested session does not exist
 */
export async function resolveSources (sources, { cwd = process.cwd() } = {}) {
  const games = []
  for (const source of sources) {
    const vidRef = parseVidSource(source)
    if (vidRef !== null) {
      games.push(await fetchVidGame(vidRef, source))
      continue
    }
    const resolved = path.resolve(cwd, source)
    const stat = fs.statSync(resolved, { throwIfNoEntry: false })
    if (stat !== undefined && stat.isFile()) {
      games.push(gameFromFile(resolved))
    } else if (stat !== undefined && stat.isDirectory()) {
      const files = fs.readdirSync(resolved, { recursive: true })
        .map(name => path.join(resolved, String(name)))
        .filter(file => file.endsWith('.json') && fs.statSync(file).isFile())
        .sort()
      games.push(...files.map(gameFromFile))
    } else {
      const matches = fs.globSync(source, { cwd })
        .map(name => path.resolve(cwd, name))
        .filter(file => fs.statSync(file).isFile())
        .sort()
      if (matches.length === 0) {
        throw new Error(`"${source}" matched nothing — not a video id, ` +
          'file, directory, or glob')
      }
      games.push(...matches.map(gameFromFile))
    }
  }
  return games
}
