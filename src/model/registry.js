// The PBQL property surface: every queryable property, with type/unit/doc
// (which generate docs/data-dictionary.md — run `yarn docs`) and an
// extract() that reads it from insights JSON (latest major, augmented
// names). extract() returns undefined when the underlying data is missing;
// the engine maps that to `unknown`.
//
// extract(ctx) receives { game, rally, rallyIdx, shot, shotIdx } (a Game
// instance plus the shot being evaluated); player properties additionally
// receive the player index.
import {
  feetToNet, feetToNearestBaseline, feetToNearestSideline,
  feetToKitchen, isOnFarSide, toPlayerFrame
} from './geometry.js'

// a game is singles when only two player slots are occupied
function isSingles (game) {
  return game.insights.session?.num_players === 2
}

// this team's partner: 0↔1, 2↔3
const partnerOf = idx => idx ^ 1

// the opposing pair, in player-id order, for a player on either team
const opponentsOf = idx => idx < 2 ? [2, 3] : [0, 1]

// LHS/RHS resolution: the opponent playing the left/right side of their
// own court at the moment of `ctx`'s shot — left of their partner in the
// opponents' own facing, i.e. the smaller x in each opponent's own frame.
// In singles the lone opponent answers both sides; unknown when their
// positions are missing.
function opponentBySide (ctx, from, wantLHS) {
  const opponents = opponentsOf(from)
  if (isSingles(ctx.game)) {
    return opponents[0]
  }
  const positions = opponents.map(idx => ctx.game.playerPosAtShot(ctx.shot, idx))
  if (positions.some(p => p === undefined)) {
    return undefined
  }
  const [a, b] = positions.map(p => toPlayerFrame(p, isOnFarSide(p)).x)
  const [lhs, rhs] = a <= b ? opponents : [opponents[1], opponents[0]]
  return wantLHS ? lhs : rhs
}

function ballMovement (ctx) {
  return ctx.shot.resulting_ball_movement
}

function trajectory (ctx) {
  return ballMovement(ctx)?.trajectory
}

// The shared shape of a position (shot.from / shot.to / shot.peak):
// hitter-relative x/y/z, raw absX/absY/absZ, and derived distances.
// Exported so the generated docs describe the position type once instead
// of repeating nine rows per position. extractWith builds the extractor
// from the position's raw accessor and its hitter-frame view; z and absZ
// share one accessor because height has no mirrored frame.
export const POSITION_SUBPROPS = [
  {
    path: 'x',
    unit: 'feet',
    doc: 'hitter-frame x (0-20, grows to the hitter\'s right)',
    extractWith: (getPos, framed) => ctx => framed(ctx)?.x
  },
  {
    path: 'y',
    unit: 'feet',
    doc: 'hitter-frame y (own baseline 0, net 22)',
    extractWith: (getPos, framed) => ctx => framed(ctx)?.y
  },
  {
    path: 'z',
    unit: 'feet',
    doc: 'height above the ground',
    extractWith: getPos => ctx => getPos(ctx)?.z
  },
  {
    path: 'absX',
    unit: 'feet',
    doc: 'raw court x (far-left corner origin)',
    extractWith: getPos => ctx => getPos(ctx)?.x
  },
  {
    path: 'absY',
    unit: 'feet',
    doc: 'raw court y (far-left corner origin)',
    extractWith: getPos => ctx => getPos(ctx)?.y
  },
  {
    path: 'absZ',
    unit: 'feet',
    doc: 'height above the ground',
    extractWith: getPos => ctx => getPos(ctx)?.z
  },
  {
    path: 'feetToNearestSideline',
    unit: 'feet',
    doc: 'distance to the nearest sideline',
    extractWith: getPos => ctx => mapPos(getPos(ctx), feetToNearestSideline)
  },
  {
    path: 'feetToNearestBaseline',
    unit: 'feet',
    doc: 'distance to the nearest baseline',
    extractWith: getPos => ctx => mapPos(getPos(ctx), feetToNearestBaseline)
  },
  {
    path: 'feetToNet',
    unit: 'feet',
    doc: 'distance to the plane of the net',
    extractWith: getPos => ctx => mapPos(getPos(ctx), feetToNet)
  }
]

