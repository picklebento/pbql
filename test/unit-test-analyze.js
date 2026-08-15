import { analyze, enumValuesOf } from '../src/analyze/analyze.js'
import { parse } from '../src/index.js'
import { REGISTRY } from '../src/model/registry.js'

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
    // rally.count: a condition argument, validated recursively, one level
    expect(analyzeWhere('rally.count(shot.hitter = me) >= 3')).toEqual([])
    expect(analyzeWhere('rally.count() = 1')[0].code).toBe('PBQL_BAD_ARITY')
    expect(analyzeWhere('rally.count(shot.nope) = 1')[0].code)
      .toBe('PBQL_UNKNOWN_PROPERTY')
    expect(analyzeWhere(
      'rally.count(rally.count(shot.num = 1) = 1) > 0')[0].code)
      .toBe('PBQL_NESTED_COUNT')
    expect(analyzeWhere(
      'rally.count(NOT (rally.count(shot.num = 1) = 1)) > 0')[0].code)
      .toBe('PBQL_NESTED_COUNT')
    // its result is a NUMBER: comparing to a string is a type error
    expect(analyzeWhere('rally.count(shot.num = 1) = "three"')[0].code)
      .toBe('PBQL_TYPE_MISMATCH')
    // an unresolvable method stays untyped, so only the unknown-method
    // error fires (no bogus type error stacked on top)
    expect(analyzeWhere('shot.quality.taggedWith("x") = 1').map(e => e.code))
      .toEqual(['PBQL_UNKNOWN_METHOD'])
    expect(analyzeWhere('shot.quality.taggedWith("x")')[0].code)
      .toBe('PBQL_UNKNOWN_METHOD')
  })

  test('method arguments are checked against their declared type', () => {
    expect(analyzeWhere('shot.taggedWith(5)')[0]).toEqual({
      code: 'PBQL_TYPE_MISMATCH',
      message: 'taggedWith() takes a string pattern, not number',
      line: 1,
      col: 16,
      length: 0
    })
    expect(analyzeWhere('me.taggedWith(true)')[0].code).toBe('PBQL_TYPE_MISMATCH')
    expect(analyzeWhere('shot.isHitOnSide(1 + 2)')[0].message)
      .toBe('isHitOnSide() takes a string side, not number')
    // typed property arguments are checked too; untyped expressions pass
    expect(analyzeWhere('shot.taggedWith(shot.speed)')[0].code)
      .toBe('PBQL_TYPE_MISMATCH')
    expect(analyzeWhere('shot.taggedWith(shot.type)')).toEqual([])
    expect(analyzeWhere('shot.taggedWith(min(1, 2))')).toEqual([])
    // the enum check still fires for well-typed strings
    expect(analyzeWhere('shot.isHitOnSide("up")')[0].code)
      .toBe('PBQL_UNKNOWN_ENUM_VALUE')
  })

  test('a relation called like a method is an error, not a crash', () => {
    expect(analyzeWhere('shot.hitter("a")')[0]).toEqual({
      code: 'PBQL_UNKNOWN_METHOD',
      message: 'shot.hitter is a player, not a method',
      line: 1,
      col: 16,
      length: 0,
      hint: 'call a player method on it (e.g. shot.hitter.taggedWith("Alex")) ' +
        'or compare it (e.g. shot.hitter = me)'
    })
    // every relation root: the `me` root, a multi-hop path, no arguments at all
    expect(analyzeWhere('me.teammate(1)')[0].message)
      .toBe('me.teammate is a player, not a method')
    expect(analyzeWhere('shot[1].hitter.opponentLHS(1)')[0].message)
      .toBe('shot[1].hitter.opponentLHS is a player, not a method')
    expect(analyzeWhere('shot.hitter()')[0].code).toBe('PBQL_UNKNOWN_METHOD')
    // the arguments are still checked (they are ordinary expressions)
    expect(analyzeWhere('shot.hitter(shot.isVoley)').map(e => e.code))
      .toEqual(['PBQL_UNKNOWN_PROPERTY', 'PBQL_UNKNOWN_METHOD'])
  })

  test('SELECT * stands alone: no GROUP BY, no CONTEXT', () => {
    const analyzeText = text => analyze(parse(text).ast).errors
    expect(analyzeText('SELECT * FROM "x" WHERE shot.num = 1')).toEqual([])
    expect(analyzeText(
      'SELECT * FROM "x" WHERE shot.num = 1 GROUP BY shot.type')[0].code)
      .toBe('PBQL_STAR_GROUPED')
    expect(analyzeText(
      'SELECT * FROM "x" WHERE shot.num = 1 CONTEXT BEFORE rally')[0].code)
      .toBe('PBQL_SELECT_CONTEXT')
  })

  test('HAVING needs GROUP BY and groups its references', () => {
    const analyzeText = text => analyze(parse(text).ast).errors
    expect(analyzeText('SELECT rally.num, count() FROM "x" ' +
      'WHERE shot.num >= 1 GROUP BY rally.num HAVING count() >= 3'))
      .toEqual([])
    expect(analyzeText('SELECT count() FROM "x" WHERE shot.num >= 1 ' +
      'HAVING count() >= 3')[0].code).toBe('PBQL_HAVING_NO_GROUP_BY')
    // a bare per-shot property has no single value within a group
    expect(analyzeText('SELECT rally.num FROM "x" WHERE shot.num >= 1 ' +
      'GROUP BY rally.num HAVING shot.speed > 3')[0].code)
      .toBe('PBQL_NOT_GROUPED')
    // SELECT items still take aggregates only at the top
    expect(analyzeText('SELECT count() * 2 FROM "x" WHERE shot.num >= 1')[0]
      .code).toBe('PBQL_UNKNOWN_FUNCTION')
  })

  test('bare non-player objects are not values; players are (identity)', () => {
    const [bare] = analyzeWhere('shot = 1')
    expect(bare.code).toBe('PBQL_MISSING_PROPERTY')
    expect(bare.hint).toBeUndefined() // the .num hint is exists()-specific
    expect(analyzeWhere('rally = 1')[0].message)
      .toBe('select a property of rally (e.g. rally.num)')
    expect(analyzeWhere('shot.hitter = me')).toEqual([])
    expect(analyzeWhere('me = shot.hitter')).toEqual([])
  })

  test('exists() on a bare shot/rally reference hints at .num', () => {
    const [error] = analyzeWhere('exists(shot[1])')
    expect(error).toMatchObject({
      code: 'PBQL_MISSING_PROPERTY',
      message: 'select a property of shot (e.g. shot.num)',
      hint: 'to test whether shot[1] exists, use exists(shot[1].num) ' +
        '(num is always present when the reference is in range)'
    })
    expect(analyzeWhere('exists(rally[-1])')[0].hint)
      .toBe('to test whether rally[-1] exists, use exists(rally[-1].num) ' +
        '(num is always present when the reference is in range)')
    // game has no num property, so the hint is withheld there
    expect(analyzeWhere('exists(game)')[0].hint).toBeUndefined()
    // a player is a value, so exists(me) needs no hint (and no error)
    expect(analyzeWhere('exists(me)')).toEqual([])
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

  test('date: one arity, string result', () => {
    expect(analyzeWhere('date(game.epoch) = "2025-01-01"')).toEqual([])
    expect(analyzeWhere('date() = "x"')[0].code).toBe('PBQL_BAD_ARITY')
    expect(analyzeWhere('date(1, 2) = "x"')[0].code).toBe('PBQL_BAD_ARITY')
    // string result: equality is fine, ordering is not (order games by
    // game.epoch itself instead)
    expect(analyzeWhere('date(game.epoch) < "2025-01-01"')[0]).toMatchObject({
      code: 'PBQL_TYPE_MISMATCH',
      message: '"<" needs numbers, not string'
    })
    expect(analyzeWhere('date(game.epoch) = 5')[0].message)
      .toBe('cannot compare string with number')
  })

  test('enum properties reject values production never emits', () => {
    expect(analyzeWhere('shot.type = "smsh"')[0]).toMatchObject({
      code: 'PBQL_UNKNOWN_ENUM_VALUE',
      message: 'shot.type is never "smsh" (valid: "smash", "lob", "dink", ' +
        '"drop", "drive", "atp", "erne")',
      hint: 'did you mean "smash"?'
    })
    // both operand orders, both equality operators
    expect(analyzeWhere('"drivee" = shot[1].type')[0]).toMatchObject({
      code: 'PBQL_UNKNOWN_ENUM_VALUE',
      message: expect.stringContaining('shot[1].type is never "drivee"'),
      hint: 'did you mean "drive"?'
    })
    expect(analyzeWhere('shot.winnerType != "winner"')[0]).toMatchObject({
      code: 'PBQL_UNKNOWN_ENUM_VALUE',
      message: 'shot.winnerType is never "winner" (valid: "clean", "forced_fault")'
    })
    // IN lists: one report for the first invalid element
    const inErrors = analyzeWhere('shot.type IN ("smash", "speedup", "volley")')
    expect(inErrors).toHaveLength(1)
    expect(inErrors[0]).toMatchObject({
      code: 'PBQL_UNKNOWN_ENUM_VALUE',
      message: expect.stringContaining('shot.type is never "speedup"')
    })
    expect(analyzeWhere('shot.type IN ("smash", "drive")')).toEqual([])
  })

  test('every declared enum value passes for every enum property', () => {
    const roots = { shot: 'shot', rally: 'rally', game: 'game', player: 'me' }
    let checked = 0
    for (const [objName, { propList }] of Object.entries(REGISTRY)) {
      for (const { path, unit } of propList) {
        for (const value of enumValuesOf(unit) ?? []) {
          expect(analyzeWhere(`${roots[objName]}.${path} = ${JSON.stringify(value)}`))
            .toEqual([])
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(30) // the surface stays enum-rich
  })

  test('enum-typed method arguments are validated the same way', () => {
    for (const kind of ['atp', 'erne', 'hands_battle', 'long_rally', 'poach', 'sequence']) {
      expect(analyzeWhere(`shot.inHighlight("${kind}")`)).toEqual([])
    }
    expect(analyzeWhere('shot.isHitOnSide("left")')).toEqual([])
    expect(analyzeWhere('shot.isHitOnSide("right")')).toEqual([])
    expect(analyzeWhere('shot.inHighlight("ernie")')[0]).toMatchObject({
      code: 'PBQL_UNKNOWN_ENUM_VALUE',
      message: 'inHighlight() kind is never "ernie" (valid: "atp", "erne", ' +
        '"hands_battle", "long_rally", "poach", "sequence")',
      hint: 'did you mean "erne"?'
    })
    expect(analyzeWhere('shot.isHitOnSide("up")')[0]).toMatchObject({
      code: 'PBQL_UNKNOWN_ENUM_VALUE',
      message: 'isHitOnSide() side is never "up" (valid: "left", "right")'
    })
  })

  test('enum enforcement leaves non-literal comparisons and arguments alone', () => {
    expect(analyzeWhere('shot.type = shot[1].type')).toEqual([])
    expect(analyzeWhere('shot.from.zone = shot.to.zone')).toEqual([])
    expect(analyzeWhere('shot.inHighlight(shot.winnerType)')).toEqual([])
    // non-string literals stay the type checker's business
    expect(analyzeWhere('shot.type = 5')).toEqual([
      expect.objectContaining({ code: 'PBQL_TYPE_MISMATCH' })])
    // a non-string argument is the type check's business, not the enum's
    expect(analyzeWhere('shot.taggedWith(5)').map(e => e.code))
      .toEqual(['PBQL_TYPE_MISMATCH'])
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

  test('a plain SELECT cannot carry CONTEXT either', () => {
    // a projection returns rows, not clips, so CONTEXT is meaningless on it
    expect(analyzeQuery('SELECT shot.speed FROM "f" WHERE true CONTEXT BEFORE 1 shot')[0])
      .toMatchObject({
        code: 'PBQL_SELECT_CONTEXT',
        message: 'CONTEXT applies to shot clips, not SELECT results'
      })
    // the AFTER side is guarded the same way
    expect(analyzeQuery('SELECT shot.speed FROM "f" WHERE true CONTEXT AFTER 2secs')[0].code)
      .toBe('PBQL_SELECT_CONTEXT')
    // a SELECT at the zero-context default is fine, and shot-lists still take
    // CONTEXT freely
    expect(analyzeQuery('SELECT shot.speed FROM "f" WHERE true')).toEqual([])
    expect(analyzeQuery('FROM "f" WHERE true CONTEXT BEFORE 1 shot')).toEqual([])
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

describe('methods have exactly one spelling', () => {
  test('a method written function-style is an unknown function', () => {
    // the bare `shot` argument is also flagged (objects are not values)
    expect(analyzeWhere('taggedWith(shot, "BJ*")').map(e => e.code))
      .toContain('PBQL_UNKNOWN_FUNCTION')
    expect(analyzeWhere('taggedWith(me.teammate, "A*")')[0].code)
      .toBe('PBQL_UNKNOWN_FUNCTION')
  })
})
