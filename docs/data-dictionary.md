# PBQL Data Dictionary

<!-- GENERATED FILE — do not edit. Run `yarn docs` to regenerate
     from src/model/registry.js. -->

The complete queryable surface. Any property may be **unknown** when the
underlying data was not detected — see the unknown-handling rules in
[Language](language.md). `player.*` rows apply to every player
reference; positions are measured at the moment the current shot was hit.

## shot

The shot being tested. `shot[k]` addresses the shot k earlier/later in the same rally. `shot.hitter` navigates to the player who hit it.

| Property | Description | Type | Unit / values |
|---|---|---|---|
| `shot.hitter` | the player who hit this shot | player | |
| `shot.num` | which shot of the rally this is (the serve is 1) | number | 1-based |
| `shot.isFinal` | whether this is the rally's last shot | boolean |  |
| `shot.isVolley` | whether the ball was hit before bouncing | boolean |  |
| `shot.isSpeedup` | whether the shot added significant pace near the kitchen | boolean |  |
| `shot.isReset` | whether the shot was a volley that took significant pace off a hard incoming ball; only volleys are assessed | boolean |  |
| `shot.isPoach` | whether the hitter cut across in front of their partner to volley a ball that was headed to the partner | boolean |  |
| `shot.isPassing` | whether the shot was a rally-ending drive or smash that got past the nearest opponent untouched; unknown in singles | boolean |  |
| `shot.isPutaway` | whether the shot functioned as a putaway or rally finisher — a clean winner or a decisive attack that directly created the rally's end (can be a well-placed dink or drop, not only a hard hit) | boolean |  |
| `shot.type` | the shot classification; never set on serves and returns (shot.num 1 and 2) | string | "smash"\|"lob"\|"dink"\|"drop"\|"drive"\|"atp"\|"erne" |
| `shot.verticalType` | the vertical character of the stroke, from strike height (dig ≤ 2.5ft, overhead ≥ 6ft) | string | "dig"\|"neutral"\|"overhead" |
| `shot.strokeSide` | which side of the body the stroke was made on | string | "left"\|"right" |
| `shot.strokeType` | forehand or backhand, from strokeSide and the hitter's handedness; needs augmented insights carrying handedness (strokeSide always works) | string | "forehand"\|"backhand" |
| `shot.winnerType` | how this shot won the rally ("clean" = fault-free final shot, "forced_fault" = the opponents faulted on their reply); unknown if it did not win | string | "clean"\|"forced_fault" |
| `shot.quality.overall` | the overall quality of the shot, derived from the execution quality (1 is best) | number | 0-1 |
| `shot.quality.execution` | how well the shot was executed | number | 0-1 |
| `shot.quality.pressure` | positional pressure faced and imposed by this shot (1 = most pressure); unknown for singles, serves, and returns | number | 0-1 |
| `shot.positioningScore` | how well the hitter was positioned at this shot, against a strong-team baseline (1 is best); unknown for singles, serves, and returns | number | 0-1 |
| `shot.partnerPositioningScore` | how well the hitter's partner was positioned at this shot, against a strong-team baseline (1 is best); unknown for singles, serves, and returns | number | 0-1 |
| `shot.speed` | ball speed after the hit | number | mph |
| `shot.direction` | named direction the ball traveled, from the hitter's perspective (left/middle/right thirds of the court) | string | "DownTheMiddle"\|"DownTheLineLeft"\|"DownTheLineRight"\|"MidCrossLeft"\|"MidCrossRight"\|"LeftToMiddle"\|"RightToMiddle"\|"LeftCrossRight"\|"RightCrossLeft" |
| `shot.yaw` | horizontal launch angle (0 = toward the hitter's left sideline, 90 = straight at the net) | number | degrees |
| `shot.pitch` | vertical angle from the strike point up to the flight's peak (0 = flat or downward, 90 = straight up) | number | degrees |
| `shot.distance` | straight-line distance from where the ball was struck to where its flight ended | number | feet |
| `shot.distanceFromBaseline` | how far in front of the opponent's baseline the ball's flight ended (negative = past it) | number | feet |
| `shot.heightOverNet` | ball height when crossing the net plane | number | feet |
| `shot.crossedNet` | whether the ball crossed the plane of the net | boolean |  |
| `shot.confidence` | confidence in the reconstructed trajectory | number | 0-1 |
| `shot.hitTime` | when in the video the ball was struck | number | seconds |
| `shot.endTime` | when in the video the shot's flight ended | number | seconds |
| `shot.hasError` | whether any error was detected on this shot | boolean |  |
| `shot.errors.unforced` | whether the fault on this shot was an unforced error; only assessed on actual faults with a confidently-known rally winner | boolean |  |
| `shot.errors.popup` | whether a dink or drop popped the ball up ("exploited" = the opponents attacked it out of the air, "potential" = they did not) | string | "exploited"\|"potential" |
| `shot.hasFault` | whether this shot committed a rule fault, actual or potential — e.g. a ball headed out that an opponent played anyway | boolean |  |
| `shot.errors.faults.net` | whether the net stopped the ball | boolean |  |
| `shot.errors.faults.short` | whether the shot landed on the hitter's own side short of the net | boolean |  |
| `shot.errors.faults.out.outcome` | whether the out ball landed or was played anyway | string | "landed"\|"intercepted" |
| `shot.errors.faults.out.direction` | which way the ball went (or was headed) out — "long" past the baseline, "left"/"right" wide of a sideline from the hitter's perspective | string | "left"\|"right"\|"long" |
| `shot.from.x` | where the ball was struck — hitter-frame x (0-20, grows to the hitter's right) | number | feet |
| `shot.from.y` | where the ball was struck — hitter-frame y (own baseline 0, net 22) | number | feet |
| `shot.from.z` | where the ball was struck — height above the ground | number | feet |
| `shot.from.absX` | where the ball was struck — raw court x (far-left corner origin) | number | feet |
| `shot.from.absY` | where the ball was struck — raw court y (far-left corner origin) | number | feet |
| `shot.from.absZ` | where the ball was struck — height above the ground | number | feet |
| `shot.from.feetToNearestSideline` | where the ball was struck — distance to the nearest sideline | number | feet |
| `shot.from.feetToNearestBaseline` | where the ball was struck — distance to the nearest baseline | number | feet |
| `shot.from.feetToNet` | where the ball was struck — distance to the plane of the net | number | feet |
| `shot.from.zone` | depth zone the ball was struck from | string | "deep"\|"mid"\|"short"\|"kitchen" |
| `shot.to.x` | where the ball's flight ended — hitter-frame x (0-20, grows to the hitter's right) | number | feet |
| `shot.to.y` | where the ball's flight ended — hitter-frame y (own baseline 0, net 22) | number | feet |
| `shot.to.z` | where the ball's flight ended — height above the ground | number | feet |
| `shot.to.absX` | where the ball's flight ended — raw court x (far-left corner origin) | number | feet |
| `shot.to.absY` | where the ball's flight ended — raw court y (far-left corner origin) | number | feet |
| `shot.to.absZ` | where the ball's flight ended — height above the ground | number | feet |
| `shot.to.feetToNearestSideline` | where the ball's flight ended — distance to the nearest sideline | number | feet |
| `shot.to.feetToNearestBaseline` | where the ball's flight ended — distance to the nearest baseline | number | feet |
| `shot.to.feetToNet` | where the ball's flight ended — distance to the plane of the net | number | feet |
| `shot.to.zone` | depth zone where the ball's flight ended | string | "deep"\|"mid"\|"short"\|"kitchen"\|"net"\|"out" |
| `shot.peak.x` | the highest point of the ball's flight — hitter-frame x (0-20, grows to the hitter's right) | number | feet |
| `shot.peak.y` | the highest point of the ball's flight — hitter-frame y (own baseline 0, net 22) | number | feet |
| `shot.peak.z` | the highest point of the ball's flight — height above the ground | number | feet |
| `shot.peak.absX` | the highest point of the ball's flight — raw court x (far-left corner origin) | number | feet |
| `shot.peak.absY` | the highest point of the ball's flight — raw court y (far-left corner origin) | number | feet |
| `shot.peak.absZ` | the highest point of the ball's flight — height above the ground | number | feet |
| `shot.peak.feetToNearestSideline` | the highest point of the ball's flight — distance to the nearest sideline | number | feet |
| `shot.peak.feetToNearestBaseline` | the highest point of the ball's flight — distance to the nearest baseline | number | feet |
| `shot.peak.feetToNet` | the highest point of the ball's flight — distance to the plane of the net | number | feet |
| `shot.isHitOnSide(side)` | whether the ball was struck on the given half ("left"\|"right") of the court in the hitter's frame (right = x >= 10) | boolean | |
| `shot.taggedWith(pattern)` | whether the hitter matches this name pattern (case-insensitive, * wildcard; untagged players match their default "Player N" name) or exact email | boolean | |
| `shot.inHighlight(kind)` | whether the shot falls inside a highlight of the given kind ("atp", "erne", "hands_battle" = a rapid volley exchange, "long_rally", "poach", "sequence" = a notable stretch of shots) | boolean | |

