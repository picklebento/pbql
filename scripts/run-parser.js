import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from '../src/index.js'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = process.argv[2] ?? path.join(repoRoot, 'test', 'demo.pbql')

const { ast, errors } = parse(fs.readFileSync(file, 'utf8'))
if (errors) {
  console.error(JSON.stringify(errors, null, 2))
  process.exit(1)
}
console.log(JSON.stringify(ast, null, 2))
