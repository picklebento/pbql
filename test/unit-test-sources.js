import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { resolveLocalSources } from '../src/index.js'

import { makeDoublesInsights, makeSinglesInsights } from './fixtures/make-insights.js'

describe('resolveLocalSources', () => {
  let dir
  beforeEach(() => {
    // dir/
    //   a.json  notes.txt
    //   sub/b.json  sub/deeper/c.json
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbql-src-'))
    fs.mkdirSync(path.join(dir, 'sub', 'deeper'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'a.json'),
      JSON.stringify(makeDoublesInsights()))
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not insights')
    fs.writeFileSync(path.join(dir, 'sub', 'b.json'),
      JSON.stringify(makeSinglesInsights()))
    fs.writeFileSync(path.join(dir, 'sub', 'deeper', 'c.json'),
      JSON.stringify(makeDoublesInsights()))
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  test('video paths load one game each, vid = basename sans .json', () => {
    const games = resolveLocalSources([
      { kind: 'video', vid: path.join(dir, 'a.json') } // absolute, default cwd
    ])
    expect(games).toHaveLength(1)
    expect(games[0]).toMatchObject({ vid: 'a', sessionIdx: 0 })
    expect(games[0].insights.version).toBe('4.5.0')
  })

  test('relative paths resolve against the cwd option', () => {
    const games = resolveLocalSources(
      [{ kind: 'video', vid: 'sub/b.json' }], { cwd: dir })
    expect(games.map(g => g.vid)).toEqual(['b'])
  })

  test('missing video files name the offending path', () => {
    expect(() => resolveLocalSources(
      [{ kind: 'video', vid: 'nope.json' }], { cwd: dir }))
      .toThrow(/video\("nope\.json"\): no such insights file .*nope\.json/)
    // a directory is not an insights file either
    expect(() => resolveLocalSources(
      [{ kind: 'video', vid: 'sub' }], { cwd: dir }))
      .toThrow('video("sub"): no such insights file')
  })

  test('folder paths collect *.json recursively, sorted by path', () => {
    const games = resolveLocalSources(
      [{ kind: 'folder', path: '.', recursive: true }], { cwd: dir })
    expect(games.map(g => g.vid)).toEqual(['a', 'b', 'c']) // notes.txt skipped
    expect(games.every(g => g.sessionIdx === 0)).toBe(true)
  })

  test('folder("path", false) stays in the top directory', () => {
    const games = resolveLocalSources(
      [{ kind: 'folder', path: '.', recursive: false }], { cwd: dir })
    expect(games.map(g => g.vid)).toEqual(['a'])
  })

  test('missing or non-directory folder paths name the offending path', () => {
    expect(() => resolveLocalSources(
      [{ kind: 'folder', path: 'nowhere', recursive: true }], { cwd: dir }))
      .toThrow(/folder\("nowhere"\): no such directory .*nowhere/)
    expect(() => resolveLocalSources(
      [{ kind: 'folder', path: 'a.json', recursive: true }], { cwd: dir }))
      .toThrow('folder("a.json"): no such directory')
  })

  test('integer folder ids cannot resolve locally', () => {
    expect(() => resolveLocalSources([{ kind: 'folder', fid: 92 }], { cwd: dir }))
      .toThrow('folder(92) names a pb.vision library folder')
  })

  test('multiple sources concatenate in FROM order', () => {
    const games = resolveLocalSources([
      { kind: 'folder', path: 'sub', recursive: false },
      { kind: 'video', vid: 'a.json' }
    ], { cwd: dir })
    expect(games.map(g => g.vid)).toEqual(['b', 'a'])
  })
})