// the one-line meaning of each position root, shared with the docs
export const POSITION_ROOT_DOCS = {
  from: 'where the ball was struck',
  to: 'where the ball\'s flight ended',
  peak: 'the highest point of the ball\'s flight'
}

// Builds a position's property entries. The hitter's side (which decides
// the mirror) comes from where the ball was struck.
function positionProps (prefix, getPos, extras = []) {
  function framed (ctx) {
    const pos = getPos(ctx)
    const struckAt = trajectory(ctx)?.start?.location
    if (pos === undefined || struckAt === undefined) {
      return undefined
    }
    return toPlayerFrame(pos, isOnFarSide(struckAt))
  }
  const doc = POSITION_ROOT_DOCS[prefix]
  return [
    ...POSITION_SUBPROPS.map(sub => ({
      path: `${prefix}.${sub.path}`,
      type: 'number',
      unit: sub.unit,
      doc: `${doc} — ${sub.doc}`,
      extract: sub.extractWith(getPos, framed)
    })),
    ...extras
  ]
}

function mapPos (pos, fn) {
  return pos === undefined ? undefined : fn(pos)
}

const SHOT_PROPS = [
  {
    path: 'num',
    type: 'number',
    unit: '1-based',
    doc: 'which shot of the rally this is (the serve is 1)',
    extract: ctx => ctx.shotIdx + 1
  },
  {
    path: 'isFinal',
    type: 'boolean',
    doc: 'whether this is the rally\'s last shot',
    extract: ctx => ctx.shot.is_final
  },
  {
    path: 'isVolley',
    type: 'boolean',
    doc: 'whether the ball was hit before bouncing',
    extract: ctx => ctx.shot.is_volley
  },
  {
    path: 'isSpeedup',
    type: 'boolean',
    doc: 'whether the shot added significant pace near the kitchen',
    extract: ctx => ctx.shot.is_speedup
  },
  {
    path: 'isReset',
    type: 'boolean',
    doc: 'whether the shot was a volley that took significant pace off a ' +
      'hard incoming ball; only volleys are assessed',
    extract: ctx => ctx.shot.is_reset
  },
  {
    path: 'isPoach',
    type: 'boolean',
    doc: 'whether the hitter cut across in front of their partner to ' +
      'volley a ball that was headed to the partner',
    extract: ctx => ctx.shot.is_poach
  },
  {
    path: 'isPassing',
    type: 'boolean',
    doc: 'whether the shot was a rally-ending drive or smash that got past ' +
      'the nearest opponent untouched; unknown in singles',
    extract: ctx => ctx.shot.is_passing
  },
  {
    path: 'isPutaway',
    type: 'boolean',
    doc: 'whether the shot functioned as a putaway or rally finisher — a clean winner or a decisive attack that directly created the rally\'s end (can be a well-placed dink or drop, not only a hard hit)',
    extract: ctx => ctx.shot.is_putaway
  },
  {
    path: 'type',
    type: 'string',
    unit: '"smash"|"lob"|"dink"|"drop"|"drive"|"atp"|"erne"',
    doc: 'the shot classification; never set on serves and returns (shot.num 1 and 2)',
    extract: ctx => ctx.shot.shot_type
  },
  {
    path: 'verticalType',
    type: 'string',
    unit: '"dig"|"neutral"|"overhead"',
    doc: 'the vertical character of the stroke, from strike height (dig ≤ 2.5ft, overhead ≥ 6ft)',
    extract: ctx => ctx.shot.vertical_type
  },
  {
    path: 'strokeSide',
    type: 'string',
    unit: '"left"|"right"',
    doc: 'which side of the body the stroke was made on',
    extract: ctx => ctx.shot.stroke_side
  },
  {
    path: 'strokeType',
    type: 'string',
    unit: '"forehand"|"backhand"',
    doc: 'forehand or backhand, from strokeSide and the hitter\'s handedness; ' +
      'needs augmented insights carrying handedness (strokeSide always works)',
    extract: ctx => {
      const handedness = ctx.game.playerHandedness(ctx.shot.player_id)
      const side = ctx.shot.stroke_side
      if (handedness === undefined || (side !== 'left' && side !== 'right')) {
        return undefined
      }
      // a stroke on the paddle-hand side is a forehand; the mirror image
      // holds for left-handers
      return side === handedness ? 'forehand' : 'backhand'
    }
  },
  {
    path: 'winnerType',
    type: 'string',
    unit: '"clean"|"forced_fault"',
    doc: 'how this shot won the rally ("clean" = fault-free final shot, ' +
      '"forced_fault" = the opponents faulted on their reply); unknown if it did not win',
    extract: ctx => ctx.shot.winner_type
  },
  {
    path: 'quality.overall',
    type: 'number',
    unit: '0-1',
    doc: 'the overall quality of the shot, derived from the execution quality (1 is best)',
    extract: ctx => ctx.shot.quality?.overall
  },
  {
    path: 'quality.execution',
    type: 'number',
    unit: '0-1',
    doc: 'how well the shot was executed',
    extract: ctx => ctx.shot.quality?.execution
  },
  {
    path: 'quality.pressure',
    type: 'number',
    unit: '0-1',
    doc: 'positional pressure faced and imposed by this shot (1 = most pressure); unknown for singles, serves, and returns',
    extract: ctx => ctx.shot.quality?.pressure
  },
  {
    path: 'positioningScore',
    type: 'number',
    unit: '0-1',
    doc: 'how well the hitter was positioned at this shot, against a strong-team baseline (1 is best); unknown for singles, serves, and returns',
    extract: ctx => ctx.shot.shooter_positioning_score
  },
  {
    path: 'partnerPositioningScore',
    type: 'number',
    unit: '0-1',
    doc: 'how well the hitter\'s partner was positioned at this shot, against a strong-team baseline (1 is best); unknown for singles, serves, and returns',
    extract: ctx => ctx.shot.partner_positioning_score
  },
  {
    path: 'speed',
    type: 'number',
    unit: 'mph',
    doc: 'ball speed after the hit',
    extract: ctx => ballMovement(ctx)?.speed
  },
  {
    path: 'direction',
    type: 'string',
    unit: '"DownTheMiddle"|"DownTheLineLeft"|"DownTheLineRight"|"MidCrossLeft"|"MidCrossRight"|"LeftToMiddle"|"RightToMiddle"|"LeftCrossRight"|"RightCrossLeft"',
    doc: 'named direction the ball traveled, from the hitter\'s perspective ' +
      '(left/middle/right thirds of the court)',
    extract: ctx => ballMovement(ctx)?.angles?.direction
  },
  {
    path: 'yaw',
    type: 'number',
    unit: 'degrees',
    doc: 'horizontal launch angle (0 = toward the hitter\'s left sideline, 90 = straight at the net)',
    extract: ctx => ballMovement(ctx)?.angles?.yaw
  },
  {
    path: 'pitch',
    type: 'number',
    unit: 'degrees',
    doc: 'vertical angle from the strike point up to the flight\'s peak ' +
      '(0 = flat or downward, 90 = straight up)',
    extract: ctx => ballMovement(ctx)?.angles?.pitch
  },
  {
    path: 'distance',
    type: 'number',
    unit: 'feet',
    doc: 'straight-line distance from where the ball was struck to where its flight ended',
    extract: ctx => ballMovement(ctx)?.distance
  },
  {
    path: 'distanceFromBaseline',
    type: 'number',
    unit: 'feet',
    doc: 'how far in front of the opponent\'s baseline the ball\'s flight ' +
      'ended (negative = past it)',
    extract: ctx => ballMovement(ctx)?.distance_from_baseline
  },
  {
    path: 'heightOverNet',
    type: 'number',
    unit: 'feet',
    doc: 'ball height when crossing the net plane',
    extract: ctx => ballMovement(ctx)?.height_over_net
  },
  {
    path: 'crossedNet',
    type: 'boolean',
    doc: 'whether the ball crossed the plane of the net',
    extract: ctx => ballMovement(ctx)?.crossed_net
  },
  {
    path: 'confidence',
    type: 'number',
    unit: '0-1',
    doc: 'confidence in the reconstructed trajectory',
    extract: ctx => trajectory(ctx)?.confidence
  },
  {
    path: 'hitTime',
    type: 'number',
    unit: 'seconds',
    doc: 'when in the video the ball was struck',
    extract: ctx => msToSecs(ctx.game.hitMs(ctx.shot))
  },
  {
    path: 'endTime',
    type: 'number',
    unit: 'seconds',
    doc: 'when in the video the shot\'s flight ended',
    extract: ctx => msToSecs(ctx.game.endMs(ctx.shot))
  },
  {
    path: 'hasError',
    type: 'boolean',
    doc: 'whether any error was detected on this shot',
    extract: ctx => ctx.shot.errors !== undefined
  },
  {
    path: 'errors.unforced',
    type: 'boolean',
    doc: 'whether the fault on this shot was an unforced error; only ' +
      'assessed on actual faults with a confidently-known rally winner',
    extract: ctx => ctx.shot.errors?.unforced
  },
  {
    path: 'errors.popup',
    type: 'string',
    unit: '"exploited"|"potential"',
    doc: 'whether a dink or drop popped the ball up ("exploited" = the ' +
      'opponents attacked it out of the air, "potential" = they did not)',
    extract: ctx => ctx.shot.errors?.popup
  },
  {
    path: 'hasFault',
    type: 'boolean',
    doc: 'whether this shot committed a rule fault, actual or potential — ' +
      'e.g. a ball headed out that an opponent played anyway',
    extract: ctx => ctx.shot.errors?.faults !== undefined
  },
  // fault flags are recorded only when the fault happened, so absence means
  // false, never unknown (the `=== true` guard also shrugs off malformed data)
  {
    path: 'errors.faults.net',
    type: 'boolean',
    doc: 'whether the net stopped the ball',
    extract: ctx => ctx.shot.errors?.faults?.net === true
  },
  {
    path: 'errors.faults.short',
    type: 'boolean',
    doc: 'whether the shot landed on the hitter\'s own side short of the net',
    extract: ctx => ctx.shot.errors?.faults?.short === true
  },
  {
    path: 'errors.faults.out.outcome',
    type: 'string',
    unit: '"landed"|"intercepted"',
    doc: 'whether the out ball landed or was played anyway',
    extract: ctx => ctx.shot.errors?.faults?.out?.outcome
  },
  {
    path: 'errors.faults.out.direction',
    type: 'string',
    unit: '"left"|"right"|"long"',
    doc: 'which way the ball went (or was headed) out — "long" past the ' +
      'baseline, "left"/"right" wide of a sideline from the hitter\'s ' +
      'perspective',
    extract: ctx => ctx.shot.errors?.faults?.out?.direction
  },
  ...positionProps('from', ctx => trajectory(ctx)?.start?.location,
    [{
      path: 'from.zone',
      type: 'string',
      // strike zones never include "net"/"out": production derives the
      // start zone from a shot event, and only net events map to "net" and
      // out-of-bounds bounces to "out"
      unit: '"deep"|"mid"|"short"|"kitchen"',
      doc: 'depth zone the ball was struck from',
      extract: ctx => trajectory(ctx)?.start?.zone
    }]),
  ...positionProps('to', ctx => trajectory(ctx)?.end?.location,
    [{
      path: 'to.zone',
      type: 'string',
      unit: '"deep"|"mid"|"short"|"kitchen"|"net"|"out"',
      doc: 'depth zone where the ball\'s flight ended',
      extract: ctx => trajectory(ctx)?.end?.zone
    }]),
  ...positionProps('peak', ctx => trajectory(ctx)?.peak)
]

