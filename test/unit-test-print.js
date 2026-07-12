import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse, print } from '../src/index.js'

import { stripLoc } from './helpers.js'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function roundtrips (text) {
  const first = parse(text)
  expect(first.errors).toBeUndefined()
  const printed = print(first.ast)
  const second = parse(printed)
  expect(second.errors).toBeUndefined()
  expect(stripLoc(second.ast)).toEqual(stripLoc(first.ast))
  return printed
}

// every example in the NL→PBQL corpus, split on its "# Q:" markers
function readCorpus () {
  const text = fs.readFileSync(
    path.join(repoRoot, 'test', 'corpus', 'examples.pbql'), 'utf8')
  const examples = []
  for (const line of text.split('\n')) {
    if (line.startsWith('# Q:')) {
      examples.push({ question: line.slice(4).trim(), lines: [] })
    } else if (examples.length > 0 && line.trim() !== '') {
      examples.at(-1).lines.push(line)
    }
  }
  return examples.map(e => ({ question: e.question, query: e.lines.join('\n') }))
}

describe('the example corpus', () => {
  const corpus = readCorpus()

  test('has a healthy number of examples', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(20)
  })

  test.each(corpus)('parses and roundtrips: $question', ({ query }) => {
    roundtrips(query)
  })
})

describe('print()', () => {
  test('the demo query roundtrips through print', () => {
    roundtrips(fs.readFileSync(path.join(repoRoot, 'test', 'demo.pbql'), 'utf8'))
  })

  test('canonicalizes keyword case and alias operators', () => {
    const printed = roundtrips('from folder(1) where shot.speed <> 3 and shot.num == 2')
    expect(printed).toBe('FROM folder(1)\nWHERE shot.speed != 3 AND shot.num = 2')
  })

  test('keeps necessary parentheses and drops redundant ones', () => {
    const printed = roundtrips(
      'FROM folder(1) WHERE ((shot.isVolley OR shot.isReset)) AND (shot.isPoach AND (shot.isFinal))')
    expect(printed).toBe(
      'FROM folder(1)\nWHERE (shot.isVolley OR shot.isReset) AND shot.isPoach AND shot.isFinal')
  })

  test('parenthesizes NOT of a junction but not NOT of a comparison', () => {
    expect(roundtrips('FROM folder(1) WHERE NOT (shot.isVolley AND shot.isReset)'))
      .toContain('NOT (shot.isVolley AND shot.isReset)')
    expect(roundtrips('FROM folder(1) WHERE NOT shot.speed = 3'))
      .toContain('NOT shot.speed = 3')
  })

  test('prints arithmetic with minimal parens, honoring associativity', () => {
    expect(roundtrips('FROM folder(1) WHERE shot.a - (shot.b + 1) * 2 = 0'))
      .toContain('shot.a - (shot.b + 1) * 2 = 0')
    expect(roundtrips('FROM folder(1) WHERE - -1 = 1'))
      .toContain('- -1 = 1')
  })

  test('prints relative references, methods, IN, and durations canonically', () => {
    const printed = roundtrips(`
      select shot.speed as "mph" from video("abc123def456", 2), folder(9)
      where shot[-1].taggedWith("BJ*") and shot.num in (1, 3)
      context before max(1 shot, 2sec)
      context after rally
      order by shot.speed desc, shot.hitTime asc
      limit 10`)
    expect(printed).toBe([
      'SELECT shot.speed AS "mph"',
      'FROM video("abc123def456", 2), folder(9)',
      'WHERE shot[-1].taggedWith("BJ*") AND shot.num IN (1, 3)',
      'CONTEXT BEFORE max(1 shot, 2secs)',
      'CONTEXT AFTER rally',
      'ORDER BY shot.speed DESC, shot.hitTime',
      'LIMIT 10'
    ].join('\n'))
  })

  test('omits default (zero) context and prints escaped strings', () => {
    const printed = roundtrips('FROM folder(1) WHERE hitter.name = "say \\"hi\\" \\\\"')
    expect(printed).toBe('FROM folder(1)\nWHERE hitter.name = "say \\"hi\\" \\\\"')
  })
})
