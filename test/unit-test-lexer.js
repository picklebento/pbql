import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import lexer from '../src/lang/lexer.js'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function lex (text) {
  lexer.reset(text)
  const tokens = []
  let token
  while ((token = lexer.next()) !== undefined) {
    tokens.push(token)
  }
  return tokens
}

describe('pbql lexer', () => {
  test('skips whitespace and comments', () => {
    const tokens = lex('# a comment\n  \n42 # trailing comment')
    expect(tokens.map(t => t.type)).toEqual(['int'])
    expect(tokens[0].value).toBe(42)
  })

  test('lexes numeric literals with sign and type', () => {
    const [a, b, c, d] = lex('1 -2 3.5 -4.25')
    expect([a.type, a.value]).toEqual(['int', 1])
    expect([b.type, b.value]).toEqual(['int', -2])
    expect([c.type, c.value]).toEqual(['float', 3.5])
    expect([d.type, d.value]).toEqual(['float', -4.25])
  })

  test('lexes booleans as real booleans', () => {
    const [t, f] = lex('true false')
    expect([t.type, t.value]).toEqual(['true', true])
    expect([f.type, f.value]).toEqual(['false', false])
  })

  test('lexes strings with quotes intact (grammar strips them)', () => {
    const [s] = lex('"Anna Leigh Waters"')
    expect(s.type).toBe('string')
    expect(s.value).toBe('"Anna Leigh Waters"')
  })

  test('comparison operators prefer the longest match', () => {
    const tokens = lex('<= >= != < > =')
    expect(tokens.map(t => t.type))
      .toEqual(Array(6).fill('comparisonOperator'))
    expect(tokens.map(t => t.text)).toEqual(['<=', '>=', '!=', '<', '>', '='])
  })

  test('multi-word section keywords are single tokens', () => {
    const types = lex('SHOT CONTEXT BEFORE SHOT CONTEXT AFTER ORDER BY ASC DESC')
      .map(t => t.type)
    expect(types).toEqual(
      ['shotContextBefore', 'shotContextAfter', 'orderBy', 'sortOrder', 'sortOrder'])
  })

  test('keywords are carved out of identifiers', () => {
    const types = lex('FROM WHERE LIMIT AND OR NOT folder video min max shot rally game')
      .map(t => t.type)
    expect(types).toEqual([
      'kw_FROM', 'kw_WHERE', 'kw_LIMIT', 'kw_AND', 'kw_OR', 'kw_NOT',
      'kw_folder', 'kw_video', 'kw_min', 'kw_max', 'kw_shot', 'kw_rally',
      'kw_game'])
  })

  test('non-keyword identifiers stay identifiers', () => {
    const tokens = lex('isVolley feetToKitchen trajectory')
    expect(tokens.map(t => t.type))
      .toEqual(['identifier', 'identifier', 'identifier'])
  })

  test('lexes player references, absolute and relative', () => {
    const tokens = lex(
      'me myTeammate myOpponent1 myOpponentLHS hitter hittersTeammate hittersOpponent2 hittersOpponentRHS')
    expect(tokens.map(t => t.type)).toEqual(Array(8).fill('player'))
  })

  test('lexes punctuation and units', () => {
    const types = lex('( ) [ ] . , secs shots').map(t => t.type)
    expect(types).toEqual([
      'leftParen', 'rightParen', 'leftBracket', 'rightBracket', 'dot',
      'comma', 'unitSeconds', 'unitShots'])
  })

  test('unrecognized text becomes an error token with a position', () => {
    const tokens = lex('42 @oops')
    expect(tokens[0].type).toBe('int')
    const err = tokens[1]
    expect(err.type).toBe('error')
    expect(err.line).toBe(1)
    expect(err.col).toBe(4)
  })

  test('lexes the demo query with no error tokens', () => {
    const text = fs.readFileSync(path.join(repoRoot, 'test', 'demo.pbql'), 'utf8')
    const tokens = lex(text)
    expect(tokens.length).toBeGreaterThan(100)
    expect(tokens.filter(t => t.type === 'error')).toEqual([])
  })
})
