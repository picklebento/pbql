// The pbql CLI: run a query over insights JSON and emit selected shots as
// JSON/CSV/EDL, an ffmpeg command, or pb.vision explore links. FROM sources
// are strings the CLI resolves per src/sources/resolve.js.
import fs from 'node:fs'
import { parseArgs } from 'node:util'

import { runQuery } from '../engine/run.js'
import { parse } from '../lang/parse.js'
import { toClips } from '../output/clips.js'
import { shotsToCSV } from '../output/csv.js'
import { toEDL } from '../output/edl.js'
import { ffmpegCommands } from '../output/ffmpeg.js'
import { toSelectedShotsJSON } from '../output/json.js'
import { toShotExplorerURLs } from '../se/to-shot-explorer.js'
import { resolveSources } from '../sources/resolve.js'
import { validate } from '../validate.js'

export const USAGE = `usage: pbql [QUERY | -f query.pbql] [options]
  FROM sources are strings; the CLI interprets each with one rule:
  a pb.vision video id with optional 1-based session ("83gyqyc10y8f",
  "83gyqyc10y8f:2" — insights are fetched from production), else an
  existing file (one insights JSON), else an existing directory (every
  *.json beneath it), else a glob ("games/*.json"). Write "./name" for
  a local file whose name looks like a video id. Fetched insights are
  cached (no expiration) in $XDG_CACHE_HOME/pbql (default ~/.cache/pbql),
  one file per game; to refetch, delete the game's file or the directory.
    pbql 'FROM "game.json" WHERE shot.isVolley' --out csv
  -f, --file <path>       read the query from a file
  --me <playerIdx>        which player (0-3) "me" refers to
  --out <format>          json (default) | csv | edl | ffmpeg | se
                          (se = pb.vision explore links carrying the query,
                          one per video-id source in FROM;
                          edl uses the queried video's frame rate, default 30)
  --video-file <path>     source video path (required for --out ffmpeg)
  --output-file <path>    cut video path for --out ffmpeg (default cut.mp4)
  --merge-gap <secs>      merge clips closer than this (default 0.5)
  --max-secs-beyond-rally <n>  context spill limit (default 3)`

const OPTIONS = {
  file: { type: 'string', short: 'f' },
  me: { type: 'string' },
  out: { type: 'string', default: 'json' },
  'video-file': { type: 'string' },
  'output-file': { type: 'string', default: 'cut.mp4' },
  'merge-gap': { type: 'string', default: '0.5' },
  'max-secs-beyond-rally': { type: 'string', default: '3' },
  help: { type: 'boolean', short: 'h', default: false }
}

function fail (io, message) {
  io.stderr(message)
  return 1
}

function reportErrors (io, errors) {
  for (const e of errors) {
    io.stderr(`${e.line}:${e.col} ${e.code}: ${e.message}` +
      (e.hint === undefined ? '' : ` (${e.hint})`))
  }
  return 1
}

// --out se emits explore links that carry the query itself (?q=...), so it
// only needs a valid query — no insights are fetched or evaluated
function emitExploreLinks (text, io) {
  const { errors, ast } = validate(text)
  if (errors.length > 0) {
    return reportErrors(io, errors)
  }
  let urls
  try {
    urls = toShotExplorerURLs(text, ast.sources)
  } catch (err) {
    return fail(io, err.message)
  }
  if (urls.length === 0) {
    return fail(io, '--out se needs a pb.vision video id in FROM ' +
      '(e.g. FROM "83gyqyc10y8f"); local paths have no explore page')
  }
  io.stdout(urls.join('\n'))
  return 0
}

export async function main (argv, io) {
  let parsed
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true })
  } catch (err) {
    return fail(io, `${err.message}\n${USAGE}`)
  }
  const { values, positionals } = parsed
  if (values.help) {
    io.stdout(USAGE)
    return 0
  }

  // numeric flags are validated up front, whatever the output format
  const number = text => (text.trim() === '' ? NaN : Number(text))
  const me = values.me === undefined ? undefined : number(values.me)
  if (me !== undefined && (!Number.isInteger(me) || me < 0 || me > 3)) {
    return fail(io, `--me must be an integer 0-3, got "${values.me}"\n${USAGE}`)
  }
  const numeric = {}
  for (const flag of ['merge-gap', 'max-secs-beyond-rally']) {
    numeric[flag] = number(values[flag])
    if (!Number.isFinite(numeric[flag]) || numeric[flag] < 0) {
      return fail(io, `--${flag} must be a finite non-negative number, ` +
        `got "${values[flag]}"\n${USAGE}`)
    }
  }

  let text
  if (values.file !== undefined) {
    text = fs.readFileSync(values.file, 'utf8')
  } else if (positionals.length === 1) {
    text = positionals[0]
  } else {
    return fail(io, `expected a query (or -f query.pbql)\n${USAGE}`)
  }

  if (values.out === 'se') {
    return emitExploreLinks(text, io)
  }

  const meta = me === undefined ? {} : { myPlayerIdx: me }
  // resolve the query's FROM sources; parse errors are left for runQuery
  // below so they print with positions like any other
  const query = parse(text)
  let games = []
  if (query.ast !== undefined) {
    try {
      games = (await resolveSources(query.ast.sources))
        .map(game => ({ ...game, meta }))
    } catch (err) {
      return fail(io, err.message)
    }
  }

  const result = runQuery({
    text,
    games,
    options: { maxSecsBeyondRally: numeric['max-secs-beyond-rally'] }
  })
  if (result.errors) {
    return reportErrors(io, result.errors)
  }
  for (const warning of result.warnings) {
    io.stderr(`warning: ${warning.vid}: ${warning.message}`)
  }

  const mergeGapMs = numeric['merge-gap'] * 1000
  switch (values.out) {
    case 'json':
      io.stdout(JSON.stringify(toSelectedShotsJSON(result), null, 2))
      return 0
    case 'csv':
      io.stdout(shotsToCSV(result))
      return 0
    case 'edl':
      io.stdout(toEDL({
        title: 'pbql selection',
        clips: toClips(result.shots, { mergeGapMs }),
        // frame rate comes from the queried data (the first game's, as in
        // the web app); toEDL falls back to 30 when the camera doesn't say
        fps: games[0]?.insights.camera?.fps
      }))
      return 0
    case 'ffmpeg': {
      if (values['video-file'] === undefined) {
        return fail(io, '--out ffmpeg requires --video-file')
      }
      const clips = toClips(result.shots, { mergeGapMs })
      if (clips.length === 0) {
        return fail(io, 'no shots selected; nothing to cut')
      }
      const { steps } = ffmpegCommands({
        input: values['video-file'],
        clips,
        output: values['output-file']
      })
      io.stdout(steps.map(s => s.command).join('\n'))
      return 0
    }
    default:
      return fail(io, `unknown --out format "${values.out}"\n${USAGE}`)
  }
}
