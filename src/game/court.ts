/** NBA court geometry in feet. x runs baseline to baseline (0–94), y sideline to sideline (0–50). */
export const COURT_L = 94;
export const COURT_W = 50;
export const HOOP_OFFSET = 5.25;
export const RIM_HEIGHT = 10;
export const THREE_R = 23.75;
export const CORNER_Y = 3; // corner three line is 3 ft from the sideline (22 ft from hoop)
export const CORNER_X = 14; // straight corner line runs 14 ft out from baseline
export const FT_DIST = 15; // free-throw line is 15 ft from the backboard plane

export const LEFT_HOOP = { x: HOOP_OFFSET, y: COURT_W / 2 };
export const RIGHT_HOOP = { x: COURT_L - HOOP_OFFSET, y: COURT_W / 2 };

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** True if a shot from (x, y) at the given hoop is worth 3. */
export function isThree(x: number, y: number, hoopX: number): boolean {
  const fromBaseline = hoopX < COURT_L / 2 ? x : COURT_L - x;
  if (fromBaseline <= CORNER_X) return y < CORNER_Y || y > COURT_W - CORNER_Y;
  return dist(x, y, hoopX, COURT_W / 2) > THREE_R;
}

export function inBounds(x: number, y: number, margin = 0): boolean {
  return x >= -margin && x <= COURT_L + margin && y >= -margin && y <= COURT_W + margin;
}
