#!/usr/bin/env node
import { main } from '../src/cli/main.js'

process.exitCode = main(process.argv.slice(2), {
  stdout: text => console.log(text),
  stderr: text => console.error(text)
})
