// Resolves a query's FROM source strings for Node hosts (the CLI). Each
// source is interpreted by exactly one rule:
//   1. vid-shaped ("83gyqyc10y8f" or "83gyqyc10y8f:2", session 1-based) —
//      a pb.vision video, fetched per src/sources/fetch-vid.js (a local
//      file named like a vid must be written "./…"). Fetched insights are
//      cached locally and the cache is preferred — a hit skips the network
//      entirely (see cacheFile below).
//   2. an existing file — one insights JSON (a local file is a whole game
//      at sessionIdx 0).
//   3. an existing directory — every *.json beneath it, recursively.
//   4. anything else — a glob pattern ("games/*.json").
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { fetchVidInsights } from './fetch-vid.js'
import { parseVidSource } from './vid.js'

// Fetched insights are cached with no expiration (a game's insights for a
// given engine version never change), one file per game under
// $XDG_CACHE_HOME/pbql (default ~/.cache/pbql). Refreshing = deleting the
// game's file (or the whole directory); there is deliberately no --refresh
// flag — one canonical approach.
function cacheFile (vid, sessionIdx) {
  const root = process.env.XDG_CACHE_HOME ||
    path.join(os.homedir(), '.cache')
  return path.join(root, 'pbql', `${vid}-${sessionIdx + 1}.json`)
}

function readCache (file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null // absent or unparseable (corrupt): treat as a miss
  }
}

function writeCache (file, insights) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  // write-then-rename so a concurrent reader never sees a partial file
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(insights))
  fs.renameSync(tmp, file)
}

async function fetchVidGame ({ vid, sessionIdx }, source) {
  const cache = cacheFile(vid, sessionIdx)
  const cached = readCache(cache)
  if (cached !== null) {
    return { vid, sessionIdx, insights: cached }
  }
  let insights
  try {
    insights = await fetchVidInsights({ vid, sessionIdx })
  } catch (err) {
    // fetch-vid errors don't know which FROM string they came from
    throw new Error(`"${source}": ${err.message}`)
  }
  writeCache(cache, insights)
  return { vid, sessionIdx, insights }
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
 * @throws {Error} when a source is blank or matches nothing, the pb.vision service
 *   rejects the vid (unknown / never processed / still processing /
 *   failed), or the requested session does not exist
 */
export async function resolveSources (sources, { cwd = process.cwd() } = {}) {
  const games = []
  for (const source of sources) {
    if (source.trim() === '') {
      // "" would otherwise resolve as the cwd and sweep everything under it
      throw new Error(`"${source}" is blank — each FROM source must name ` +
        'a video id, file, directory, or glob')
    }
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
