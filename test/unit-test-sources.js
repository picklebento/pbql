import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { resolveSources } from '../src/index.js'

import { makeDoublesInsights, makeSinglesInsights } from './fixtures/make-insights.js'

describe('resolveSources', () => {
  let dir
  beforeEach(() => {
    // dir/
    //   a.json  notes.txt  ab12cd34ef56 (a file named like a vid)
    //   sub/b.json  sub/deeper/c.json
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbql-src-'))
    fs.mkdirSync(path.join(dir, 'sub', 'deeper'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'a.json'),
      JSON.stringify(makeDoublesInsights()))
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not insights')
    fs.writeFileSync(path.join(dir, 'ab12cd34ef56'),
      JSON.stringify(makeSinglesInsights()))
    fs.writeFileSync(path.join(dir, 'sub', 'b.json'),
      JSON.stringify(makeSinglesInsights()))
    fs.writeFileSync(path.join(dir, 'sub', 'deeper', 'c.json'),
      JSON.stringify(makeDoublesInsights()))
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  test('file sources load one game each, vid = basename sans .json', async () => {
    const games = await resolveSources([path.join(dir, 'a.json')]) // abs, default cwd
    expect(games).toHaveLength(1)
    expect(games[0]).toMatchObject({ vid: 'a', sessionIdx: 0 })
    expect(games[0].insights.version).toBe('4.5.0')
  })

  test('relative paths resolve against the cwd option', async () => {
    const games = await resolveSources(['sub/b.json'], { cwd: dir })
    expect(games.map(g => g.vid)).toEqual(['b'])
  })

  test('directory sources collect *.json recursively, sorted by path', async () => {
    const games = await resolveSources(['.'], { cwd: dir })
    expect(games.map(g => g.vid)).toEqual(['a', 'b', 'c']) // notes.txt skipped
    expect(games.every(g => g.sessionIdx === 0)).toBe(true)
  })

  test('anything else is a glob; matched directories are skipped', async () => {
    expect((await resolveSources(['sub/**/*.json'], { cwd: dir })).map(g => g.vid))
      .toEqual(['b', 'c'])
    // sub/* matches the deeper/ directory too; only files load
    expect((await resolveSources(['*.json', 'sub/*'], { cwd: dir })).map(g => g.vid))
      .toEqual(['a', 'b'])
  })

  test('empty or blank sources are rejected, never resolved as the cwd', async () => {
    for (const source of ['', ' ', '\t\n']) {
      await expect(resolveSources([source], { cwd: dir }))
        .rejects.toThrow('each FROM source must name a video id')
    }
  })

  test('sources that match nothing name the offending string', async () => {
    await expect(resolveSources(['nowhere/*.json'], { cwd: dir }))
      .rejects.toThrow('"nowhere/*.json" matched nothing')
    await expect(resolveSources(['missing.json'], { cwd: dir }))
      .rejects.toThrow('"missing.json" matched nothing')
  })

  test('a "./" prefix makes a vid-shaped name the local file it names', async () => {
    const games = await resolveSources(['./ab12cd34ef56'], { cwd: dir })
    expect(games[0]).toMatchObject({ vid: 'ab12cd34ef56', sessionIdx: 0 })
    expect(games[0].insights.session.vid).toBe('testvid00002') // singles fixture
  })

  test('session numbers are 1-based; :0 is rejected', async () => {
    await expect(resolveSources(['ab12cd34ef56:0'], { cwd: dir }))
      .rejects.toThrow('"ab12cd34ef56:0": session numbers are 1-based')
  })

  test('multiple sources concatenate in FROM order', async () => {
    const games = await resolveSources(['sub/deeper', 'a.json'], { cwd: dir })
    expect(games.map(g => g.vid)).toEqual(['c', 'a'])
  })

  describe('vid-shaped sources fetch insights from production', () => {
    const ENDPOINT =
      'https://api-2o2klzx4pa-uc.a.run.app/video/ai_engine_version'
    const BUCKET = 'https://storage.googleapis.com/pbv-pro'
    const realFetch = global.fetch
    const savedXdg = process.env.XDG_CACHE_HOME
    let calls, responses, cacheDir
    beforeEach(() => {
      calls = []
      responses = []
      global.fetch = async (url, opts) => {
        calls.push({ url, opts })
        return responses.shift()
      }
      // point the insights cache at a fresh temp dir (never the real one)
      cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbql-cache-'))
      process.env.XDG_CACHE_HOME = cacheDir
    })
    afterEach(() => {
      global.fetch = realFetch
      fs.rmSync(cacheDir, { recursive: true, force: true })
      if (savedXdg === undefined) {
        delete process.env.XDG_CACHE_HOME
      } else {
        process.env.XDG_CACHE_HOME = savedXdg
      }
    })

    const version = ver => new Response(
      JSON.stringify({ aiEngineVersion: ver }), { status: 200 })
    const insights = () => new Response(
      JSON.stringify(makeDoublesInsights()), { status: 200 })

    test('engines ≥ 133 have a 0-based session segment in the URL', async () => {
      responses = [version(190), insights()]
      const games = await resolveSources(['ab12cd34ef56:2'])
      expect(calls[0].url).toBe(ENDPOINT)
      expect(calls[0].opts).toMatchObject({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"vid":"ab12cd34ef56"}'
      })
      expect(calls[1].url).toBe(`${BUCKET}/ab12cd34ef56/190/1/insights.json`)
      expect(games).toHaveLength(1)
      expect(games[0]).toMatchObject({ vid: 'ab12cd34ef56', sessionIdx: 1 })
      expect(games[0].insights.version).toBe('4.5.0')
    })

    test('session defaults to 1; engines ≤ 132 have no session segment', async () => {
      responses = [version(190), insights(), version(120), insights()]
      const games = await resolveSources(['ab12cd34ef56', 'cd34ef56ab12:1'])
      expect(calls[1].url).toBe(`${BUCKET}/ab12cd34ef56/190/0/insights.json`)
      expect(calls[3].url).toBe(`${BUCKET}/cd34ef56ab12/120/insights.json`)
      expect(games.map(g => [g.vid, g.sessionIdx]))
        .toEqual([['ab12cd34ef56', 0], ['cd34ef56ab12', 0]])
    })

    test('sessions past the first never exist on engines ≤ 132', async () => {
      responses = [version(132)]
      const err = await resolveSources(['ab12cd34ef56:2']).catch(e => e)
      expect(err.message).toBe('"ab12cd34ef56:2": session 2 not found for this video')
      expect(err.cause.message).toBe('session 2 not found for this video')
      expect(calls).toHaveLength(1) // the bucket is never asked
    })

    test('bucket 404/403 (missing object) means the session does not exist',
      async () => {
        for (const status of [404, 403]) {
          responses = [version(190), new Response('nope', { status })]
          await expect(resolveSources(['ab12cd34ef56:3'])).rejects.toThrow(
            '"ab12cd34ef56:3": session 3 not found for this video')
        }
      })

    test('a fetch writes the cache; a hit then skips the network', async () => {
      responses = [version(190), insights()]
      await resolveSources(['ab12cd34ef56:2'])
      expect(calls).toHaveLength(2) // miss: version endpoint + bucket
      const file = path.join(cacheDir, 'pbql', 'ab12cd34ef56-2.json')
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).version).toBe('4.5.0')
      calls = []
      const games = await resolveSources(['ab12cd34ef56:2'])
      expect(calls).toHaveLength(0) // hit: no version call, no bucket fetch
      expect(games[0]).toMatchObject({ vid: 'ab12cd34ef56', sessionIdx: 1 })
      expect(games[0].insights.version).toBe('4.5.0')
    })

    test('a corrupt cache file is a miss: refetched and rewritten', async () => {
      const file = path.join(cacheDir, 'pbql', 'ab12cd34ef56-1.json')
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, '{not json')
      responses = [version(190), insights()]
      const games = await resolveSources(['ab12cd34ef56'])
      expect(calls).toHaveLength(2)
      expect(games[0].insights.version).toBe('4.5.0')
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).version).toBe('4.5.0')
    })

    test('the cache defaults to ~/.cache/pbql without XDG_CACHE_HOME',
      async () => {
        delete process.env.XDG_CACHE_HOME
        // jest sandboxes process.env, so $HOME edits never reach libuv's
        // homedir lookup — stub the shared node:os export instead
        const savedHomedir = os.homedir
        os.homedir = () => cacheDir
        try {
          responses = [version(190), insights()]
          await resolveSources(['ab12cd34ef56'])
          expect(fs.existsSync(path.join(
            cacheDir, '.cache', 'pbql', 'ab12cd34ef56-1.json'))).toBe(true)
        } finally {
          os.homedir = savedHomedir
        }
      })

    test('endpoint errors surface the service message and status', async () => {
      const rejectsSaying = async (status, body, expected) => {
        responses = [new Response(body, { status })]
        await expect(resolveSources(['ab12cd34ef56'])).rejects.toThrow(
          '"ab12cd34ef56": cannot fetch this video\'s insights — ' +
          `the pb.vision service says (HTTP ${status}): ${expected}`)
      }
      // unknown vid
      await rejectsSaying(404,
        '{"code":"NotFoundException","message":"Not found"}', 'Not found')
      // never processed / still processing / failed-or-aborted (400s)
      for (const message of [
        'video has not been processed',
        'video is still being processed',
        'video processing failed or was aborted']) {
        await rejectsSaying(400,
          JSON.stringify({ code: 'BadRequest', message }), message)
      }
      // non-JSON body: used verbatim
      await rejectsSaying(503, 'Service Unavailable', 'Service Unavailable')
      // JSON without a string message: raw body
      await rejectsSaying(500, '{"error":true}', '{"error":true}')
      // empty body: just the status
      await rejectsSaying(502, '', 'HTTP 502')
    })
  })
})
