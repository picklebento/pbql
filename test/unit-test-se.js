import { runQuery, toShotExplorerParams, toShotExplorerURLs, validate } from '../src/index.js'

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
      text: 'FROM video("v") WHERE shot.isFinal CONTEXT BEFORE 2 shots CONTEXT AFTER rally',
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
    expect(toShotExplorerParams(run('CONTEXT BEFORE 2secs'))[0].params)
      .toEqual({ shots: '3.3', numAfter: 0 })
    expect(toShotExplorerParams(
      run('CONTEXT AFTER min(1 shots, 2secs)'))[0].params)
      .toEqual({ shots: '3.3', numBefore: 0 })
  })

  test('builds explore deep links per game with a configurable host', () => {
    const result = runQuery({
      text: 'FROM video("v") WHERE shot.speed = 50 CONTEXT BEFORE 1 shots CONTEXT AFTER 1 shots',
      games: [makeDoublesGame()]
    })
    expect(toShotExplorerURLs(result)).toEqual([
      'https://pb.vision/video/testvid00001/0/explore?shots=3.3&numBefore=1&numAfter=1'
    ])
    expect(toShotExplorerURLs(result, { host: 'https://pbv-dev.web.app' })[0])
      .toContain('https://pbv-dev.web.app/video/')
  })
})

describe('LLM_GUIDE', () => {
  test('ships the generated language guide for prompt-building hosts', async () => {
    const { LLM_GUIDE } = await import('../src/index.js')
    expect(LLM_GUIDE).toContain('## Query shape')
    expect(LLM_GUIDE).toContain('CONTEXT BEFORE')
    expect(LLM_GUIDE).toContain('## Data dictionary')
    expect(LLM_GUIDE).toContain('## Examples')
  })
})