function msToSecs (ms) {
  return ms === undefined ? undefined : ms / 1000
}

const RALLY_PROPS = [
  {
    path: 'num',
    type: 'number',
    unit: '1-based',
    doc: 'which rally of the game this is',
    extract: ctx => ctx.rallyIdx + 1
  },
  {
    path: 'numShots',
    type: 'number',
    doc: 'how many shots the rally contains',
    extract: ctx => ctx.rally.shots?.length ?? 0
  },
  {
    path: 'startTime',
    type: 'number',
    unit: 'seconds',
    doc: 'when in the video the rally starts',
    extract: ctx => msToSecs(ctx.rally.start_ms)
  },
  {
    path: 'endTime',
    type: 'number',
    unit: 'seconds',
    doc: 'when in the video the rally ends',
    extract: ctx => msToSecs(ctx.rally.end_ms)
  },
  {
    path: 'duration',
    type: 'number',
    unit: 'seconds',
    doc: 'how long the rally lasted',
    extract: ctx => (ctx.rally.end_ms - ctx.rally.start_ms) / 1000
  },
  {
    path: 'winner',
    type: 'number',
    unit: '0|1',
    doc: 'which team won the rally',
    extract: ctx => ctx.rally.winning_team
  },
  {
    path: 'allPlayersReachedKitchen',
    type: 'boolean',
    doc: 'whether every player reached the kitchen line this rally',
    extract: ctx => {
      const players = ctx.rally.players
      if (players === undefined) {
        return undefined
      }
      return players
        .filter(p => p !== null && p !== undefined)
        .every(p => (p.kitchen_arrivals?.length ?? 0) > 0)
    }
  }
]

