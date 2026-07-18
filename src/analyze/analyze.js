// Semantic validation of a parsed query against the property registry:
// unknown properties/methods/functions (with nearest-match suggestions),
// arity problems, and obvious type mismatches. Also provides normalize(),
// which rewrites accepted alias forms into canonical ones.
import { REGISTRY, walkRelations } from '../model/registry.js'

// scalar functions usable anywhere; SELECT additionally allows aggregates
export const SCALAR_FNS = new Map([
  ['min', { minArgs: 2, maxArgs: Infinity }],
  ['max', { minArgs: 2, maxArgs: Infinity }],
  ['abs', { minArgs: 1, maxArgs: 1 }],
  ['exists', { minArgs: 1, maxArgs: 1 }],
  // unit conversions: mph→km/h, seconds→ms, ms→seconds ("secs"/"ms"
  // themselves are duration-unit keywords, hence the to- prefix)
  ['kph', { minArgs: 1, maxArgs: 1 }],
  ['toMs', { minArgs: 1, maxArgs: 1 }],
  ['toSecs', { minArgs: 1, maxArgs: 1 }]
])
export const AGGREGATE_FNS = new Map([
  ['count', { minArgs: 0, maxArgs: 0 }],
  ['sum', { minArgs: 1, maxArgs: 1 }],
  ['avg', { minArgs: 1, maxArgs: 1 }],
  ['min', { minArgs: 1, maxArgs: 1 }],
  ['max', { minArgs: 1, maxArgs: 1 }]
])

