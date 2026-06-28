// Groups selected shots' windows into non-overlapping clips (per game),
// merging windows that overlap or sit within mergeGapMs of each other —
// the same consolidation the Shot Explorer applies before playback/EDL.

export function toClips (shots, { mergeGapMs = 0 } = {}) {
  const byGame = new Map()
  for (const shot of shots) {
    const key = `${shot.vid}#${shot.sessionIdx}`
    if (!byGame.has(key)) {
      byGame.set(key, [])
    }
    byGame.get(key).push(shot)
  }
  const clips = []
  for (const gameShots of byGame.values()) {
    gameShots.sort((a, b) => a.window.sMs - b.window.sMs)
    let current
    for (const shot of gameShots) {
      if (current !== undefined && shot.window.sMs <= current.eMs + mergeGapMs) {
        current.eMs = Math.max(current.eMs, shot.window.eMs)
        current.shots.push(shot)
      } else {
        current = {
          vid: shot.vid,
          sessionIdx: shot.sessionIdx,
          sMs: shot.window.sMs,
          eMs: shot.window.eMs,
          shots: [shot]
        }
        clips.push(current)
      }
    }
  }
  return clips
}
