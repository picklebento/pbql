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

const SEQUENCES = ['serve', 'return', '3', '4', '5']

function ballMovement (ctx) {
  return ctx.shot.resulting_ball_movement
}

function trajectory (ctx) {
  return ballMovement(ctx)?.trajectory
}

// Builds the property set for one position (from/to/peak): hitter-relative
// x/y/z, raw absX/absY/absZ, and derived distances. The hitter's side (which
// decides the mirror) comes from where the ball was struck.
function positionProps (prefix, doc, getPos, extras = []) {
  function framed (ctx) {
    const pos = getPos(ctx)
    const struckAt = trajectory(ctx)?.start?.location
    if (pos === undefined || struckAt === undefined) {
      return undefined
    }
    return toPlayerFrame(pos, isOnFarSide(struckAt))
  }
  const p = (path, type, unit, docStr, extract) =>
    ({ path: `${prefix}.${path}`, type, unit, doc: docStr, extract })
  // height has no mirrored frame, so z and absZ share one accessor
  const height = ctx => getPos(ctx)?.z
  return [
    p('x', 'number', 'feet', `${doc} — hitter-frame x (0-20, grows to the hitter's right)`,
      ctx => framed(ctx)?.x),
    p('y', 'number', 'feet', `${doc} — hitter-frame y (own baseline 0, net 22)`,
      ctx => framed(ctx)?.y),
    p('z', 'number', 'feet', `${doc} — height above the ground`, height),
    p('absX', 'number', 'feet', `${doc} — raw court x (far-left corner origin)`,
      ctx => getPos(ctx)?.x),
    p('absY', 'number', 'feet', `${doc} — raw court y (far-left corner origin)`,
      ctx => getPos(ctx)?.y),
    p('absZ', 'number', 'feet', `${doc} — height above the ground`, height),
    p('feetToNearestSideline', 'number', 'feet', `${doc} — distance to the nearest sideline`,
      ctx => mapPos(getPos(ctx), feetToNearestSideline)),
    p('feetToNearestBaseline', 'number', 'feet', `${doc} — distance to the nearest baseline`,
      ctx => mapPos(getPos(ctx), feetToNearestBaseline)),
    p('feetToNet', 'number', 'feet', `${doc} — distance to the plane of the net`,
      ctx => mapPos(getPos(ctx), feetToNet)),
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
    path: 'sequence',
    type: 'string',
    unit: '"serve"|"return"|"3"|"4"|"5"',
    doc: 'the common name for this shot\'s position in the rally; unknown from the 6th shot on',
    extract: ctx => SEQUENCES[ctx.shotIdx]
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
    doc: 'whether the ball was hit out of the air',
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
    doc: 'whether the shot took significant pace off the ball',
    extract: ctx => ctx.shot.is_reset
  },
  {
    path: 'isPoach',
    type: 'boolean',
    doc: 'whether the hitter took a ball on their partner\'s side',
    extract: ctx => ctx.shot.is_poach
  },
  {
    path: 'isPassing',
    type: 'boolean',
    doc: 'whether the shot passed the nearest opponent untouched',
    extract: ctx => ctx.shot.is_passing
  },
  {
    path: 'isPutaway',
    type: 'boolean',
    doc: 'whether the shot was a putaway',
    extract: ctx => ctx.shot.is_putaway
  },
  {
    path: 'type',
    type: 'string',
    unit: '"smash"|"lob"|"dink"|"drop"|"drive"|"volley"|"reset"|"speedup"',
    doc: 'the shot classification',
    extract: ctx => ctx.shot.shot_type
  },
  {
    path: 'verticalType',
    type: 'string',
    unit: '"dig"|"topspin"|"slice"|"lob"|"neutral"',
    doc: 'the vertical character of the stroke',
    extract: ctx => ctx.shot.vertical_type
  },
  {
    path: 'strokeType',
    type: 'string',
    unit: '"forehand"|"backhand"|"two-handed"',
    doc: 'the stroke used',
    extract: ctx => ctx.shot.stroke_type
  },
  {
    path: 'strokeSide',
    type: 'string',
    unit: '"left"|"right"',
    doc: 'which side of the body the stroke was made on',
    extract: ctx => ctx.shot.stroke_side
  },
  {
    path: 'winnerType',
    type: 'string',
    unit: '"winner"|"ace"|"forced_fault"|"unforced_fault"',
    doc: 'how this shot won the rally; unknown if it did not',
    extract: ctx => ctx.shot.winner_type
  },
  {
    path: 'quality.overall',
    type: 'number',
    unit: '0-1',
    doc: 'combined execution + selection quality (1 is best)',
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
    path: 'quality.selection',
    type: 'number',
    unit: '0-1',
    doc: 'how good a choice this shot was',
    extract: ctx => ctx.shot.quality?.selection
  },
  {
    path: 'speed',
    type: 'number',
    unit: 'mph',
    doc: 'ball speed after the hit',
    extract: ctx => ballMovement(ctx)?.speed
  },
  {
    path: 'spin.class',
    type: 'string',
    unit: '"topspin"|"backspin"|"sidespin"|"minimal_spin"',
    doc: 'dominant spin after the hit',
    extract: ctx => ballMovement(ctx)?.spin?.dominant_class
  },
  {
    path: 'spin.rpm',
    type: 'number',
    unit: 'rpm',
    doc: 'spin magnitude after the hit',
    extract: ctx => ballMovement(ctx)?.spin?.magnitude
  },
  {
    path: 'direction',
    type: 'string',
    unit: '"DownTheMiddle"|"DownTheLineLeft"|…',
    doc: 'named direction the ball traveled',
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
    doc: 'vertical launch angle (0 = flat, 90 = straight up)',
    extract: ctx => ballMovement(ctx)?.angles?.pitch
  },
  {
    path: 'distance',
    type: 'number',
    unit: 'feet',
    doc: 'how far the ball flew before contact with anything',
    extract: ctx => ballMovement(ctx)?.distance
  },
  {
    path: 'distanceFromBaseline',
    type: 'number',
    unit: 'feet',
    doc: 'where the ball landed relative to the opponent\'s baseline',
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
    doc: 'whether any error was detected on this shot (never unknown)',
    extract: ctx => ctx.shot.errors !== undefined
  },
  {
    path: 'errors.unforced',
    type: 'boolean',
    doc: 'whether the error was unforced',
    extract: ctx => ctx.shot.errors?.unforced
  },
  {
    path: 'errors.popup',
    type: 'string',
    unit: '"exploited"|"potential"',
    doc: 'whether the shot popped the ball up (and whether opponents capitalized)',
    extract: ctx => ctx.shot.errors?.popup
  },
  {
    path: 'errors.deadDink',
    type: 'string',
    unit: '"exploited"|"potential"',
    doc: 'whether the dink sat up attackably',
    extract: ctx => ctx.shot.errors?.dead_dink
  },
  {
    path: 'hasFault',
    type: 'boolean',
    doc: 'whether this shot committed a rule fault (never unknown)',
    extract: ctx => ctx.shot.errors?.faults !== undefined
  },
  {
    path: 'errors.faults.net',
    type: 'boolean',
    doc: 'whether the net stopped the ball',
    extract: ctx => ctx.shot.errors?.faults?.net
  },
  {
    path: 'errors.faults.kitchen',
    type: 'boolean',
    doc: 'whether the hitter volleyed while in the kitchen',
    extract: ctx => ctx.shot.errors?.faults?.kitchen
  },
  {
    path: 'errors.faults.paddleHitNet',
    type: 'boolean',
    doc: 'whether the paddle touched the net',
    extract: ctx => ctx.shot.errors?.faults?.paddle_hit_net
  },
  {
    path: 'errors.faults.doubleBounce',
    type: 'boolean',
    doc: 'whether the ball bounced twice before the hit',
    extract: ctx => ctx.shot.errors?.faults?.excess_bounce
  },
  {
    path: 'errors.faults.short',
    type: 'boolean',
    doc: 'whether the serve/shot came up short',
    extract: ctx => ctx.shot.errors?.faults?.short
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
    doc: 'which way the ball went out',
    extract: ctx => ctx.shot.errors?.faults?.out?.direction
  },
  ...positionProps('from', 'where the ball was struck',
    ctx => trajectory(ctx)?.start?.location,
    [{
      path: 'from.zone',
      type: 'string',
      unit: '"deep"|"mid"|"short"|"kitchen"|"net"|"out"',
      doc: 'depth zone the ball was struck from',
      extract: ctx => trajectory(ctx)?.start?.zone
    }]),
  ...positionProps('to', 'where the ball\'s flight ended',
    ctx => trajectory(ctx)?.end?.location,
    [{
      path: 'to.zone',
      type: 'string',
      unit: '"deep"|"mid"|"short"|"kitchen"|"net"|"out"',
      doc: 'depth zone where the ball\'s flight ended',
      extract: ctx => trajectory(ctx)?.end?.zone
    }]),
  ...positionProps('peak', 'the highest point of the ball\'s flight',
    ctx => trajectory(ctx)?.peak)
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
        .every(p => (p.kitchen_arrivals?.length ?? 0) > 0 ||
          p.ms_to_kitchen !== undefined)
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
    extract: ctx => ctx.game.meta.videoName ?? ctx.game.insights.session?.name
  },
  {
    path: 'numRallies',
    type: 'number',
    doc: 'how many rallies the game contains',
    extract: ctx => ctx.game.rallies.length
  },
  {
    path: 'duration',
    type: 'number',
    unit: 'seconds',
    doc: 'first rally start to last rally end',
    extract: ctx => {
      const { rallies } = ctx.game
      return (rallies[rallies.length - 1].end_ms - rallies[0].start_ms) / 1000
    }
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
// properties are measured at the moment the current shot was hit, in the
// player's own frame (their baseline is y=0).
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
    doc: 'whether the player started this rally on the left side',
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
      return (p.kitchen_arrivals?.length ?? 0) > 0 || p.ms_to_kitchen !== undefined
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
  }
]

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
    args: [{ name: 'side', type: 'string' }],
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
    args: [{ name: 'kind', type: 'string' }],
    doc: 'whether the shot falls inside a highlight of the given kind ("atp", "erne", "hands_battle", "long_rally", "poach", "sequence")',
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

function toMaps (props, methods = []) {
  return {
    props: new Map(props.map(p => [p.path, p])),
    methods: new Map(methods.map(m => [m.name, m])),
    propList: props,
    methodList: methods
  }
}

export const REGISTRY = {
  shot: toMaps(SHOT_PROPS, SHOT_METHODS),
  rally: toMaps(RALLY_PROPS),
  game: toMaps(GAME_PROPS),
  player: toMaps(PLAYER_PROPS, PLAYER_METHODS)
}