function levenshtein (a, b) {
  const rows = [[...Array(b.length + 1).keys()]]
  for (let i = 1; i <= a.length; i++) {
    rows.push([i])
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return rows[a.length][b.length]
}

function suggest (name, candidates) {
  let best
  let bestDist = Infinity
  for (const candidate of candidates) {
    const dist = levenshtein(name.toLowerCase(), candidate.toLowerCase())
    if (dist < bestDist) {
      bestDist = dist
      best = candidate
    }
  }
  // allow more edits for longer names (taggedAs → taggedWith is distance 4)
  return best !== undefined &&
    bestDist <= Math.max(3, Math.floor(best.length / 2))
    ? best
    : undefined
}

// Rewrites the function spelling of a method — taggedWith(shot, "x"),
// taggedWith(shot.hitter, "x") — into its canonical method form:
// shot.taggedWith("x"), shot.hitter.taggedWith("x"). Returns a new tree.
export function normalize (node) {
  if (Array.isArray(node)) {
    return node.map(normalize)
  }
  if (node === null || typeof node !== 'object') {
    return node
  }
  if (node.kind === 'call' && node.args.length >= 1) {
    const [subject, ...rest] = node.args
    // the subject must end AT an object/player (only relation segments, no
    // scalar tail) whose terminal type owns the named method
    if (subject.kind === 'prop' && !subject.args) {
      const { typeName, rest: subRest } = walkRelations(subject.base, subject.path)
      if (subRest.length === 0 && REGISTRY[typeName].methods.has(node.name)) {
        return normalize({
          kind: 'prop',
          base: subject.base,
          path: [...subject.path, node.name],
          args: rest,
          loc: node.loc
        })
      }
    }
  }
  const out = {}
  for (const [key, value] of Object.entries(node)) {
    out[key] = normalize(value)
  }
  return out
}

function inferType (node) {
  switch (node.kind) {
    case 'lit': return typeof node.value
    case 'arith':
    case 'neg': return 'number'
    case 'prop': {
      const { typeName, rest } = walkRelations(node.base, node.path)
      if (node.args || rest.length === 0) {
        return undefined // methods are boolean; player identities compare loosely
      }
      return REGISTRY[typeName].props.get(rest.join('.'))?.type
    }
    default: return undefined
  }
}

const ORDERING_OPS = new Set(['<', '<=', '>', '>='])

export function analyze (query) {
  const errors = []
  const err = (node, code, message, hint) => {
    errors.push({
      code,
      message,
      line: node.loc?.line ?? 1,
      col: node.loc?.col ?? 1,
      length: 0,
      ...(hint === undefined ? {} : { hint })
    })
  }

  function checkExpr (node, allowAggregates) {
    switch (node.kind) {
      case 'lit':
        return
      case 'not':
      case 'neg':
        return checkExpr(node.arg, false)
      case 'and':
      case 'or':
        return node.args.forEach(a => checkExpr(a, false))
      case 'arith':
      case 'cmp': {
        checkExpr(node.lhs, false)
        checkExpr(node.rhs, false)
        if (node.kind === 'cmp') {
          const lhsType = inferType(node.lhs)
          const rhsType = inferType(node.rhs)
          if (lhsType !== undefined && rhsType !== undefined && lhsType !== rhsType) {
            err(node, 'PBQL_TYPE_MISMATCH',
              `cannot compare ${lhsType} with ${rhsType}`)
          } else if (ORDERING_OPS.has(node.op)) {
            for (const type of [lhsType, rhsType]) {
              if (type !== undefined && type !== 'number') {
                err(node, 'PBQL_TYPE_MISMATCH',
                  `"${node.op}" needs numbers, not ${type}`)
                break
              }
            }
          }
        }
        return
      }
      case 'in': {
        checkExpr(node.lhs, false)
        const lhsType = inferType(node.lhs)
        for (const value of node.list) {
          // eslint-disable-next-line valid-typeof -- lhsType is a typeof string
          if (lhsType !== undefined && typeof value !== lhsType) {
            err(node, 'PBQL_TYPE_MISMATCH',
              `IN list mixes ${typeof value} with ${lhsType}`)
            break
          }
        }
        return
      }
      case 'prop': {
        const { typeName, rest } = walkRelations(node.base, node.path)
        const table = REGISTRY[typeName]
        if (node.args) {
          node.args.forEach(a => checkExpr(a, false))
          const name = rest[rest.length - 1]
          const method = rest.length === 1 ? table.methods.get(name) : undefined
          if (method === undefined) {
            err(node, 'PBQL_UNKNOWN_METHOD',
              `${typeName} has no method "${rest.join('.')}"`,
              hintFor(name, [...table.methods.keys(), ...table.relations.keys()]))
          } else if (node.args.length !== method.args.length) {
            err(node, 'PBQL_BAD_ARITY',
              `${name}() takes ${method.args.length} argument(s), got ${node.args.length}`)
          }
          return
        }
        if (rest.length === 0) {
          // a path ending AT a player is an identity value; a bare shot/
          // rally/game is not a value
          if (typeName !== 'player') {
            err(node, 'PBQL_MISSING_PROPERTY',
              `select a property of ${typeName} (e.g. ${typeName}.num)`)
          }
          return
        }
        const key = rest.join('.')
        if (!table.props.has(key)) {
          err(node, 'PBQL_UNKNOWN_PROPERTY',
            `${typeName} has no property "${key}"`,
            hintFor(key, [...table.props.keys(), ...table.methods.keys(),
              ...table.relations.keys()]))
        }
        return
      }
      case 'call':
        return checkCall(node, allowAggregates)
    }
  }

  function checkCall (node, allowAggregates) {
    node.args.forEach(a => checkExpr(a, false))
    const scalar = SCALAR_FNS.get(node.name)
    const aggregate = allowAggregates ? AGGREGATE_FNS.get(node.name) : undefined
    const fits = fn => fn !== undefined &&
      node.args.length >= fn.minArgs && node.args.length <= fn.maxArgs
    if (fits(aggregate) || fits(scalar)) {
      return
    }
    if (scalar === undefined && aggregate === undefined) {
      err(node, 'PBQL_UNKNOWN_FUNCTION', `unknown function "${node.name}"`,
        hintFor(node.name, [
          ...SCALAR_FNS.keys(),
          ...(allowAggregates ? AGGREGATE_FNS.keys() : []),
          ...REGISTRY.shot.methods.keys()
        ]))
    } else {
      err(node, 'PBQL_BAD_ARITY',
        `${node.name}() cannot take ${node.args.length} argument(s) here`)
    }
  }

  function hintFor (name, candidates) {
    const match = suggest(name, candidates)
    return match === undefined ? undefined : `did you mean "${match}"?`
  }

  for (const item of query.select ?? []) {
    checkExpr(item.expr, true)
  }
  checkExpr(query.where, false)
  for (const item of query.orderBy ?? []) {
    checkExpr(item.expr, false)
  }
  return { errors }
}
