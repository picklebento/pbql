// The one ms→secs rule for shot-list outputs: every output format prints
// the same seconds value for the same underlying milliseconds.
export const msToSecs = ms => Math.round(ms) / 1000
