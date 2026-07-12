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

  // the corpus feeds docs/llms.txt, so its examples must be stored exactly
  // as print() would emit them (canonical keyword case, singular "1 shot" /
  // "1sec" units, current FROM string syntax, …) — no drift allowed
  test.each(corpus)('is stored canonically: $question', ({ query }) => {
    expect(query).toBe(print(parse(query).ast))
  })
})

// example queries displayed by the docs site and README are authored
// separately from the corpus, so hold them to the same canonical bar
describe('displayed example queries are canonical', () => {
  const decode = html => html.replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>').replaceAll('&amp;', '&')
  const expectCanonical = query => {
    const { ast, errors } = parse(query)
    expect(errors).toBeUndefined()
    expect(query).toBe(print(ast))
  }

  test('the docs-site homepage example', () => {
    const html = fs.readFileSync(
      path.join(repoRoot, 'docs-site', 'index.html'), 'utf8')
    const match = html.match(/<pre><code>([\s\S]*?)<\/code><\/pre>/)
    expect(match).not.toBeNull()
    expectCanonical(decode(match[1]))
  })

  test('the playground starter query', () => {
    const html = fs.readFileSync(
      path.join(repoRoot, 'docs-site', 'playground', 'index.html'), 'utf8')
    const match = html.match(/<textarea id="query"[^>]*>\n?([\s\S]*?)<\/textarea>/)
    expect(match).not.toBeNull()
    expectCanonical(decode(match[1]))
  })

  test('the README example', () => {
    const md = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8')
    const match = md.match(/```sql\n([\s\S]*?)\n```/)
    expect(match).not.toBeNull()
    expectCanonical(match[1])
  })
})

describe('print()', () => {
  test('the demo query roundtrips through print', () => {
    roundtrips(fs.readFileSync(path.join(repoRoot, 'test', 'demo.pbql'), 'utf8'))
  })

  test('canonicalizes keyword case and alias operators', () => {
    const printed = roundtrips('from "f" where shot.speed <> 3 and shot.num == 2')
    expect(printed).toBe('FROM "f"\nWHERE shot.speed != 3 AND shot.num = 2')
  })

  test('keeps necessary parentheses and drops redundant ones', () => {
    const printed = roundtrips(
      'FROM "f" WHERE ((shot.isVolley OR shot.isReset)) AND (shot.isPoach AND (shot.isFinal))')
    expect(printed).toBe(
      'FROM "f"\nWHERE (shot.isVolley OR shot.isReset) AND shot.isPoach AND shot.isFinal')
  })

  test('parenthesizes NOT of a junction but not NOT of a comparison', () => {
    expect(roundtrips('FROM "f" WHERE NOT (shot.isVolley AND shot.isReset)'))
      .toContain('NOT (shot.isVolley AND shot.isReset)')
    expect(roundtrips('FROM "f" WHERE NOT shot.speed = 3'))
      .toContain('NOT shot.speed = 3')
  })

  test('prints arithmetic with minimal parens, honoring associativity', () => {
    expect(roundtrips('FROM "f" WHERE shot.a - (shot.b + 1) * 2 = 0'))
      .toContain('shot.a - (shot.b + 1) * 2 = 0')
    expect(roundtrips('FROM "f" WHERE - -1 = 1'))
      .toContain('- -1 = 1')
  })

  test('prints relative references, methods, IN, and durations canonically', () => {
    const printed = roundtrips(`
      select shot.speed as "mph" from "abc123def456:2", "games/*.json"
      where shot[-1].taggedWith("BJ*") and shot.num in (1, 3)
      context before max(1 shot, 2sec)
      context after rally
      order by shot.speed desc, shot.hitTime asc
      limit 10`)
    expect(printed).toBe([
      'SELECT shot.speed AS "mph"',
      'FROM "abc123def456:2", "games/*.json"',
      'WHERE shot[-1].taggedWith("BJ*") AND shot.num IN (1, 3)',
      'CONTEXT BEFORE max(1 shot, 2secs)',
      'CONTEXT AFTER rally',
      'ORDER BY shot.speed DESC, shot.hitTime',
      'LIMIT 10'
    ].join('\n'))
  })

  test('prints sources as quoted strings, escapes included (D17)', () => {
    expect(roundtrips('from "abc123def456:2" , "games/*.json" WHERE true'))
      .toBe('FROM "abc123def456:2", "games/*.json"\nWHERE true')
    expect(roundtrips('FROM "a \\"b\\" \\\\" WHERE true'))
      .toBe('FROM "a \\"b\\" \\\\"\nWHERE true')
  })

  test('omits default (zero) context and prints escaped strings', () => {
    const printed = roundtrips('FROM "f" WHERE hitter.name = "say \\"hi\\" \\\\"')
    expect(printed).toBe('FROM "f"\nWHERE hitter.name = "say \\"hi\\" \\\\"')
  })
})

describe('duration number agreement', () => {
  test('singular units print as 1 shot / 1sec', () => {
    expect(roundtrips('FROM "f" WHERE true CONTEXT BEFORE 1secs CONTEXT AFTER 1 shots'))
      .toContain('CONTEXT BEFORE 1sec\nCONTEXT AFTER 1 shot')
  })
})
