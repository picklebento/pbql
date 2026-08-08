import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { main, USAGE } from '../src/cli/main.js'
import { runQuery, toClips, toCSV, shotsToCSV, toEDL, ffmpegCommands, toCommandString, toSelectedShotsJSON } from '../src/index.js'

import { makeDoublesGame, makeDoublesInsights } from './fixtures/make-insights.js'

const shot = (sMs, eMs, vid = 'a', sessionIdx = 0) =>
  ({ vid, sessionIdx, rallyIdx: 0, shotIdx: 0, hitMs: sMs, window: { sMs, eMs }, contextShots: [] })

describe('toClips', () => {
  test('merges overlapping windows, honors mergeGapMs, splits by game', () => {
    const shots = [shot(0, 1000), shot(900, 2000), shot(2400, 3000), shot(0, 500, 'b')]
    const merged = toClips(shots)
    expect(merged.map(c => [c.vid, c.sMs, c.eMs])).toEqual([
      ['a', 0, 2000], ['a', 2400, 3000], ['b', 0, 500]])
    expect(merged[0].shots).toHaveLength(2)
    expect(toClips(shots, { mergeGapMs: 500 }).map(c => [c.vid, c.sMs, c.eMs]))
      .toEqual([['a', 0, 3000], ['b', 0, 500]])
  })
})

describe('toSelectedShotsJSON', () => {
  test('emits the Shot-Explorer shape in seconds, with context shots', () => {
    const result = runQuery({
      text: 'FROM "x" WHERE shot.speed = 50 CONTEXT BEFORE 1 shots',
      games: [makeDoublesGame()]
    })
    expect(toSelectedShotsJSON(result)).toEqual({
      selectedShots: [{
        vid: 'testvid00001',
        sessionIdx: 0,
        rallyIdx: 2,
        shotIdx: 2,
        hitTimeSecs: 58,
        window: { sSecs: 55, eSecs: 59 },
        contextShots: [{ rallyIdx: 2, shotIdx: 1 }]
      }],
      warnings: []
    })
  })

  test('carries SELECT columns and rows alongside each shot window', () => {
    // a projection returns rows, not clips, so its shots keep the bare flight
    // window (context is inert on SELECT)
    const result = runQuery({
      text: 'SELECT shot.num FROM "x" WHERE shot.speed = 50',
      games: [makeDoublesGame()]
    })
    expect(toSelectedShotsJSON(result)).toEqual({
      selectedShots: [{
        vid: 'testvid00001',
        sessionIdx: 0,
        rallyIdx: 2,
        shotIdx: 2,
        hitTimeSecs: 58,
        window: { sSecs: 58, eSecs: 59 },
        contextShots: []
      }],
      warnings: [],
      columns: ['shot.num'],
      rows: [[3]]
    })
  })

  test('missing hit time becomes null in JSON and empty in CSV', () => {
    const result = { shots: [{ ...shot(1, 2), hitMs: undefined }], warnings: [] }
    expect(toSelectedShotsJSON(result).selectedShots[0].hitTimeSecs).toBeNull()
    expect(shotsToCSV(result)).toContain('a,0,0,0,,0.001,0.002')
  })

  test('JSON and CSV print identical seconds for the same result', () => {
    // a fractional-ms window edge (58000 − 500.5 = 57499.5ms) makes the
    // shared round-to-ms rule observable in both outputs
    const result = runQuery({
      text: 'FROM "x" WHERE shot.speed = 50 CONTEXT BEFORE 0.5005secs',
      games: [makeDoublesGame()]
    })
    const [json] = toSelectedShotsJSON(result).selectedShots
    const row = shotsToCSV(result).trim().split('\r\n')[1].split(',')
    expect(json.window.sSecs).toBe(57.5) // not the unrounded 57.4995
    expect(Number(row[4])).toBe(json.hitTimeSecs)
    expect(Number(row[5])).toBe(json.window.sSecs)
    expect(Number(row[6])).toBe(json.window.eSecs)
  })
})

