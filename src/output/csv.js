// RFC 4180 CSV output: SELECT projections, or a fixed useful column set
// for plain shot lists.

function cell (value) {
  if (value === null || value === undefined) {
    return ''
  }
  let text = String(value)
  // OWASP CSV-injection guard: a leading = + - @ tab or CR would make a
  // spreadsheet treat the cell as a formula, so prefix string values with
  // a single quote. Numbers (e.g. -4) are not affected.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`
  }
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCSV (columns, rows) {
  const lines = [columns.map(cell).join(',')]
  for (const row of rows) {
    lines.push(row.map(cell).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

export function shotsToCSV (result) {
  if (result.columns) {
    return toCSV(result.columns, result.rows)
  }
  const columns = ['vid', 'sessionIdx', 'rallyIdx', 'shotIdx',
    'hitTimeSecs', 'windowStartSecs', 'windowEndSecs']
  const rows = result.shots.map(shot => [
    shot.vid,
    shot.sessionIdx,
    shot.rallyIdx,
    shot.shotIdx,
    shot.hitMs === undefined ? null : shot.hitMs / 1000,
    shot.window.sMs / 1000,
    shot.window.eMs / 1000
  ])
  return toCSV(columns, rows)
}
