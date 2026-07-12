# The PBQL Language, v0.1 (draft)

PBQL selects shots from pickleball games analyzed by PB Vision. This document
is the normative spec: the grammar in `src/lang/pbql.ne` implements it, and
every deviation is a bug. Property-by-property details live in the generated
[data dictionary](data-dictionary.md).

## 1. Overall shape

```sql
[SELECT expr [AS "label"] [, ...]]
FROM "source" [, ...]
WHERE condition
[CONTEXT BEFORE duration]
[CONTEXT AFTER duration]
[ORDER BY expr [ASC|DESC] [, ...]]
[LIMIT n]
```

A query conceptually builds one row per **shot** across all games named by
`FROM`, keeps the rows where `WHERE` evaluates to `true`, widens each kept
shot's video window per `CONTEXT`, sorts, limits, and outputs. Without
`SELECT`, the output is the selected shots themselves (for the Shot Explorer,
EDL, or ffmpeg); with `SELECT`, it is one projected row per shot (CSV/JSON),
or a single row if every selected expression is an aggregate. `SELECT` is
specified here for completeness but is not implemented until milestone M6.

## 2. Lexical structure

- **Keywords** are case-insensitive (`FROM` ≡ `from` ≡ `From`). Canonical
  form is UPPERCASE for clause keywords and lowercase for everything else.
  Multi-word keywords (`CONTEXT BEFORE`, `CONTEXT AFTER`,
  `ORDER BY`) allow any whitespace between the words.
- **Identifiers** (property names, function names) are case-sensitive:
  `shot.isVolley`, not `shot.isvolley`.
- **Numbers**: integer (`42`) and decimal (`3.5`) literals, always
  non-negative at the token level; negation is the unary `-` operator.
- **Strings**: double-quoted; `\"` and `\\` are the only escapes; no
  newlines inside strings.
- **Booleans**: `true`, `false`.
- **Comments**: `#` to end of line.
- **Reserved words may still be used as property names**: keywords are
  allowed as path segments after a `.` (`shot.from.x` works even though
  `FROM` is a keyword).

### Aliases (accepted and canonicalized, never printed)

| You may write | Canonical |
|---|---|
| `<>` | `!=` |
| `==` | `=` |
| `seconds`, `sec` | `secs` |
| `shot` (duration unit) | `shots` |
| `f(x, ...)` for a method | `x.f(...)` |

## 3. Operators and precedence

Highest to lowest; comparisons do not chain (`a < b < c` is an error).

1. property access / indexing / calls — `shot[-1].speed`, `x.f(y)`, `f(y)`
2. unary minus — `-x`
3. `*`, `/`
4. `+`, `-`
5. comparisons — `=`, `!=`, `<`, `<=`, `>`, `>=`, `IN (v, ...)`
6. `NOT`
7. `AND`
8. `OR`

`AND`/`OR` are left-associative; parentheses group as usual. `x IN (a, b, c)`
is exactly `x = a OR x = b OR x = c`.

## 4. Types and unknown

Values are **numbers**, **strings**, **booleans**, **players**, **positions**
(objects with coordinate properties), and **unknown**.

The insights data omits anything the AI could not determine, so missing data
is a first-class concept with SQL-style three-valued logic:

