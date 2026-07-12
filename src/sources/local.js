// Resolves FROM sources against the local filesystem (CLI/offline usage):
// video("path") names one insights JSON file, and folder("path") a directory
// whose *.json files are all queried — recursively unless the query said
// folder("path", false). Sessions only exist on pb.vision, so every local
// file is a whole game at sessionIdx 0.
import fs from 'node:fs'
import path from 'node:path'

function gameFromFile (file) {
  return {
    vid: path.basename(file).replace(/\.json$/, ''),
    sessionIdx: 0,
    insights: JSON.parse(fs.readFileSync(file, 'utf8'))
  }
}

/**
 * Resolves a query's FROM sources to local insights files.
 * @param {Array<object>} sources the query AST's sources
 * @param {object} [options]
 * @param {string} [options.cwd] base for relative paths (default:
 *   process.cwd())
 * @returns {Array<{vid: string, sessionIdx: number, insights: object}>} one
 *   entry per game; vid is the file's basename without .json
 * @throws {Error} when a path does not exist or a source only makes sense
 *   on pb.vision (integer folder ids)
 */
export function resolveLocalSources (sources, { cwd = process.cwd() } = {}) {
  const games = []
  for (const source of sources) {
    if (source.kind === 'video') {
      const file = path.resolve(cwd, source.vid)
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        throw new Error(`video("${source.vid}"): no such insights file ` +
          `(looked for ${file})`)
      }
      games.push(gameFromFile(file))
    } else if (source.path !== undefined) {
      const dir = path.resolve(cwd, source.path)
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        throw new Error(`folder("${source.path}"): no such directory ` +
          `(looked for ${dir})`)
      }
      const files = fs.readdirSync(dir, { recursive: source.recursive })
        .map(name => path.join(dir, String(name)))
        .filter(file => file.endsWith('.json') && fs.statSync(file).isFile())
        .sort()
      games.push(...files.map(gameFromFile))
    } else {
      throw new Error(`folder(${source.fid}) names a pb.vision library ` +
        'folder; local queries need a directory path, e.g. folder("./games")')
    }
  }
  return games
}
