#!/bin/bash
set -o errexit
set -o nounset

cd "`dirname \"$0\"`"
node --experimental-default-type module ./run-lexer.js
