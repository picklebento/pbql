# PBQL: Pickleball Query Language

PBQL is a SQL-like language for querying shots in pickleball games analyzed
by [PB Vision](https://pb.vision). A query names the videos or folders to
search, filters shots by their properties, attaches surrounding context, and
orders/limits the results:

```sql
FROM "games/*.json"
WHERE shot.type = "drop" AND hitter = me AND shot.quality.overall >= 0.8
CONTEXT BEFORE 1 shot
CONTEXT AFTER 2secs
ORDER BY shot.speed DESC
LIMIT 50
```

Selected shots can drive the Shot Explorer in the PB Vision web app, be
exported as JSON/CSV, or be turned into an EDL or ffmpeg command that cuts
the clips into a reel.

Docs and a browser playground: https://pbv-public.github.io/pbql/

## Status

Working library and CLI: lexer, parser, analyzer, evaluation engine, and
outputs (see the kitchen-sink query in `test/demo.pbql`).

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

Run a query from the CLI — `FROM` sources are quoted strings: a pb.vision
video id (`"83gyqyc10y8f"`, optionally `":2"` for the second game — insights
are fetched from production and cached without expiration in
`$XDG_CACHE_HOME/pbql`, default `~/.cache/pbql`; delete a game's file, or
the directory, to refetch), else a local file (one insights JSON), an
existing directory (every `*.json` beneath it), or a glob:

```bash
node bin/pbql.js 'FROM "game.json" WHERE shot.isVolley' --out csv
node bin/pbql.js 'FROM "games/*.json" WHERE hitter = me' --me 0 --out edl
```

## Usage

```js
import { parse } from '@pbvision/pbql'

const { ast, errors } = parse('FROM "game.json" WHERE shot.isVolley')
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
