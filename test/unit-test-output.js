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
  test('emits the Shot-Explorer shape in seconds', () => {
    const result = runQuery({
      text: 'SELECT shot.num FROM video("x") WHERE shot.speed = 50 CONTEXT BEFORE 1 shots',
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
})

describe('CSV', () => {
  test('escapes per RFC 4180', () => {
    expect(toCSV(['a', 'b,c'], [['x,y', 'he said "hi"'], [null, 3]]))
      .toBe('a,"b,c"\r\n"x,y","he said ""hi"""\r\n,3\r\n')
  })

  test('shot lists get fixed columns; SELECT results use theirs', () => {
    const result = runQuery({
      text: 'FROM video("x") WHERE shot.speed = 50',
      games: [makeDoublesGame()]
    })
    expect(shotsToCSV(result)).toBe(
      'vid,sessionIdx,rallyIdx,shotIdx,hitTimeSecs,windowStartSecs,windowEndSecs\r\n' +
      'testvid00001,0,2,2,58,58,59\r\n')
    const selected = runQuery({
      text: 'SELECT count() FROM video("x") WHERE true',
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

  test('handles hour-scale timecodes and defaults to 30fps', () => {
    const edl = toEDL({ title: 'T', clips: [{ sMs: 3661000, eMs: 3662000 }], fps: 30 })
    expect(edl).toContain('01:01:01:00 01:01:02:00')
    expect(toEDL({ title: 'T', clips: [{ sMs: 0, eMs: 1000 }] }))
      .toContain('00:00:00:00 00:00:01:00')
  })
})

describe('ffmpegCommands', () => {
  const clips = [{ sMs: 500, eMs: 2000 }, { sMs: 10000, eMs: 12500 }]

  test('precise mode emits one frame-accurate filter_complex command', () => {
    const { steps, concatList } = ffmpegCommands({
      input: 'in.mp4', clips, output: 'out.mp4'
    })
    expect(concatList).toBeUndefined()
    expect(steps).toHaveLength(1)
    const [{ argv, command }] = steps
    expect(argv[0]).toBe('ffmpeg')
    const filter = argv[argv.indexOf('-filter_complex') + 1]
    expect(filter).toContain('[0:v]trim=start=0.500:end=2.000,setpts=PTS-STARTPTS[v0]')
    expect(filter).toContain('[0:a]atrim=start=10.000:end=12.500,asetpts=PTS-STARTPTS[a1]')
    expect(filter).toContain('[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]')
    expect(command).toContain("-filter_complex '")
  })

  test('fast mode emits per-clip copies plus a concat step', () => {
    const { steps, concatList } = ffmpegCommands({
      input: 'in.mp4', clips, output: 'out.mp4', mode: 'fast'
    })
    expect(steps).toHaveLength(3)
    expect(steps[0].command).toBe('ffmpeg -ss 0.500 -to 2.000 -i in.mp4 -c copy clip0.mp4')
    expect(steps[2].command).toBe('ffmpeg -f concat -safe 0 -i clips.txt -c copy out.mp4')
    expect(concatList).toBe("file 'clip0.mp4'\nfile 'clip1.mp4'\n")
  })

  test('refuses an empty clip list; quotes tricky args', () => {
    expect(() => ffmpegCommands({ input: 'in.mp4', clips: [], output: 'o.mp4' }))
      .toThrow('no clips')
    expect(toCommandString(['ffmpeg', '-i', "it's here.mp4"]))
      .toBe("ffmpeg -i 'it'\\''s here.mp4'")
  })
})

describe('CLI main()', () => {
  let dir, insightsFile, out, err, io
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbql-test-'))
    insightsFile = path.join(dir, 'testvid00001.json')
    fs.writeFileSync(insightsFile, JSON.stringify(makeDoublesInsights()))
    out = []
    err = []
    io = { stdout: t => out.push(t), stderr: t => err.push(t) }
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  const QUERY = 'FROM video("testvid00001") WHERE shot.speed = 50 CONTEXT BEFORE 1secs'

  test('--help prints usage', () => {
    expect(main(['--help'], io)).toBe(0)
    expect(out[0]).toBe(USAGE)
  })

  test('bad invocations fail with guidance', () => {
    expect(main([], io)).toBe(1)
    expect(err[0]).toContain('expected a query')
    expect(main(['q', 'extra', '--insights', insightsFile], io)).toBe(1)
    expect(main(['--nope'], io)).toBe(1)
  })

  test('without --insights, FROM names local files and folders', () => {
    expect(main([`FROM video("${insightsFile}") WHERE shot.speed = 50`], io))
      .toBe(0)
    expect(JSON.parse(out[0]).selectedShots[0]).toMatchObject({
      vid: 'testvid00001', sessionIdx: 0, rallyIdx: 2, shotIdx: 2
    })
    expect(main([`FROM folder("${dir}") WHERE shot.speed = 50`], io)).toBe(0)
    expect(JSON.parse(out[1]).selectedShots).toHaveLength(1)
  })

  test('local source failures exit 1 with the offending path', () => {
    expect(main(['FROM video("missing.json") WHERE true'], io)).toBe(1)
    expect(err[0]).toContain('video("missing.json"): no such insights file')
    expect(main(['FROM folder(1) WHERE true'], io)).toBe(1)
    expect(err[1]).toContain('folder(1) names a pb.vision library folder')
    expect(main(['FROM @'], io)).toBe(1) // parse errors still report positions
    expect(err[2]).toBe('1:6 PBQL_LEX_ERROR: unrecognized text')
  })

  test('query errors print with positions and exit 1', () => {
    expect(main(['FROM folder(1) WHERE shot.isVoley', '--insights', insightsFile], io))
      .toBe(1)
    expect(err[0]).toContain('PBQL_UNKNOWN_PROPERTY')
    expect(err[0]).toContain('did you mean "isVolley"?')
    expect(main(['FROM @', '--insights', insightsFile], io)).toBe(1)
    expect(err[1]).toBe('1:6 PBQL_LEX_ERROR: unrecognized text') // no hint suffix
  })

  test('default JSON output; vid defaults to the file basename', () => {
    expect(main([QUERY, '--insights', insightsFile], io)).toBe(0)
    const json = JSON.parse(out[0])
    expect(json.selectedShots).toHaveLength(1)
    expect(json.selectedShots[0]).toMatchObject({
      vid: 'testvid00001', rallyIdx: 2, shotIdx: 2, window: { sSecs: 57, eSecs: 59 }
    })
  })

  test('reads the query from a file; honors --vid/--session/--me', () => {
    const queryFile = path.join(dir, 'q.pbql')
    fs.writeFileSync(queryFile, 'FROM video("v") WHERE hitter = me')
    expect(main(['-f', queryFile, '--insights', insightsFile,
      '--vid', 'customvid001', '--session', '1', '--me', '1'], io)).toBe(0)
    const json = JSON.parse(out[0])
    expect(json.selectedShots).toHaveLength(2) // Bob's shots
    expect(json.selectedShots[0]).toMatchObject({ vid: 'customvid001', sessionIdx: 1 })
  })

  test('se output prints explore deep links', () => {
    expect(main([QUERY, '--insights', insightsFile, '--out', 'se',
      '--host', 'https://pbv-dev.web.app'], io)).toBe(0)
    expect(out[0]).toBe(
      'https://pbv-dev.web.app/video/testvid00001/0/explore?shots=3.3&numAfter=0')
  })

  test('csv and edl outputs', () => {
    expect(main([QUERY, '--insights', insightsFile, '--out', 'csv'], io)).toBe(0)
    expect(out[0]).toContain('vid,sessionIdx,rallyIdx')
    expect(main([QUERY, '--insights', insightsFile, '--out', 'edl'], io)).toBe(0)
    expect(out[1]).toContain('FCM: NON-DROP FRAME')
  })

  test('ffmpeg output requires --video-file and selected shots', () => {
    expect(main([QUERY, '--insights', insightsFile, '--out', 'ffmpeg'], io)).toBe(1)
    expect(err[0]).toContain('--video-file')
    expect(main([QUERY, '--insights', insightsFile, '--out', 'ffmpeg',
      '--video-file', 'game.mp4'], io)).toBe(0)
    expect(out[0]).toContain('ffmpeg -i game.mp4 -filter_complex')
    expect(main(['FROM video("v") WHERE false', '--insights', insightsFile,
      '--out', 'ffmpeg', '--video-file', 'game.mp4'], io)).toBe(1)
    expect(err.at(-1)).toContain('nothing to cut')
  })

  test('ffmpeg --fast prints the concat list as comments', () => {
    expect(main([QUERY, '--insights', insightsFile, '--out', 'ffmpeg',
      '--video-file', 'game.mp4', '--fast', '--output-file', 'reel.mp4'], io)).toBe(0)
    expect(out[0]).toContain('# write this to clips.txt first:')
    expect(out[1]).toContain('reel.mp4')
  })

  test('unknown --out fails; unsupported insights warn on stderr', () => {
    expect(main([QUERY, '--insights', insightsFile, '--out', 'yaml'], io)).toBe(1)
    const oldFile = path.join(dir, 'old.json')
    fs.writeFileSync(oldFile, JSON.stringify({ version: '2.9.0', rallies: [] }))
    expect(main([QUERY, '--insights', `${insightsFile},${oldFile}`], io)).toBe(0)
    expect(err.at(-1)).toContain('unsupported insights version')
  })
})
