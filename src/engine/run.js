// runQuery: the engine's public entry point. The caller supplies the games
// to search (the host resolves FROM sources to insights JSON — the CLI via
// src/sources/resolve.js); the engine analyzes, filters, orders,
// limits, computes context windows, and projects SELECT.
import { analyze, isAggregateCall, normalize } from '../analyze/analyze.js'
import { parse } from '../lang/parse.js'
import { printExpr } from '../lang/print.js'
import { Game, InvalidInsightsError, UnsupportedInsightsError } from '../model/game.js'
import { playerMatchesTag } from '../model/registry.js'

import { UNKNOWN, asNumber, evalExpr } from './evaluate.js'
import { computeWindow } from './window.js'

// Aggregate coercion: booleans fold to 1/0 so avg(<condition>) is a rate and
// sum(<condition>) counts trues; numbers pass through; strings and other
// non-numbers become UNKNOWN and are skipped (so sum(shot.type) is null).
function aggregateNumber (value) {
  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }
  return asNumber(value)
}

// one aggregate value over a set of shots; all inputs unknown (or an empty
// set) aggregates to null
function evalAggregate (expr, shots) {
  if (expr.name === 'count') {
    return shots.length
  }
  const values = shots
    .map(ctx => aggregateNumber(evalExpr(expr.args[0], ctx)))
    .filter(v => v !== UNKNOWN) // so avg(<cond>) is a rate, sum(<cond>) a count
  if (values.length === 0) {
    return null
  }
  switch (expr.name) {
    case 'sum': return values.reduce((a, b) => a + b, 0)
    case 'avg': return values.reduce((a, b) => a + b, 0) / values.length
    case 'min': return values.reduce((a, b) => Math.min(a, b))
    default: return values.reduce((a, b) => Math.max(a, b))
  }
}

function compareValues (a, b) {
  // unknowns sort last regardless of direction (handled by the caller)
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a < b ? -1 : a > b ? 1 : 0
  }
  /* istanbul ignore else -- every registry property has a uniform type, so
     mixed-type keys can't occur today */
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return Number(a) - Number(b)
  } else {
    return 0 // incomparable values keep their relative order
  }
}

// stable sort by per-item ORDER BY keys; UNKNOWN keys sort last regardless
// of direction
function sortByKeys (items, orderBy, keysOf) {
  const keyed = items.map(item => ({ item, keys: keysOf(item) }))
  keyed.sort((a, b) => {
    for (let i = 0; i < orderBy.length; i++) {
      const ka = a.keys[i]
      const kb = b.keys[i]
      if (ka === UNKNOWN || kb === UNKNOWN) {
        if (ka !== kb) {
          return ka === UNKNOWN ? 1 : -1
        }
        continue
      }
      const cmp = compareValues(ka, kb)
      if (cmp !== 0) {
        return orderBy[i].dir === 'desc' ? -cmp : cmp
      }
    }
    return 0
  })
  return keyed.map(k => k.item)
}

function project (query, selected) {
  const columns = query.select.map(({ expr, label }) =>
    label ?? printExpr(expr))
  const aggregateFlags = query.select.map(({ expr }) => isAggregateCall(expr))
  if (aggregateFlags.some(Boolean)) {
    if (!aggregateFlags.every(Boolean)) {
      return {
        errors: [{
          code: 'PBQL_MIXED_AGGREGATES',
          message: 'SELECT cannot mix aggregate and per-shot expressions ' +
            '(unless the per-shot expressions are GROUP BY keys)',
          line: 1,
          col: 1,
          length: 0
        }]
      }
    }
    return { columns, rows: [query.select.map(({ expr }) => evalAggregate(expr, selected))] }
  }
  const rows = selected.map(ctx => query.select.map(({ expr }) => {
    const value = evalExpr(expr, ctx)
    return value === UNKNOWN ? null : value
  }))
  return { columns, rows }
}

