# ThatPickleballGuy, in your own footage

Kyle Koszuta ([thatpickleballguy](https://www.youtube.com/@thatpickleballguy))
teaches shots, patterns, and strategy to a few hundred thousand pickleball
players. Every lesson ends the same way: *now go find this in your own game.*
This file does exactly that. For each instructional video from roughly the
last two years of his catalog (July 2024 – July 2026, plus a handful of
evergreen lessons from late 2023 / early 2024 grouped with their newer
near-duplicates), it gives the question a viewer might ask about their own
footage and a validated PBQL query that answers it.

How to use these:

- Replace `"83gyqyc10y8f"` with your own pb.vision video id (add `:2` for
  game 2), a local insights file, or a glob like `"games/*.json"`.
- Queries assume you are tagged in the game so `me` resolves (with the CLI,
  pass `--me N`).
- Missing data evaluates to *unknown* and `WHERE` keeps only *true*, so a
  filter like `shot.quality.overall < 0.4` quietly skips shots the AI
  couldn't score. That is usually what you want.
- Most clip queries pull in a shot of lead-in (and a shot of lead-out
  where the payoff is what matters), so you see the setup around each shot,
  not just the shot in isolation.
- Where a video teaches something shot data can't see directly (grip, swing
  mechanics, footwork), the query is an honest approximation and says so in
  a note. Vlogs, gear videos, interviews, and mental-game episodes (e.g.
  "This Wasn't An Easy Goodbye", "Behind the Scenes of Selkirk's Biggest
  Breakthrough Yet", "5 Mental Mistakes Destroying Your Game", the
  7-minute meditation) are skipped entirely.

---

## Serves

### "[Give me 10 minutes and I'll fix your serve forever.](https://www.youtube.com/watch?v=qazUxtEX_-4)" (2025)

> Show every serve I missed (into the net, short, or out) so I can see
> what's breaking down.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "serve" AND shot.hasFault
```

### "[3 Tricks to immediately Add SERIOUS POWER to Your Serve](https://www.youtube.com/watch?v=XZXix27vyvg)" (2025) / "[7 Reasons Your Serve Has No Power (& How to Serve Harder)](https://www.youtube.com/watch?v=V0HhlLojf0k)" (2024)

> Rank my serves by speed and show where each one landed. Are my hardest
> serves still finding the deep zone?

```sql
SELECT shot.hitTime AS "when (s)", shot.speed AS "mph", shot.to.zone AS "depth"
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "serve"
ORDER BY shot.speed DESC
```

### "[5 Ridiculous Pickleball Strategies That Just Might Work](https://www.youtube.com/watch?v=ZZFeoUK54Fk)" (2024)

> Did anyone actually try a lob serve? Show any serve that arced way up,
> and the return it got.

```sql
FROM "83gyqyc10y8f"
WHERE shot.sequence = "serve" AND shot.peak.z >= 12
CONTEXT AFTER 1 shot
```

*Note:* there is no "lob serve" classification, so this approximates one as
a serve whose apex was 12+ feet up.

## Returns

### "[I taught my 4.5 friend how to return like a pro](https://www.youtube.com/watch?v=UPSacn3AXLQ)" (2026)

> Show my returns that landed deep, plus the third shot each one forced.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "return" AND shot.to.zone = "deep"
CONTEXT AFTER 1 shot
```

### "[5 Advanced Pickleball Return Strategies to Outplay Your Opponents](https://www.youtube.com/watch?v=p27Gq140UjQ)" (2024)

> Find my returns aimed down the middle.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "return" AND shot.direction = "DownTheMiddle"
```

### "[The Serve RETURN: The Most Undervalued Shot in Pickleball](https://www.youtube.com/watch?v=722mGzXn4RA)" (2023)

> Show the returns that put me on the back foot, both the ones I flubbed
> and the ones that landed short, with the serve that set each up.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "return" AND (shot.hasError OR shot.to.zone IN ("kitchen", "short"))
CONTEXT BEFORE 1 shot
```

*Note:* a return should land deep and push the serving team back; one that
drops in the kitchen or short zone (even cleanly) gives them an easy
third-shot attack. Folding those short returns in with outright errors
catches every return that cost me the initiative, not just the ones I
shanked.

## Third (and fourth) shots

### "[A Third Shot Drop Strategy Masterclass](https://www.youtube.com/watch?v=g2ByJMmUP4A)" (2024)

> Find my third-shot drops that landed in the kitchen, with the whole rally
> for context.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "3" AND shot.type = "drop" AND shot.to.zone = "kitchen"
CONTEXT BEFORE rally
CONTEXT AFTER rally
```

### "[The 3rd Shot Drop Is DEAD (Or Is It??) | ft. Senior Pro Dayne Gingrich](https://www.youtube.com/watch?v=um4GCt_ILUM)" (2025)

> Show my third-shot drops that sat up and got attacked.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "3" AND shot.type = "drop" AND shot.errors.popup = "exploited"
CONTEXT AFTER 1 shot
```

### "[7 Steps to a Deadly 3rd Shot Drive](https://www.youtube.com/watch?v=UkyN4pHQZyQ)" (2025) / "[A 3rd Shot Drive Strategy MasterClass](https://www.youtube.com/watch?v=WAP-wN5Wjjw)" (2024)

> My 15 hardest third-shot drives that stayed low over the net.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "3" AND shot.type = "drive" AND shot.heightOverNet < 5
ORDER BY shot.speed DESC
LIMIT 15
```

### "[3rd Shot Drop vs. Drive: Which to use and WHEN?](https://www.youtube.com/watch?v=LnTAm5pAr9c)" (2023)

> Give me a spreadsheet of every third shot I hit (drop or drive), with
> execution scores and outcomes so I can compare.

```sql
SELECT shot.type, shot.speed AS "mph", shot.quality.execution AS "execution", shot.winnerType
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "3"
ORDER BY shot.hitTime
```

### "[The Fourth Shot: Pickleball's Most Ignored Weapon](https://www.youtube.com/watch?v=vhcl0Lg47x8)" (2023)

> Show my fourth shots taken out of the air, with the drop that set them up.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "4" AND shot.isVolley
CONTEXT BEFORE 1 shot
```

## Dinking & kitchen play

### "[How to Become a Better Dinker](https://www.youtube.com/watch?v=z1Rhjzfqyc8)" (2025)

> Pull my 20 weakest dinks so I can see what to fix.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.type = "dink" AND shot.quality.overall < 0.5
ORDER BY shot.quality.overall
LIMIT 20
```

### "[7 Reasons You Pop Up Dinks (and how to avoid them)](https://www.youtube.com/watch?v=RhcsiwavxYg)" (2024)

> Show my dinks that popped up, and what the other team did about it.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.type = "dink" AND exists(shot.errors.popup)
CONTEXT AFTER 1 shot
```

*Note:* `exists()` catches both flavors: pop-ups the opponents punished
(`"exploited"`) and the ones they let slide (`"potential"`).

### "[I Found My 4.5 Friend's Superpower at the Kitchen](https://www.youtube.com/watch?v=0hfPtvSnuyk)" (2026)

> Show my dinks from extended kitchen battles where all four players made
> it to the line.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.type = "dink" AND rally.allPlayersReachedKitchen AND rally.numShots >= 12
CONTEXT BEFORE 1 shot
```

## Speedups, flicks & hands battles

### "[Everything to Know About \"Speed Ups\" In Pickleball](https://www.youtube.com/watch?v=pCXvUVoBcVo)" (2023)

> Show every speedup I threw and the two shots that followed. Did the
> first punch land?

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.isSpeedup
CONTEXT AFTER 2 shots
```

### "[On-Court Masterclass with World #5 Tyra Black (Her hands are crazy!!)](https://www.youtube.com/watch?v=FW2uIWvKR5U)" (2025)

> Find the moments an opponent sped up on me and I countered out of the air.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot[-1].isSpeedup AND shot.isVolley
CONTEXT BEFORE 1 shot
CONTEXT AFTER 1 shot
```

### "[How to Get Faster Hands in pickleball](https://www.youtube.com/watch?v=5Yh6BX7fRRI)" (2024)

> Cut a reel of every hands battle in my games.

```sql
FROM "83gyqyc10y8f"
WHERE shot.inHighlight("hands_battle")
CONTEXT BEFORE 1 shot
```

### "[4.5 Learns Pro Level Forehand Flick in 6 Minutes](https://www.youtube.com/watch?v=JV0rGW5_qIc)" (2026)

> Show my forehand flicks, the speedups I lifted from below the net.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.isSpeedup AND shot.strokeSide = "right" AND shot.from.z < 3
CONTEXT BEFORE 1 shot
```

*Note:* there is no "flick" classification; contact below net height
(~3 ft) on a speedup is the closest signature. `shot.strokeSide = "right"`
is the forehand side for right-handers.

### "[How to Hit a Backhand Flick (The Ultimate Guide)](https://www.youtube.com/watch?v=6kRQFJomZwg)" (2026)

> Show my backhand flicks.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.isSpeedup AND shot.strokeSide = "left" AND shot.from.z < 3
CONTEXT BEFORE 1 shot
```

*Note:* `shot.strokeSide = "left"` is the backhand side for right-handers.

## Resets & defense

### "[3 Pickleball Skills That ACTUALLY Make a Difference](https://www.youtube.com/watch?v=Dw8RDein-XU)" (2026)

The first skill: recognize disadvantage and neutralize before you attack.

> Show my resets from the transition zone, the "neutralize first" skill.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.isReset AND shot.from.zone = "mid"
CONTEXT BEFORE 1 shot
```

### "[How to Beat Bangers in 2026](https://www.youtube.com/watch?v=V1LHO0JA9RQ)" (2023)

> Find every time a banger drove one at me over 40 mph and I took the pace
> off.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.isReset AND shot[-1].type = "drive" AND shot[-1].speed > 40
CONTEXT BEFORE 1 shot
```

### "[I Taught My 4.0 Friend How the Pros Defend](https://www.youtube.com/watch?v=nbY6HvPJecU)" (2023)

> Show my successful digs against smashes, and what happened next.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot[-1].type = "smash" AND NOT shot.hasError
CONTEXT AFTER 1 shot
```

*Note:* `shot.hasError` is never unknown, so `NOT shot.hasError` is safe
here. It genuinely means "no detected error", not "error status unknown".

## Overheads & strokes

### "[It Looks Wrong, But This Will Fix Your Overheads](https://www.youtube.com/watch?v=PIMxQnnav4w)" (2026)

> Pull up every overhead I hit, along with the lob that forced it.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.type = "smash"
CONTEXT BEFORE 1 shot
```

## Poaching & ernes

### "[Why Men's and Women's Doubles Look So Different](https://www.youtube.com/watch?v=xxIpb_FWwQs)" (2026)

One of the differences Kyle breaks down is how often players cross the
middle.

> Show every poach in my games. Who's crossing the middle, and when?

```sql
FROM "83gyqyc10y8f"
WHERE shot.isPoach
CONTEXT BEFORE 1 shot
```

*Note:* add `AND shot.hitter.team = me.team` to see only your side's poaches.

### "[The Erne; In-Game Breakdown of Pickleball's Coolest Shot](https://www.youtube.com/watch?v=JCiPxO2gwaQ)" (2023)

> Cut a reel of the ernes in my games, with the shots that set them up.

```sql
FROM "83gyqyc10y8f"
WHERE shot.inHighlight("erne")
CONTEXT BEFORE 2 shots
```

## Positioning & doubles strategy

### "[Mixed Doubles Strategy Session with Rachel Rohrabacher](https://www.youtube.com/watch?v=LeLzxLzCouE)" (2026)

> How often do opponents attack the middle between me and my partner? Show
> those shots.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter.team != me.team AND shot.direction = "DownTheMiddle" AND shot.to.zone != "out"
CONTEXT BEFORE 1 shot
```

### "[The #1 Doubles Strategy New Players Must Know](https://www.youtube.com/watch?v=29MxOqfOVhU)" (2024)

Get to the kitchen line. Here is what it costs you when you don't.

> Show the rallies I lost where I never made it to the kitchen line.

```sql
FROM "83gyqyc10y8f"
WHERE shot.isFinal AND NOT me.reachedKitchen AND rally.winner != me.team
CONTEXT BEFORE rally
```

*Note:* filtering on the rally's final shot keeps one clip per rally;
`NOT me.reachedKitchen` keeps only rallies where that is known to be false.

### "[A 46-Minute Strategy Session w/ Anna Leigh Waters [ON COURT]](https://www.youtube.com/watch?v=K9tX7F1U2wk)" (2025)

Anna Leigh's green light: a short return means drive it.

> Find the short returns I punished with a third-shot drive.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "3" AND shot.type = "drive" AND shot[-1].to.zone IN ("short", "kitchen")
CONTEXT BEFORE 1 shot
```

*Note:* `shot[-1]` of my third shot is the opponent's return; its `to.zone`
is measured in the court it landed in, so `"short"`/`"kitchen"` means the
return came up short on my side.

### "[Tyra Blacks Pickleball strategy will break your brain.](https://www.youtube.com/watch?v=LAcgHiwcMPw)" (2025)

Tyra lobs on purpose, from the kitchen line, to move pressing opponents.

> Show my on-purpose lobs from the kitchen line, and what they earned.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.type = "lob" AND shot.from.zone = "kitchen"
CONTEXT AFTER 1 shot
```

## Errors, discipline & match review

### "[How to Win a Pickleball Tournament](https://www.youtube.com/watch?v=q5XEKWW4tSU)" (2026)

Tournament play is won by whoever donates fewer points.

> Round up every unforced error I made, the points I gave away.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.errors.unforced
CONTEXT BEFORE 1 shot
```

### "[3 Strategies to WIN more 3.5 Tournaments](https://www.youtube.com/watch?v=_ZBbNk25BP4)" (2025)

> How many points did I give away on unforced errors?

```sql
SELECT count()
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.errors.unforced
```

### "[6 Overlooked Mistakes Destroying Your Game](https://www.youtube.com/watch?v=K_4ytzcJlxk)" (2025)

> Find every ball I popped up that got hammered.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.errors.popup = "exploited"
CONTEXT AFTER 1 shot
```

### "[4 Mistakes That Make You Want to Break Your Paddle | Part 2](https://www.youtube.com/watch?v=FBPlMxStOv4)" (2025)

> Show every ball I put into the net.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.errors.faults.net
CONTEXT BEFORE 1 shot
```

### "[STOP Hitting Out Balls (3 On-Court Drills)](https://www.youtube.com/watch?v=XD0U6uirhA8)" (2024) / "[How to Let Out Balls Go in Pickleball](https://www.youtube.com/watch?v=Kf1gUaLvOkM)" (2024)

> Catch me playing balls that were sailing out.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot[-1].errors.faults.out.outcome = "intercepted"
CONTEXT BEFORE 1 shot
```

*Note:* the previous (opponent) shot carried an out fault whose outcome was
`"intercepted"`, and since I hit the next ball, I'm the one who bailed
them out.

### "[I Analyzed a 4.5 Match: These Strategies Decide Who Wins](https://www.youtube.com/watch?v=251iMaoG3HU)" (2025)

> Show me how every rally ended, with the three shots leading in.

```sql
FROM "83gyqyc10y8f"
WHERE shot.isFinal
CONTEXT BEFORE 3 shots
```

### "[The Only 6 Pickleball Drills You'll Ever Need](https://www.youtube.com/watch?v=1Y2zpXxK6ag)" (2024)

> Is my drilling paying off? Average execution score across all my drops
> this game.

```sql
SELECT count() AS "drops", avg(shot.quality.execution) AS "avg execution"
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.type = "drop"
```

## Waiting on the data

The entries below are written against fields the CV / data-extraction
pipeline doesn't populate yet (some are being removed from PBQL until the
data exists). The lessons are still worth targeting, so they stay here with
their citations for the day the data arrives. Each keeps its original query
in a plain (non-validated) block, notes what's missing, and (where an
honest approximation exists) offers a runnable **Meanwhile:** query.

