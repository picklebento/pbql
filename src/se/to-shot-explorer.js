// Builds Shot Explorer deep links. The explore page accepts a PBQL query
// directly via its q param, so sharing a query is just sharing a URL — no
// result translation needed. One link per pb.vision video named in FROM
// (other source strings — files, directories, globs — have no explore page).
import { parseVidSource } from '../sources/vid.js'

/**
 * Builds ready-to-open explore deep links for a query.
 * @param {string} queryText the PBQL query
 * @param {Array<string>} sources the query's FROM sources (ast.sources)
 * @returns {Array<string>} one URL per vid-shaped source, in FROM order
 */
export function toShotExplorerURLs (queryText, sources) {
  const urls = []
  for (const source of sources) {
    const vidSource = parseVidSource(source)
    if (vidSource !== null) {
      urls.push(`https://pb.vision/video/${vidSource.vid}/` +
        `${vidSource.sessionIdx}/explore?q=${encodeURIComponent(queryText)}`)
    }
  }
  return urls
}
