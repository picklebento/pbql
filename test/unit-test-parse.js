import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from '../src/index.js'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function read (...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), 'utf8')
}

describe('parse()', () => {
  test('parses the kitchen-sink demo query to exactly the golden AST', () => {
    const { ast, errors } = parse(read('test', 'demo.pbql'))
    expect(errors).toBeUndefined()
    const golden = JSON.parse(read('test', 'corpus', 'demo-ast.json'))
    expect(ast).toEqual(golden)
  })

  test('parses a minimal query and applies defaults', () => {
    const { ast, errors } = parse('FROM folder(1) WHERE true')
    expect(errors).toBeUndefined()
    expect(ast.sources).toEqual([{ fid: 1 }])
    expect(ast.where).toEqual({ value: true })
    // omitted clauses default to no context, no ordering, no limit
    expect(ast.context).toEqual({
      before: { durationExpr: 0, isSeconds: true },
      after: { durationExpr: 0, isSeconds: true }
    })
    expect(ast.order).toBeNull()
    expect(ast.limit).toBeNull()
  })

  test('reports unrecognized text with its position', () => {
    const { ast, errors } = parse('FROM @')
    expect(ast).toBeUndefined()
    expect(errors).toEqual([{
      code: 'PBQL_LEX_ERROR',
      message: 'unrecognized text',
      line: 1,
      col: 6,
      length: 1
    }])
  })

  test('reports an unexpected token with its position and length', () => {
    const { errors } = parse('FROM FROM')
    expect(errors).toEqual([{
      code: 'PBQL_PARSE_ERROR',
      message: 'unexpected "FROM"',
      line: 1,
      col: 6,
      length: 4
    }])
  })

  test('reports an incomplete query at the end of the input', () => {
    const { errors } = parse('FROM video("x")\nWHERE')
    expect(errors).toEqual([{
      code: 'PBQL_UNEXPECTED_END',
      message: 'query ended unexpectedly (incomplete statement)',
      line: 2,
      col: 6,
      length: 0
    }])
  })
})
