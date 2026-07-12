import { analyze, normalize } from '../src/analyze/analyze.js'
import { parse } from '../src/index.js'

import { stripLoc } from './helpers.js'

function analyzeQuery (text) {
  const { ast, errors } = parse(text)
  expect(errors).toBeUndefined()
  return analyze(ast).errors
}

function analyzeWhere (expr) {
  return analyzeQuery(`FROM "f" WHERE ${expr}`)
}

describe('analyze()', () => {
  test('accepts every corpus-style construct', () => {
    expect(analyzeWhere(
      'shot.isVolley AND hitter = me AND shot.quality.overall >= 0.5 AND ' +
      'shot.taggedWith("A*") AND exists(shot.winnerType) AND ' +
      'min(shot.from.x, shot.to.x) < 10 AND NOT rally.winner = me.team'))
      .toEqual([])
  })

  test('unknown property gets a nearest-match hint with its position', () => {
    const [error] = analyzeWhere('shot.isVoley')
    expect(error).toEqual({
      code: 'PBQL_UNKNOWN_PROPERTY',
      message: 'shot has no property "isVoley"',
      line: 1,
      col: 16,
      length: 0,
      hint: 'did you mean "isVolley"?'
    })
  })

  test('unknown player property names the player reference', () => {
    const [error] = analyzeWhere('myTeammate.feetToKichen > 1')
    expect(error.message).toBe('myTeammate has no property "feetToKichen"')
    expect(error.hint).toBe('did you mean "feetToKitchen"?')
  })

  test('a wildly wrong name gets no hint', () => {
    const [error] = analyzeWhere('shot.zzzzzzzzzzzzzzzz = 1')
    expect(error.hint).toBeUndefined()
  })

  test('unknown methods and bad arity are flagged', () => {
    expect(analyzeWhere('shot.taggedAs("x")')[0]).toMatchObject({
      code: 'PBQL_UNKNOWN_METHOD',
      hint: 'did you mean "taggedWith"?'
    })
    expect(analyzeWhere('shot.taggedWith("x", "y")')[0].code).toBe('PBQL_BAD_ARITY')
    expect(analyzeWhere('shot.quality.taggedWith("x")')[0].code)
      .toBe('PBQL_UNKNOWN_METHOD')
  })

  test('bare non-player objects are not values', () => {
    expect(analyzeWhere('shot = 1')[0].code).toBe('PBQL_MISSING_PROPERTY')
    expect(analyzeWhere('hitter = me')).toEqual([])
  })

  test('unknown and misused functions', () => {
    expect(analyzeWhere('foo(1) = 1')[0]).toMatchObject({
      code: 'PBQL_UNKNOWN_FUNCTION',
      message: 'unknown function "foo"'
    })
    expect(analyzeWhere('min(1) = 1')[0].code).toBe('PBQL_BAD_ARITY')
    expect(analyzeWhere('abs(1, 2) = 1')[0].code).toBe('PBQL_BAD_ARITY')
    // aggregates don't exist in WHERE...
    expect(analyzeWhere('count() = 1')[0].code).toBe('PBQL_UNKNOWN_FUNCTION')
    // ...but do in SELECT, where min() is also a 1-arg aggregate
    expect(analyzeQuery('SELECT count(), min(shot.speed) FROM "f" WHERE true'))
      .toEqual([])
  })

  test('type mismatches in comparisons, ordering, and IN lists', () => {
    expect(analyzeWhere('shot.speed = "fast"')[0]).toMatchObject({
      code: 'PBQL_TYPE_MISMATCH',
      message: 'cannot compare number with string'
    })
    expect(analyzeWhere('shot.type < "dink"')[0].message)
      .toBe('"<" needs numbers, not string')
    expect(analyzeWhere('shot.num IN (1, "x")')[0].message)
      .toBe('IN list mixes string with number')
    // unknown-typed sides are let through (runtime handles them)
    expect(analyzeWhere('shot.speed > min(1, 2)')).toEqual([])
  })

  test('handmade nodes without positions default to 1:1', () => {
    const { errors } = analyze({
      select: null,
      sources: [],
      where: { kind: 'prop', base: { object: 'shot', offset: 0 }, path: ['nope'] },
      orderBy: null,
      limit: null
    })
    expect(errors[0]).toMatchObject({ line: 1, col: 1 })
  })

  test('unknown functions in SELECT suggest aggregates too', () => {
    const [error] = analyzeQuery('SELECT coont() FROM "f" WHERE true')
    expect(error.code).toBe('PBQL_UNKNOWN_FUNCTION')
    expect(error.hint).toBe('did you mean "count"?')
  })

  test('checks SELECT and ORDER BY expressions too', () => {
    expect(analyzeQuery('SELECT shot.spd FROM "f" WHERE true')[0].hint)
      .toBe('did you mean "speed"?')
    expect(analyzeQuery('FROM "f" WHERE true ORDER BY shot.spd')[0].code)
      .toBe('PBQL_UNKNOWN_PROPERTY')
  })
})

describe('normalize()', () => {
  test('rewrites function-form methods to method form (D15/D16)', () => {
    const { ast } = parse('FROM "f" WHERE taggedWith(shot, "BJ*")')
    const { ast: canonical } = parse('FROM "f" WHERE shot.taggedWith("BJ*")')
    expect(stripLoc(normalize(ast))).toEqual(stripLoc(canonical))
  })

  test('rewrites player-subject methods and validates post-rewrite', () => {
    const { ast } = parse('FROM "f" WHERE taggedWith(myTeammate, "A*")')
    const normalized = normalize(ast)
    expect(analyze(normalized).errors).toEqual([])
    expect(normalized.where).toMatchObject({
      kind: 'prop',
      base: { object: 'player', name: 'myTeammate' },
      path: ['taggedWith']
    })
  })

  test('leaves regular functions and non-method calls alone', () => {
    const { ast } = parse(
      'FROM "f" WHERE min(shot.from.x, 1) < 2 AND foo(shot.speed) = 1')
    expect(stripLoc(normalize(ast))).toEqual(stripLoc(ast))
  })
})