describe('CSV', () => {
  test('escapes per RFC 4180', () => {
    expect(toCSV(['a', 'b,c'], [['x,y', 'he said "hi"'], [null, 3]]))
      .toBe('a,"b,c"\r\n"x,y","he said ""hi"""\r\n,3\r\n')
  })

  test('neutralizes spreadsheet formula injection in string cells', () => {
    // OWASP CSV-injection guard: leading = + - @ tab CR get a quote prefix
    expect(toCSV(['name'], [
      ['=SUM(A1)'], ['+1'], ['-owned'], ['@cmd'], ['\ttab'], ['\rcr'], ['safe']
    ])).toBe('name\r\n\'=SUM(A1)\r\n\'+1\r\n\'-owned\r\n\'@cmd\r\n' +
      '\'\ttab\r\n"\'\rcr"\r\nsafe\r\n')
    // only strings are guarded: negative numbers export cleanly
    expect(toCSV(['n'], [[-4], [-0.5]])).toBe('n\r\n-4\r\n-0.5\r\n')
  })

  test('shot lists get fixed columns; SELECT results use theirs', () => {
    // 0secs keeps the flight-only window so the row shows the shot's own bounds
    const result = runQuery({
      text: 'FROM "x" WHERE shot.speed = 50 CONTEXT BEFORE 0secs',
      games: [makeDoublesGame()]
    })
    expect(shotsToCSV(result)).toBe(
      'vid,sessionIdx,rallyIdx,shotIdx,hitTimeSecs,windowStartSecs,windowEndSecs\r\n' +
      'testvid00001,0,2,2,58,58,59\r\n')
    const selected = runQuery({
      text: 'SELECT count() FROM "x" WHERE true',
      games: [makeDoublesGame()]
    })
    expect(shotsToCSV(selected)).toBe('count()\r\n9\r\n')
  })
})

describe('toEDL', () => {
  test('emits CMX 3600 with correct timecodes and running record', () => {
    expect(toEDL({ title: 'T', clips: [{ sMs: 0, eMs: 2000 }, { sMs: 10000, eMs: 11500 }], fps: 30 }))
      .toBe([
        'TITLE: T',
        'FCM: NON-DROP FRAME',
        '',
        '001  AX       V    C        00:00:00:00 00:00:02:00 00:00:00:00 00:00:02:00',
        '002  AX       V    C        00:00:10:00 00:00:11:15 00:00:02:00 00:00:03:15',
        ''
      ].join('\n'))
  })

  test('fractional rates keep integer frames via the nominal base', () => {
    // 60.06s at 29.97fps is round(60.06 × 29.97) = 1800 frames, which is
    // exactly 00:01:00:00 at the nominal 30-frame NDF base
    const edl = toEDL({ title: 'T', clips: [{ sMs: 0, eMs: 60060 }], fps: 29.97 })
    expect(edl).toContain(
      '00:00:00:00 00:01:00:00 00:00:00:00 00:01:00:00')
    // 1.001s → round(29.99997) = 30 frames → 00:00:01:00, never "00:00:00:30"
    // with a fractional remainder in the frame field
    expect(toEDL({ title: 'T', clips: [{ sMs: 0, eMs: 1001 }], fps: 29.97 }))
      .toContain('00:00:00:00 00:00:01:00')
  })

  test('handles hour-scale timecodes and defaults to 30fps', () => {
    const edl = toEDL({ title: 'T', clips: [{ sMs: 3661000, eMs: 3662000 }], fps: 30 })
    expect(edl).toContain('01:01:01:00 01:01:02:00')
    expect(toEDL({ title: 'T', clips: [{ sMs: 0, eMs: 1000 }] }))
      .toContain('00:00:00:00 00:00:01:00')
  })
})

