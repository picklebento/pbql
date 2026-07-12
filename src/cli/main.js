// The pbql CLI: run a query over local insights JSON files and emit
// selected shots as JSON/CSV/EDL or an ffmpeg command. FROM sources are
// resolved as local paths: video("game.json") is an insights file and
// folder("dir") queries every *.json beneath a directory.
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
import { resolveLocalSources } from '../sources/local.js'

export const USAGE = `usage: pbql [QUERY | -f query.pbql] [options]
  FROM sources are local paths relative to the current directory:
  video("game.json") is an insights file; folder("dir") queries every
  *.json under dir, recursively unless written folder("dir", false).
  Sessions do not apply to local files.
    pbql 'FROM video("game.json") WHERE shot.isVolley' --out csv
  -f, --file <path>       read the query from a file
  --me <playerIdx>        which player (0-3) "me" refers to
  --out <format>          json (default) | csv | edl | ffmpeg | se
                          (se = Shot Explorer deep links, one per game;
                          edl uses the queried video's frame rate, default 30)
  --host <url>            web app host for --out se (default https://pb.vision)
  --video-file <path>     source video path (required for --out ffmpeg)
  --output-file <path>    cut video path for --out ffmpeg (default cut.mp4)
  --merge-gap <secs>      merge clips closer than this (default 0.5)
  --max-secs-beyond-rally <n>  context spill limit (default 3)`

const OPTIONS = {
  file: { type: 'string', short: 'f' },
  me: { type: 'string' },
  out: { type: 'string', default: 'json' },
  host: { type: 'string', default: 'https://pb.vision' },
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

export function main (argv, io) {
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

  let text
  if (values.file !== undefined) {
    text = fs.readFileSync(values.file, 'utf8')
  } else if (positionals.length === 1) {
    text = positionals[0]
  } else {
    return fail(io, `expected a query (or -f query.pbql)\n${USAGE}`)
  }

  const meta = values.me === undefined ? {} : { myPlayerIdx: parseInt(values.me) }
  // resolve the query's FROM sources as local paths; parse errors are
  // left for runQuery below so they print with positions like any other
  const query = parse(text)
  let games = []
  if (query.ast !== undefined) {
    try {
      games = resolveLocalSources(query.ast.sources)
        .map(game => ({ ...game, meta }))
    } catch (err) {
      return fail(io, err.message)
    }
  }

  const result = runQuery({
    text,
    games,
    options: { maxSecsBeyondRally: parseFloat(values['max-secs-beyond-rally']) }
  })
  if (result.errors) {
    for (const e of result.errors) {
      io.stderr(`${e.line}:${e.col} ${e.code}: ${e.message}` +
        (e.hint === undefined ? '' : ` (${e.hint})`))
    }
    return 1
  }
  for (const warning of result.warnings) {
    io.stderr(`warning: ${warning.vid}: ${warning.message}`)
  }

  const mergeGapMs = parseFloat(values['merge-gap']) * 1000
  switch (values.out) {
    case 'json':
      io.stdout(JSON.stringify(toSelectedShotsJSON(result), null, 2))
      return 0
    case 'csv':
      io.stdout(shotsToCSV(result))
      return 0
    case 'se':
      io.stdout(toShotExplorerURLs(result, { host: values.host }).join('\n'))
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
