// Converts query results into the Shot Explorer's own input format — the
// explore page's URL params (?shots=R.S,…&numBefore=&numAfter=, 1-based
// rally.shot numbers) — so a PBQL query can drive SE exactly like manual
// filters, with the language's richer expressiveness.

// SE expresses context only as uniform shot counts (0-999; 999 = to the
// rally boundary). Plain `N shots` and `rally` durations map exactly;
// seconds-based or min/max durations don't, so we return undefined and SE
// falls back to its own default (the clip windows may differ slightly).
export function windowParam (dur) {
  if (dur.kind === 'durfn') {
    return undefined
  }
  if (dur.unit === 'shots') {
    return dur.value
  }
  if (dur.unit === 'rally') {
    return 999
  }
  return dur.value === 0 ? 0 : undefined
}

/**
 * Groups a query result into per-game Shot Explorer selections.
 * @param {object} result a runQuery() result
 * @returns {Array<{vid: string, sessionIdx: number, params: {shots: string,
 *   numBefore?: number, numAfter?: number}}>} one entry per game that had
 *   selected shots, in result order
 */
export function toShotExplorerParams (result) {
  const numBefore = windowParam(result.context.before)
  const numAfter = windowParam(result.context.after)
  const byGame = new Map()
  for (const shot of result.shots) {
    const key = `${shot.vid}#${shot.sessionIdx}`
    if (!byGame.has(key)) {
      byGame.set(key, { vid: shot.vid, sessionIdx: shot.sessionIdx, refs: [] })
    }
    // the explore page uses 1-based rally.shot pairs
    byGame.get(key).refs.push(`${shot.rallyIdx + 1}.${shot.shotIdx + 1}`)
  }
  return [...byGame.values()].map(({ vid, sessionIdx, refs }) => {
    const params = { shots: refs.join(',') }
    if (numBefore !== undefined) {
      params.numBefore = numBefore
    }
    if (numAfter !== undefined) {
      params.numAfter = numAfter
    }
    return { vid, sessionIdx, params }
  })
}

/**
 * Builds ready-to-open explore deep links, one per game with results.
 * @param {object} result a runQuery() result
 * @param {object} [options] { host } — e.g. 'https://pbv-dev.web.app'
 */
export function toShotExplorerURLs (result, { host = 'https://pb.vision' } = {}) {
  return toShotExplorerParams(result).map(({ vid, sessionIdx, params }) => {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]))
    return `${host}/video/${vid}/${sessionIdx}/explore?${qs}`
  })
}
