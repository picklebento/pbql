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
  shot: 'The shot being tested. `shot[k]` addresses the shot k earlier/later in the same rally. `shot.hitter` navigates to the player who hit it.',
  rally: 'The rally containing the current shot. `rally[k]` addresses neighboring rallies in the same game.',
  game: 'The session (one game of a possibly multi-game video) containing the shot.',
  player: 'A player value, reached from the root `me` or a shot\'s `hitter` (e.g. `shot.hitter`, `shot[1].hitter`) and stepped through the relations below. A path ending AT a player is its identity, for `=`/`!=` (`shot.hitter = me`). Scalar props are measured at the moment of the shot the player was reached through.'
}

function propRows (objName, { propList, methodList, relationList }) {
  const rows = relationList.map(r =>
    `| \`${objName}.${r.name}\` | player | | ${r.doc} |`)
  rows.push(...propList.map(p =>
    `| \`${objName}.${p.path}\` | ${p.type} | ${p.unit ?? ''} | ${p.doc} |`))
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
    '    [GROUP BY expr, ...]            -- one output row per group',
    '    [CONTEXT BEFORE duration]      -- omit for the default 1-shot lead-in; write to override',
    '    [CONTEXT AFTER duration]       -- omit for the default 1-shot lead-out; write to override',
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
    '- exists() takes a property, not a bare object: to probe whether a',
    '  shot/rally reference exists, use its num — exists(shot[1].num), not',
    '  exists(shot[1]) — since num is always present when the reference is',
    '  in range.',
    '- Fault flags are the exception to unknown-ness: shot.hasError,',
    '  shot.hasFault, shot.errors.faults.net and shot.errors.faults.short',
    '  are never unknown (a fault is recorded only when it happened, so',
    '  absent means false). NOT shot.errors.faults.net simply selects every',
    '  shot that cleared the net — no exists() guard needed.',
    '- Durations: `2secs`, `1 shot`, `rally` (= to the rally boundary), or',
    '  min(a, b)/max(a, b) of two durations (min = cap, max = floor).',
    '  `N shots` also adds those shots to the results as context.',
    '- Subject predicates are methods: shot.taggedWith("Alex*"),',
    '  shot.inHighlight("atp"). Utilities are functions: min, max, exists,',
    '  abs, kph (mph→km/h — apply it to the property when testing a km/h',
    '  threshold: kph(shot.speed) > 70), toMs, toSecs, and',
    '  timecode(secs) — a time as an "m:ss" string (seconds floored;',
    '  timecode(x, true) appends a 0-based :ff frame counter at the game\'s',
    '  own fps). Strings compare with = / != only.',
    '- Times are seconds; distances feet; speeds mph; quality 0-1 (1 best).',
    '- String properties whose dictionary entry lists quoted alternatives',
    '  (shot.type, shot.winnerType, zones, …) accept ONLY those values in',
    '  =/!=/IN — any other string literal is a validation error. A "speedup"',
    '  or "volley" is never a shot.type: those are the shot.isSpeedup /',
    '  shot.isVolley booleans.',
    '- GROUP BY computes per-group breakdowns (win rate by shot type, avg',
    '  speed by player) in one query; with it, every SELECT/ORDER BY item',
    '  must be an aggregate or one of the group keys, and CONTEXT is not',
    '  allowed.',
    '- WHERE is required in every query — there is no bare FROM … GROUP BY.',
    '  When no filter is wanted (count everything, a whole-game breakdown),',
    '  write WHERE true.',
    '- Counting or aggregating RALLIES ("how many rallies …", average rally',
    '  length): every shot in a rally carries the rally\'s properties, so an',
    '  unanchored count()/avg() counts shots, not rallies. Anchor with',
    '  shot.num = 1 (exactly one shot per rally) alongside the rally',
    '  condition so each rally counts once.',
    '- Computing rates ("how often do we win when …"): if the condition can',
    '  hold at most once per rally (who served, a shot.num = 1 fact), one',
    '  query is enough — avg(<condition>) is a rate (booleans average as',
    '  1/0), and GROUP BY gives per-group rates. But when the condition can',
    '  occur MULTIPLE times in one rally (e.g. "rallies where I hit a',
    '  drop"), a shot-level avg over-counts rallies with several matching',
    '  shots: instead SELECT rally.num, rally.winner with the condition,',
    '  dedupe the rallies yourself, and divide — or run two such queries',
    '  and divide the deduped rally counts. Keep WHERE to exactly the',
    '  rally-membership condition asked about; who won is read from the',
    '  projected rally.winner afterward, never folded into WHERE. Never',
    '  present a shot-weighted average as a per-point rate.',
    '- Use SELECT only when the question asks for values or aggregates',
    '  (counts, averages, a spreadsheet of numbers). Questions that find or',
    '  show shots — including superlatives like "the fastest shot" (use',
    '  ORDER BY … LIMIT) — must NOT have a SELECT clause.',
    '- DEFAULT CONTEXT: a query that selects individual shots (no SELECT/',
    '  GROUP BY) is watched as clips, and each selected shot AUTOMATICALLY',
    '  comes with a one-shot lead-in and lead-out — so DON\'T write CONTEXT',
    '  for a normal clip; just omit it. Write CONTEXT only to CHANGE that',
    '  default: `CONTEXT BEFORE rally` (or a secs/shots/min/max duration) for',
    '  more footage on a side, or `CONTEXT BEFORE 0secs` for no lead-in or',
    '  lead-out at all. Writing ANY CONTEXT clause opts out of the ±1',
    '  default — the side you don\'t write becomes 0. SELECT / aggregate /',
    '  GROUP BY / count queries return rows, not clips, so they take NO',
    '  CONTEXT. CONTEXT never changes which shots match: to SELECT the shot',
    '  before/after an event, put a shot[1]/shot[-1] condition in WHERE (the',
    '  shot right before a winner: WHERE exists(shot[1].winnerType)).',
    '- "First/second half of the game" has two readings. By the clock,',
    '  compare shot.hitTime against the game\'s midpoint:',
    '  shot.hitTime >= game.startTime + game.duration / 2 (game.startTime/',
    '  game.endTime bound the rallies). By rally count, compare rally.num',
    '  against game.numRallies / 2 (rally.num > game.numRallies / 2). Use',
    '  the clock for time questions ("the last ten minutes", "late in the',
    '  video"), rally counts for rally-position questions ("the last five',
    '  rallies", "the game\'s second half of points").',
    '- Relative references work on both axes: shot[-1]/shot[1] address the',
    '  previous/next shot within the rally, and rally[-1]/rally[1] address',
    '  the previous/next rally within the game (e.g. rally[-1].winner is who',
    '  won the prior rally) — use them instead of arithmetic on shot.num or',
    '  rally.num.',
    '- Players are values you navigate to. Two roots: `me` (the asker) and a',
    '  shot\'s hitter, `shot.hitter` (also `shot[k].hitter`, e.g.',
    '  `shot[1].hitter` targets the next shot\'s hitter). From any player step',
    '  to a related player: .teammate, .opponent1, .opponent2, .opponentLHS,',
    '  .opponentRHS (e.g. me.teammate, shot.hitter.opponentLHS). Then read a',
    '  player scalar (.name, .team (0|1), .feetToKitchen, .pos.x, …) or stop',
    '  at the player to compare identities with = / != (shot.hitter = me,',
    '  shot[1].hitter.name = "Joe"). taggedWith is a player/shot method',
    '  (shot.hitter.taggedWith("Anna*")).',
    '- Forehand/backhand questions: shot.strokeType needs the hitter\'s',
    '  handedness, which only host-augmented insights carry — it is unknown',
    '  otherwise. shot.strokeSide ("left"/"right" side of the body) always',
    '  works and is usually what "backhand speedups" style questions want',
    '  when handedness data may be missing.',
    '- Where a player STANDS is read off the player (me.feetToKitchen,',
    '  shot.hitter.opponentLHS.feetToNet <= 14 for a player up at the net);',
    '  shot.from/shot.to are where the BALL was hit/landed. Questions about',
    '  hitting at/near a player test that player\'s position properties, not',
    '  shot.to coordinates.',
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
    for (const r of entry.relationList) {
      parts.push(`- ${objName}.${r.name} (player): ${r.doc}`)
    }
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
