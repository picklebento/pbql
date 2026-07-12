// Translates a Shot Explorer selection (the `filters` + `shotWindow` shape
// from the web app) into PBQL text. SE semantics: OR within a filter
// field, AND across fields. Fields the generator can't express yet are
// returned in `unsupported` instead of being silently dropped.

function quote (value) {
  return `"${String(value).replace(/[\\"]/g, ch => '\\' + ch)}"`
}

function inList (prop, values) {
  return values.length === 1
    ? `${prop} = ${quote(values[0])}`
    : `${prop} IN (${values.map(quote).join(', ')})`
}

function orGroup (terms) {
  return terms.length === 1 ? terms[0] : `(${terms.join(' OR ')})`
}

const ERROR_TERMS = {
  net: 'shot.errors.faults.net',
  out: '(exists(shot.errors.faults.out) AND shot.isFinal)',
  popup: 'exists(shot.errors.popup)',
  intercepted: 'shot.errors.faults.out.outcome = "intercepted"',
  unforced: 'shot.errors.unforced',
  none: 'NOT shot.hasError'
}

const CHARACTERISTIC_TERMS = {
  error: 'shot.hasError',
  'error-dead-dink': 'exists(shot.errors.deadDink)',
  'error-popup': 'exists(shot.errors.popup)',
  fault: 'shot.hasFault',
  'fault-double-bounce': 'shot.errors.faults.doubleBounce',
  'fault-kitchen': 'shot.errors.faults.kitchen',
  'fault-net': 'shot.errors.faults.net',
  'fault-out': 'exists(shot.errors.faults.out)',
  'fault-paddle-hit-net': 'shot.errors.faults.paddleHitNet',
  passing: 'shot.isPassing',
  poach: 'shot.isPoach',
  reset: 'shot.isReset',
  speedup: 'shot.isSpeedup',
  volley: 'shot.isVolley'
}

function has (values) {
  return Array.isArray(values) && values.length > 0
}

/**
 * @param {object} args
 * @param {string} args.vid the video to query
 * @param {number} [args.sessionNum] 1-based game number within the video
 * @param {object} [args.filters] the SE filters object (subset supported)
 * @param {object} [args.shotWindow] { numBefore, numAfter } (999 = to the
 *   rally boundary)
 * @param {Array} [args.players] display names by player index ([{name}]),
 *   used to render player filters readably (hitter.name = "Carol")
 * @param {number} [args.myPlayerIdx] the current user's player index, so
 *   their own filter renders as `hitter = me`
 * @returns {{text: string, unsupported: Array<string>}} the query and any
 *   filter fields that could not be translated
 */
