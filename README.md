[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/binasalama12/makefun-best-game-01-w10-hotwire/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/binasalama12/makefun-best-game-01-w10-hotwire/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

# HOTWIRE CITY

**You are the wheelman Dray's Net cannot hold: run 12 getaway fares across 6 districts, hotwire any car at the kerb, draft street mods at the safehouse, outrun rival wheelman Sable Rook — and break Commissioner Dray's Gauntlet.**

A top-down open-city driving game on a 2D canvas — no libraries, no build step, no
network. Open `game/index.html` from any static server and play.

## The game

The city is one seamless 3×2 grid of districts — Portside, Old Market, Neon Strip,
Palm Heights, University Hill, Foundry Row — each with its own palette, landmarks
and traffic. You work on foot and behind the wheel: any parked or crawling car can
be hotwired in under a second, driven hard, and ditched the moment it stops being
useful. Every witness feeds **the Net**, Commissioner Dray's private dragnet,
measured in five rings. The higher the rings climb, the more of the Net the city
fields against you:

- **Net Cruisers** work the grid and pin slow cars. **Interceptors** lead your line
  and ram to spin you out. The unmarked **Tail Car** shadows you and holds the Net
  at one ring. **Gate Crews** seal intersections at four rings, **Spike Vans** run
  your route ahead of you and lay strips that pop tyres, and **Foot Crews** grab
  you if you linger on foot.
- Lose every eye for five seconds and the Net slips a ring. Park inside a green
  **garage** and hold, and it sheds another. Get held slow in a crew's reach and
  the pin meter fills — that ends runs.

Between jobs the **safehouse** cools the city and deals a **street-mod draft**:
pick one of three from a pool of nine (nitro tanks, ghost plates, decoy flares,
run-flat tyres, a radar jammer and more) — it is yours for the rest of the run,
and the build you assemble is the run you play.

The campaign is an arc, not a job list. **Fare 6 is THE DUEL**: Sable Rook, the
only wheelman who has never lost a fare, runs the same client against you.
**Fare 12 is DRAY'S GAUNTLET**: the Commissioner seals Portside and the Net sits
at five rings while you punch through with his own witness in the back seat.

Three ways to play the same city:

- **GETAWAY WHEEL** — the 12-fare campaign above, a mod draft every 2 fares.
- **TURF COURIER** — 15 packages routed through the districts in any order while
  each district's own Net pressure pushes back; three pins or a dead clock ends it.
- **BAIL RUN** — endless: the city wakes up every 25 seconds, medals at $25K,
  $50K and $100,000, survive as long as you can stay cold.

Three difficulties (Cruise / Hot / Inferno) scale traffic, timers and how fast
the Net climbs.

## Controls

- **WASD / arrows:** walk, or drive the car you are in. **E:** hotwire the car at
  your elbow (0.9 s at the door). **Space:** handbrake — drift, swing the tail,
  chain combos. **Shift:** sprint on foot, nitro burst with NITRO TANKS fitted.
- **F:** fire a decoy flare (with DECOY FLARES drafted). **R:** restart the run.
  **1/2/3:** pick a draft card or a difficulty. **Click / Enter:** start, advance.

## Screens

`screenshots/` holds four real renders of the game itself: fare 12 at five rings
with the full HUD live (minimap, incoming panel, fitted mods), the safehouse
draft over the district pressure map, the title screen with the pursuer bestiary,
and a grade-S run record with the full stat ledger.

## Structure

- `main.ts` — entry point; hands the page to the game module.
- `game/src/` — the game, one module per concern: `city` (the seeded city),
  `cars` (traffic and physics), `police` (the Net: rings, witnesses, the six
  pursuer AIs), `player`, `missions` (the three flavours), `meta` (safehouse,
  draft, grades), `render`, `hud`, `fx`, `audio`, `input`, `shots`
  (the deterministic screenshot harness the dossier was rendered with).
- `vendor/makefun-game.ts` — the vendored make.fun game helper.
