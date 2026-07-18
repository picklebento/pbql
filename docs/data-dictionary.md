# PBQL Data Dictionary

<!-- GENERATED FILE — do not edit. Run `yarn docs` to regenerate
     from src/model/registry.js. -->

The complete queryable surface. Any property may be **unknown** when the
underlying data was not detected — see the unknown-handling rules in
[language.md](language.md). `player.*` rows apply to every player
reference; positions are measured at the moment the current shot was hit.

## shot

The shot being tested. `shot[k]` addresses the shot k earlier/later in the same rally. `shot.hitter` navigates to the player who hit it.

| Property | Type | Unit / values | Description |
|---|---|---|---|
| `shot.hitter` | player | | the player who hit this shot |
| `shot.num` | number | 1-based | which shot of the rally this is (the serve is 1) |
| `shot.sequence` | string | "serve"|"return"|"3"|"4"|"5" | the common name for this shot's position in the rally; unknown from the 6th shot on |
| `shot.isFinal` | boolean |  | whether this is the rally's last shot |
| `shot.isVolley` | boolean |  | whether the ball was hit out of the air |
| `shot.isSpeedup` | boolean |  | whether the shot added significant pace near the kitchen |
| `shot.isReset` | boolean |  | whether the shot took significant pace off the ball |
| `shot.isPoach` | boolean |  | whether the hitter took a ball on their partner's side |
| `shot.isPassing` | boolean |  | whether the shot passed the nearest opponent untouched |
| `shot.isPutaway` | boolean |  | whether the shot was a putaway |
| `shot.type` | string | "smash"|"lob"|"dink"|"drop"|"drive"|"volley"|"reset"|"speedup" | the shot classification |
| `shot.verticalType` | string | "dig"|"topspin"|"slice"|"lob"|"neutral" | the vertical character of the stroke |
| `shot.strokeSide` | string | "left"|"right" | which side of the body the stroke was made on |
| `shot.winnerType` | string | "winner"|"ace"|"forced_fault"|"unforced_fault" | how this shot won the rally; unknown if it did not |
| `shot.quality.overall` | number | 0-1 | combined execution + selection quality (1 is best) |
| `shot.quality.execution` | number | 0-1 | how well the shot was executed |
| `shot.speed` | number | mph | ball speed after the hit |
| `shot.direction` | string | "DownTheMiddle"|"DownTheLineLeft"|… | named direction the ball traveled |
| `shot.yaw` | number | degrees | horizontal launch angle (0 = toward the hitter's left sideline, 90 = straight at the net) |
| `shot.pitch` | number | degrees | vertical launch angle (0 = flat, 90 = straight up) |
| `shot.distance` | number | feet | how far the ball flew before contact with anything |
| `shot.distanceFromBaseline` | number | feet | where the ball landed relative to the opponent's baseline |
| `shot.heightOverNet` | number | feet | ball height when crossing the net plane |
| `shot.crossedNet` | boolean |  | whether the ball crossed the plane of the net |
| `shot.confidence` | number | 0-1 | confidence in the reconstructed trajectory |
| `shot.hitTime` | number | seconds | when in the video the ball was struck |
| `shot.endTime` | number | seconds | when in the video the shot's flight ended |
| `shot.hasError` | boolean |  | whether any error was detected on this shot (never unknown) |
| `shot.errors.unforced` | boolean |  | whether the error was unforced |
| `shot.errors.popup` | string | "exploited"|"potential" | whether the shot popped the ball up (and whether opponents capitalized) |
| `shot.hasFault` | boolean |  | whether this shot committed a rule fault (never unknown) |
| `shot.errors.faults.net` | boolean |  | whether the net stopped the ball |
| `shot.errors.faults.short` | boolean |  | whether the serve/shot came up short |
| `shot.errors.faults.out.outcome` | string | "landed"|"intercepted" | whether the out ball landed or was played anyway |
| `shot.errors.faults.out.direction` | string | "left"|"right"|"long" | which way the ball went out |
| `shot.from.x` | number | feet | where the ball was struck — hitter-frame x (0-20, grows to the hitter's right) |
| `shot.from.y` | number | feet | where the ball was struck — hitter-frame y (own baseline 0, net 22) |
| `shot.from.z` | number | feet | where the ball was struck — height above the ground |
| `shot.from.absX` | number | feet | where the ball was struck — raw court x (far-left corner origin) |
| `shot.from.absY` | number | feet | where the ball was struck — raw court y (far-left corner origin) |
| `shot.from.absZ` | number | feet | where the ball was struck — height above the ground |
| `shot.from.feetToNearestSideline` | number | feet | where the ball was struck — distance to the nearest sideline |
| `shot.from.feetToNearestBaseline` | number | feet | where the ball was struck — distance to the nearest baseline |
| `shot.from.feetToNet` | number | feet | where the ball was struck — distance to the plane of the net |
| `shot.from.zone` | string | "deep"|"mid"|"short"|"kitchen"|"net"|"out" | depth zone the ball was struck from |
| `shot.to.x` | number | feet | where the ball's flight ended — hitter-frame x (0-20, grows to the hitter's right) |
| `shot.to.y` | number | feet | where the ball's flight ended — hitter-frame y (own baseline 0, net 22) |
| `shot.to.z` | number | feet | where the ball's flight ended — height above the ground |
| `shot.to.absX` | number | feet | where the ball's flight ended — raw court x (far-left corner origin) |
| `shot.to.absY` | number | feet | where the ball's flight ended — raw court y (far-left corner origin) |
| `shot.to.absZ` | number | feet | where the ball's flight ended — height above the ground |
| `shot.to.feetToNearestSideline` | number | feet | where the ball's flight ended — distance to the nearest sideline |
| `shot.to.feetToNearestBaseline` | number | feet | where the ball's flight ended — distance to the nearest baseline |
| `shot.to.feetToNet` | number | feet | where the ball's flight ended — distance to the plane of the net |
| `shot.to.zone` | string | "deep"|"mid"|"short"|"kitchen"|"net"|"out" | depth zone where the ball's flight ended |
| `shot.peak.x` | number | feet | the highest point of the ball's flight — hitter-frame x (0-20, grows to the hitter's right) |
| `shot.peak.y` | number | feet | the highest point of the ball's flight — hitter-frame y (own baseline 0, net 22) |
| `shot.peak.z` | number | feet | the highest point of the ball's flight — height above the ground |
| `shot.peak.absX` | number | feet | the highest point of the ball's flight — raw court x (far-left corner origin) |
| `shot.peak.absY` | number | feet | the highest point of the ball's flight — raw court y (far-left corner origin) |
| `shot.peak.absZ` | number | feet | the highest point of the ball's flight — height above the ground |
| `shot.peak.feetToNearestSideline` | number | feet | the highest point of the ball's flight — distance to the nearest sideline |
| `shot.peak.feetToNearestBaseline` | number | feet | the highest point of the ball's flight — distance to the nearest baseline |
| `shot.peak.feetToNet` | number | feet | the highest point of the ball's flight — distance to the plane of the net |
| `shot.isHitOnSide(side)` | boolean | | whether the ball was struck on the given half ("left"|"right") of the court in the hitter's frame (right = x >= 10) |
| `shot.taggedWith(pattern)` | boolean | | whether the hitter matches this name pattern (case-insensitive, * wildcard; untagged players match their default "Player N" name) or exact email |
| `shot.inHighlight(kind)` | boolean | | whether the shot falls inside a highlight of the given kind ("atp", "erne", "hands_battle", "long_rally", "poach", "sequence") |