### "[They Banned His Genius Serve, Now He Does This](https://www.youtube.com/watch?v=YyN9lJMwkh8)" (2025)

Zane Navratil's post-ban weapon: heavy topspin, landed deep.

> Find my topspin serves that landed deep, biggest spin first.

```
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "serve" AND shot.spin.class = "topspin" AND shot.to.zone = "deep"
ORDER BY shot.spin.rpm DESC
```

**Missing:** ball spin (`shot.spin.*`). Spin estimation was removed from
the pipeline in 2024 and needs new CV output.

**Meanwhile:** rank your deep serves by speed instead. See the deep-serve
query under "3 Tricks to immediately Add SERIOUS POWER to Your Serve" in
the Serves section.

### "[They say don't slice returns. This pro does anyway.](https://www.youtube.com/watch?v=V6fIzk2Sv1c)" (2026)

> Pull up my slice returns as a spreadsheet. Where did they land, and how
> low did they cross the net?

```
SELECT shot.hitTime AS "when (s)", shot.to.zone AS "depth", shot.heightOverNet AS "ft over net"
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "return" AND shot.verticalType = "slice"
```

**Missing:** spin-based stroke classes. In practice `shot.verticalType`
only ever reports strike height (`dig`/`neutral`/`overhead`); `"slice"` was
never implemented.

