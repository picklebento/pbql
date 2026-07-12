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

  test('file sources load one game each, vid = basename sans .json', () => {
    const games = resolveSources([path.join(dir, 'a.json')]) // abs, default cwd
    expect(games).toHaveLength(1)
    expect(games[0]).toMatchObject({ vid: 'a', sessionIdx: 0 })
    expect(games[0].insights.version).toBe('4.5.0')
  })

  test('relative paths resolve against the cwd option', () => {
    const games = resolveSources(['sub/b.json'], { cwd: dir })
    expect(games.map(g => g.vid)).toEqual(['b'])
  })

  test('directory sources collect *.json recursively, sorted by path', () => {
    const games = resolveSources(['.'], { cwd: dir })
    expect(games.map(g => g.vid)).toEqual(['a', 'b', 'c']) // notes.txt skipped
    expect(games.every(g => g.sessionIdx === 0)).toBe(true)
  })

  test('anything else is a glob; matched directories are skipped', () => {
    expect(resolveSources(['sub/**/*.json'], { cwd: dir }).map(g => g.vid))
      .toEqual(['b', 'c'])
    // sub/* matches the deeper/ directory too; only files load
    expect(resolveSources(['*.json', 'sub/*'], { cwd: dir }).map(g => g.vid))
      .toEqual(['a', 'b'])
  })

  test('sources that match nothing name the offending string', () => {
    expect(() => resolveSources(['nowhere/*.json'], { cwd: dir }))
      .toThrow('"nowhere/*.json" matched nothing')
    expect(() => resolveSources(['missing.json'], { cwd: dir }))
      .toThrow('"missing.json" matched nothing')
  })

  test('vid-shaped sources are pb.vision videos: fetch not yet supported', () => {
    for (const source of ['ab12cd34ef56', 'ab12cd34ef56:2']) {
      expect(() => resolveSources([source], { cwd: dir })).toThrow(
        `"${source}": fetching insights by video id is not yet supported`)
    }
    // ...but a "./" prefix makes it the local file it names (documented)
    const games = resolveSources(['./ab12cd34ef56'], { cwd: dir })
    expect(games[0]).toMatchObject({ vid: 'ab12cd34ef56', sessionIdx: 0 })
    expect(games[0].insights.session.vid).toBe('testvid00002') // singles fixture
  })

  test('session numbers are 1-based; :0 is rejected', () => {
    expect(() => resolveSources(['ab12cd34ef56:0'], { cwd: dir }))
      .toThrow('"ab12cd34ef56:0": session numbers are 1-based')
  })

  test('multiple sources concatenate in FROM order', () => {
    const games = resolveSources(['sub/deeper', 'a.json'], { cwd: dir })
    expect(games.map(g => g.vid)).toEqual(['c', 'a'])
  })
})