const GAME_PROPS = [
  {
    path: 'vid',
    type: 'string',
    doc: 'the video ID this game is from',
    extract: ctx => ctx.game.vid
  },
  {
    path: 'sessionNum',
    type: 'number',
    unit: '1-based',
    doc: 'which game of the video this is',
    extract: ctx => ctx.game.sessionIdx + 1
  },
  {
    path: 'name',
    type: 'string',
    doc: 'the video/session name, if any',
    extract: ctx => ctx.game.meta.videoName ?? undefined
  },
  {
    path: 'numRallies',
    type: 'number',
    doc: 'how many rallies the game contains',
    extract: ctx => ctx.game.rallies.length
  },
  {
    path: 'startTime',
    type: 'number',
    unit: 'seconds',
    doc: 'when in the video the game starts (its first rally\'s start)',
    extract: ctx => msToSecs(ctx.game.rallies[0].start_ms)
  },
  {
    path: 'endTime',
    type: 'number',
    unit: 'seconds',
    doc: 'when in the video the game ends (its last rally\'s end)',
    extract: ctx => msToSecs(ctx.game.rallies[ctx.game.rallies.length - 1].end_ms)
  },
  {
    path: 'duration',
    type: 'number',
    unit: 'seconds',
    doc: 'first rally start to last rally end (game.startTime + game.duration = game.endTime)',
    extract: ctx => {
      const { rallies } = ctx.game
      return (rallies[rallies.length - 1].end_ms - rallies[0].start_ms) / 1000
    }
  },
  {
    path: 'videoDuration',
    type: 'number',
    unit: 'seconds',
    doc: 'the whole video\'s duration; only present in augmented insights',
    extract: ctx => msToSecs(ctx.game.videoDurationMs)
  },
  {
    path: 'avgShots',
    type: 'number',
    doc: 'average shots per rally',
    extract: ctx => ctx.game.insights.game_data?.avg_shots
  },
  {
    path: 'winner',
    type: 'number',
    unit: '0|1',
    doc: 'which team won the game (from the recorded outcome)',
    extract: ctx => {
      const outcome = ctx.game.insights.game_data?.game_outcome
      if (outcome === undefined) {
        return undefined
      }
      const [a, b] = outcome
      if (a === 'won' || b === 'lost') {
        return 0
      }
      if (b === 'won' || a === 'lost') {
        return 1
      }
      if (typeof a === 'number' && typeof b === 'number' && a !== b) {
        return a > b ? 0 : 1
      }
      return undefined
    }
  }
]

