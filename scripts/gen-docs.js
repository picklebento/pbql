// Generates docs/data-dictionary.md and docs/llms.txt from the property
// registry (src/model/registry.js) and the example corpus
// (test/corpus/examples.pbql), so the docs cannot drift from the code.
// Run via `yarn docs`.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { REGISTRY } from '../src/model/registry.js'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const OBJECT_DOCS = {
  shot: 'The shot being tested. `shot[k]` addresses the shot k earlier/later in the same rally.',
  rally: 'The rally containing the current shot. `rally[k]` addresses neighboring rallies in the same game.',
  game: 'The session (one game of a possibly multi-game video) containing the shot.',
  player: 'Any player reference: `hitter`, `me`, `myTeammate`, `myOpponent1/2`, `myOpponentLHS/RHS`, and the `hitters…` forms.'
}

function propRows (objName, { propList, methodList }) {
  const rows = propList.map(p =>
    `| \`${objName}.${p.path}\` | ${p.type} | ${p.unit ?? ''} | ${p.doc} |`)
  rows.push(...methodList.map(m => {
    const args = m.args.map(a => a.name).join(', ')
    return `| \`${objName}.${m.name}(${args})\` | boolean | | ${m.doc} |`
  }))
  return rows
}

function generateDictionary () {
  const parts = [
    '# PBQL Data Dictionary',
    '',
    '<!-- GENERATED FILE — do not edit. Run `yarn docs` to regenerate',
    '     from src/model/registry.js. -->',
    '',
    'The complete queryable surface. Any property may be **unknown** when the',
    'underlying data was not detected — see the unknown-handling rules in',
    '[language.md](language.md). `player.*` rows apply to every player',
    'reference; positions are measured at the moment the current shot was hit.',
    ''
  ]
  for (const [objName, entry] of Object.entries(REGISTRY)) {
    parts.push(`## ${objName}`, '', OBJECT_DOCS[objName], '',
      '| Property | Type | Unit / values | Description |',
      '|---|---|---|---|',
      ...propRows(objName, entry), '')
  }
  return parts.join('\n')
}

function readExamples () {
  const text = fs.readFileSync(
    path.join(repoRoot, 'test', 'corpus', 'examples.pbql'), 'utf8')
  const examples = []
  for (const line of text.split('\n')) {
    if (line.startsWith('# Q:')) {
      examples.push({ question: line.slice(4).trim(), query: [] })
    } else if (examples.length > 0 && line.trim() !== '') {
      examples.at(-1).query.push(line)
    }
  }
  return examples.map(e => ({ ...e, query: e.query.join('\n') }))
}

function generateLlmsTxt () {
  const parts = [
    '# PBQL (Pickleball Query Language) — guide for LLMs',
    '',
    '<!-- GENERATED FILE — do not edit. Run `yarn docs`. -->',
    '',
    'PBQL selects shots from pickleball games analyzed by PB Vision.',
    '',
    '## Query shape (clauses in this order)',
    '',
    '    [SELECT expr [AS "label"], ...]      -- optional projection',
    '    FROM "source", ...                   -- quoted strings the host resolves',
    '      -- pb.vision video: "83gyqyc10y8f" (game 2 = "83gyqyc10y8f:2");',
    '      -- the CLI also takes a file ("game.json"), a directory (every',
    '      -- *.json beneath it), or a glob ("games/*.json")',
    '    WHERE condition                      -- required',
    '    [CONTEXT BEFORE duration]       -- widen each clip backward',
    '    [CONTEXT AFTER duration]        -- widen each clip forward',
    '    [ORDER BY expr [ASC|DESC], ...]',
    '    [LIMIT n]',
    '',
    '## Rules that matter',
    '',
    '- Keywords are case-insensitive; property names are case-sensitive.',
    '- Operators (loosest to tightest): OR, AND, NOT, comparisons',
    '  (= != < <= > >=, x IN (a, b)), + -, * /, unary -.',
    '- Strings are double-quoted. Comments start with #.',
    '- Missing data is "unknown" (SQL NULL-like): comparisons with unknown',
    '  are unknown and WHERE keeps only true. exists(x) tests presence.',
    '- Durations: `2secs`, `1 shot`, `rally` (= to the rally boundary), or',
    '  min(a, b)/max(a, b) of two durations (min = cap, max = floor).',
    '  `N shots` also adds those shots to the results as context.',
    '- Subject predicates are methods: shot.taggedWith("Alex*"),',
    '  shot.inHighlight("atp"). Utilities are functions: min, max, exists,',
    '  abs, kph (mph→km/h), toMs, toSecs.',
    '- Times are seconds; distances feet; speeds mph; quality 0-1 (1 best).',
    '- Players: hitter, me, myTeammate, myOpponent1/2, myOpponentLHS/RHS,',
    '  hittersTeammate, … Compare with = (hitter = me). team is 0|1.',
    '',
    '## Using the pbql CLI',
    '',
    "    pbql '<query>' [--me N] [--out json|csv|edl|ffmpeg|se]",
    '',
    '- Each FROM string resolves by one rule: a pb.vision video id with an',
    '  optional 1-based session ("83gyqyc10y8f", "83gyqyc10y8f:2") fetched',
    '  from pb.vision; else an existing file (one insights JSON); else a',
    '  directory (every *.json beneath it, recursively); else a glob',
    '  ("games/*.json").',
    '- Fetched insights are cached with no expiration in $XDG_CACHE_HOME/pbql',
    "  (default ~/.cache/pbql); to refetch, delete the game's file (or the",
    '  whole directory).',
    '',
    '## Data dictionary',
    ''
  ]
  for (const [objName, entry] of Object.entries(REGISTRY)) {
    for (const p of entry.propList) {
      const unit = p.unit ? ` [${p.unit}]` : ''
      parts.push(`- ${objName}.${p.path} (${p.type}${unit}): ${p.doc}`)
    }
    for (const m of entry.methodList) {
      const args = m.args.map(a => a.name).join(', ')
      parts.push(`- ${objName}.${m.name}(${args}) (boolean): ${m.doc}`)
    }
  }
  parts.push('', '## Examples', '')
  for (const { question, query } of readExamples()) {
    parts.push(`Q: ${question}`, '', ...query.split('\n').map(l => '    ' + l), '')
  }
  return parts.join('\n')
}

fs.writeFileSync(path.join(repoRoot, 'docs', 'data-dictionary.md'),
  generateDictionary() + '\n')
fs.writeFileSync(path.join(repoRoot, 'docs', 'llms.txt'),
  generateLlmsTxt() + '\n')
console.log('wrote docs/data-dictionary.md and docs/llms.txt')

// also emit the guide as an importable module so host apps (e.g. the Shot
// Explorer's "build with AI" button) can embed it in copyable LLM prompts
const guide = generateLlmsTxt()
fs.writeFileSync(path.join(repoRoot, 'src', 'llm', 'guide.js'),
  '// GENERATED FILE — do not edit. Run `yarn docs` to regenerate from the\n' +
  '// property registry and the example corpus.\n' +
  `export const LLM_GUIDE = ${JSON.stringify(guide)}\n`)
console.log('wrote src/llm/guide.js')