### "[This Lesson Fixed My Twoey Dink (10 minute masterclass)](https://www.youtube.com/watch?v=-QCXqwrkVDw)" (2025)

> Find every two-handed dink I hit.

```
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.type = "dink" AND shot.strokeType = "two-handed"
```

**Missing:** two-handed detection. Today `shot.strokeType` is a pure
mirror of `shot.strokeSide` that assumes a right-handed player.

**Meanwhile:** review your backhand-side dinks, the twoey candidates,
assuming you're right-handed (backhand side):

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.type = "dink" AND shot.strokeSide = "left"
```

### "[On Court w/ #1 IN THE WORLD Anna-Leigh: Kitchen Strategy Masterclass](https://www.youtube.com/watch?v=gVjhEVqMqQY)" (2025)

> Find the moments an opponent's dink sat up and I made them pay.

```
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot[-1].errors.deadDink = "exploited"
CONTEXT BEFORE 2 shots
```

**Missing:** dead-dink detection (`shot.errors.deadDink`). The pipeline
doesn't produce it yet.

**Meanwhile:** pop-up detection is real (`"potential"`|`"exploited"`, where
`"exploited"` means the next side volleyed it). Catch the opponent dinks
that sat up and were punished:

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot[-1].type = "dink" AND shot[-1].errors.popup = "exploited"
CONTEXT BEFORE 2 shots
```