## rally

The rally containing the current shot. `rally[k]` addresses neighboring rallies in the same game.

| Property | Type | Unit / values | Description |
|---|---|---|---|
| `rally.num` | number | 1-based | which rally of the game this is |
| `rally.numShots` | number |  | how many shots the rally contains |
| `rally.startTime` | number | seconds | when in the video the rally starts |
| `rally.endTime` | number | seconds | when in the video the rally ends |
| `rally.duration` | number | seconds | how long the rally lasted |
| `rally.winner` | number | 0|1 | which team won the rally |
| `rally.allPlayersReachedKitchen` | boolean |  | whether every player reached the kitchen line this rally |

## game

The session (one game of a possibly multi-game video) containing the shot.

| Property | Type | Unit / values | Description |
|---|---|---|---|
| `game.vid` | string |  | the video ID this game is from |
| `game.sessionNum` | number | 1-based | which game of the video this is |
| `game.name` | string |  | the video/session name, if any |
| `game.numRallies` | number |  | how many rallies the game contains |
| `game.duration` | number | seconds | first rally start to last rally end |
| `game.avgShots` | number |  | average shots per rally |
| `game.winner` | number | 0|1 | which team won the game (from the recorded outcome) |

## player

A player value, reached from the root `me` or a shot's `hitter` (e.g. `shot.hitter`, `shot[1].hitter`) and stepped through the relations below. A path ending AT a player is its identity, for `=`/`!=` (`shot.hitter = me`). Scalar props are measured at the moment of the shot the player was reached through.

| Property | Type | Unit / values | Description |
|---|---|---|---|
| `player.teammate` | player | | this player's partner (unknown in singles) |
| `player.opponent1` | player | | the first opposing player, in player-id order (the lone opponent in singles) |
| `player.opponent2` | player | | the second opposing player, in player-id order (unknown in singles) |
| `player.opponentLHS` | player | | the opponent on this player's left at the shot's moment (unknown if positions are missing) |
| `player.opponentRHS` | player | | the opponent on this player's right at the shot's moment (unknown if positions are missing) |
| `player.id` | number | 0-3 | the player's index within this game |
| `player.team` | number | 0|1 | the player's team |
| `player.name` | string |  | the player's tagged name; untagged players keep their default name ("Player 1"…"Player 4") |
| `player.startedOnLeftSide` | boolean |  | whether the player started this rally on the left side |
| `player.reachedKitchen` | boolean |  | whether the player reached the kitchen line this rally |
| `player.pos.x` | number | feet | court x at the current shot, in the player's own frame |
| `player.pos.y` | number | feet | court y at the current shot, in the player's own frame (own baseline 0) |
| `player.pos.absX` | number | feet | raw court x at the current shot |
| `player.pos.absY` | number | feet | raw court y at the current shot |
| `player.feetToKitchen` | number | feet | distance still to cover to reach their kitchen line (0 at/inside it) |
| `player.feetToNearestSideline` | number | feet | distance to the nearest sideline at the current shot |
| `player.feetToNearestBaseline` | number | feet | distance to the nearest baseline at the current shot |
| `player.feetToNet` | number | feet | distance to the net plane at the current shot |
| `player.taggedWith(pattern)` | boolean | | whether this player matches this name pattern (case-insensitive, * wildcard; untagged players match their default "Player N" name) or exact email |