describe('ffmpegCommands', () => {
  const clips = [{ sMs: 500, eMs: 2000 }, { sMs: 10000, eMs: 12500 }]

  test('emits one frame-accurate filter_complex command', () => {
    const { argv, command } = ffmpegCommands({
      input: 'in.mp4', clips, output: 'out.mp4'
    })
    expect(argv[0]).toBe('ffmpeg')
    const filter = argv[argv.indexOf('-filter_complex') + 1]
    expect(filter).toContain('[0:v]trim=start=0.500:end=2.000,setpts=PTS-STARTPTS[v0]')
    expect(filter).toContain('[0:a]atrim=start=10.000:end=12.500,asetpts=PTS-STARTPTS[a1]')
    expect(filter).toContain('[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]')
    expect(command).toContain("-filter_complex '")
  })

  test('refuses an empty clip list; quotes tricky args', () => {
    expect(() => ffmpegCommands({ input: 'in.mp4', clips: [], output: 'o.mp4' }))
      .toThrow('no clips')
    expect(toCommandString(['ffmpeg', '-i', "it's here.mp4"]))
      .toBe("ffmpeg -i 'it'\\''s here.mp4'")
  })
})

describe('CLI main()', () => {
  let dir, insightsFile, QUERY, out, err, io
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbql-test-'))
    insightsFile = path.join(dir, 'testvid00001.json')
    fs.writeFileSync(insightsFile, JSON.stringify(makeDoublesInsights()))
    QUERY = `FROM "${insightsFile}" WHERE shot.speed = 50 CONTEXT BEFORE 1secs`
    out = []
    err = []
    io = { stdout: t => out.push(t), stderr: t => err.push(t) }
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  test('--help prints usage', async () => {
    expect(await main(['--help'], io)).toBe(0)
    expect(out[0]).toBe(USAGE)
  })

  test('bad invocations fail with guidance', async () => {
    expect(await main([], io)).toBe(1)
    expect(err[0]).toContain('expected a query')
    expect(await main(['q', 'extra'], io)).toBe(1)
    expect(err[1]).toContain('expected a query')
    expect(await main(['--nope'], io)).toBe(1)
    expect(err[2]).toContain(USAGE) // unknown flags still print usage
    expect(await main([QUERY, '--insights', insightsFile], io)).toBe(1) // removed flag
    expect(err[3]).toContain(USAGE)
    expect(await main([QUERY, '--out', 'edl', '--fps', '60'], io)).toBe(1) // removed flag
    expect(err[4]).toContain(USAGE)
  })

  test('--me must be an integer 0-3', async () => {
    for (const bad of ['4', '-1', '1.5', 'zed', '', '2x']) {
      err = []
      expect(await main([QUERY, `--me=${bad}`], io)).toBe(1)
      expect(err[0]).toContain('--me must be an integer 0-3')
      expect(err[0]).toContain(USAGE)
    }
  })

  test('--merge-gap and --max-secs-beyond-rally must be finite and >= 0',
    async () => {
      for (const flag of ['--merge-gap', '--max-secs-beyond-rally']) {
        for (const bad of ['-0.5', 'fast', 'Infinity', 'NaN', ' ']) {
          err = []
          expect(await main([QUERY, `${flag}=${bad}`], io)).toBe(1)
          expect(err[0]).toContain(
            `${flag} must be a finite non-negative number`)
          expect(err[0]).toContain(USAGE)
        }
      }
      // valid values still work end-to-end
      expect(await main([QUERY, '--merge-gap', '1',
        '--max-secs-beyond-rally', '0'], io)).toBe(0)
    })

  test('FROM names files, directories, and globs', async () => {
    expect(await main([`FROM "${insightsFile}" WHERE shot.speed = 50`], io))
      .toBe(0)
    expect(JSON.parse(out[0]).selectedShots[0]).toMatchObject({
      vid: 'testvid00001', sessionIdx: 0, rallyIdx: 2, shotIdx: 2
    })
    expect(await main([`FROM "${dir}" WHERE shot.speed = 50`], io)).toBe(0)
    expect(JSON.parse(out[1]).selectedShots).toHaveLength(1)
    expect(await main([`FROM "${dir}/*.json" WHERE shot.speed = 50`], io)).toBe(0)
    expect(JSON.parse(out[2]).selectedShots).toHaveLength(1)
  })

  test('source failures exit 1 with the offending string', async () => {
    expect(await main(['FROM "missing.json" WHERE true'], io)).toBe(1)
    expect(err[0]).toContain('"missing.json" matched nothing')
    // vid sources resolve via fetch; the resolver's message reaches stderr
    // (an empty temp cache dir keeps the real insights cache out of play)
    const realFetch = global.fetch
    const savedXdg = process.env.XDG_CACHE_HOME
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbql-cache-'))
    process.env.XDG_CACHE_HOME = cacheDir
    global.fetch = async () => new Response(
      '{"code":"NotFoundException","message":"Not found"}', { status: 404 })
    try {
      expect(await main(['FROM "83gyqyc10y8f" WHERE true'], io)).toBe(1)
      expect(err[1]).toContain('"83gyqyc10y8f": cannot fetch this video\'s ' +
        'insights — the pb.vision service says (HTTP 404): Not found')
    } finally {
      global.fetch = realFetch
      fs.rmSync(cacheDir, { recursive: true, force: true })
      if (savedXdg === undefined) {
        delete process.env.XDG_CACHE_HOME
      } else {
        process.env.XDG_CACHE_HOME = savedXdg
      }
    }
  })

  test('query errors print with positions and exit 1', async () => {
    expect(await main([`FROM "${insightsFile}" WHERE shot.isVoley`], io)).toBe(1)
    expect(err[0]).toContain('PBQL_UNKNOWN_PROPERTY')
    expect(err[0]).toContain('did you mean "isVolley"?')
    expect(await main(['FROM @'], io)).toBe(1) // parse errors still report positions
    expect(err[1]).toBe('1:6 PBQL_LEX_ERROR: unrecognized text') // no hint suffix
  })

  test('default JSON output; vid comes from the file basename', async () => {
    expect(await main([QUERY], io)).toBe(0)
    const json = JSON.parse(out[0])
    expect(json.selectedShots).toHaveLength(1)
    expect(json.selectedShots[0]).toMatchObject({
      vid: 'testvid00001', rallyIdx: 2, shotIdx: 2, window: { sSecs: 57, eSecs: 59 }
    })
  })

  test('reads the query from a file; honors --me', async () => {
    const queryFile = path.join(dir, 'q.pbql')
    fs.writeFileSync(queryFile,
      `FROM "${insightsFile}" WHERE shot.hitter = me`)
    expect(await main(['-f', queryFile, '--me', '1'], io)).toBe(0)
    const json = JSON.parse(out[0])
    expect(json.selectedShots).toHaveLength(2) // Bob's shots
    expect(json.selectedShots[0]).toMatchObject({ vid: 'testvid00001', sessionIdx: 0 })
  })

  test('se output prints explore links carrying the query body', async () => {
    // no insights are fetched or evaluated: the links carry the query
    // minus its FROM clause (the URL path already names the video)
    const q = 'FROM "83gyqyc10y8f:2", "games/*.json" WHERE shot.isVolley'
    expect(await main([q, '--out', 'se'], io)).toBe(0)
    expect(out[0]).toBe('https://pb.vision/video/83gyqyc10y8f/1/explore?q=' +
      encodeURIComponent('WHERE shot.isVolley'))
  })

  test('se fails clearly without a video-id source or with a bad query', async () => {
    expect(await main([QUERY, '--out', 'se'], io)).toBe(1) // file path source
    expect(err[0]).toContain('--out se needs a pb.vision video id')
    expect(await main(['FROM "83gyqyc10y8f" WHERE shot.isVoley', '--out', 'se'], io))
      .toBe(1) // se still validates the query
    expect(err[1]).toContain('PBQL_UNKNOWN_PROPERTY')
    expect(await main(['FROM "ab12cd34ef56:0" WHERE true', '--out', 'se'], io)).toBe(1)
    expect(err[2]).toContain('session numbers are 1-based')
  })

  test('--host is no longer a flag; it fails as an unknown option', async () => {
    expect(await main([QUERY, '--out', 'se',
      '--host', 'https://pbv-dev.web.app'], io)).toBe(1)
    expect(err[0]).toContain("'--host'")
    expect(err[0]).toContain(USAGE)
  })

  test('csv and edl outputs', async () => {
    expect(await main([QUERY, '--out', 'csv'], io)).toBe(0)
    expect(out[0]).toContain('vid,sessionIdx,rallyIdx')
    expect(await main([QUERY, '--out', 'edl'], io)).toBe(0)
    expect(out[1]).toContain('FCM: NON-DROP FRAME')
  })

  test('edl frame rate comes from the queried video, default 30', async () => {
    // a 0.5s lead-in makes the start frame differ by fps: 57.5s is frame
    // 30 of second 57 at 60fps but frame 15 at the 30fps fallback
    const query = file =>
      `FROM "${file}" WHERE shot.speed = 50 CONTEXT BEFORE 0.5secs`
    const insights = makeDoublesInsights()
    insights.camera.fps = 60
    const sixty = path.join(dir, 'sixty.json')
    fs.writeFileSync(sixty, JSON.stringify(insights))
    expect(await main([query(sixty), '--out', 'edl'], io)).toBe(0)
    expect(out[0]).toContain('00:00:57:30 00:00:59:00')
    delete insights.camera
    const nocam = path.join(dir, 'nocam.json')
    fs.writeFileSync(nocam, JSON.stringify(insights))
    expect(await main([query(nocam), '--out', 'edl'], io)).toBe(0)
    expect(out[1]).toContain('00:00:57:15 00:00:59:00')
  })

  test('edl of an empty selection emits just the header', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'pbql-empty-'))
    try {
      expect(await main([`FROM "${empty}" WHERE true`, '--out', 'edl'], io))
        .toBe(0)
      expect(out[0]).toBe('TITLE: pbql selection\nFCM: NON-DROP FRAME\n\n')
    } finally {
      fs.rmSync(empty, { recursive: true, force: true })
    }
  })

  test('ffmpeg output requires --video-file and selected shots', async () => {
    expect(await main([QUERY, '--out', 'ffmpeg'], io)).toBe(1)
    expect(err[0]).toContain('--video-file')
    expect(await main([QUERY, '--out', 'ffmpeg',
      '--video-file', 'game.mp4'], io)).toBe(0)
    expect(out[0]).toContain('ffmpeg -i game.mp4 -filter_complex')
    expect(await main([`FROM "${insightsFile}" WHERE false`,
      '--out', 'ffmpeg', '--video-file', 'game.mp4'], io)).toBe(1)
    expect(err.at(-1)).toContain('nothing to cut')
  })

  test('--fast is no longer a flag; it fails as an unknown option', async () => {
    expect(await main([QUERY, '--out', 'ffmpeg',
      '--video-file', 'game.mp4', '--fast'], io)).toBe(1)
    expect(err[0]).toContain("'--fast'")
    expect(err[0]).toContain(USAGE)
  })

  test('unknown --out fails; unsupported insights warn on stderr', async () => {
    expect(await main([QUERY, '--out', 'yaml'], io)).toBe(1)
    fs.writeFileSync(path.join(dir, 'old.json'),
      JSON.stringify({ version: '2.9.0', rallies: [] }))
    expect(await main([`FROM "${dir}" WHERE shot.speed = 50`], io)).toBe(0)
    expect(err.at(-1)).toContain('unsupported insights version')
    expect(JSON.parse(out.at(-1)).selectedShots).toHaveLength(1)
  })

  test('malformed insights files warn on stderr instead of crashing', async () => {
    fs.writeFileSync(path.join(dir, 'bad.json'),
      JSON.stringify({ version: '4.2.0', rallies: 'nope' }))
    expect(await main([`FROM "${dir}" WHERE shot.speed = 50`], io)).toBe(0)
    expect(err.at(-1)).toContain('malformed insights JSON')
    expect(JSON.parse(out.at(-1)).selectedShots).toHaveLength(1)
  })
})
