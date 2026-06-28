import { Game, UNKNOWN, computeWindow, evalExpr, parse, runQuery } from '../src/index.js'

import { makeDoublesGame, makeSinglesGame } from './fixtures/make-insights.js'

// runs `WHERE expr` over the doubles fixture, returning [rallyIdx, shotIdx]
function shotsWhere (expr, rest = '') {
  const result = runQuery({
    text: `FROM video("testvid00001") WHERE ${expr} ${rest}`,
    games: [makeDoublesGame()]
  })
  expect(result.errors).toBeUndefined()
  return result.shots.map(s => [s.rallyIdx, s.shotIdx])
}

function windowFor (contextClauses, options) {
  const result = runQuery({
    text: `FROM video("x") WHERE shot.speed = 50 ${contextClauses}`,
    games: [makeDoublesGame()],
    options
  })
  expect(result.shots).toHaveLength(1)
  return result.shots[0]
}

describe('runQuery: filtering', () => {
  test('property equality and ranges', () => {
    expect(shotsWhere('shot.type = "drop"')).toEqual([[0, 1]])
    expect(shotsWhere('shot.quality.overall >= 0.9')).toEqual([[0, 1], [0, 2]])
    expect(shotsWhere('shot.num IN (1)')).toEqual([[0, 0], [1, 0], [2, 0]])
  })

  test('hitter = me resolves through host metadata', () => {
    expect(shotsWhere('hitter = me')).toEqual([[0, 0], [1, 1], [2, 0]])
    // without a "me" mapping the predicate is unknown, never true
    const game = makeDoublesGame()
    game.meta = {}
    const result = runQuery({ text: 'FROM video("x") WHERE hitter = me', games: [game] })
    expect(result.shots).toEqual([])
  })

  test('unknown semantics: NOT never matches unknowns; exists() does', () => {
    // is_volley is only present on rally 0 (false, false, true) and (2,2)
    expect(shotsWhere('NOT shot.isVolley')).toEqual([[0, 0], [0, 1]])
    expect(shotsWhere('NOT exists(shot.isVolley) OR NOT shot.isVolley'))
      .toEqual([[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1], [2, 3]])
    expect(shotsWhere('exists(shot.winnerType)')).toEqual([[0, 2]])
  })

  test('methods: taggedWith by name glob and by email; inHighlight', () => {
    expect(shotsWhere('shot.taggedWith("bob")')).toEqual([[0, 2], [2, 2]])
    expect(shotsWhere('shot.taggedWith("ALICE@EXAMPLE.COM")'))
      .toEqual([[0, 0], [1, 1], [2, 0]])
    expect(shotsWhere('taggedWith(shot, "bob")')).toEqual([[0, 2], [2, 2]]) // alias form
    expect(shotsWhere('shot.inHighlight("atp")')).toEqual([[0, 2]])
  })

  test('relative player references, including LHS/RHS by position', () => {
    expect(shotsWhere('rally.num = 1 AND shot.num = 3 AND hittersOpponentLHS.name = "Carol"'))
      .toEqual([[0, 2]])
    expect(shotsWhere('rally.num = 1 AND shot.num = 3 AND hittersOpponentRHS.name = "Dan"'))
      .toEqual([[0, 2]])
    // far-side hitter: the frame mirrors, so p1 (abs x=15) is on p2's left
    expect(shotsWhere('rally.num = 2 AND shot.num = 1 AND hittersOpponentLHS.name = "Bob"'))
      .toEqual([[1, 0]])
    expect(shotsWhere('myTeammate.name = "Bob"')).toHaveLength(9) // true for every shot
    expect(shotsWhere('hittersOpponent1.name = "Carol"'))
      .toEqual([[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]]) // shots by team 0
    // LHS/RHS are unknown when positions are missing (the sparse shot)
    expect(shotsWhere('rally.num = 2 AND shot.num = 2 AND hittersOpponentLHS.name = "Carol"'))
      .toEqual([])
  })

  test('relative shots and rallies; out-of-range is unknown', () => {
    expect(shotsWhere('shot[-1].type = "drop"')).toEqual([[0, 2]])
    expect(shotsWhere('rally[1].winner = 1')).toEqual([[0, 0], [0, 1], [0, 2]])
    // rally 1's previous rally was won by team 0; rally 2's by team 1
    expect(shotsWhere('rally[-1].winner = 0')).toEqual([[1, 0], [1, 1]])
    expect(shotsWhere('rally[-1].winner = 1')).toEqual([[2, 0], [2, 1], [2, 2], [2, 3]])
  })

  test('arithmetic, division by zero, min/max functions', () => {
    expect(shotsWhere('shot.to.absX - shot.from.absX = 10')).toEqual([[0, 0]])
    expect(shotsWhere('shot.speed / (shot.num - 1) > 0'))
      .toEqual([[0, 1], [0, 2], [2, 1], [2, 2], [2, 3]])
    expect(shotsWhere('min(shot.from.absX, shot.to.absX) <= 5'))
      .toEqual([[0, 0], [1, 0], [2, 0], [2, 2]])
    expect(shotsWhere('max(shot.from.absX, 18) = 18')).toHaveLength(8) // sparse shot unknown
    expect(shotsWhere('-shot.pitch < 0')).toHaveLength(8)
  })

  test('runtime type guards make mismatches unknown, not crashes', () => {
    // these dodge the static checks (function results have unknown type)
    expect(shotsWhere('exists(true) < exists(true)')).toEqual([]) // ordering booleans
    expect(shotsWhere('min(2, 3) IN ("x", 2)')).toHaveLength(9) // skips the string
    expect(shotsWhere('abs(shot.type) = 1')).toEqual([]) // abs of a string
    expect(shotsWhere('min(1, shot.type) = 1')).toEqual([]) // min of a string
  })
})

