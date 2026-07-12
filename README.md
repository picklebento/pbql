# PBQL: Pickleball Query Language

PBQL is a SQL-like language for querying shots in pickleball games analyzed
by [PB Vision](https://pb.vision). A query names the videos or folders to
search, filters shots by their properties, attaches surrounding context, and
orders/limits the results:

```sql
FROM folder(92)
WHERE shot.type = "drop" AND hitter = me AND shot.quality.overall >= 0.8
CONTEXT BEFORE 1 shot
CONTEXT AFTER 2secs
ORDER BY shot.speed DESC
LIMIT 50
```

Selected shots can drive the Shot Explorer in the PB Vision web app, be
exported as JSON/CSV, or be turned into an EDL or ffmpeg command that cuts
the clips into a reel.

## Status

Early development. The lexer and parser work (see the kitchen-sink query in
`test/demo.pbql`); the evaluation engine, outputs, and CLI are being built.

## Getting started

```bash
yarn setup      # install dependencies
yarn build      # compile the nearley grammar
yarn test       # run unit tests (builds first)
yarn lint       # eslint, zero warnings allowed
yarn coverage   # tests + coverage (100% thresholds)

node scripts/run-lexer.js  [query.pbql]  # print the token stream
node scripts/run-parser.js [query.pbql]  # print the AST as JSON
```

## Usage

```js
import { parse } from '@pbvision/pbql'

const { ast, errors } = parse('FROM folder(1) WHERE shot.isVolley')
if (errors) {
  // [{ code, message, line, col, length }]
}
```

## Project layout

| Path | What it is |
|---|---|
| `src/lang/` | lexer (moo), grammar (`pbql.ne`, compiled by `yarn build`), `parse()` |
| `src/index.js` | package entry |
| `test/` | jest unit tests + `demo.pbql` and its golden AST |
| `scripts/` | grammar build + demo runners |


## License

[Apache-2.0](LICENSE)