- A property whose underlying data is absent evaluates to **unknown**; so
  does any out-of-range reference (`shot[-1]` on a rally's first shot).
- Any comparison or arithmetic with an unknown operand is unknown.
- Kleene logic: `NOT unknown = unknown`; `unknown AND false = false`;
  `unknown AND true = unknown`; `unknown OR true = true`;
  `unknown OR false = unknown`.
- `WHERE` keeps a shot only if the condition is **true** (not unknown).
- `exists(expr)` is `true`/`false`, never unknown: whether `expr` has a
  value.

Consequence worth memorizing: `NOT shot.isVolley` does *not* match shots
where volley-ness is unknown; write `NOT exists(shot.isVolley) OR NOT
shot.isVolley` if you want them too.

Comparisons require matching types (comparing a number to a string is a
validation error, not `false`). Strings compare case-sensitively with `=`
and `!=` only. Players compare with `=`/`!=` by identity (`hitter = me`).

## 5. Objects

### 5.1 `shot`, and relative shots `shot[k]`

The shot being tested. `shot[-1]`/`shot[2]` are the shots k earlier/later
**within the same rally**; beyond the rally's bounds every property of the
reference is unknown. `shot` ≡ `shot[0]`.

Time properties (`shot.hitTime`, `shot.endTime`) are **seconds** (float)
into the video. Distances are **feet**, speeds **mph**, angles **degrees**,
quality/confidence **0–1**.

Positions: `shot.from` (where the ball was struck), `shot.to` (where its
flight ended), `shot.peak` (apex). Each has hitter-relative coordinates
`x`/`y`/`z` — mirrored so the hitter's own baseline is `y = 0`, the net is
`y = 22`, and `x` grows toward the hitter's right (0–20) — plus raw court
coordinates `absX`/`absY`/`absZ` (origin at the far-left corner relative to
the camera). `shot.from.zone` / `shot.to.zone` give the depth zone
(`"deep"|"mid"|"short"|"kitchen"|"net"|"out"`).

### 5.2 `rally`, and relative rallies `rally[k]`

The rally containing the current shot; `rally[-1]`/`rally[1]` are neighbors
within the same game (unknown beyond the game). `rally.num` is 1-based.

### 5.3 `game`

The session (one game of a possibly multi-game video) containing the shot.
There is no relative game access.

### 5.4 Players

`hitter` is the player who hit the current shot; `me` is the querying user
(resolved by the host application; unknown if the user isn't tagged in the
game). Relative references derive from either root: `myTeammate`,
`myOpponent1`, `myOpponent2`, `myOpponentLHS`, `myOpponentRHS`, and
`hittersTeammate`, `hittersOpponent1`, …

- `Opponent1`/`Opponent2` are the opposing players in player-id order.
- `OpponentLHS`/`OpponentRHS` are the opponents by side at the moment the
  current shot was hit: LHS is the opponent on the reference player's left
  as they face the net. If positions are unknown at that moment, these
  references are unknown.
- In singles, all `Teammate` references are unknown, and `Opponent2` is
  unknown.

Player properties include `id`, `team`, `name`, position (`pos.x`/`pos.y`
in the player's own frame, `pos.absX`/`pos.absY` raw) at the current shot's
hit time, and derived distances (`feetToKitchen`, `distanceToNet`, …).

### 5.5 Calling conventions (D16)

- **Zero-argument derived values are plain properties**: `hitter.feetToKitchen`.
- **Predicates about one subject take arguments as methods**:
  `shot.taggedWith("Alex*")`, `shot.inHighlight("atp")`. Writing the same
  call function-style (`taggedWith(shot, "Alex*")`) is accepted and
  canonicalized.
- **Subject-less utilities are functions**: `min(a, b)`, `max(a, b)`,
  `exists(x)`, `abs(x)`.

Every built-in receives the evaluation context implicitly; user-visible
signatures never mention it.

### 5.6 `taggedWith(pattern)`

Matches against the player-tagging data (PB Vision `/user/tag`). On a shot,
it tests the hitter; on a player reference, that player. If `pattern`
contains `@` it is an email and must match exactly (case-insensitive);
otherwise it is a name pattern, case-insensitive, where `*` matches any run
of characters (`"Alex*"`). Unknown when the game has no tag data.

## 6. Clauses

### 6.1 FROM

```sql
FROM "83gyqyc10y8f", "jhc3t8h8b5cj:2", "games/*.json"
```

`FROM` takes one or more **quoted strings**. The strings are opaque to the
language: each host interprets them (the pb.vision app queries the
video/session it is showing; the CLI resolves them as below). PBQL only
requires that each source resolve to whole games of insights data.

The CLI interprets each source string with exactly one rule, the first
that applies:

1. **pb.vision video** — the string matches `^[a-z0-9]{12}(:[0-9]+)?$`: a
   12-character video id with an optional **1-based** session number
   (`"83gyqyc10y8f"` is the first game; `"83gyqyc10y8f:2"` the second).
   The CLI asks the pb.vision service for the video's engine version, then
   fetches its insights from the public production bucket; unknown,
   unprocessed, still-processing, or failed videos — and sessions that
   don't exist — are reported clearly. Fetched insights are **cached with
   no expiration** in `$XDG_CACHE_HOME/pbql` (default `~/.cache/pbql`),
   one file per game (`{vid}-{session}.json`, session 1-based), and the
   cache is preferred: a hit skips the network entirely. To refetch a
   game, delete its cache file (or the whole directory) — there is
   deliberately no refresh flag.
2. **file** — an existing file is one insights JSON. A local file is a
   whole game, so sessions do not apply. A file whose name happens to look
   like a video id must be written with a path prefix: `"./83gyqyc10y8f"`.
3. **directory** — an existing directory contributes every `*.json` file
   beneath it, recursively.
4. **glob** — anything else is a glob pattern (`"games/*.json"`,
   `"**/court-2/*.json"`), matched relative to the current directory.

### 6.2 WHERE

Any boolean-valued expression per §3–§5. Required (use `WHERE true` for
everything).

### 6.3 CONTEXT

```sql
CONTEXT BEFORE min(1 shot, 2secs)
CONTEXT AFTER 3secs
CONTEXT BEFORE rally
```

Each selected shot has a video window, by default the shot's own flight
(`hitTime`…`endTime` plus the host's presentation padding). `CONTEXT`
widens it; durations are **positive magnitudes** (direction comes from
BEFORE/AFTER):

- `N shots` — include the N previous (or following) shots **in the same
  rally**; those shots also join the result marked as context. Clamped to
  the rally: on a rally's second shot, `BEFORE 5 shots` includes only one.
- `X secs` — stretch the window by X seconds of video time. May spill past
  the rally's own start/end by at most `maxSecsBeyondRally` (an engine
  option, default **3s**), and never past the video's bounds.
- `rally` — to the rally's boundary (what the Shot Explorer calls
  `numBefore=999`).
- `min(a, b)` / `max(a, b)` — resolve each alternative **per shot** to a
  concrete magnitude, then take the smaller (`min` = cap) or larger
  (`max` = floor). Same meaning for BEFORE and AFTER.

Worked example: the selected shot is hit at 90.0s; the previous shot starts
at 86.5s. `BEFORE min(1 shot, 2secs)`: the candidates are 3.5s (to include
the previous shot) and 2.0s; `min` picks 2.0s, so the window opens at 88.0s
and no context shot is added (the previous shot isn't fully included).
`BEFORE max(1 shot, 2secs)` picks 3.5s: the window opens at 86.5s and the
previous shot joins as context.

Omitted clauses default to `BEFORE 0` / `AFTER 0`. Overlapping windows of
adjacent selected shots are merged by the engine when producing clip lists.

### 6.4 ORDER BY

```sql
ORDER BY shot.speed DESC, shot.hitTime
```

Stable sort across all games; `ASC` is the default; unknown values sort
last regardless of direction. Without `ORDER BY`, results keep video order
(by game, rally, shot).

### 6.5 LIMIT

`LIMIT n` keeps the first n rows after ordering, across all games.

### 6.6 SELECT (specified now, implemented in M6)

```sql
SELECT hitter.name, shot.speed AS "mph", shot.type
```

One row per selected shot; `AS "label"` names the output column (labels are
purely cosmetic — units never change). Aggregates `count()`, `sum(x)`,
`avg(x)`, `min(x)`, `max(x)` collapse the result to a single row; mixing
aggregate and non-aggregate expressions is a validation error (there is no
GROUP BY). Aggregates skip unknown inputs; `count()` counts selected shots.

## 7. Errors

Every phase (lex, parse, validate, evaluate) reports
`{ code, message, line, col, length, hint? }` with 1-indexed positions.
Codes are stable strings (`PBQL_LEX_ERROR`, `PBQL_PARSE_ERROR`,
`PBQL_UNEXPECTED_END`, `PBQL_UNKNOWN_PROPERTY`, `PBQL_TYPE_MISMATCH`, …).
Unknown property names come with a nearest-match hint
(`did you mean "isVolley"?`).

## 8. Data requirements

The engine evaluates PB Vision **insights** JSON, latest major version
(4.x), augmented field names. Older files are skipped and reported. Player
names, the identity of `me`, and tag data come from the host application —
they are not part of the insights file. Queries never reference raw insights
field names; the [data dictionary](data-dictionary.md) is the complete
public surface.