describe('runQuery: ordering and limits', () => {
  test('ORDER BY with DESC, ties broken by later keys, unknowns last', () => {
    const rows = shotsWhere('true', 'ORDER BY shot.speed DESC, shot.hitTime')
    expect(rows[0]).toEqual([2, 2]) // 50 mph
    expect(rows[1]).toEqual([0, 2]) // 45
    expect(rows[rows.length - 1]).toEqual([1, 1]) // sparse: speed unknown
    // the three 30mph shots stay in hitTime order
    expect(rows.slice(4, 7)).toEqual([[2, 0], [2, 1], [2, 3]])
  })

  test('ORDER BY strings and booleans', () => {
    const byType = shotsWhere('true', 'ORDER BY shot.type')
    expect(byType[0]).toEqual([0, 0]) // "drive" sorts before "drop"/"smash"
    expect(byType[byType.length - 1]).toEqual([1, 1]) // unknown type last
    const finalsFirst = shotsWhere('true', 'ORDER BY shot.isFinal DESC, shot.hitTime')
    expect(finalsFirst.slice(0, 3)).toEqual([[0, 2], [1, 1], [2, 3]])
  })

  test('LIMIT applies after ordering', () => {
    expect(shotsWhere('true', 'ORDER BY shot.speed DESC LIMIT 2'))
      .toEqual([[2, 2], [0, 2]])
  })
})

describe('runQuery: context windows', () => {
  test('default window is the shot flight itself', () => {
    expect(windowFor('')).toMatchObject({
      rallyIdx: 2, shotIdx: 2, hitMs: 58000, window: { sMs: 58000, eMs: 59000 }, contextShots: []
    })
  })

  test('secs stretch, clamped to rally bounds + 3s spill', () => {
    expect(windowFor('SHOT CONTEXT BEFORE 2secs SHOT CONTEXT AFTER 1secs').window)
      .toEqual({ sMs: 56000, eMs: 60000 })
    expect(windowFor('SHOT CONTEXT BEFORE 12secs SHOT CONTEXT AFTER 12secs').window)
      .toEqual({ sMs: 47000, eMs: 67000 }) // rally is 50000..64000
    expect(windowFor('SHOT CONTEXT BEFORE 12secs', { maxSecsBeyondRally: 0 }).window.sMs)
      .toBe(50000)
  })

  test('shots units include neighbors as context, clamped to the rally', () => {
    const one = windowFor('SHOT CONTEXT BEFORE 1 shots SHOT CONTEXT AFTER 1 shots')
    expect(one.window).toEqual({ sMs: 55000, eMs: 62000 })
    expect(one.contextShots).toEqual([
      { rallyIdx: 2, shotIdx: 1 }, { rallyIdx: 2, shotIdx: 3 }])
    const many = windowFor('SHOT CONTEXT BEFORE 5 shots')
    expect(many.window.sMs).toBe(52000)
    expect(many.contextShots).toEqual([
      { rallyIdx: 2, shotIdx: 0 }, { rallyIdx: 2, shotIdx: 1 }])
  })

  test('rally duration goes to the boundary', () => {
    const whole = windowFor('SHOT CONTEXT BEFORE rally SHOT CONTEXT AFTER rally')
    expect(whole.window).toEqual({ sMs: 50000, eMs: 64000 })
    expect(whole.contextShots).toHaveLength(3)
  })

  test('min caps, max floors, ties prefer context shots (D4)', () => {
    expect(windowFor('SHOT CONTEXT BEFORE min(1 shots, 2secs)')).toMatchObject({
      window: { sMs: 56000 }, contextShots: []
    })
    expect(windowFor('SHOT CONTEXT BEFORE max(1 shots, 2secs)')).toMatchObject({
      window: { sMs: 55000 },
      contextShots: [{ rallyIdx: 2, shotIdx: 1 }]
    })
    // 3secs resolves to exactly the previous shot's start: a tie
    expect(windowFor('SHOT CONTEXT BEFORE min(1 shots, 3secs)').contextShots)
      .toEqual([{ rallyIdx: 2, shotIdx: 1 }])
    expect(windowFor('SHOT CONTEXT AFTER max(1 shots, 1secs)')).toMatchObject({
      window: { eMs: 62000 },
      contextShots: [{ rallyIdx: 2, shotIdx: 3 }]
    })
    expect(windowFor('SHOT CONTEXT AFTER min(1 shots, 1secs)')).toMatchObject({
      window: { eMs: 60000 }, contextShots: []
    })
  })

  test('a rally-opening shot has nothing before it', () => {
    const result = runQuery({
      text: 'FROM video("x") WHERE rally.num = 3 AND shot.num = 1 SHOT CONTEXT BEFORE 2 shots',
      games: [makeDoublesGame()]
    })
    expect(result.shots[0].window.sMs).toBe(52000)
    expect(result.shots[0].contextShots).toEqual([])
  })
})