// Player properties receive the player's index as well. Position-derived
// properties are measured at the moment of the shot the player was reached
// through (shot[k] for a `shot[k].hitter…` path, else the current shot), in
// the player's own frame (their baseline is y=0).
const PLAYER_PROPS = [
  {
    path: 'id',
    type: 'number',
    unit: '0-3',
    doc: 'the player\'s index within this game',
    extract: (ctx, playerIdx) => playerIdx
  },
  {
    path: 'team',
    type: 'number',
    unit: '0|1',
    doc: 'the player\'s team',
    extract: (ctx, playerIdx) => ctx.game.playerTeam(playerIdx)
  },
  {
    path: 'name',
    type: 'string',
    doc: 'the player\'s tagged name; untagged players keep their default name ("Player 1"…"Player 4")',
    extract: (ctx, playerIdx) => ctx.game.playerName(playerIdx)
  },
  {
    path: 'startedOnLeftSide',
    type: 'boolean',
    doc: 'whether the player began the rally on the left of their partner, ' +
      'facing the net; not meaningful in singles',
    extract: (ctx, playerIdx) =>
      playerInRally(ctx, playerIdx)?.started_on_left_side
  },
  {
    path: 'reachedKitchen',
    type: 'boolean',
    doc: 'whether the player reached the kitchen line this rally',
    extract: (ctx, playerIdx) => {
      const p = playerInRally(ctx, playerIdx)
      if (p === undefined) {
        return undefined
      }
      return (p.kitchen_arrivals?.length ?? 0) > 0
    }
  },
  {
    path: 'pos.x',
    type: 'number',
    unit: 'feet',
    doc: 'court x at the current shot, in the player\'s own frame',
    extract: (ctx, playerIdx) => framedPlayerPos(ctx, playerIdx)?.x
  },
  {
    path: 'pos.y',
    type: 'number',
    unit: 'feet',
    doc: 'court y at the current shot, in the player\'s own frame (own baseline 0)',
    extract: (ctx, playerIdx) => framedPlayerPos(ctx, playerIdx)?.y
  },
  {
    path: 'pos.absX',
    type: 'number',
    unit: 'feet',
    doc: 'raw court x at the current shot',
    extract: (ctx, playerIdx) => rawPlayerPos(ctx, playerIdx)?.x
  },
  {
    path: 'pos.absY',
    type: 'number',
    unit: 'feet',
    doc: 'raw court y at the current shot',
    extract: (ctx, playerIdx) => rawPlayerPos(ctx, playerIdx)?.y
  },
  {
    path: 'feetToKitchen',
    type: 'number',
    unit: 'feet',
    doc: 'distance still to cover to reach their kitchen line (0 at/inside it)',
    extract: (ctx, playerIdx) => mapPos(rawPlayerPos(ctx, playerIdx), feetToKitchen)
  },
  {
    path: 'feetToNearestSideline',
    type: 'number',
    unit: 'feet',
    doc: 'distance to the nearest sideline at the current shot',
    extract: (ctx, playerIdx) =>
      mapPos(rawPlayerPos(ctx, playerIdx), feetToNearestSideline)
  },
  {
    path: 'feetToNearestBaseline',
    type: 'number',
    unit: 'feet',
    doc: 'distance to the nearest baseline at the current shot',
    extract: (ctx, playerIdx) =>
      mapPos(rawPlayerPos(ctx, playerIdx), feetToNearestBaseline)
  },
  {
    path: 'feetToNet',
    type: 'number',
    unit: 'feet',
    doc: 'distance to the net plane at the current shot',
    extract: (ctx, playerIdx) => mapPos(rawPlayerPos(ctx, playerIdx), feetToNet)
  },
  // whole-game team-level positional performance (both teammates share the
  // value, and team 1's is the complement of team 0's); unknown in singles
  {
    path: 'forwardPressure',
    type: 'number',
    unit: '0-1',
    doc: 'how actively the player\'s team pushed shots toward positional advantage over the whole game (team-level: teammates share it); unknown in singles',
    extract: (ctx, playerIdx) => positionalPerformance(ctx, playerIdx)?.forward_pressure
  },
  {
    path: 'finishingAbility',
    type: 'number',
    unit: '0-1',
    doc: 'how efficiently the player\'s team converted positional advantage into ending rallies over the whole game (team-level: teammates share it); unknown in singles',
    extract: (ctx, playerIdx) => positionalPerformance(ctx, playerIdx)?.finishing_ability
  }
]