export function filtersToPbql ({
  vid, sessionNum, filters = {}, shotWindow, players, myPlayerIdx
}) {
  const groups = []
  const unsupported = []

  const handlers = {
    players: values => orGroup(values.map(p => {
      if (p === 'self' || (myPlayerIdx !== undefined && Number(p) === myPlayerIdx)) {
        return 'hitter = me'
      }
      const name = players?.[p]?.name
      return name === undefined ? `hitter.id = ${p}` : `hitter.name = ${quote(name)}`
    })),
    quality: ({ min, max }) => {
      const terms = []
      if (min !== undefined && min > 0) {
        terms.push(`shot.quality.overall >= ${min}`)
      }
      if (max !== undefined && max < 1) {
        terms.push(`shot.quality.overall <= ${max}`)
      }
      return terms.join(' AND ') || undefined
    },
    types: values => inList('shot.type', values),
    attributes: values => orGroup(values.map(a =>
      a === 'speedup' ? 'shot.isSpeedup' : 'shot.isReset')),
    errors: values => orGroup(values.map(e => ERROR_TERMS[e])),
    sequences: values => {
      const named = values.filter(s => s !== 'final')
      const terms = []
      if (named.length > 0) {
        terms.push(inList('shot.sequence', named))
      }
      if (values.includes('final')) {
        terms.push('shot.isFinal')
      }
      return orGroup(terms)
    },
    serveDepth: values =>
      `shot.sequence = "serve" AND ${inList('shot.to.zone', values)}`,
    returnDepth: values =>
      `shot.sequence = "return" AND ${inList('shot.to.zone', values)}`,
    strokeType: values => inList('shot.strokeType', values),
    strokeSide: values => inList('shot.strokeSide', values),
    groundStrokeOrVolley: values => orGroup(values.map(v =>
      v === 'volley' ? 'shot.isVolley' : 'NOT shot.isVolley')),
    verticalType: values => inList('shot.verticalType', values),
    winnerType: values => inList('shot.winnerType', values),
    directions: values => inList('shot.direction', values),
    characteristics: values => // AND-combined, unlike other fields
      values.map(c => CHARACTERISTIC_TERMS[c]).join(' AND '),
    highlights: values => orGroup(values.map(h =>
      `shot.inHighlight(${quote(h)})`)),
    rallyType: values => orGroup(values.map(t =>
      Number(t) === 1
        ? 'rally.allPlayersReachedKitchen'
        : 'NOT rally.allPlayersReachedKitchen')),
    rallyLength: ({ min, max }) => {
      const terms = []
      if (min !== undefined && min > 1) {
        terms.push(`rally.numShots >= ${min}`)
      }
      if (max !== undefined && max < 999) {
        terms.push(`rally.numShots <= ${max}`)
      }
      return terms.join(' AND ') || undefined
    },
    ralliesWon: values => orGroup(values.map(w =>
      w === 'won' ? 'rally.winner = me.team' : 'rally.winner != me.team')),
    shots: values => {
      // "R.S" or a same-rally range "R.S1-R.S2" (1-based numbers)
      const terms = []
      for (const item of values) {
        const [from, to] = String(item).split('-')
        const [rallyNum, shotNum] = from.split('.')
        const [toRally, toShot] = to === undefined ? [] : to.split('.')
        if (to === undefined) {
          terms.push(`(rally.num = ${rallyNum} AND shot.num = ${shotNum})`)
        } else if (toRally === rallyNum) {
          terms.push(`(rally.num = ${rallyNum} AND ` +
            `shot.num >= ${shotNum} AND shot.num <= ${toShot})`)
        } else {
          unsupported.push(`shots:${item}`) // cross-rally ranges
        }
      }
      return terms.length > 0 ? orGroup(terms) : undefined
    },
    ranges: values => orGroup(values.map(({ s, e }) =>
      `(shot.hitTime >= ${s} AND shot.hitTime < ${e})`))
  }

  for (const [field, value] of Object.entries(filters)) {
    const isEmpty = Array.isArray(value)
      ? !has(value)
      : value === undefined || value === null
    if (isEmpty) {
      continue
    }
    const handler = handlers[field]
    if (handler === undefined) {
      unsupported.push(field) // e.g. kitchenArrival, customTags
      continue
    }
    const term = handler(value)
    if (term !== undefined) {
      groups.push(term)
    }
  }

  const lines = []
  lines.push(sessionNum === undefined
    ? `FROM video(${quote(vid)})`
    : `FROM video(${quote(vid)}, ${sessionNum})`)
  lines.push(`WHERE ${groups.join(' AND\n      ') || 'true'}`)
  if (shotWindow?.numBefore) {
    lines.push(`CONTEXT BEFORE ${shotWindow.numBefore === 999
      ? 'rally'
: `${shotWindow.numBefore} ${shotWindow.numBefore === 1 ? 'shot' : 'shots'}`}`)
  }
  if (shotWindow?.numAfter) {
    lines.push(`CONTEXT AFTER ${shotWindow.numAfter === 999
      ? 'rally'
: `${shotWindow.numAfter} ${shotWindow.numAfter === 1 ? 'shot' : 'shots'}`}`)
  }
  return { text: lines.join('\n'), unsupported }
}
