// Builds Shot Explorer deep links. The explore page accepts a PBQL query
// directly via its q param, so sharing a query is just sharing a URL — no
// result translation needed. One link per pb.vision video named in FROM
// (other source strings — files, directories, globs — have no explore page).
import { parse } from '../lang/parse.js'
import { print } from '../lang/print.js'
import { parseVidSource } from '../sources/vid.js'

// The explore URL already names the video and session, so the encoded query
// carries only the body: the app substitutes its own FROM for whatever the
// page shows. Canonical form puts FROM alone on its own line, so it drops
// out cleanly; unparseable text is encoded as-is.
function queryBody (queryText) {
  const { ast, errors } = parse(queryText)
  if (errors) {
    return queryText
  }
  return print(ast).split('\n')
    .filter(line => !line.startsWith('FROM '))
    .join('\n')
}

/**
 * Builds ready-to-open explore deep links for a query.
 * @param {string} queryText the PBQL query
 * @param {Array<string>} sources the query's FROM sources (ast.sources)
 * @returns {Array<string>} one URL per vid-shaped source, in FROM order
 */
export function toShotExplorerURLs (queryText, sources) {
  const body = queryBody(queryText)
  const urls = []
  for (const source of sources) {
    const vidSource = parseVidSource(source)
    if (vidSource !== null) {
      urls.push(`https://pb.vision/video/${vidSource.vid}/` +
        `${vidSource.sessionIdx}/explore?q=${encodeURIComponent(body)}`)
    }
  }
  return urls
}
