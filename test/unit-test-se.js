import { filtersToPbql, runQuery, toShotExplorerParams, toShotExplorerURLs, validate } from '../src/index.js'

import { makeDoublesGame, makeSinglesGame } from './fixtures/make-insights.js'

function shotsWhere (expr) {
  const result = runQuery({
    text: `FROM video("v") WHERE ${expr}`,
    games: [makeDoublesGame()]
  })
  expect(result.errors).toBeUndefined()
  return result.shots.map(s => [s.rallyIdx, s.shotIdx])
}

describe('validate()', () => {
  test('valid queries return no errors plus the canonical AST', () => {
    const { errors, ast } = validate('FROM folder(1) WHERE taggedWith(shot, "A*")')
    expect(errors).toEqual([])
    expect(ast.where.kind).toBe('prop') // alias form was normalized
  })

  test('parse and analyze errors flow through', () => {
    expect(validate('FROM @').errors[0].code).toBe('PBQL_LEX_ERROR')
    const analyzed = validate('FROM folder(1) WHERE shot.isVoley')
    expect(analyzed.errors[0].code).toBe('PBQL_UNKNOWN_PROPERTY')
    expect(analyzed.ast).toBeDefined() // parsed fine, still returned
  })
})

describe('M6 built-ins', () => {
  test('unit conversions evaluate', () => {
    expect(shotsWhere('kph(shot.speed) > 80')).toEqual([[2, 2]]) // 50mph = 80.47
    expect(shotsWhere('toMs(shot.hitTime) = 58000')).toEqual([[2, 2]])
    expect(shotsWhere('toSecs(toMs(shot.hitTime)) = 58')).toEqual([[2, 2]])
  })

  test('isHitOnSide uses the hitter frame', () => {
    // far-side strikes mirror: (2,1) abs x=10 → x'=10 (right edge of midline)
    expect(shotsWhere('shot.isHitOnSide("right")')).toEqual([[0, 2], [2, 1], [2, 2]])
    expect(shotsWhere('rally.num = 1 AND shot.isHitOnSide("left")'))
      .toEqual([[0, 0], [0, 1]])
    expect(shotsWhere('shot.isHitOnSide("up")')).toEqual([]) // bad side: unknown
    expect(shotsWhere('rally.num = 2 AND shot.num = 2 AND shot.isHitOnSide("left")'))
      .toEqual([]) // no trajectory on the sparse shot
  })
})

describe('toShotExplorerParams/URLs', () => {
  test('emits SE 1-based rally.shot refs with translated windows', () => {
    const result = runQuery({
      text: 'FROM video("v") WHERE shot.isFinal SHOT CONTEXT BEFORE 2 shots SHOT CONTEXT AFTER rally',
      games: [makeDoublesGame(), makeSinglesGame()]
    })
    expect(toShotExplorerParams(result)).toEqual([
      {
        vid: 'testvid00001',
        sessionIdx: 0,
        params: { shots: '1.3,2.2,3.4', numBefore: 2, numAfter: 999 }
      },
      {
        vid: 'testvid00002',
        sessionIdx: 0,
        params: { shots: '1.2', numBefore: 2, numAfter: 999 }
      }
    ])
  })

  test('default context maps to 0/0; secs and min/max are omitted', () => {
    const run = ctx => runQuery({
      text: `FROM video("v") WHERE shot.speed = 50 ${ctx}`,
      games: [makeDoublesGame()]
    })
    expect(toShotExplorerParams(run(''))[0].params)
      .toEqual({ shots: '3.3', numBefore: 0, numAfter: 0 })
    expect(toShotExplorerParams(run('SHOT CONTEXT BEFORE 2secs'))[0].params)
      .toEqual({ shots: '3.3', numAfter: 0 })
    expect(toShotExplorerParams(
      run('SHOT CONTEXT AFTER min(1 shots, 2secs)'))[0].params)
      .toEqual({ shots: '3.3', numBefore: 0 })
  })

  test('builds explore deep links per game with a configurable host', () => {
    const result = runQuery({
      text: 'FROM video("v") WHERE shot.speed = 50 SHOT CONTEXT BEFORE 1 shots SHOT CONTEXT AFTER 1 shots',
      games: [makeDoublesGame()]
    })
    expect(toShotExplorerURLs(result)).toEqual([
      'https://pb.vision/video/testvid00001/0/explore?shots=3.3&numBefore=1&numAfter=1'
    ])
    expect(toShotExplorerURLs(result, { host: 'https://pbv-dev.web.app' })[0])
      .toContain('https://pbv-dev.web.app/video/')
  })
})

