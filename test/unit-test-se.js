import { runQuery, toShotExplorerURLs, validate } from '../src/index.js'

import { makeDoublesGame } from './fixtures/make-insights.js'

function shotsWhere (expr) {
  const result = runQuery({
    text: `FROM "v" WHERE ${expr}`,
    games: [makeDoublesGame()]
  })
  expect(result.errors).toBeUndefined()
  return result.shots.map(s => [s.rallyIdx, s.shotIdx])
}

describe('validate()', () => {
  test('valid queries return no errors plus the canonical AST', () => {
    const { errors, ast } = validate('FROM "f" WHERE taggedWith(shot, "A*")')
    expect(errors).toEqual([])
    expect(ast.where.kind).toBe('prop') // alias form was normalized
  })

  test('parse and analyze errors flow through', () => {
    expect(validate('FROM @').errors[0].code).toBe('PBQL_LEX_ERROR')
    const analyzed = validate('FROM "f" WHERE shot.isVoley')
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
    // by hand from the fixture strike points: near-side strikes reflect x
    // ((0,0) abs x=5 → x'=15 right; (0,2) abs x=14 → x'=6 left; (2,0) x'=15;
    // (2,2) x'=6 left), far-side strikes keep x ((0,1) x'=15; (1,0) x'=14;
    // (2,1) abs x=10 → x'=10, the right edge of the midline; (2,3) x'=15)
    expect(shotsWhere('shot.isHitOnSide("right")'))
      .toEqual([[0, 0], [0, 1], [1, 0], [2, 0], [2, 1], [2, 3]])
    expect(shotsWhere('rally.num = 1 AND shot.isHitOnSide("left")'))
      .toEqual([[0, 2]])
    expect(shotsWhere('shot.isHitOnSide("up")')).toEqual([]) // bad side: unknown
    expect(shotsWhere('rally.num = 2 AND shot.num = 2 AND shot.isHitOnSide("left")'))
      .toEqual([]) // no trajectory on the sparse shot
  })
})

describe('toShotExplorerURLs', () => {
  test('one explore link per vid-shaped source, carrying the query in ?q=', () => {
    const text = 'FROM "83gyqyc10y8f", "./games", "jhc3t8h8b5cj:2"\nWHERE shot.isVolley'
    expect(toShotExplorerURLs(text, ['83gyqyc10y8f', './games', 'jhc3t8h8b5cj:2']))
      .toEqual([
        // sessions in URLs are 0-based; local paths have no explore page
        `https://pb.vision/video/83gyqyc10y8f/0/explore?q=${encodeURIComponent(text)}`,
        `https://pb.vision/video/jhc3t8h8b5cj/1/explore?q=${encodeURIComponent(text)}`
      ])
    expect(toShotExplorerURLs('FROM "./games" WHERE true', ['./games']))
      .toEqual([])
  })

  test('session numbers are 1-based; :0 is rejected', () => {
    expect(() => toShotExplorerURLs('q', ['ab12cd34ef56:0']))
      .toThrow('"ab12cd34ef56:0": session numbers are 1-based')
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