// The documented default row order for GROUP BY: ascending per key
// component with null (unknown) keys last; across types — which a single
// key expression cannot produce today — booleans sort before numbers
// before strings.
const TYPE_RANK = { boolean: 0, number: 1, string: 2 }
function compareKeyValues (a, b) {
  if (a === null || b === null) {
    return a === b ? 0 : a === null ? 1 : -1
  }
  const rank = TYPE_RANK[typeof a] - TYPE_RANK[typeof b]
  /* istanbul ignore next -- every expression has one runtime value type, so
     a key column never mixes types today */
  if (rank !== 0) {
    return rank
  }
  return compareValues(a, b)
}

function compareKeyTuples (a, b) {
  let cmp = 0
  for (let i = 0; cmp === 0 && i < a.length; i++) {
    cmp = compareKeyValues(a[i], b[i])
  }
  return cmp
}

// GROUP BY: partition the WHERE-selected shots by their key tuple, then
// evaluate SELECT once per group. Unknown key values become null (shots
// sharing the null-extended tuple form one group — never dropped). Group
// keys are constant within a group, so they read off its first member;
// aggregates run over the members. Without ORDER BY, rows sort ascending by
// key tuple (compareKeyValues); ORDER BY sorts rows by its aggregate/key
// expressions; LIMIT keeps the first rows.
function projectGrouped (query, selected) {
  const groups = new Map() // serialized key tuple → { keyValues, members }
  for (const ctx of selected) {
    const keyValues = query.groupBy.map(expr => {
      const value = evalExpr(expr, ctx)
      return value === UNKNOWN ? null : value
    })
    const id = JSON.stringify(keyValues)
    if (!groups.has(id)) {
      groups.set(id, { keyValues, members: [] })
    }
    groups.get(id).members.push(ctx)
  }
  // the analyzer guarantees every SELECT/ORDER BY expr is one or the other
  const valueOf = (expr, group) => {
    if (isAggregateCall(expr)) {
      return evalAggregate(expr, group.members)
    }
    const value = evalExpr(expr, group.members[0])
    return value === UNKNOWN ? null : value
  }
  let rows = [...groups.values()]
  rows = query.orderBy
    ? sortByKeys(rows, query.orderBy, group => query.orderBy.map(({ expr }) => {
      const value = valueOf(expr, group)
      return value === null ? UNKNOWN : value // nulls sort last either way
    }))
    : rows.sort((a, b) => compareKeyTuples(a.keyValues, b.keyValues))
  if (query.limit !== null) {
    rows = rows.slice(0, query.limit)
  }
  return {
    columns: query.select.map(({ expr, label }) => label ?? printExpr(expr)),
    rows: rows.map(group => query.select.map(({ expr }) => valueOf(expr, group)))
  }
}

// Collects the facts about a query that depend on per-game player metadata:
// whether it references "me"/"my…" (needs meta.myPlayerIdx) and each literal
// taggedWith() pattern (needs a matching tagged player in the game).
function collectPlayerFacts (node, facts) {
  if (Array.isArray(node)) {
    node.forEach(item => collectPlayerFacts(item, facts))
    return
  }
  if (node === null || typeof node !== 'object') {
    return
  }
  if (node.kind === 'prop') {
    const { base } = node
    if (base.object === 'player') { // the only player root is `me`
      facts.referencesMe = true
    }
    // taggedWith is always the final path segment of a method call
    if (node.args && node.path[node.path.length - 1] === 'taggedWith' &&
        node.args[0].kind === 'lit' && typeof node.args[0].value === 'string') {
      facts.tagPatterns.add(node.args[0].value)
    }
  }
  for (const value of Object.values(node)) {
    collectPlayerFacts(value, facts)
  }
}

