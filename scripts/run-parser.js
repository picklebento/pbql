import fs from 'node:fs'

import nearley from 'nearley'

import grammar from '../src/grammar-generated.js'

const parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar))

const testText = fs.readFileSync('../test/demo.pbql').toString()

function die (reason) {
  console.error(reason)
  process.exit(1)
}

try {
  parser.feed(testText)
} catch (parseError) {
  die('parse error: ' + JSON.stringify(parseError))
}
if (parser.results) {
  if (parser.results.length > 1) {
    die('unexpected: grammar is ambiguous')
  }
  if (parser.results.length === 0) {
    die('unexpected: no parse results')
  }
  console.log(JSON.stringify(parser.results[0]))
}
