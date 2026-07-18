#!/bin/bash
# Compiles the nearley grammar (src/lang/pbql.ne) into src/lang/grammar-generated.js.
set -o errexit
set -o nounset

cd "$(dirname "$0")/.."

outputFile=src/lang/grammar-generated.js
tmpFile="$(mktemp)"
rm -f "$outputFile"
yarn -s nearleyc src/lang/pbql.ne -o "$tmpFile"
# the grammar header loads the lexer with require(); rewrite it as an ESM import
echo "import pbqlLexer from './lexer.js'" > "$outputFile"
grep -Fv 'require("./lexer.js")' "$tmpFile" >> "$outputFile"
rm "$tmpFile"
