// Court geometry. All coordinates are in feet in the insights "world" frame:
// origin at the far-left court corner relative to the camera, x across the
// 20ft width, y along the 44ft length, z up. The net plane is y=22 and the
// kitchen (non-volley) lines are y=15 and y=29.
export const COURT = {
  WIDTH: 20,
  LENGTH: 44,
  NET_Y: 22,
  KITCHEN_NEAR_Y: 15,
  KITCHEN_FAR_Y: 29
}

// true if the position is on the far half of the court (beyond the net)
export function isOnFarSide (pos) {
  return pos.y > COURT.NET_Y
}

// Mirrors a world position into the frame of a player on the far side, so
// that "their own baseline" is y'=0 and x' grows to their right as they face
// the net. For a near-side player the world frame already has this shape.
export function toPlayerFrame (pos, onFarSide) {
  if (!onFarSide) {
    return pos
  }
  const mirrored = { x: COURT.WIDTH - pos.x, y: COURT.LENGTH - pos.y }
  if (pos.z !== undefined) {
    mirrored.z = pos.z
  }
  return mirrored
}

// distance to the nearest sideline (identical in either frame)
export function feetFromNearestSideline (pos) {
  return Math.min(pos.x, COURT.WIDTH - pos.x)
}

// distance to the nearest baseline (identical in either frame)
export function feetFromNearestBaseline (pos) {
  return Math.min(pos.y, COURT.LENGTH - pos.y)
}

// distance to the plane of the net
export function distanceToNet (pos) {
  return Math.abs(pos.y - COURT.NET_Y)
}

// Distance remaining to reach one's own kitchen line, moving toward the net;
// 0 when standing on the line or inside the kitchen (or past it).
export function feetToKitchen (pos) {
  return isOnFarSide(pos)
    ? Math.max(0, pos.y - COURT.KITCHEN_FAR_Y)
    : Math.max(0, COURT.KITCHEN_NEAR_Y - pos.y)
}
