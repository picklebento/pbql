# ThatPickleballGuy, in your own footage

Kyle Koszuta ([thatpickleballguy](https://www.youtube.com/@thatpickleballguy))
teaches shots, patterns, and strategy to a few hundred thousand pickleball
players. Every lesson ends the same way: *now go find this in your own game.*
This file does exactly that — for each instructional video from roughly the
last two years of his catalog (July 2024 – July 2026, plus a handful of
evergreen lessons from late 2023 / early 2024 grouped with their newer
near-duplicates), it gives the question a viewer might ask about their own
footage and a validated PBQL query that answers it.

How to use these:

- Replace `"83gyqyc10y8f"` with your own pb.vision video id (add `:2` for
  game 2), a local insights file, or a glob like `"games/*.json"`.
- Queries assume you are tagged in the game so `me` resolves (with the CLI,
  pass `--me N`).
- Missing data evaluates to *unknown* and `WHERE` keeps only *true* — so a
  filter like `shot.quality.selection < 0.4` quietly skips shots the AI
  couldn't score. That is usually what you want.
- Where a video teaches something shot data can't see directly (grip, swing
  mechanics, footwork), the query is an honest approximation and says so in
  a note. Vlogs, gear videos, interviews, and mental-game episodes (e.g.
  "This Wasn't An Easy Goodbye", "Behind the Scenes of Selkirk's Biggest
  Breakthrough Yet", "5 Mental Mistakes Destroying Your Game", the
  7-minute meditation) are skipped entirely.

---

## Serves

### "Give me 10 minutes and I'll fix your serve forever." (2025)

> Show every serve I missed — into the net, short, or out — so I can see
> what's breaking down.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "serve" AND shot.hasFault
```

### "3 Tricks to immediately Add SERIOUS POWER to Your Serve" (2025) / "7 Reasons Your Serve Has No Power (& How to Serve Harder)" (2024)

> Rank my serves by speed and show where each one landed — are my hardest
> serves still finding the deep zone?

```sql
SELECT shot.hitTime AS "when (s)", shot.speed AS "mph", shot.to.zone AS "depth"
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "serve"
ORDER BY shot.speed DESC
```

### "They Banned His Genius Serve, Now He Does This" (2025)

Zane Navratil's post-ban weapon: heavy topspin, landed deep.

> Find my topspin serves that landed deep, biggest spin first.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "serve" AND shot.spin.class = "topspin" AND shot.to.zone = "deep"
ORDER BY shot.spin.rpm DESC
```

### "5 Ridiculous Pickleball Strategies That Just Might Work" (2024)

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

### "I taught my 4.5 friend how to return like a pro" (2026)

> Show my returns that landed deep, plus the third shot each one forced.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "return" AND shot.to.zone = "deep"
CONTEXT AFTER 1 shot
```

### "They say don't slice returns. This pro does anyway." (2026)

> Pull up my slice returns as a spreadsheet — where did they land and how
> low did they cross the net?

```sql
SELECT shot.hitTime AS "when (s)", shot.to.zone AS "depth", shot.heightOverNet AS "ft over net"
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "return" AND shot.verticalType = "slice"
```

### "5 Advanced Pickleball Return Strategies to Outplay Your Opponents" (2024)

> Find my returns aimed down the middle.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "return" AND shot.direction = "DownTheMiddle"
```

### "The Serve RETURN: The Most Undervalued Shot in Pickleball" (2023)

> Every return I flubbed, with the serve that caused it.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "return" AND shot.hasError
CONTEXT BEFORE 1 shot
```

## Third (and fourth) shots

### "A Third Shot Drop Strategy Masterclass" (2024)

> Find my third-shot drops that landed in the kitchen, with the whole rally
> for context.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "3" AND shot.type = "drop" AND shot.to.zone = "kitchen"
CONTEXT BEFORE rally
CONTEXT AFTER rally
```

### "The 3rd Shot Drop Is DEAD (Or Is It??) | ft. Senior Pro Dayne Gingrich" (2025)

> Show my third-shot drops that sat up and got attacked.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "3" AND shot.type = "drop" AND shot.errors.popup = "exploited"
CONTEXT AFTER 1 shot
```

### "7 Steps to a Deadly 3rd Shot Drive" (2025) / "A 3rd Shot Drive Strategy MasterClass" (2024)

> My 15 hardest third-shot drives that stayed low over the net.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "3" AND shot.type = "drive" AND shot.heightOverNet < 5
ORDER BY shot.speed DESC
LIMIT 15
```

### "3rd Shot Drop vs. Drive: Which to use and WHEN?" (2023)

> Give me a spreadsheet of every third shot I hit — drop or drive — with
> choice and execution scores so I can compare.

```sql
SELECT shot.type, shot.speed AS "mph", shot.quality.selection AS "choice", shot.quality.execution AS "execution", shot.winnerType
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "3"
ORDER BY shot.hitTime
```

### "The Fourth Shot: Pickleball's Most Ignored Weapon" (2023)

> Show my fourth shots taken out of the air, with the drop that set them up.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "4" AND shot.isVolley
CONTEXT BEFORE 1 shot
```

## Dinking & kitchen play

### "How to Become a Better Dinker" (2025)

> Pull my 20 weakest dinks so I can see what to fix.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.type = "dink" AND shot.quality.overall < 0.5
ORDER BY shot.quality.overall
LIMIT 20
```

### "This Lesson Fixed My Twoey Dink (10 minute masterclass)" (2025)

> Find every two-handed dink I hit.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.type = "dink" AND shot.strokeType = "two-handed"
```

### "7 Reasons You Pop Up Dinks (and how to avoid them)" (2024)

> Show my dinks that popped up — and what the other team did about it.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.type = "dink" AND exists(shot.errors.popup)
CONTEXT AFTER 1 shot
```

*Note:* `exists()` catches both flavors — pop-ups the opponents punished
(`"exploited"`) and the ones they let slide (`"potential"`).

### "I Found My 4.5 Friend's Superpower at the Kitchen" (2026)

> Show my dinks from extended kitchen battles where all four players made
> it to the line.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.type = "dink" AND rally.allPlayersReachedKitchen AND rally.numShots >= 12
```

### "On Court w/ #1 IN THE WORLD Anna-Leigh: Kitchen Strategy Masterclass" (2025)

> Find the moments an opponent's dink sat up and I made them pay.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot[-1].errors.deadDink = "exploited"
CONTEXT BEFORE 2 shots
```

*Note:* teams alternate shots within a rally, so `shot[-1]` is always the
other side's ball; `"exploited"` means the dead dink was capitalized on —
and since I hit the next shot, the exploiting was mine.

### "These 5 Kitchen Mistakes Are Ruining Your Game" (2024)

> Find my dinks that sat up asking to be attacked.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND exists(shot.errors.deadDink)
CONTEXT AFTER 1 shot
```

## Speedups, flicks & hands battles

### "Everything to Know About \"Speed Ups\" In Pickleball" (2023)

> Show every speedup I threw and the two shots that followed — did the
> first punch land?

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.isSpeedup
CONTEXT AFTER 2 shots
```

### "How Pros Decide WHEN to Attack | (Ft. Augie Ge)" (2025)

> Show the speedups where I attacked the wrong ball.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.isSpeedup AND shot.quality.selection < 0.4
CONTEXT AFTER 1 shot
```

### "On-Court Masterclass with World #5 Tyra Black (Her hands are crazy!!)" (2025)

> Find the moments an opponent sped up on me and I countered out of the air.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot[-1].isSpeedup AND shot.isVolley
CONTEXT BEFORE 1 shot
CONTEXT AFTER 1 shot
```

### "How to Get Faster Hands in pickleball" (2024)

> Cut a reel of every hands battle in my games.

```sql
FROM "83gyqyc10y8f"
WHERE shot.inHighlight("hands_battle")
```

### "4.5 Learns Pro Level Forehand Flick in 6 Minutes" (2026)

> Show my forehand flicks — speedups I lifted from below the net.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.isSpeedup AND shot.strokeType = "forehand" AND shot.from.z < 3
```

*Note:* there is no "flick" classification; contact below net height
(~3 ft) on a speedup is the closest signature.

### "How to Hit a Backhand Flick (The Ultimate Guide)" (2026)

> Show my backhand flicks.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.isSpeedup AND shot.strokeType = "backhand" AND shot.from.z < 3
```

## Resets & defense

### "3 Pickleball Skills That ACTUALLY Make a Difference" (2026)

The first skill: recognize disadvantage and neutralize before you attack.

> Show my resets from the transition zone — the "neutralize first" skill.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.isReset AND shot.from.zone = "mid"
CONTEXT BEFORE 1 shot
```

### "How to Beat Bangers in 2026" (2023)

> Find every time a banger drove one at me over 40 mph and I took the pace
> off.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.isReset AND shot[-1].type = "drive" AND shot[-1].speed > 40
```

### "I Taught My 4.0 Friend How the Pros Defend" (2023)

> Show my successful digs against smashes, and what happened next.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot[-1].type = "smash" AND NOT shot.hasError
CONTEXT AFTER 1 shot
```

*Note:* `shot.hasError` is never unknown, so `NOT shot.hasError` is safe
here — it genuinely means "no detected error", not "error status unknown".

## Overheads & strokes

### "It Looks Wrong, But This Will Fix Your Overheads" (2026)

> Pull up every overhead I hit, along with the lob that forced it.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.type = "smash"
CONTEXT BEFORE 1 shot
```

### "The Ultimate Two-Handed Backhand Lesson (w/ Roscoe Bellamy)" (2026) / "2024's Best New Shot: The Two-Handed Backhand" (2023)

> Collect all my two-handed backhands, best first, to review my form.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.strokeType = "two-handed"
ORDER BY shot.quality.overall DESC
```

## Poaching & ernes

### "Why Men's and Women's Doubles Look So Different" (2026)

One of the differences Kyle breaks down is how often players cross the
middle.

> Show every poach in my games — who's crossing the middle and when.

```sql
FROM "83gyqyc10y8f"
WHERE shot.isPoach
CONTEXT BEFORE 1 shot
```

*Note:* add `AND shot.hitter.team = me.team` to see only your side's poaches.

### "The Erne; In-Game Breakdown of Pickleball's Coolest Shot" (2023)

> Cut a reel of the ernes in my games, with the shots that set them up.

```sql
FROM "83gyqyc10y8f"
WHERE shot.inHighlight("erne")
CONTEXT BEFORE 2 shots
```

## Positioning & doubles strategy

### "Mixed Doubles Strategy Session with Rachel Rohrabacher" (2026)

> How often do opponents attack the middle between me and my partner? Show
> those shots.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter.team != me.team AND shot.direction = "DownTheMiddle" AND shot.to.zone != "out"
```

### "7 Strategies To Use When Playing Pickleball With A LEFTY (ft. Tanner Tomassi)" (2024)

> Spot the lefty: show opponent forehands struck on the left side of the
> body.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter.team != me.team AND shot.strokeType = "forehand" AND shot.strokeSide = "left"
```

*Note:* handedness isn't recorded directly; a forehand released on the left
side of the body means a left-hander (or a very committed run-around).

### "The #1 Doubles Strategy New Players Must Know" (2024)

Get to the kitchen line — here is what it costs you when you don't.

> Show the rallies I lost where I never made it to the kitchen line.

```sql
FROM "83gyqyc10y8f"
WHERE shot.isFinal AND NOT me.reachedKitchen AND rally.winner != me.team
CONTEXT BEFORE rally
```

*Note:* filtering on the rally's final shot keeps one clip per rally;
`NOT me.reachedKitchen` keeps only rallies where that is known to be false.

### "A 46-Minute Strategy Session w/ Anna Leigh Waters [ON COURT]" (2025)

Anna Leigh's green light: a short return means drive it.

> Find the short returns I punished with a third-shot drive.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.sequence = "3" AND shot.type = "drive" AND shot[-1].to.zone IN ("short", "kitchen")
```

*Note:* `shot[-1]` of my third shot is the opponent's return; its `to.zone`
is measured in the court it landed in, so `"short"`/`"kitchen"` means the
return came up short on my side.

### "Tyra Blacks Pickleball strategy will break your brain." (2025)

Tyra lobs on purpose, from the kitchen line, to move pressing opponents.

> Show my on-purpose lobs from the kitchen line, and what they earned.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.type = "lob" AND shot.from.zone = "kitchen"
CONTEXT AFTER 1 shot
```

## Errors, discipline & match review

### "How to Win a Pickleball Tournament" (2026)

Tournament play is won by whoever donates fewer points.

> Round up every unforced error I made — the points I gave away.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.errors.unforced
CONTEXT BEFORE 1 shot
```

### "3 Strategies to WIN more 3.5 Tournaments" (2025)

> How many points did I give away on unforced errors?

```sql
SELECT count()
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.errors.unforced
```

### "6 Overlooked Mistakes Destroying Your Game" (2025)

> Find every ball I popped up that got hammered.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.errors.popup = "exploited"
CONTEXT AFTER 1 shot
```

### "4 Mistakes That Make You Want to Break Your Paddle | Part 2" (2025)

> Show every ball I put into the net.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.errors.faults.net
```

### "3 Pickleball Kitchen Rules New Players Get Wrong" (2025)

> Did I ever volley while in the kitchen? Show the violations.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.errors.faults.kitchen
```

*Note:* of the kitchen rules the video covers, the volley-in-the-kitchen
fault is the one shot data detects.

### "STOP Hitting Out Balls (3 On-Court Drills)" (2024) / "How to Let Out Balls Go in Pickleball" (2024)

> Catch me playing balls that were sailing out.

```sql
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot[-1].errors.faults.out.outcome = "intercepted"
CONTEXT BEFORE 1 shot
```

*Note:* the previous (opponent) shot carried an out fault whose outcome was
`"intercepted"` — and since I hit the next ball, I'm the one who bailed
them out.

### "I Analyzed a 4.5 Match — These Strategies Decide Who Wins" (2025)

> Show me how every rally ended, with the three shots leading in.

```sql
FROM "83gyqyc10y8f"
WHERE shot.isFinal
CONTEXT BEFORE 3 shots
```

### "The Only 6 Pickleball Drills You'll Ever Need" (2024)

> Is my drilling paying off? Average execution score across all my drops
> this game.

```sql
SELECT count() AS "drops", avg(shot.quality.execution) AS "avg execution"
FROM "83gyqyc10y8f"
WHERE shot.hitter = me AND shot.type = "drop"
```

---

*Surveyed: 116 long-form uploads on the channel (July 2023 – July 2026),
77 with full dates/descriptions; 45 entries above cover 49 instructional
videos. Every query validates against the PBQL analyzer and is printed in
canonical `print(parse(q).ast)` form.*