## rally

The rally containing the current shot. `rally[k]` addresses neighboring rallies in the same game.

| Property | Description | Type | Unit / values |
|---|---|---|---|
| `rally.num` | which rally of the game this is | number | 1-based |
| `rally.numShots` | how many shots the rally contains | number |  |
| `rally.startTime` | when in the video the rally starts | number | seconds |
| `rally.endTime` | when in the video the rally ends | number | seconds |
| `rally.duration` | how long the rally lasted | number | seconds |
| `rally.winner` | which team won the rally | number | 0\|1 |
| `rally.allPlayersReachedKitchen` | whether every player reached the kitchen line this rally | boolean |  |

## game

The session (one game of a possibly multi-game video) containing the shot.

| Property | Description | Type | Unit / values |
|---|---|---|---|
| `game.vid` | the video ID this game is from | string |  |
| `game.sessionNum` | which game of the video this is | number | 1-based |
| `game.name` | the video/session name, if any | string |  |
| `game.numRallies` | how many rallies the game contains | number |  |
| `game.startTime` | when in the video the game starts (its first rally's start) | number | seconds |
| `game.endTime` | when in the video the game ends (its last rally's end) | number | seconds |
| `game.duration` | first rally start to last rally end (game.startTime + game.duration = game.endTime) | number | seconds |
| `game.videoDuration` | the whole video's duration; only present in augmented insights | number | seconds |
| `game.avgShots` | average shots per rally | number |  |
| `game.winner` | which team won the game (from the recorded outcome) | number | 0\|1 |

## player

A player value, reached from the root `me` or a shot's `hitter` (e.g. `shot.hitter`, `shot[1].hitter`) and stepped through the relations below. A path ending AT a player is its identity, for `=`/`!=` (`shot.hitter = me`). Scalar props are measured at the moment of the shot the player was reached through.

| Property | Description | Type | Unit / values |
|---|---|---|---|
| `player.teammate` | this player's partner (unknown in singles) | player | |
| `player.opponent1` | the first opposing player, in player-id order (the lone opponent in singles) | player | |
| `player.opponent2` | the second opposing player, in player-id order (unknown in singles) | player | |
| `player.opponentLHS` | the opponent on this player's left at the shot's moment (unknown if positions are missing) | player | |
| `player.opponentRHS` | the opponent on this player's right at the shot's moment (unknown if positions are missing) | player | |
| `player.id` | the player's index within this game | number | 0-3 |
| `player.team` | the player's team | number | 0\|1 |
| `player.name` | the player's tagged name; untagged players keep their default name ("Player 1"…"Player 4") | string |  |
| `player.startedOnLeftSide` | whether the player began the rally on the left of their partner, facing the net; not meaningful in singles | boolean |  |
| `player.reachedKitchen` | whether the player reached the kitchen line this rally | boolean |  |
| `player.pos.x` | court x at the current shot, in the player's own frame | number | feet |
| `player.pos.y` | court y at the current shot, in the player's own frame (own baseline 0) | number | feet |
| `player.pos.absX` | raw court x at the current shot | number | feet |
| `player.pos.absY` | raw court y at the current shot | number | feet |
| `player.feetToKitchen` | distance still to cover to reach their kitchen line (0 at/inside it) | number | feet |
| `player.feetToNearestSideline` | distance to the nearest sideline at the current shot | number | feet |
| `player.feetToNearestBaseline` | distance to the nearest baseline at the current shot | number | feet |
| `player.feetToNet` | distance to the net plane at the current shot | number | feet |
| `player.forwardPressure` | how actively the player's team pushed shots toward positional advantage over the whole game (team-level: teammates share it); unknown in singles | number | 0-1 |
| `player.finishingAbility` | how efficiently the player's team converted positional advantage into ending rallies over the whole game (team-level: teammates share it); unknown in singles | number | 0-1 |
| `player.taggedWith(pattern)` | whether this player matches this name pattern (case-insensitive, * wildcard; untagged players match their default "Player N" name) or exact email | boolean | |