describe('coverage edges', () => {
  test('doubles Opponent2 and player-subject methods', () => {
    expect(shotsWhere('myOpponent2.name = "Dan"')).toHaveLength(9)
    expect(shotsWhere('myTeammate.taggedWith("b*")')).toHaveLength(9)
  })

  test('method args that are unknown make the call unknown', () => {
    expect(shotsWhere('shot.inHighlight(shot.winnerType)')).toEqual([])
  })

  test('abs of real numbers; IN with an unknown lhs', () => {
    expect(shotsWhere('abs(0 - shot.speed) = 50')).toEqual([[2, 2]])
    expect(shotsWhere('shot.winnerType IN ("winner", "ace")')).toEqual([[0, 2]])
  })

  test('remaining runtime operators: !=, +, *', () => {
    expect(shotsWhere('shot.type != "drive"'))
      .toEqual([[0, 1], [0, 2], [2, 2]])
    expect(shotsWhere('shot.num + 1 = 2')).toHaveLength(3)
    expect(shotsWhere('shot.num * 2 = 4')).toHaveLength(3)
  })

  test('OR of only unknowns and falses is unknown', () => {
    expect(shotsWhere('rally.num = 2 AND (shot.isVolley OR false)')).toEqual([])
  })

  test('ORDER BY skips a key when both sides are unknown', () => {
    expect(shotsWhere('rally.num = 2', 'ORDER BY shot.isVolley, shot.hitTime DESC'))
      .toEqual([[1, 1], [1, 0]])
  })

  test('durfn arg order and all-secs ties', () => {
    expect(windowFor('SHOT CONTEXT BEFORE min(2secs, 1 shots)').window.sMs).toBe(56000)
    expect(windowFor('SHOT CONTEXT AFTER max(2secs, 1 shots)').window.eMs).toBe(62000)
    const tie = windowFor('SHOT CONTEXT BEFORE min(3secs, 3secs)')
    expect(tie.window.sMs).toBe(55000)
    expect(tie.contextShots).toEqual([])
  })

  test('computeWindow defaults its options', () => {
    const game = new Game(makeDoublesGame())
    const ctx = game.shotRefs[7] // rally 2, shot 2
    const zero = { kind: 'dur', unit: 'secs', value: 0 }
    expect(computeWindow(ctx, { before: { kind: 'dur', unit: 'secs', value: 12 }, after: zero }))
      .toMatchObject({ sMs: 47000 })
  })

  test('evalExpr tolerates unanalyzed ASTs (unknown names are unknown)', () => {
    const game = new Game(makeDoublesGame())
    const ctx = game.shotRefs[0]
    const where = text => parse(`FROM folder(1) WHERE ${text}`).ast.where
    expect(evalExpr(where('shot.nope'), ctx)).toBe(UNKNOWN)
    expect(evalExpr(where('shot.nope(1)'), ctx)).toBe(UNKNOWN)
    expect(evalExpr(where('foo(1)'), ctx)).toBe(UNKNOWN)
    expect(evalExpr(where('shot'), ctx)).toBe(UNKNOWN) // bare non-player object
    const bareCtx = { game, rally: {}, rallyIdx: 0, shot: {}, shotIdx: 0 }
    expect(evalExpr(where('shot[-1].num'), bareCtx)).toBe(UNKNOWN)
  })

  test('game-object properties evaluate in queries', () => {
    expect(shotsWhere('game.numRallies = 3')).toHaveLength(9)
    expect(shotsWhere('game.winner = me.team')).toHaveLength(9)
  })
})