function positionalPerformance (ctx, playerIdx) {
  return ctx.game.insights.player_data?.[playerIdx]?.positional_performance
}

function playerInRally (ctx, playerIdx) {
  return ctx.rally.players?.[playerIdx] ?? undefined
}

function rawPlayerPos (ctx, playerIdx) {
  return ctx.game.playerPosAtShot(ctx.shot, playerIdx) ?? undefined
}

function framedPlayerPos (ctx, playerIdx) {
  const pos = rawPlayerPos(ctx, playerIdx)
  return pos === undefined ? undefined : toPlayerFrame(pos, isOnFarSide(pos))
}

// Methods (subject predicates with arguments). apply() receives the
// evaluation ctx, the resolved subject (a player index for player subjects,
// undefined for shot subjects), and the literal arguments.
const SHOT_METHODS = [
  {
    name: 'isHitOnSide',
    args: [{ name: 'side', type: 'string', unit: '"left"|"right"' }],
    doc: 'whether the ball was struck on the given half ("left"|"right") of the court in the hitter\'s frame (right = x >= 10)',
    apply: (ctx, subject, [side]) => {
      const struck = trajectory(ctx)?.start?.location
      if (struck === undefined || (side !== 'left' && side !== 'right')) {
        return undefined
      }
      const { x } = toPlayerFrame(struck, isOnFarSide(struck))
      return side === 'right' ? x >= 10 : x < 10
    }
  },
  {
    name: 'taggedWith',
    args: [{ name: 'pattern', type: 'string' }],
    doc: 'whether the hitter matches this name pattern (case-insensitive, * wildcard; untagged players match their default "Player N" name) or exact email',
    apply: (ctx, subject, [pattern]) =>
      playerMatchesTag(ctx, ctx.shot.player_id, pattern)
  },
  {
    name: 'inHighlight',
    args: [{
      name: 'kind',
      type: 'string',
      unit: '"atp"|"erne"|"hands_battle"|"long_rally"|"poach"|"sequence"'
    }],
    doc: 'whether the shot falls inside a highlight of the given kind ' +
      '("atp", "erne", "hands_battle" = a rapid volley exchange, ' +
      '"long_rally", "poach", "sequence" = a notable stretch of shots)',
    apply: (ctx, subject, [kind]) => {
      const highlights = ctx.game.insights.highlights
      const hitMs = ctx.game.hitMs(ctx.shot)
      if (highlights === undefined || hitMs === undefined) {
        return undefined
      }
      return highlights.some(h => h.kind === kind &&
        (h.rally_idx === undefined || h.rally_idx === ctx.rallyIdx) &&
        h.s <= hitMs && hitMs <= h.e)
    }
  }
]

