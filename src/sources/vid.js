// Recognizes FROM source strings that name a pb.vision video: a 12-char
// video id with an optional 1-based session number ("83gyqyc10y8f" or
// "83gyqyc10y8f:2"). A local file whose name happens to look like a video
// id must be written with a path prefix (e.g. "./83gyqyc10y8f").
const VID_SOURCE = /^([a-z0-9]{12})(:[0-9]+)?$/

/**
 * Parses a source string as a pb.vision video reference.
 * @param {string} source a FROM source string
 * @returns {{vid: string, sessionIdx: number}|null} the video id and
 *   0-based session index (session 1 is the default), or null when the
 *   string is not vid-shaped
 * @throws {Error} when the session number is 0 (sessions are 1-based)
 */
export function parseVidSource (source) {
  const match = VID_SOURCE.exec(source)
  if (match === null) {
    return null
  }
  const sessionNum = match[2] === undefined ? 1 : parseInt(match[2].slice(1))
  if (sessionNum === 0) {
    throw new Error(`"${source}": session numbers are 1-based ` +
      '(the video\'s first game is ":1")')
  }
  return { vid: match[1], sessionIdx: sessionNum - 1 }
}
