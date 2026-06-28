// The pbql CLI: run a query over local insights JSON files and emit
// selected shots as JSON/CSV/EDL or an ffmpeg command. FROM sources are
// not dereferenced by the CLI yet — the files you pass are the games
// searched.
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { runQuery } from '../engine/run.js'
import { toClips } from '../output/clips.js'
import { shotsToCSV } from '../output/csv.js'
import { toEDL } from '../output/edl.js'
import { ffmpegCommands } from '../output/ffmpeg.js'
import { toSelectedShotsJSON } from '../output/json.js'

export const USAGE = `usage: pbql [QUERY | -f query.pbql] --insights a.json[,b.json] [options]
  -f, --file <path>       read the query from a file
  --insights <paths>      comma-separated insights JSON files (required)
  --vid <ids>             comma-separated video ids (default: file basenames)
  --session <nums>        comma-separated 0-based session indexes (default 0)
  --me <playerIdx>        which player (0-3) "me" refers to
  --out <format>          json (default) | csv | edl | ffmpeg
  --video-file <path>     source video path (required for --out ffmpeg)
  --output-file <path>    cut video path for --out ffmpeg (default cut.mp4)
  --fast                  ffmpeg stream-copy mode (keyframe-accurate only)
  --fps <n>               EDL frame rate (default 30)
  --merge-gap <secs>      merge clips closer than this (default 0.5)
  --max-secs-beyond-rally <n>  context spill limit (default 3)`

const OPTIONS = {
  file: { type: 'string', short: 'f' },
  insights: { type: 'string' },
  vid: { type: 'string' },
  session: { type: 'string' },
  me: { type: 'string' },
  out: { type: 'string', default: 'json' },
  'video-file': { type: 'string' },
  'output-file': { type: 'string', default: 'cut.mp4' },
  fast: { type: 'boolean', default: false },
  fps: { type: 'string', default: '30' },
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

  if (values.insights === undefined) {
    return fail(io, `--insights is required\n${USAGE}`)
  }
  const files = values.insights.split(',')
  const vids = values.vid === undefined ? [] : values.vid.split(',')
  const sessions = values.session === undefined ? [] : values.session.split(',')
  const meta = values.me === undefined ? {} : { myPlayerIdx: parseInt(values.me) }
  const games = files.map((file, i) => ({
    vid: vids[i] ?? path.basename(file).replace(/\.json$/, ''),
    sessionIdx: sessions[i] === undefined ? 0 : parseInt(sessions[i]),
    insights: JSON.parse(fs.readFileSync(file, 'utf8')),
    meta
  }))

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
    case 'edl':
      io.stdout(toEDL({
        title: 'pbql selection',
        clips: toClips(result.shots, { mergeGapMs }),
        fps: parseFloat(values.fps)
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
      const { steps, concatList } = ffmpegCommands({
        input: values['video-file'],
        clips,
        output: values['output-file'],
        mode: values.fast ? 'fast' : 'precise'
      })
      if (concatList !== undefined) {
        io.stdout('# write this to clips.txt first:\n' +
          concatList.split('\n').filter(Boolean).map(l => `#   ${l}`).join('\n'))
      }
      io.stdout(steps.map(s => s.command).join('\n'))
      return 0
    }
    default:
      return fail(io, `unknown --out format "${values.out}"\n${USAGE}`)
  }
}
