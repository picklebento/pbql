# The PBQL CLI

Run PBQL queries from the command line against pb.vision videos or local
insights files. The query language is specified in [Language](language.md);
the complete property surface is the [Data Dictionary](data-dictionary.md).

```bash
node bin/pbql.js 'FROM "83gyqyc10y8f" WHERE shot.isVolley' --me 0 --out csv
node bin/pbql.js -f query.pbql --out edl
```

## Sources

`FROM` sources are quoted strings; the CLI interprets each with exactly one
rule, the first that applies:

1. **pb.vision video** — the string matches `^[a-z0-9]{12}(:[0-9]+)?$`: a
   12-character video id with an optional **1-based** session number
   (`"83gyqyc10y8f"` is the first game; `"83gyqyc10y8f:2"` the second).
   The CLI fetches the video's insights from the pb.vision service;
   unknown, unprocessed, still-processing, or failed videos — and sessions
   that don't exist — are reported clearly. Fetched insights are **cached
   with no expiration** in `$XDG_CACHE_HOME/pbql` (default
   `~/.cache/pbql`), one file per game (`{vid}-{session}.json`, session
   1-based), and the cache is preferred: a hit skips the network entirely.
   To refetch a game, delete its cache file (or the whole directory) —
   there is deliberately no refresh flag.
2. **file** — an existing file is one insights JSON. A local file is a
   whole game, so sessions do not apply. A file whose name happens to look
   like a video id must be written with a path prefix: `"./83gyqyc10y8f"`.
3. **directory** — an existing directory contributes every `*.json` file
   beneath it, recursively.
4. **glob** — anything else is a glob pattern (`"games/*.json"`,
   `"**/court-2/*.json"`), matched relative to the current directory.

## Options

| Flag | Meaning |
|---|---|
| `-f, --file <path>` | read the query from a file instead of the command line |
| `--me <playerIdx>` | which player (0–3) `me` refers to |
| `--out <format>` | `json` (default), `csv`, `edl`, `ffmpeg`, or `se` |
| `--video-file <path>` | source video path (required for `--out ffmpeg`) |
| `--output-file <path>` | cut video path for `--out ffmpeg` (default `cut.mp4`) |
| `--merge-gap <secs>` | merge clips closer than this (default 0.5) |
| `--max-secs-beyond-rally <n>` | `secs`-context spill limit (default 3) |

## Output formats

- **json** — the selected shots (or `SELECT` rows) as JSON, including each
  shot's video window and context shots.
- **csv** — one row per selected shot or `SELECT` row.
- **edl** — a CMX 3600 edit decision list cutting the selected clips
  back-to-back, at the queried video's frame rate (default 30). Import it
  into an editor to review the reel.
- **ffmpeg** — an ffmpeg command that cuts the clips from `--video-file`
  and concatenates them into `--output-file`. Clips closer together than
  `--merge-gap` seconds are merged into one.
- **se** — pb.vision Shot Explorer links carrying the query itself
  (`?q=`), one per video-id source in `FROM`.
