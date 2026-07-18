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
      'shot.isVolley AND shot.hitter = me AND shot.quality.overall >= 0.5 AND ' +
      'shot.taggedWith("A*") AND exists(shot.winnerType) AND ' +
      'min(shot.from.x, shot.to.x) < 10 AND NOT rally.winner = me.team'))
      .toEqual([])
  })

  test('validates player navigation: relations, identity, scalar tails', () => {
    // multi-hop relations, then a scalar; identity comparisons; me root
    expect(analyzeWhere(
      'shot.hitter.opponentLHS.feetToKitchen <= 2 AND ' +
      'me.teammate.name = "Anna" AND shot[1].hitter = me AND ' +
      'shot.hitter != shot[-1].hitter AND me.opponentRHS.taggedWith("Ben*")'))
      .toEqual([])
    // an unknown relation/prop after a valid player transition is caught,
    // reported against the terminal type (player)
    const [bad] = analyzeWhere('shot.hitter.feetToKichen > 1')
    expect(bad.message).toBe('player has no property "feetToKichen"')
    expect(bad.hint).toBe('did you mean "feetToKitchen"?')
    // a relation used on the wrong type is just an unknown property there
    expect(analyzeWhere('shot.teammate = me')[0].code).toBe('PBQL_UNKNOWN_PROPERTY')
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

  test('unknown player property names the player type after navigation', () => {
    const [error] = analyzeWhere('me.teammate.feetToKichen > 1')
    expect(error.message).toBe('player has no property "feetToKichen"')
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

  test('bare non-player objects are not values; players are (identity)', () => {
    expect(analyzeWhere('shot = 1')[0].code).toBe('PBQL_MISSING_PROPERTY')
    expect(analyzeWhere('rally = 1')[0].message)
      .toBe('select a property of rally (e.g. rally.num)')
    expect(analyzeWhere('shot.hitter = me')).toEqual([])
    expect(analyzeWhere('me = shot.hitter')).toEqual([])
  })

  test('unknown and misused functions', () => {
    expect(analyzeWhere('foo(1) = 1')[0]).toMatchObject({
      code: 'PBQL_UNKNOWN_FUNCTION',
      message: 'unknown function "foo"'
    })
    expect(analyzeWhere('min(1) = 1')[0].code).toBe('PBQL_BAD_ARITY')
    expect(analyzeWhere('abs(1, 2) = 1')[0].code).toBe('PBQL_BAD_ARITY')
    expect(analyzeWhere('timecode() = "0:00"')[0].code).toBe('PBQL_BAD_ARITY')
    expect(analyzeWhere('timecode(1, true, 2) = "x"')[0].code)
      .toBe('PBQL_BAD_ARITY')
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
    // ...including parenthesized boolean operands, which have no type
    expect(analyzeWhere('(shot.isVolley AND shot.isFinal) = true')).toEqual([])
  })

  test('timecode: both arities, string result, boolean withFrames', () => {
    expect(analyzeWhere('timecode(shot.hitTime) = "0:18"')).toEqual([])
    expect(analyzeWhere('timecode(shot.hitTime, true) != "0:18:00"')).toEqual([])
    // the result is a string: equality is fine, ordering is not
    expect(analyzeWhere('timecode(shot.hitTime) < "0:30"')[0]).toMatchObject({
      code: 'PBQL_TYPE_MISMATCH',
      message: '"<" needs numbers, not string'
    })
    expect(analyzeWhere('timecode(shot.hitTime) = 5')[0].message)
      .toBe('cannot compare string with number')
    // withFrames must be a boolean when its type is known statically...
    expect(analyzeWhere('timecode(1, 30) = "x"')[0]).toMatchObject({
      code: 'PBQL_TYPE_MISMATCH',
      message: 'timecode() takes a boolean second argument, not number'
    })
    expect(analyzeWhere('timecode(1, shot.isVolley) = "0:01"')).toEqual([])
    // ...while unknown-typed flags pass and resolve per Kleene at runtime
    expect(analyzeWhere('timecode(1, exists(shot.speed)) = "0:01"')).toEqual([])
  })

  test('GROUP BY: keys and aggregates in SELECT and ORDER BY are valid', () => {
    expect(analyzeQuery(
      'SELECT shot.type, avg(rally.winner = me.team) AS "win rate" FROM "f" ' +
      'WHERE shot.hitter = me GROUP BY shot.type')).toEqual([])
    // ORDER BY may use aggregates (even ones not in SELECT) and keys
    expect(analyzeQuery(
      'SELECT shot.type, shot.hitter.team, count() FROM "f" WHERE true ' +
      'GROUP BY shot.type, shot.hitter.team ' +
      'ORDER BY avg(shot.speed) DESC, shot.type')).toEqual([])
  })

  test('GROUP BY: non-key, non-aggregate expressions are PBQL_NOT_GROUPED', () => {
    const [select] = analyzeQuery(
      'SELECT shot.speed FROM "f" WHERE true GROUP BY shot.type')
    expect(select).toMatchObject({
      code: 'PBQL_NOT_GROUPED',
      message: '"shot.speed" must be an aggregate or a GROUP BY key'
    })
    // key matching is structural: shot[1].type is not the key shot.type
    expect(analyzeQuery(
      'SELECT shot[1].type FROM "f" WHERE true GROUP BY shot.type')[0].code)
      .toBe('PBQL_NOT_GROUPED')
    // 2-ary min() is the scalar function, not the aggregate
    expect(analyzeQuery(
      'SELECT count() FROM "f" WHERE true GROUP BY shot.type ' +
      'ORDER BY min(shot.speed, 1)')[0]).toMatchObject({
      code: 'PBQL_NOT_GROUPED',
      message: '"min(shot.speed, 1)" must be an aggregate or a GROUP BY key'
    })
  })

  test('GROUP BY needs a SELECT and cannot carry CONTEXT', () => {
    expect(analyzeQuery('FROM "f" WHERE true GROUP BY shot.type')[0])
      .toMatchObject({ code: 'PBQL_GROUP_BY_NO_SELECT', line: 1, col: 30 })
    expect(analyzeQuery('SELECT count() FROM "f" WHERE true GROUP BY shot.type ' +
      'CONTEXT BEFORE 1 shot')[0].code).toBe('PBQL_GROUP_BY_CONTEXT')
    expect(analyzeQuery('SELECT count() FROM "f" WHERE true GROUP BY shot.type ' +
      'CONTEXT AFTER 2secs')[0].code).toBe('PBQL_GROUP_BY_CONTEXT')
  })

  test('GROUP BY keys are checked and cannot hold aggregates', () => {
    expect(analyzeQuery('SELECT count() FROM "f" WHERE true GROUP BY shot.tpye')[0])
      .toMatchObject({ code: 'PBQL_UNKNOWN_PROPERTY', hint: 'did you mean "type"?' })
    expect(analyzeQuery('SELECT count() FROM "f" WHERE true GROUP BY count()')[0].code)
      .toBe('PBQL_UNKNOWN_FUNCTION')
  })

  test('ORDER BY aggregates stay invalid without GROUP BY', () => {
    expect(analyzeQuery('FROM "f" WHERE true ORDER BY count()')[0].code)
      .toBe('PBQL_UNKNOWN_FUNCTION')
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
  test('rewrites function-form methods to method form', () => {
    const { ast } = parse('FROM "f" WHERE taggedWith(shot, "BJ*")')
    const { ast: canonical } = parse('FROM "f" WHERE shot.taggedWith("BJ*")')
    expect(stripLoc(normalize(ast))).toEqual(stripLoc(canonical))
  })

  test('rewrites player-subject methods, appending to the navigation path', () => {
    const { ast } = parse('FROM "f" WHERE taggedWith(me.teammate, "A*")')
    const normalized = normalize(ast)
    expect(analyze(normalized).errors).toEqual([])
    expect(normalized.where).toMatchObject({
      kind: 'prop',
      base: { object: 'player', root: 'me' },
      path: ['teammate', 'taggedWith'],
      args: [{ kind: 'lit', value: 'A*' }]
    })
    // the same for a hitter reached from a shot base
    const { ast: h } = parse('FROM "f" WHERE taggedWith(shot.hitter, "B*")')
    expect(normalize(h).where).toMatchObject({
      base: { object: 'shot', offset: 0 },
      path: ['hitter', 'taggedWith']
    })
    // subjects with a scalar tail are not method subjects — left alone
    const { ast: keep } = parse('FROM "f" WHERE taggedWith(shot.hitter.name, "B*")')
    expect(normalize(keep).where.kind).toBe('call')
  })

  test('leaves regular functions and non-method calls alone', () => {
    const { ast } = parse(
      'FROM "f" WHERE min(shot.from.x, 1) < 2 AND foo(shot.speed) = 1')
    expect(stripLoc(normalize(ast))).toEqual(stripLoc(ast))
  })
})
