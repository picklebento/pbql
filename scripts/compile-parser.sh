#!/bin/bash
set -o errexit
set -o nounset

cd "`dirname \"$0\"`"

outputFile=../src/grammar-generated.js
tmpFile=/tmp/body.js
rm -f $outputFile
yarn nearleyc ./src/pbql.ne -o $tmpFile
# change generated grammar to use module rather than require()
echo "import pbqlLexer from './lexer.js'" > $outputFile
cat $tmpFile | fgrep -v 'const pbqlLexer =' >> $outputFile
rm $tmpFile