const PLAYER_METHODS = [
  {
    name: 'taggedWith',
    args: [{ name: 'pattern', type: 'string' }],
    doc: 'whether this player matches this name pattern (case-insensitive, * wildcard; untagged players match their default "Player N" name) or exact email',
    apply: (ctx, playerIdx, [pattern]) => playerMatchesTag(ctx, playerIdx, pattern)
  }
]

// Relations navigate to another player. A relation's resolve(ctx, fromIdx)
// returns the target player index (or undefined → unknown), where ctx pins
// the shot moment that side-based relations (LHS/RHS) and player positions
// are measured at. The engine walks a path's leading relation segments to
// advance the player cursor before reading a scalar prop/method (see
// evaluate.js and docs §5.4).
const SHOT_RELATIONS = [
  {
    name: 'hitter',
    doc: 'the player who hit this shot',
    resolve: ctx => ctx.shot.player_id
  }
]

const PLAYER_RELATIONS = [
  {
    name: 'teammate',
    doc: 'this player\'s partner (unknown in singles)',
    resolve: (ctx, from) => isSingles(ctx.game) ? undefined : partnerOf(from)
  },
  {
    name: 'opponent1',
    doc: 'the first opposing player, in player-id order (the lone opponent in singles)',
    resolve: (ctx, from) => opponentsOf(from)[0]
  },
  {
    name: 'opponent2',
    doc: 'the second opposing player, in player-id order (unknown in singles)',
    resolve: (ctx, from) => isSingles(ctx.game) ? undefined : opponentsOf(from)[1]
  },
  {
    name: 'opponentLHS',
    doc: 'the opponent playing the left side of their court (left of their ' +
      'partner) at the shot\'s moment (unknown if positions are missing)',
    resolve: (ctx, from) => opponentBySide(ctx, from, true)
  },
  {
    name: 'opponentRHS',
    doc: 'the opponent playing the right side of their court (right of their ' +
      'partner) at the shot\'s moment (unknown if positions are missing)',
    resolve: (ctx, from) => opponentBySide(ctx, from, false)
  }
]

