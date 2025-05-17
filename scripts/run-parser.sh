#!/bin/bash
set -o errexit
set -o nounset

cd "`dirname \"$0\"`"
./compile-parser.sh
node --experimental-default-type module ./run-parser.js
