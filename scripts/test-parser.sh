#!/bin/bash
set -o errexit
set -o nounset

cd "`dirname \"$0\"`"

# create non esm version of lexer file
nonESMLexerJS=../src/lexer-non-esm.cjs
echo "const moo = require('moo')" > $nonESMLexerJS
cat ../src/lexer.js | fgrep -v 'import moo' | fgrep -v 'export default' >> $nonESMLexerJS
echo 'module.exports = lexer' >> $nonESMLexerJS

# create non esm version of the grammar file
cat ../src/pbql.ne | fgrep -v '@preprocessor module' | sed s/lexer.js/lexer-non-esm.cjs/ > /tmp/pbql-for-test.ne

# compile the non esm grammar file
yarn nearleyc /tmp/pbql-for-test.ne -o ./src/pbql-for-test.cjs

# run nearley-test on the non esm grammar file (it doesn't support esm)
set +o errexit
yarn nearley-test ./src/pbql-for-test.cjs < ../test/demo.pbql
rm ../src/pbql-for-test.cjs $nonESMLexerJS
