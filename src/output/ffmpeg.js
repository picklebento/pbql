// Generates ffmpeg invocations that cut the selected clips out of a source
// video. Two modes:
//  - precise: one command, frame-accurate (filter_complex trim + concat),
//    re-encodes
//  - fast: one stream-copy command per clip plus a concat step; splits on
//    keyframes only, so cuts may be off by up to a GOP

const secs = ms => (ms / 1000).toFixed(3)

function shellQuote (arg) {
  return /^[A-Za-z0-9_\-./:=[\]]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`
}

export function toCommandString (argv) {
  return argv.map(shellQuote).join(' ')
}

function preciseArgv (input, clips, output) {
  const filters = []
  const pads = []
  clips.forEach((clip, i) => {
    const range = `start=${secs(clip.sMs)}:end=${secs(clip.eMs)}`
    filters.push(`[0:v]trim=${range},setpts=PTS-STARTPTS[v${i}]`)
    filters.push(`[0:a]atrim=${range},asetpts=PTS-STARTPTS[a${i}]`)
    pads.push(`[v${i}][a${i}]`)
  })
  filters.push(`${pads.join('')}concat=n=${clips.length}:v=1:a=1[v][a]`)
  return ['ffmpeg', '-i', input, '-filter_complex', filters.join(';'),
    '-map', '[v]', '-map', '[a]', output]
}

/**
 * @param {object} args
 * @param {string} args.input source video path
 * @param {Array<{sMs: number, eMs: number}>} args.clips ranges to keep
 * @param {string} args.output output video path
 * @param {'precise'|'fast'} [args.mode]
 * @returns {{steps: Array<{argv: Array<string>, command: string}>,
 *   concatList?: string}} commands to run in order; fast mode also returns
 *   the concat-list file content (write it as clips.txt before the last step)
 */
export function ffmpegCommands ({ input, clips, output, mode = 'precise' }) {
  if (clips.length === 0) {
    throw new Error('no clips to cut')
  }
  if (mode === 'precise') {
    const argv = preciseArgv(input, clips, output)
    return { steps: [{ argv, command: toCommandString(argv) }] }
  }
  const steps = clips.map((clip, i) => {
    const argv = ['ffmpeg', '-ss', secs(clip.sMs), '-to', secs(clip.eMs),
      '-i', input, '-c', 'copy', `clip${i}.mp4`]
    return { argv, command: toCommandString(argv) }
  })
  const concatArgv = ['ffmpeg', '-f', 'concat', '-safe', '0', '-i',
    'clips.txt', '-c', 'copy', output]
  steps.push({ argv: concatArgv, command: toCommandString(concatArgv) })
  return {
    steps,
    concatList: clips.map((_, i) => `file 'clip${i}.mp4'`).join('\n') + '\n'
  }
}