// Per-game warnings for player references the game cannot resolve. These are
// additive: the conditions still evaluate to unknown and simply never
// match — the warnings tell the user why (hosts show them like validation
// errors).
function playerWarnings (facts, game) {
  const warnings = []
  const warn = (code, message) =>
    warnings.push({ vid: game.vid, sessionIdx: game.sessionIdx, code, message })
  if (facts.referencesMe && game.myPlayerIdx === undefined) {
    warn('PBQL_ME_NOT_TAGGED',
      '"me" is not tagged in this game, so conditions using "me" or "my…" ' +
      'players are unknown here')
  }
  for (const pattern of facts.tagPatterns) {
    const matches = [0, 1, 2, 3].some(playerIdx =>
      playerMatchesTag({ game }, playerIdx, pattern) === true)
    if (!matches) {
      warn('PBQL_TAG_NOT_FOUND',
        `no player in this game matches taggedWith("${pattern}"), so it is ` +
        'unknown here')
    }
  }
  return warnings
}

/**
 * Runs a PBQL query over the given games.
 * @param {object} args
 * @param {string} args.text the query text
 * @param {Array<object>} args.games the games to search, as plain
 *   {vid, sessionIdx, insights, meta} descriptors (the engine wraps them);
 *   games whose insights version is unsupported are skipped and reported in
 *   warnings
 * @param {object} [args.options] { maxSecsBeyondRally }
 * @returns {{shots: Array, columns?: Array, rows?: Array,
 *   warnings: Array} | {errors: Array}} results, or lex/parse/analyze errors
 */
export function runQuery ({ text, games, options = {} }) {
  const parsed = parse(text)
  if (parsed.errors) {
    return { errors: parsed.errors }
  }
  // canonicalize alias forms (e.g. taggedWith(shot, "x")) before validating
  const query = normalize(parsed.ast)
  const analysis = analyze(query)
  if (analysis.errors.length > 0) {
    return { errors: analysis.errors }
  }

  const warnings = []
  const wrapped = []
  for (const game of games) {
    try {
      wrapped.push(new Game(game))
    } catch (err) {
      /* istanbul ignore next -- only insights problems are expected here */
      if (!(err instanceof UnsupportedInsightsError) &&
          !(err instanceof InvalidInsightsError)) {
        throw err
      }
      warnings.push({
        vid: game.vid,
        sessionIdx: game.sessionIdx,
        code: err.code,
        message: err.message
      })
    }
  }

  // warn per game about player references that cannot resolve there (the
  // conditions themselves still evaluate to unknown — see playerWarnings)
  const facts = { referencesMe: false, tagPatterns: new Set() }
  for (const part of [query.where, query.select, query.groupBy, query.orderBy]) {
    collectPlayerFacts(part, facts)
  }
  for (const game of wrapped) {
    warnings.push(...playerWarnings(facts, game))
  }

  let selected = []
  for (const game of wrapped) {
    for (const ctx of game.shotRefs) {
      if (evalExpr(query.where, ctx) === true) {
        selected.push(ctx)
      }
    }
  }

  // with GROUP BY, ORDER BY and LIMIT act on the grouped rows instead
  // (inside projectGrouped); the shots themselves keep video order
  if (!query.groupBy) {
    if (query.orderBy) {
      selected = sortByKeys(selected, query.orderBy, ctx =>
        query.orderBy.map(({ expr }) => evalExpr(expr, ctx)))
    }
    if (query.limit !== null) {
      selected = selected.slice(0, query.limit)
    }
  }

  const shots = selected.map(ctx => {
    const { sMs, eMs, contextShots } = computeWindow(ctx, query.context, options)
    return {
      vid: ctx.game.vid,
      sessionIdx: ctx.game.sessionIdx,
      rallyIdx: ctx.rallyIdx,
      shotIdx: ctx.shotIdx,
      hitMs: ctx.game.hitMs(ctx.shot),
      window: { sMs, eMs },
      contextShots
    }
  })

  // the resolved context durations ride along so hosts can see the effective
  // window settings (a bare shot-list defaults to a ±1-shot lead-in/lead-out;
  // projections and a written-but-one-sided clause default the rest to 0secs)
  const result = { shots, warnings, context: query.context }
  if (query.groupBy) {
    const { columns, rows } = projectGrouped(query, selected)
    result.columns = columns
    result.rows = rows
  } else if (query.select) {
    const projected = project(query, selected)
    if (projected.errors) {
      return projected
    }
    result.columns = projected.columns
    result.rows = projected.rows
  }
  return result
}
