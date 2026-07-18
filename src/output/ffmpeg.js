// Generates the ffmpeg invocation that cuts the selected clips out of a
// source video: one frame-accurate command (filter_complex trim + concat)
// that re-encodes.

const secs = ms => (ms / 1000).toFixed(3)

function shellQuote (arg) {
  return /^[A-Za-z0-9_\-./:=[\]]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`
}

export function toCommandString (argv) {
  return argv.map(shellQuote).join(' ')
}

/**
 * @param {object} args
 * @param {string} args.input source video path
 * @param {Array<{sMs: number, eMs: number}>} args.clips ranges to keep
 * @param {string} args.output output video path
 * @returns {{argv: Array<string>, command: string}} the command to run,
 *   as an argv array and its shell-quoted string form
 */
export function ffmpegCommands ({ input, clips, output }) {
  if (clips.length === 0) {
    throw new Error('no clips to cut')
  }
  const filters = []
  const pads = []
  clips.forEach((clip, i) => {
    const range = `start=${secs(clip.sMs)}:end=${secs(clip.eMs)}`
    filters.push(`[0:v]trim=${range},setpts=PTS-STARTPTS[v${i}]`)
    filters.push(`[0:a]atrim=${range},asetpts=PTS-STARTPTS[a${i}]`)
    pads.push(`[v${i}][a${i}]`)
  })
  filters.push(`${pads.join('')}concat=n=${clips.length}:v=1:a=1[v][a]`)
  const argv = ['ffmpeg', '-i', input, '-filter_complex', filters.join(';'),
    '-map', '[v]', '-map', '[a]', output]
  return { argv, command: toCommandString(argv) }
}