*Note:* teams alternate shots within a rally, so `shot[-1]` is always the
other side's ball, and since I hit the next shot, the exploiting was mine.

### "[These 5 Kitchen Mistakes Are Ruining Your Game](https://www.youtube.com/watch?v=g1i3GJ5Q8pk)" (2024)

> Find my dinks that sat up asking to be attacked.

```
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND exists(shot.errors.deadDink)
CONTEXT AFTER 1 shot
```

**Missing:** dead-dink detection (`shot.errors.deadDink`). The pipeline
doesn't produce it yet.

**Meanwhile:** the popup-based equivalent, which coincides with the "7
Reasons You Pop Up Dinks" query in the Dinking & kitchen play section:

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.type = "dink" AND exists(shot.errors.popup)
CONTEXT AFTER 1 shot
```

### "[How Pros Decide WHEN to Attack | (Ft. Augie Ge)](https://www.youtube.com/watch?v=Sp_TIdRFOAA)" (2025)

> Show the speedups where I attacked the wrong ball.

```
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.isSpeedup AND shot.quality.selection < 0.4
CONTEXT AFTER 1 shot
```

**Missing:** shot-selection scoring. `shot.quality.selection` is a stub
that only ever emits a constant 0 on fault shots.

**Meanwhile:** an honest reframing, the speedups I *executed* badly, not
necessarily the wrong balls to attack:

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.isSpeedup AND shot.quality.overall < 0.4
CONTEXT AFTER 1 shot
```

