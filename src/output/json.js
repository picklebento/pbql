// The machine-facing result shape: what the Shot Explorer consumes
// (0-based indices; explore URLs take rallyNum.shotNum = idx + 1).
import { msToSecs as secs } from './secs.js'

export function toSelectedShotsJSON (result) {
  const out = {
    selectedShots: result.shots.map(shot => ({
      vid: shot.vid,
      sessionIdx: shot.sessionIdx,
      rallyIdx: shot.rallyIdx,
      shotIdx: shot.shotIdx,
      hitTimeSecs: shot.hitMs === undefined ? null : secs(shot.hitMs),
      window: { sSecs: secs(shot.window.sMs), eSecs: secs(shot.window.eMs) },
      contextShots: shot.contextShots
    })),
    warnings: result.warnings
  }
  if (result.columns) {
    out.columns = result.columns
    out.rows = result.rows
  }
  return out
}
