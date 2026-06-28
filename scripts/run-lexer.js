import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import lexer from '../src/lang/lexer.js'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = process.argv[2] ?? path.join(repoRoot, 'test', 'demo.pbql')

lexer.reset(fs.readFileSync(file, 'utf8'))
let token
while ((token = lexer.next()) !== undefined) {
  console.log(`${token.line}:${token.col} ${token.type} ${JSON.stringify(token.value)}`)
}