### "[The Ultimate Two-Handed Backhand Lesson (w/ Roscoe Bellamy)](https://www.youtube.com/watch?v=7dPD2ejpHdI)" (2026) / "[2024's Best New Shot: The Two-Handed Backhand](https://www.youtube.com/watch?v=KrxcKFjvuV8)" (2023)

> Collect all my two-handed backhands, best first, to review my form.

```
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.strokeType = "two-handed"
ORDER BY shot.quality.overall DESC
```

**Missing:** two-handed detection. Today `shot.strokeType` is a pure
mirror of `shot.strokeSide` that assumes a right-handed player.

**Meanwhile:** review your backhand-side strokes, assuming you're
right-handed (backhand side):

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.strokeSide = "left"
ORDER BY shot.quality.overall DESC
```

### "[7 Strategies To Use When Playing Pickleball With A LEFTY (ft. Tanner Tomassi)](https://www.youtube.com/watch?v=Pj3oSDspTH4)" (2024)

> Spot the lefty: show opponent forehands struck on the left side of the
> body.

```
FROM "83gyqyc10y8f"
WHERE shot.hitter.team != me.team AND shot.strokeType = "forehand" AND shot.strokeSide = "left"
```

**Missing:** real handedness. `shot.strokeType` currently mirrors
`shot.strokeSide` assuming right-handedness, which makes a left-side
forehand logically impossible to record. Handedness is planned for the
augmented insights.

### "[3 Pickleball Kitchen Rules New Players Get Wrong](https://www.youtube.com/watch?v=C84yW8a5uUE)" (2025)

> Did I ever volley while in the kitchen? Show the violations.

```
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.errors.faults.kitchen
```

**Missing:** kitchen-fault detection. `shot.errors.faults.kitchen` is a
hardcoded stub that is always false.

---

*Surveyed: 116 long-form uploads on the channel (July 2023 – July 2026),
77 with full dates/descriptions; 45 entries above cover 49 instructional
videos: 36 runnable today, 9 waiting on data. Every runnable query
validates against the PBQL analyzer and is printed in canonical
`print(parse(q).ast)` form; the plain-block originals under "Waiting on the
data" are exempt until their fields ship.*
