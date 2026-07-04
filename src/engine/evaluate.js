// Expression evaluation with SQL/Kleene three-valued logic (D2): missing
// data evaluates to UNKNOWN, which propagates through comparisons and
// arithmetic; WHERE keeps a shot only when the condition is exactly true.
import { isOnFarSide, toPlayerFrame } from '../model/geometry.js'
import { REGISTRY } from '../model/registry.js'

export const UNKNOWN = Symbol('pbql.unknown')

const u = value => value === undefined ? UNKNOWN : value

// which side is this team's partner: 0↔1, 2↔3
const partnerOf = idx => idx ^ 1

function isSingles (game) {
  return game.insights.session?.num_players === 2
}

/**
 * Resolves a player reference (canonical spelling, e.g. "myOpponentLHS") to
 * a player index 0-3, or undefined when unresolvable (no "me" mapping,
 * singles teammate, unknown positions for LHS/RHS, …).
 */
export function resolvePlayer (name, ctx) {
  const root = name.startsWith('my') || name === 'me'
    ? ctx.game.myPlayerIdx
    : ctx.shot.player_id
  if (root === undefined) {
    return undefined
  }
  if (name === 'me' || name === 'hitter') {
    return root
  }
  const rel = name.replace(/^(my|hitters)/, '')
  if (rel === 'Teammate') {
    return isSingles(ctx.game) ? undefined : partnerOf(root)
  }
  const opponents = root < 2 ? [2, 3] : [0, 1]
  if (isSingles(ctx.game)) {
    // the lone opponent answers Opponent1/LHS/RHS; there is no Opponent2
    return rel === 'Opponent2' ? undefined : opponents[0]
  }
  if (rel === 'Opponent1') {
    return opponents[0]
  }
  if (rel === 'Opponent2') {
    return opponents[1]
  }
  // OpponentLHS/RHS: by side at the current shot, from the root player's
  // point of view (left = smaller x in the root player's frame)
  const rootPos = ctx.game.playerPosAtShot(ctx.shot, root)
  const positions = opponents.map(idx => ctx.game.playerPosAtShot(ctx.shot, idx))
  if (rootPos === undefined || rootPos === null ||
      positions.some(p => p === undefined || p === null)) {
    return undefined
  }
  const rootOnFarSide = isOnFarSide(rootPos)
  const [a, b] = positions.map(p => toPlayerFrame(p, rootOnFarSide).x)
  const [lhs, rhs] = a <= b ? opponents : [opponents[1], opponents[0]]
  return rel === 'OpponentLHS' ? lhs : rhs
}

function comparable (a, b) {
  return typeof a === typeof b
}

function compare (op, a, b) {
  if (a === UNKNOWN || b === UNKNOWN || !comparable(a, b)) {
    return UNKNOWN
  }
  switch (op) {
    case '=': return a === b
    case '!=': return a !== b
    default:
      if (typeof a !== 'number') {
        return UNKNOWN // ordering is defined for numbers only
      }
      switch (op) {
        case '<': return a < b
        case '<=': return a <= b
        case '>': return a > b
        default: return a >= b
      }
  }
}

function asNumber (value) {
  return typeof value === 'number' ? value : UNKNOWN
}

function evalProp (node, ctx) {
  const { base } = node
  let table = REGISTRY[base.object]
  let subCtx = ctx
  let playerIdx
  if (base.object === 'player') {
    table = REGISTRY.player
    playerIdx = resolvePlayer(base.name, ctx)
    if (playerIdx === undefined) {
      return UNKNOWN
    }
  } else if (base.object === 'shot') {
    const shotIdx = ctx.shotIdx + base.offset
    const shots = ctx.rally.shots ?? []
    if (shotIdx < 0 || shotIdx >= shots.length) {
      return UNKNOWN
    }
    subCtx = { ...ctx, shot: shots[shotIdx], shotIdx }
  } else if (base.object === 'rally') {
    const rallyIdx = ctx.rallyIdx + base.offset
    const rallies = ctx.game.rallies
    if (rallyIdx < 0 || rallyIdx >= rallies.length) {
      return UNKNOWN
    }
    subCtx = { ...ctx, rally: rallies[rallyIdx], rallyIdx }
  }
  if (node.args) { // method call (analyzer guarantees it exists)
    const method = table.methods.get(node.path[0])
    if (method === undefined) {
      return UNKNOWN
    }
    const args = []
    for (const argNode of node.args) {
      const arg = evalExpr(argNode, ctx)
      if (arg === UNKNOWN) {
        return UNKNOWN
      }
      args.push(arg)
    }
    return u(method.apply(subCtx, playerIdx, args))
  }
  if (node.path.length === 0) {
    // a bare player reference is its identity (so hitter = me works)
    return base.object === 'player' ? playerIdx : UNKNOWN
  }
  const prop = table.props.get(node.path.join('.'))
  if (prop === undefined) {
    return UNKNOWN
  }
  return u(prop.extract(subCtx, playerIdx))
}

function evalCall (node, ctx) {
  if (node.name === 'exists') {
    return evalExpr(node.args[0], ctx) !== UNKNOWN
  }
  const args = []
  for (const argNode of node.args) {
    const value = asNumber(evalExpr(argNode, ctx))
    if (value === UNKNOWN) {
      return UNKNOWN
    }
    args.push(value)
  }
  switch (node.name) {
    case 'min': return Math.min(...args)
    case 'max': return Math.max(...args)
    case 'abs': return Math.abs(args[0])
    case 'kph': return args[0] * 1.609344
    case 'toMs': return args[0] * 1000
    case 'toSecs': return args[0] / 1000
    default: return UNKNOWN // unknown functions never reach here via runQuery
  }
}

export function evalExpr (node, ctx) {
  switch (node.kind) {
    case 'lit':
      return node.value
    case 'prop':
      return evalProp(node, ctx)
    case 'call':
      return evalCall(node, ctx)
    case 'neg': {
      const value = asNumber(evalExpr(node.arg, ctx))
      return value === UNKNOWN ? UNKNOWN : -value
    }
    case 'arith': {
      const lhs = asNumber(evalExpr(node.lhs, ctx))
      const rhs = asNumber(evalExpr(node.rhs, ctx))
      if (lhs === UNKNOWN || rhs === UNKNOWN) {
        return UNKNOWN
      }
      switch (node.op) {
        case '+': return lhs + rhs
        case '-': return lhs - rhs
        case '*': return lhs * rhs
        default: return rhs === 0 ? UNKNOWN : lhs / rhs
      }
    }
    case 'cmp':
      return compare(node.op, evalExpr(node.lhs, ctx), evalExpr(node.rhs, ctx))
    case 'in': {
      const lhs = evalExpr(node.lhs, ctx)
      if (lhs === UNKNOWN) {
        return UNKNOWN
      }
      return node.list.some(value => comparable(lhs, value) && lhs === value)
    }
    case 'not': {
      const value = evalExpr(node.arg, ctx)
      return typeof value === 'boolean' ? !value : UNKNOWN
    }
    case 'and': {
      let sawUnknown = false
      for (const arg of node.args) {
        const value = evalExpr(arg, ctx)
        if (value === false) {
          return false
        }
        if (value !== true) {
          sawUnknown = true
        }
      }
      return sawUnknown ? UNKNOWN : true
    }
    default: { // 'or' is the only remaining kind
      let sawUnknown = false
      for (const arg of node.args) {
        const value = evalExpr(arg, ctx)
        if (value === true) {
          return true
        }
        if (value !== false) {
          sawUnknown = true
        }
      }
      return sawUnknown ? UNKNOWN : false
    }
  }
}