describe('filtersToPbql()', () => {
  // every generated query must be valid PBQL — checked on each call
  function gen (args) {
    const result = filtersToPbql({ vid: 'abc123def456', ...args })
    expect(validate(result.text).errors).toEqual([])
    return result
  }

  test('no filters means everything, with optional session', () => {
    expect(gen({}).text).toBe('FROM video("abc123def456")\nWHERE true')
    expect(gen({ sessionNum: 2 }).text)
      .toBe('FROM video("abc123def456", 2)\nWHERE true')
    // values are escaped, so hostile input still yields a valid query
    expect(gen({ vid: 'we"ird' }).text).toBe('FROM video("we\\"ird")\nWHERE true')
  })

  test('translates each supported field', () => {
    const { text, unsupported } = gen({
      filters: {
        players: ['self', 2],
        quality: { min: 0.6, max: 1 },
        types: ['dink', 'drop'],
        attributes: ['speedup', 'reset'],
        errors: ['net', 'none'],
        sequences: ['serve', '3', 'final'],
        serveDepth: ['deep'],
        returnDepth: ['short', 'mid'],
        strokeType: ['backhand'],
        strokeSide: ['left'],
        groundStrokeOrVolley: ['volley', 'groundstroke'],
        verticalType: ['dig'],
        winnerType: ['ace'],
        directions: ['DownTheMiddle'],
        characteristics: ['poach', 'fault-net'],
        highlights: ['atp'],
        rallyType: [1, 0],
        rallyLength: { min: 5, max: 12 },
        ralliesWon: ['won', 'lost'],
        shots: ['5.3', '7.1-7.4', '2.5-3.1'],
        ranges: [{ s: 12.5, e: 30 }]
      },
      shotWindow: { numBefore: 2, numAfter: 999 }
    })
    for (const expected of [
      '(hitter = me OR hitter.id = 2)',
      'shot.quality.overall >= 0.6',
      'shot.type IN ("dink", "drop")',
      '(shot.isSpeedup OR shot.isReset)',
      '(shot.errors.faults.net OR NOT shot.hasError)',
      '(shot.sequence IN ("serve", "3") OR shot.isFinal)',
      'shot.sequence = "serve" AND shot.to.zone = "deep"',
      'shot.sequence = "return" AND shot.to.zone IN ("short", "mid")',
      'shot.strokeType = "backhand"',
      'shot.strokeSide = "left"',
      '(shot.isVolley OR NOT shot.isVolley)',
      'shot.verticalType = "dig"',
      'shot.winnerType = "ace"',
      'shot.direction = "DownTheMiddle"',
      'shot.isPoach AND shot.errors.faults.net',
      'shot.inHighlight("atp")',
      '(rally.allPlayersReachedKitchen OR NOT rally.allPlayersReachedKitchen)',
      'rally.numShots >= 5 AND rally.numShots <= 12',
      '(rally.winner = me.team OR rally.winner != me.team)',
      '(rally.num = 5 AND shot.num = 3)',
      '(rally.num = 7 AND shot.num >= 1 AND shot.num <= 4)',
      '(shot.hitTime >= 12.5 AND shot.hitTime < 30)',
      'SHOT CONTEXT BEFORE 2 shots',
      'SHOT CONTEXT AFTER rally'
    ]) {
      expect(text).toContain(expected)
    }
    expect(unsupported).toEqual(['shots:2.5-3.1']) // cross-rally range
  })

  test('degenerate bounds and empty fields drop out', () => {
    const { text } = gen({
      filters: {
        quality: { min: 0, max: 1 },
        rallyLength: { min: 1, max: 999 },
        types: [],
        players: null
      }
    })
    expect(text).toContain('WHERE true')
  })

  test('final-only sequences and all-unsupported shot lists', () => {
    expect(gen({ filters: { sequences: ['final'] } }).text)
      .toContain('WHERE shot.isFinal')
    expect(gen({ filters: { sequences: ['serve', 'return'] } }).text)
      .toContain('WHERE shot.sequence IN ("serve", "return")')
    const allCross = gen({ filters: { shots: ['1.2-2.3'] } })
    expect(allCross.text).toContain('WHERE true')
    expect(allCross.unsupported).toEqual(['shots:1.2-2.3'])
  })

  test('quality upper bound and flipped window forms', () => {
    expect(gen({ filters: { quality: { min: 0, max: 0.9 } } }).text)
      .toContain('shot.quality.overall <= 0.9')
    const { text } = gen({ shotWindow: { numBefore: 999, numAfter: 2 } })
    expect(text).toContain('SHOT CONTEXT BEFORE rally')
    expect(text).toContain('SHOT CONTEXT AFTER 2 shots')
  })

  test('unsupported fields are reported, not dropped silently', () => {
    const { unsupported } = gen({
      filters: { kitchenArrival: [1, 2], customTags: ['x'], types: ['dink'] }
    })
    expect(unsupported).toEqual(['kitchenArrival', 'customTags'])
  })

  test('generated queries run end-to-end against real games', () => {
    const { text } = gen({
      filters: { types: ['smash'], ralliesWon: ['won'] },
      shotWindow: { numBefore: 1 }
    })
    const result = runQuery({ text, games: [makeDoublesGame()] })
    expect(result.shots.map(s => [s.rallyIdx, s.shotIdx])).toEqual([[0, 2]])
    expect(result.shots[0].contextShots).toEqual([{ rallyIdx: 0, shotIdx: 1 }])
  })
})

describe('filtersToPbql player readability', () => {
  const gen = args => {
    const result = filtersToPbql({ vid: 'abc123def456', ...args })
    expect(validate(result.text).errors).toEqual([])
    return result.text
  }

  test('renders me and tagged names instead of raw indexes', () => {
    const players = [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Carol' }, { name: 'Player 4' }]
    expect(gen({ filters: { players: [0, 2] }, players, myPlayerIdx: 0 }))
      .toContain('(hitter = me OR hitter.name = "Carol")')
    expect(gen({ filters: { players: ['self', 3] }, players, myPlayerIdx: 0 }))
      .toContain('(hitter = me OR hitter.name = "Player 4")')
  })

  test('falls back to hitter.id without name info', () => {
    expect(gen({ filters: { players: [1] } })).toContain('hitter.id = 1')
    expect(gen({ filters: { players: [1] }, players: [{ name: 'Alice' }], myPlayerIdx: 0 }))
      .toContain('hitter.id = 1') // index 1 has no name entry
  })
})
