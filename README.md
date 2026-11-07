# NBA Legends

A 2K-style basketball game for **iPhone (Safari, landscape)**. Play real-time 5-on-5 with legendary teams from past seasons, or build your own Dream Team.

The focus is on game mechanics. Players are simple jersey tokens, not detailed models.

## Features

- **Real-time play.** You control one player. The AI runs your teammates and the opponent.
- **12 legendary teams:** '96 Bulls, '98 Bulls, '01 Lakers, '08 Celtics, '08 Lakers, '11 Mavericks, '13 Heat, '14 Spurs, '14 Warriors, '16 Cavaliers, '17 Warriors, '18 Rockets.
- **Difficulty:** Rookie, Pro, All-Star, Superstar, Hall of Fame. It changes:
  - your shot bonus or penalty
  - the size of the green window on the shot meter
  - how quickly the AI makes decisions
  - how aggressive the AI is with steals and help defense
  - how often the AI fouls, and how well it blocks
- **Quarter length:** 2, 3, 5 or 10 minutes. Overtime runs half a quarter.
- **Dream Team builder.** Pick any legends from any team, with no salary cap. You need at least 5 players and can have up to 13. The top 5 start. Choose a name and jersey colours. Dream Teams are saved on the device.
- **Full basketball rules:**
  - game clock and 24-second shot clock (14 after an offensive rebound)
  - shooting and reach-in fouls, and-ones, the bonus, free throws with a timing meter
  - fouling out
  - out of bounds and shot-clock violations
  - overtime
  - teams swap baskets at halftime
- Everyone runs at full speed; there's no sprint button and no fatigue. Subs are manual (fouled-out players are replaced automatically).
- **Box scores** at the half, at the end of the game, or any time from the pause menu.

## Controls (touch)

| | Offense | Defense |
|---|---|---|
| Left thumb (drag anywhere on the left) | Move | Move |
| **A** (big orange/red) | **Shoot.** Hold, then release in the green. Near the rim it's an auto layup or dunk. | **Block.** Jump to contest or rebound. |
| **B** (blue/green) | **Pass** to the teammate you're pushing toward, or the most open one if you're not pushing | **Steal.** Reaching can draw a foul. |
| **D** (purple) | **Spin move**, which can break ankles | **Switch** to the defender closest to the ball (control also auto-switches when the ball changes hands) |

## Run it

```bash
npm install
```

```bash
npm run dev
```

Open the "Network" URL that `npm run dev` prints on your iPhone. The phone must be on the same Wi-Fi as the computer.

```bash
npm test
```

```bash
npm run build
```

## Put it on your iPhone

The workflow in `.github/workflows/deploy.yml` builds the game and publishes it to GitHub Pages. To set it up:

1. On GitHub, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to the branch, or run the workflow by hand from the **Actions** tab.
3. On your iPhone, open `https://<your-user>.github.io/nba-game/` in Safari.
4. Tap **Share → Add to Home Screen**. The game will then open full screen like an app.

## Code map

| Path | What's there |
|---|---|
| `src/data/teams.ts` | Rosters and ratings. Edit this file to tune players or add teams. |
| `src/game/game.ts` | Game engine: possessions, AI, passing, shooting, rebounds, fouls, clock, subs |
| `src/game/shooting.ts` | Shot-make model and shot-meter grading. Pure functions, unit-tested. |
| `src/game/difficulty.ts` | Difficulty levels |
| `src/game/render.ts` | Canvas renderer (broadcast camera) |
| `src/game/input.ts` | Touch joystick and buttons |
| `src/ui/` | Menus, team select, Dream Team builder, in-game HUD and overlays |

Player names belong to the real NBA legends. This is a personal, non-commercial project.
