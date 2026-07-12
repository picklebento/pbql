// The playground page logic. Everything runs client-side: ./pbql.js is the
// real library bundled by docs-site/build.js, and vid loading mirrors
// src/sources/resolve.js (the version endpoint, then the public bucket).
import { parse, parseVidSource, print, runQuery, toShotExplorerURLs, validate } from './pbql.js'

const VERSION_ENDPOINT =
  'https://api-2o2klzx4pa-uc.a.run.app/video/ai_engine_version'
const BUCKET = 'https://storage.googleapis.com/pbv-pro'
// engines ≤ 132 predate multi-session processing: no session URL segment
const FIRST_SESSIONED_VERSION = 133
const DEMO_VID = '83gyqyc10y8f'

const $ = id => document.getElementById(id)
// the loaded game: {vid, sessionIdx, insights, source} (source is the
// vid[:sessionNum] string when loaded from pb.vision, null for local files)
let game = null

function showMessages (messages) {
  const box = $('messages')
  box.replaceChildren(...messages.map(({ text, cls }) => {
    const div = document.createElement('div')
    div.className = cls
    div.textContent = text
    return div
  }))
}

const errorText = e => `${e.line}:${e.col} ${e.message}` +
  (e.hint === undefined ? '' : ` (${e.hint})`)

function setGameStatus (text, cls = 'hint') {
  $('game-status').textContent = text
  $('game-status').className = cls
}

function setGame (loaded) {
  game = loaded
  const { vid, sessionIdx, insights } = loaded
  setGameStatus(`loaded ${vid} (session ${sessionIdx + 1}): ` +
    `insights v${insights.version}, ${insights.rallies?.length ?? 0} rallies`)
}

// mirrors endpointMessage in src/sources/resolve.js: endpoint errors carry
// JSON {code, message} (404 unknown vid; 400 unprocessed/processing/failed)
async function endpointMessage (res) {
  const body = await res.text()
  try {
    const { message } = JSON.parse(body)
    if (typeof message === 'string') {
      return message
    }
  } catch {}
  return body === '' ? `HTTP ${res.status}` : body
}

async function fetchVidGame (source) {
  const ref = parseVidSource(source) // throws when the session number is 0
  if (ref === null) {
    throw new Error(`"${source}" is not a video id — expected 12 characters` +
      ' with an optional 1-based session ("83gyqyc10y8f" or "83gyqyc10y8f:2")')
  }
  const res = await fetch(VERSION_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vid: ref.vid })
  })
  if (!res.ok) {
    throw new Error('cannot fetch this video\'s insights — the pb.vision ' +
      `service says (HTTP ${res.status}): ${await endpointMessage(res)}`)
  }
  const { aiEngineVersion } = await res.json()
  const sessioned = aiEngineVersion >= FIRST_SESSIONED_VERSION
  const sessionNotFound = () =>
    new Error(`session ${ref.sessionIdx + 1} not found for this video`)
  if (!sessioned && ref.sessionIdx > 0) {
    throw sessionNotFound() // pre-133 videos only ever have one session
  }
  const url = `${BUCKET}/${ref.vid}/${aiEngineVersion}` +
    (sessioned ? `/${ref.sessionIdx}` : '') + '/insights.json'
  const insightsRes = await fetch(url)
  if (!insightsRes.ok) { // the bucket answers 404/403 for missing objects
    throw sessionNotFound()
  }
  return { ...ref, insights: await insightsRes.json(), source }
}

async function loadVid (source) {
  setGameStatus(`loading ${source}…`)
  try {
    setGame(await fetchVidGame(source.trim()))
  } catch (err) {
    game = null
    setGameStatus(err.message, 'err')
  }
}

async function loadFile (file) {
  try {
    const insights = JSON.parse(await file.text())
    setGame({
      vid: file.name.replace(/\.json$/, ''),
      sessionIdx: 0,
      insights,
      source: null
    })
  } catch (err) {
    game = null
    setGameStatus(`${file.name}: ${err.message}`, 'err')
  }
}

