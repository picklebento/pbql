// runQuery: the engine's public entry point. The caller supplies the games
// to search (the host resolves FROM sources to insights JSON); the engine
// analyzes, filters, orders, limits, computes context windows, and projects
// SELECT.
import { AGGREGATE_FNS, analyze, normalize } from '../analyze/analyze.js'
import { parse } from '../lang/parse.js'
import { printExpr } from '../lang/print.js'
import { Game, UnsupportedInsightsError } from '../model/game.js'

import { UNKNOWN, evalExpr } from './evaluate.js'
import { computeWindow } from './window.js'

function isAggregateItem (item) {
  const { expr } = item
  return expr.kind === 'call' && AGGREGATE_FNS.has(expr.name) &&
    expr.args.length === (expr.name === 'count' ? 0 : 1)
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

function sortSelected (selected, orderBy) {
  const keyed = selected.map(ctx => ({
    ctx,
    keys: orderBy.map(({ expr }) => evalExpr(expr, ctx))
  }))
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
  return keyed.map(k => k.ctx)
}

function project (query, selected) {
  const columns = query.select.map(({ expr, label }) =>
    label ?? printExpr(expr))
  const aggregateFlags = query.select.map(isAggregateItem)
  if (aggregateFlags.some(Boolean)) {
    if (!aggregateFlags.every(Boolean)) {
      return {
        errors: [{
          code: 'PBQL_MIXED_AGGREGATES',
          message: 'SELECT cannot mix aggregate and per-shot expressions',
          line: 1,
          col: 1,
          length: 0
        }]
      }
    }
    const row = query.select.map(({ expr }) => {
      if (expr.name === 'count') {
        return selected.length
      }
      const values = selected
        .map(ctx => evalExpr(expr.args[0], ctx))
        .filter(v => v !== UNKNOWN) // aggregates skip unknown inputs
      if (values.length === 0) {
        return null
      }
      switch (expr.name) {
        case 'sum': return values.reduce((a, b) => a + b, 0)
        case 'avg': return values.reduce((a, b) => a + b, 0) / values.length
        case 'min': return values.reduce((a, b) => Math.min(a, b))
        default: return values.reduce((a, b) => Math.max(a, b))
      }
    })
    return { columns, rows: [row] }
  }
  const rows = selected.map(ctx => query.select.map(({ expr }) => {
    const value = evalExpr(expr, ctx)
    return value === UNKNOWN ? null : value
  }))
  return { columns, rows }
}

/**
 * Runs a PBQL query over the given games.
 * @param {object} args
 * @param {string} [args.text] the query text (or pass a parsed args.ast)
 * @param {object} [args.ast] a parsed query AST
 * @param {Array<Game|object>} args.games Game instances, or raw
 *   {vid, sessionIdx, insights, meta} descriptors to wrap; games whose
 *   insights version is unsupported are skipped and reported in warnings
 * @param {object} [args.options] { maxSecsBeyondRally }
 * @returns {{shots: Array, columns?: Array, rows?: Array,
 *   warnings: Array} | {errors: Array}} results, or lex/parse/analyze errors
 */
export function runQuery ({ text, ast, games, options = {} }) {
  if (ast === undefined) {
    const parsed = parse(text)
    if (parsed.errors) {
      return { errors: parsed.errors }
    }
    ast = parsed.ast
  }
  // canonicalize alias forms (e.g. taggedWith(shot, "x")) before validating
  const query = normalize(ast)
  const analysis = analyze(query)
  if (analysis.errors.length > 0) {
    return { errors: analysis.errors }
  }

  const warnings = []
  const wrapped = []
  for (const game of games) {
    if (game instanceof Game) {
      wrapped.push(game)
      continue
    }
    try {
      wrapped.push(new Game(game))
    } catch (err) {
      /* istanbul ignore next -- only version problems are expected here */
      if (!(err instanceof UnsupportedInsightsError)) {
        throw err
      }
      warnings.push({
        vid: game.vid,
        sessionIdx: game.sessionIdx,
        message: err.message
      })
    }
  }

  let selected = []
  for (const game of wrapped) {
    for (const ctx of game.shotRefs) {
      if (evalExpr(query.where, ctx) === true) {
        selected.push(ctx)
      }
    }
  }

  if (query.orderBy) {
    selected = sortSelected(selected, query.orderBy)
  }
  if (query.limit !== null) {
    selected = selected.slice(0, query.limit)
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

  const result = { shots, warnings }
  if (query.select) {
    const projected = project(query, selected)
    if (projected.errors) {
      return projected
    }
    result.columns = projected.columns
    result.rows = projected.rows
  }
  return result
}
