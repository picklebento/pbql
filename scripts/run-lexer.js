import fs from 'node:fs'

import pbqlLexer from '../src/lexer.js'

const testText = fs.readFileSync('../test/demo.pbql').toString()

pbqlLexer.reset(testText)
while (true) {
  const token = pbqlLexer.next()
  if (token === undefined) {
    break
  }
  console.log({ type: token.type, value: token.value })
}