// results table: SELECT columns when the query projects, else the fixed
// shot columns (matching shotsToCSV in src/output/csv.js)
function toTable (result) {
  if (result.columns) {
    return { columns: result.columns, rows: result.rows }
  }
  return {
    columns: ['vid', 'sessionIdx', 'rallyIdx', 'shotIdx',
      'hitTimeSecs', 'windowStartSecs', 'windowEndSecs'],
    rows: result.shots.map(shot => [
      shot.vid,
      shot.sessionIdx,
      shot.rallyIdx,
      shot.shotIdx,
      shot.hitMs === undefined ? null : shot.hitMs / 1000,
      shot.window.sMs / 1000,
      shot.window.eMs / 1000
    ])
  }
}

const cellText = value => {
  if (value === null || value === undefined) {
    return ''
  }
  return typeof value === 'number'
    ? String(Math.round(value * 1000) / 1000)
    : String(value)
}

function renderResults (text, result) {
  const { columns, rows } = toTable(result)
  const out = []

  const count = document.createElement('p')
  count.textContent = result.columns
    ? `${rows.length} row${rows.length === 1 ? '' : 's'}`
    : `${result.shots.length} shot${result.shots.length === 1 ? '' : 's'} selected`
  out.push(count)

  if (game.source !== null) {
    const [url] = toShotExplorerURLs(text, [game.source])
    const p = document.createElement('p')
    const a = document.createElement('a')
    a.href = url
    a.textContent = 'open this query in the pb.vision Shot Explorer'
    p.append(a)
    out.push(p)
  }

  if (rows.length > 0) {
    const table = document.createElement('table')
    const header = table.createTHead().insertRow()
    for (const column of columns) {
      const th = document.createElement('th')
      th.textContent = column
      header.append(th)
    }
    const body = table.createTBody()
    for (const row of rows) {
      const tr = body.insertRow()
      for (const value of row) {
        tr.insertCell().textContent = cellText(value)
      }
    }
    out.push(table)
  }
  $('results').replaceChildren(...out)
}

function onValidate () {
  $('results').replaceChildren()
  const { errors } = validate($('query').value)
  showMessages(errors.length === 0
    ? [{ text: 'query is valid', cls: 'ok' }]
    : errors.map(e => ({ text: errorText(e), cls: 'err' })))
}

function onFormat () {
  $('results').replaceChildren()
  const parsed = parse($('query').value) // syntax only: unknown names still format
  if (parsed.errors) {
    showMessages(parsed.errors.map(e => ({ text: errorText(e), cls: 'err' })))
    return
  }
  $('query').value = print(parsed.ast)
  showMessages([])
}

function onRun () {
  $('results').replaceChildren()
  const text = $('query').value
  if (game === null) {
    showMessages([{
      text: 'load a game first (the demo button is the quickest way)',
      cls: 'err'
    }])
    return
  }
  const meta = $('me').value === '' ? {} : { myPlayerIdx: Number($('me').value) }
  const result = runQuery({
    text,
    games: [{ vid: game.vid, sessionIdx: game.sessionIdx, insights: game.insights, meta }]
  })
  if (result.errors) {
    showMessages(result.errors.map(e => ({ text: errorText(e), cls: 'err' })))
    return
  }
  showMessages(result.warnings.map(w =>
    ({ text: `warning: ${w.message}`, cls: 'warn' })))
  renderResults(text, result)
}

$('validate').addEventListener('click', onValidate)
$('format').addEventListener('click', onFormat)
$('run').addEventListener('click', onRun)
$('load-vid').addEventListener('click', () => loadVid($('vid').value))
$('load-demo').addEventListener('click', () => {
  $('vid').value = DEMO_VID
  loadVid(DEMO_VID)
})
$('file').addEventListener('change', event => {
  const [file] = event.target.files
  if (file !== undefined) {
    loadFile(file)
  }
})
