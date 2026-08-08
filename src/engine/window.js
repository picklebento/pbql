// Context-window computation: each selected shot's video window is
// its own flight, widened by the CONTEXT clauses. Durations are
// positive magnitudes; `shots` units never cross rally boundaries (and add
// the covered shots to the result as context); `secs` units are exact video
// time, bounded only by the video itself (start always; end when the
// insights carry the video duration); min/max take the smaller/larger
// resolved duration, with identical meaning for BEFORE and AFTER.

// a candidate window edge plus the context shots it fully includes
function resolve (dur, side, ctx) {
  const { game, rally, shot, shotIdx } = ctx
  const before = side === 'before'
  const anchor = before ? game.hitMs(shot) : game.endMs(shot)
  if (dur.kind === 'durfn') {
    const candidates = dur.args.map(arg => resolve(arg, side, ctx))
    // wider = an earlier start (before) or a later end (after)
    const wider = (a, b) => before ? a.edgeMs < b.edgeMs : a.edgeMs > b.edgeMs
    candidates.sort((a, b) => (wider(a, b) ? -1 : 1))
    const [widest, tightest] = candidates
    if (widest.edgeMs === tightest.edgeMs) {
      // same window: prefer the candidate that carries context shots
      return widest.contextShots.length > 0 ? widest : tightest
    }
    return dur.fn === 'max' ? widest : tightest
  }
  if (dur.unit === 'rally') {
    return {
      edgeMs: before ? rally.start_ms : rally.end_ms,
      contextShots: contextRange(ctx, before ? 0 : shotIdx + 1,
        before ? shotIdx : rally.shots.length)
    }
  }
  if (dur.unit === 'shots') {
    const shots = rally.shots
    if (before) {
      const target = Math.max(0, shotIdx - dur.value)
      return {
        edgeMs: Math.min(anchor, game.hitMs(shots[target])),
        contextShots: contextRange(ctx, target, shotIdx)
      }
    }
    const target = Math.min(shots.length - 1, shotIdx + dur.value)
    return {
      edgeMs: Math.max(anchor, game.endMs(shots[target])),
      contextShots: contextRange(ctx, shotIdx + 1, target + 1)
    }
  }
  // secs: exact video time. The video's start is a hard floor; its end is
  // a hard ceiling too when augmented insights carry the video duration
  // (regular files don't, so windows may then extend into the trailing
  // footage)
  if (before) {
    return { edgeMs: Math.max(0, anchor - dur.value * 1000), contextShots: [] }
  }
  return {
    edgeMs: Math.min(game.videoDurationMs ?? Infinity, anchor + dur.value * 1000),
    contextShots: []
  }
}

function contextRange (ctx, fromIdx, toIdx) {
  const shots = []
  for (let shotIdx = fromIdx; shotIdx < toIdx; shotIdx++) {
    shots.push({ rallyIdx: ctx.rallyIdx, shotIdx })
  }
  return shots
}

/**
 * Computes the video window for one selected shot.
 * @returns {{sMs: number, eMs: number, contextShots: Array<{rallyIdx:
 *   number, shotIdx: number}>}} window bounds (ms) and the neighboring
 *   shots that shots-unit context pulled in
 */
export function computeWindow (ctx, context) {
  const before = resolve(context.before, 'before', ctx)
  const after = resolve(context.after, 'after', ctx)
  return {
    sMs: before.edgeMs,
    eMs: after.edgeMs,
    contextShots: [...before.contextShots, ...after.contextShots]
  }
}