describe('runQuery: SELECT', () => {
  test('projects one row per shot with labeled columns', () => {
    const result = runQuery({
      text: 'SELECT shot.num, shot.speed AS "mph" FROM video("x") WHERE rally.num = 3 ORDER BY shot.num',
      games: [makeDoublesGame()]
    })
    expect(result.columns).toEqual(['shot.num', 'mph'])
    expect(result.rows).toEqual([[1, 30], [2, 30], [3, 50], [4, 30]])
  })

  test('unknown values project as null', () => {
    const result = runQuery({
      text: 'SELECT shot.isVolley FROM video("x") WHERE rally.num = 2',
      games: [makeDoublesGame()]
    })
    expect(result.rows).toEqual([[null], [null]])
  })

  test('aggregates collapse to one row and skip unknowns', () => {
    const result = runQuery({
      text: 'SELECT count(), avg(shot.speed), min(shot.speed), max(shot.speed), sum(shot.num) ' +
        'FROM video("x") WHERE rally.num = 3',
      games: [makeDoublesGame()]
    })
    expect(result.rows).toEqual([[4, 35, 30, 50, 10]])
    const sparse = runQuery({
      text: 'SELECT avg(shot.speed) FROM video("x") WHERE rally.num = 2',
      games: [makeDoublesGame()]
    })
    expect(sparse.rows).toEqual([[38]]) // the trajectory-less shot is skipped
    const empty = runQuery({
      text: 'SELECT count(), avg(shot.speed) FROM video("x") WHERE false',
      games: [makeDoublesGame()]
    })
    expect(empty.rows).toEqual([[0, null]])
  })

  test('mixing aggregates with per-shot expressions is an error', () => {
    const result = runQuery({
      text: 'SELECT count(), shot.num FROM video("x") WHERE true',
      games: [makeDoublesGame()]
    })
    expect(result.errors[0].code).toBe('PBQL_MIXED_AGGREGATES')
  })
})

describe('runQuery: inputs and errors', () => {
  test('singles: teammate/opponent2 unknown, lone opponent answers LHS', () => {
    const games = [makeSinglesGame()]
    const run = text => runQuery({ text, games }).shots.map(s => [s.rallyIdx, s.shotIdx])
    expect(run('FROM video("x") WHERE myOpponent1.name = "Carol"')).toHaveLength(2)
    expect(run('FROM video("x") WHERE myTeammate.name = "Carol"')).toEqual([])
    expect(run('FROM video("x") WHERE hittersOpponent2.name = "Carol"')).toEqual([])
    expect(run('FROM video("x") WHERE hittersOpponentLHS.name = "Carol"'))
      .toEqual([[0, 0]])
  })

  test('accepts pre-wrapped Game instances', () => {
    const result = runQuery({
      text: 'FROM video("x") WHERE hitter = me',
      games: [new Game(makeDoublesGame())]
    })
    expect(result.shots).toHaveLength(3)
  })

  test('skips-and-reports games with unsupported insights versions', () => {
    const old = { vid: 'oldvideo0001', sessionIdx: 0, insights: { version: '2.9.0', rallies: [] } }
    const result = runQuery({
      text: 'FROM video("x") WHERE true',
      games: [makeDoublesGame(), old]
    })
    expect(result.shots).toHaveLength(9)
    expect(result.warnings).toEqual([{
      vid: 'oldvideo0001',
      sessionIdx: 0,
      message: expect.stringContaining('unsupported insights version "2.9.0"')
    }])
  })

  test('propagates parse and analyze errors', () => {
    expect(runQuery({ text: 'FROM @', games: [] }).errors[0].code)
      .toBe('PBQL_LEX_ERROR')
    expect(runQuery({ text: 'FROM folder(1) WHERE shot.isVoley', games: [] })
      .errors[0].code).toBe('PBQL_UNKNOWN_PROPERTY')
    // a pre-parsed AST is accepted directly
    const { ast } = parse('FROM video("x") WHERE shot.type = "drop"')
    const { shots } = runQuery({ ast, games: [makeDoublesGame()] })
    expect(shots).toHaveLength(1)
  })
})
