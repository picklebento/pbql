// Wraps one (video, session)'s insights JSON plus host-supplied metadata
// into the indexed, memoized shape the engine evaluates against.
//
// Supported input: PB Vision insights, latest major version (4.x), augmented
// field names. Older majors are rejected (the caller should skip-and-report
// per D13 in docs/design-decisions.md).

export const SUPPORTED_MAJOR = 4

export class UnsupportedInsightsError extends Error {
  constructor (version) {
    super(`unsupported insights version "${version}" (supported: ${SUPPORTED_MAJOR}.x); ` +
      'reprocess the video to query it')
    this.name = 'UnsupportedInsightsError'
    this.code = 'PBQL_UNSUPPORTED_VERSION'
    this.version = version
  }
}

export class InvalidInsightsError extends Error {
  constructor (detail) {
    super(`malformed insights JSON (${detail}); ` +
      'is this really a PB Vision insights file?')
    this.name = 'InvalidInsightsError'
    this.code = 'PBQL_INVALID_INSIGHTS'
  }
}

function validateInsights (insights) {
  if (insights === null || typeof insights !== 'object' ||
      Array.isArray(insights)) {
    throw new InvalidInsightsError('expected an object')
  }
}

function validateRallies (insights) {
  if (!Array.isArray(insights.rallies)) {
    throw new InvalidInsightsError('"rallies" is missing or not an array')
  }
  insights.rallies.forEach((rally, rallyIdx) => {
    if (rally === null || typeof rally !== 'object') {
      throw new InvalidInsightsError(`rallies[${rallyIdx}] is not an object`)
    }
    if (rally.shots !== undefined && !Array.isArray(rally.shots)) {
      throw new InvalidInsightsError(`rallies[${rallyIdx}].shots is not an array`)
    }
  })
}

export class Game {
  /**
   * @param {object} args
   * @param {string} args.vid the video ID
   * @param {number} args.sessionIdx 0-based session index within the video
   * @param {object} args.insights parsed insights JSON (augmented names)
   * @param {object} [args.meta] host-supplied metadata: players
   *   ([{uid, name}] by player index), myPlayerIdx, videoName
   */
  constructor ({ vid, sessionIdx, insights, meta }) {
    validateInsights(insights)
    const version = insights.version ?? insights.serverMetadata?.version
    const major = parseInt(version)
    if (isNaN(major) || major !== SUPPORTED_MAJOR) {
      throw new UnsupportedInsightsError(version)
    }
    validateRallies(insights)
    this.vid = vid
    this.sessionIdx = sessionIdx
    this.insights = insights
    this.meta = meta ?? {}
    // one flat entry per shot, in video order — the engine's iteration unit
    this.shotRefs = []
    insights.rallies.forEach((rally, rallyIdx) => {
      (rally.shots ?? []).forEach((shot, shotIdx) => {
        this.shotRefs.push({ game: this, rally, rallyIdx, shot, shotIdx })
      })
    })
  }

  get rallies () {
    return this.insights.rallies
  }

  // when the ball was struck (ms); trajectory timing is the precise source,
  // shot.start_ms the fallback (same fallback the web app uses)
  hitMs (shot) {
    return shot.resulting_ball_movement?.trajectory?.start?.ms ?? shot.start_ms
  }

  // when the shot's flight ended (ms)
  endMs (shot) {
    return shot.resulting_ball_movement?.trajectory?.end?.ms ?? shot.end_ms
  }

  // the hitter's court position when the shot was hit, or undefined
  playerPosAtShot (shot, playerIdx) {
    return shot.player_positions?.[playerIdx] ?? undefined
  }

  // whether this player slot is occupied (singles leave slots 1 and 3 empty)
  playerExists (playerIdx) {
    const playerData = this.insights.player_data
    if (playerData !== undefined) {
      return playerData[playerIdx] !== null && playerData[playerIdx] !== undefined
    }
    return this.insights.session?.num_players === 2
      ? playerIdx === 0 || playerIdx === 2
      : true
  }

  // the tagged name, else the insights default, else "Player N" — every
  // existing player is queryable by the name the UI shows for them
  playerName (playerIdx) {
    if (!this.playerExists(playerIdx)) {
      return undefined
    }
    return this.meta.players?.[playerIdx]?.name ??
      this.insights.player_data?.[playerIdx]?.name ??
      `Player ${playerIdx + 1}`
  }

  playerTeam (playerIdx) {
    // convention: players 0-1 are team 0, players 2-3 are team 1
    return this.insights.player_data?.[playerIdx]?.team ?? (playerIdx < 2 ? 0 : 1)
  }

  get myPlayerIdx () {
    return this.meta.myPlayerIdx
  }

  // last video ms of the game (for clamping context windows)
  get endOfGameMs () {
    const { rallies } = this
    return rallies[rallies.length - 1].end_ms
  }
}