export function playerMatchesTag (ctx, playerIdx, pattern) {
  if (playerIdx === undefined) {
    return undefined
  }
  if (pattern.includes('@')) {
    // email: exact match, case-insensitive; addresses are host-supplied
    const addr = ctx.game.meta.players?.[playerIdx]?.addr
    return addr === undefined ? undefined : addr.toLowerCase() === pattern.toLowerCase()
  }
  const name = ctx.game.playerName(playerIdx)
  if (name === undefined) {
    return undefined
  }
  // name glob: case-insensitive, * matches any run of characters
  return globMatch(pattern.toLowerCase(), name.toLowerCase())
}

// Iterative two-pointer wildcard match (* = any run of characters). Linear
// scanning with single-star backtracking — unlike a backtracking regex, a
// pathological pattern (many stars) cannot blow up combinatorially.
function globMatch (pattern, text) {
  pattern = pattern.replace(/\*+/g, '*') // consecutive stars act as one
  let p = 0 // position in pattern
  let t = 0 // position in text
  let starP = -1 // pattern position after the most recent *
  let starT = 0 // text position that * was last stretched to
  while (t < text.length) {
    if (p < pattern.length && pattern[p] === '*') {
      starP = ++p
      starT = t
    } else if (p < pattern.length && pattern[p] === text[t]) {
      p++
      t++
    } else if (starP !== -1) {
      // stretch the last * one character further and retry after it
      p = starP
      t = ++starT
    } else {
      return false
    }
  }
  // trailing * matches the empty run
  if (p < pattern.length && pattern[p] === '*') {
    p++
  }
  return p === pattern.length
}

function toMaps (props, methods = [], relations = []) {
  return {
    props: new Map(props.map(p => [p.path, p])),
    methods: new Map(methods.map(m => [m.name, m])),
    relations: new Map(relations.map(r => [r.name, r])),
    propList: props,
    methodList: methods,
    relationList: relations
  }
}

export const REGISTRY = {
  shot: toMaps(SHOT_PROPS, SHOT_METHODS, SHOT_RELATIONS),
  rally: toMaps(RALLY_PROPS),
  game: toMaps(GAME_PROPS),
  player: toMaps(PLAYER_PROPS, PLAYER_METHODS, PLAYER_RELATIONS)
}

// Walks the leading relation segments of a prop path, advancing the object
// type across each player-transition (shot→hitter, player→teammate/…).
// Returns the terminal object type and the remaining (scalar/method) path.
// Shared with the analyzer; the engine performs the same walk
// while also resolving each relation to a concrete player (evaluate.js).
export function walkRelations (base, path) {
  let typeName = base.object
  let i = 0
  while (i < path.length && REGISTRY[typeName].relations.has(path[i])) {
    typeName = 'player'
    i++
  }
  return { typeName, rest: path.slice(i) }
}
