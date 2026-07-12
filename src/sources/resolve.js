// Resolves a query's FROM source strings for Node hosts (the CLI). Each
// source is interpreted by exactly one rule (D17):
//   1. vid-shaped ("83gyqyc10y8f" or "83gyqyc10y8f:2", session 1-based) —
//      a pb.vision video; its insights live in the public production
//      bucket, but fetching is not yet supported (see the TODO below).
//   2. an existing file — one insights JSON (a local file is a whole game
//      at sessionIdx 0; a file named like a vid must be written "./…").
//   3. an existing directory — every *.json beneath it, recursively.
//   4. anything else — a glob pattern ("games/*.json").
import fs from 'node:fs'
import path from 'node:path'

import { parseVidSource } from './vid.js'

function gameFromFile (file) {
  return {
    vid: path.basename(file).replace(/\.json$/, ''),
    sessionIdx: 0,
    insights: JSON.parse(fs.readFileSync(file, 'utf8'))
  }
}

/**
 * Resolves a query's FROM sources to insights games.
 * @param {Array<string>} sources the query AST's source strings
 * @param {object} [options]
 * @param {string} [options.cwd] base for relative paths and globs
 *   (default: process.cwd())
 * @returns {Array<{vid: string, sessionIdx: number, insights: object}>} one
 *   entry per game, in FROM order; vid is the file's basename without .json
 * @throws {Error} when a source matches nothing, or names a pb.vision
 *   video (not yet fetchable)
 */
export function resolveSources (sources, { cwd = process.cwd() } = {}) {
  const games = []
  for (const source of sources) {
    if (parseVidSource(source) !== null) {
      // TODO(M8): fetch https://storage.googleapis.com/pbv-pro/
      // {vid}/{aiEngineVersion}/{sessionIdx}/insights.json — but the
      // aiEngineVersion path segment cannot be discovered client-side:
      // the public bucket denies anonymous object listing (verified
      // 2026-07-15). Blocked on a version-discovery endpoint.
      throw new Error(`"${source}": fetching insights by video id is not ` +
        'yet supported (needs a version-discovery endpoint — plan M8); ' +
        'download the insights JSON and query the file instead')
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
