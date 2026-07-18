// CMX 3600 EDL output — the same dialect the PB Vision web app exports,
// so downstream editors treat both alike.

function millisecondsToFrame (ms, fps) {
  return Math.round((ms / 1000) * fps)
}

function framesToTimecode (frames, fps) {
  const framePart = frames % fps
  const totalSecs = Math.floor(frames / fps)
  const secs = totalSecs % 60
  const mins = Math.floor(totalSecs / 60) % 60
  const hours = Math.floor(totalSecs / 3600)
  return [hours, mins, secs, framePart]
    .map(n => String(n).padStart(2, '0'))
    .join(':')
}

/**
 * Builds a CMX 3600 EDL cutting the given clips back-to-back.
 * @param {object} args
 * @param {string} args.title EDL title line
 * @param {Array<{sMs: number, eMs: number}>} args.clips source ranges
 * @param {number} [args.fps] frame rate (insights `camera.fps`; default 30)
 */
export function toEDL ({ title, clips, fps = 30 }) {
  // Frames are counted at the true rate, but NDF timecode digits roll over
  // at a nominal integer base (29.97 → 30), like real CMX exporters — a
  // fractional modulus would put non-integers in the frame field.
  const timecodeFps = Math.round(fps)
  const lines = [`TITLE: ${title}`, 'FCM: NON-DROP FRAME', '']
  let recFrames = 0
  clips.forEach((clip, i) => {
    const srcIn = millisecondsToFrame(clip.sMs, fps)
    const srcOut = millisecondsToFrame(clip.eMs, fps)
    const lengthFrames = srcOut - srcIn
    const num = String(i + 1).padStart(3, '0')
    lines.push(`${num}  AX       V    C        ` +
      `${framesToTimecode(srcIn, timecodeFps)} ${framesToTimecode(srcOut, timecodeFps)} ` +
      `${framesToTimecode(recFrames, timecodeFps)} ${framesToTimecode(recFrames + lengthFrames, timecodeFps)}`)
    recFrames += lengthFrames
  })
  return lines.join('\n') + '\n'
}
