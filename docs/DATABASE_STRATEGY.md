# Database strategy – Rugby Scorer

Web app, **offline-first**. All data lives in the browser (IndexedDB). No server required; optional export/backup later.

---

## 1. Technology choice: IndexedDB via Dexie.js

| Option        | Pros                          | Cons                    |
|---------------|-------------------------------|--------------------------|
| **Dexie.js**  | Structured tables, queries, async, works offline, no backend | None for this use case  |
| localStorage  | Simple                        | Size limits, no queries  |
| SQLite (sql.js) | Full SQL                     | Heavier, less idiomatic in browser |
| PouchDB       | Sync to CouchDB               | Overkill if no sync yet  |

**Recommendation:** **Dexie.js** (IndexedDB wrapper). Good for players, teams, matches, and match logs; works fully offline; easy to add export/import later.

---

## 2. Data model

### 2.1 Tables (stores)

```
teams          – Team names and colours (reusable across matches)
players        – Player records: team, roster, stats (games played, tries, etc.)
matches        – Match setup + result + full match log (one row per match)
```

### 2.2 Schema (TypeScript-friendly)

**teams**
- `id` (string, primary)
- `name` (string)
- `color` (string, hex)
- `createdAt` (number, timestamp)

**players**
- `id` (string, primary)
- `teamId` (string, index) – which team they belong to
- `name` (string)
- `number` (number, 1–23)
- `position` (string)
- `isStarter` (boolean)
- `gamesPlayed` (number, default 0)
- `tries` (number, default 0)
- `points` (number, default 0) – optional: total points scored
- `yellowCards`, `redCards` (numbers, optional)
- `createdAt`, `updatedAt` (numbers)

**matches**
- `id` (string, primary)
- `homeTeamId`, `awayTeamId` (strings, index) – refs to teams (or denormalised names)
- `homeTeamName`, `awayTeamName` (strings) – snapshot at match time
- `homeColor`, `awayColor` (strings)
- `homeScore`, `awayScore` (numbers)
- `halfDuration` (number, seconds)
- `competition`, `venue`, `referee` (strings, optional)
- `currentHalf`, `elapsedSeconds`, `injuryTime` (numbers) – for in-progress
- `startedAt` (number, timestamp)
- `endedAt` (number, optional) – set when match is closed
- `status` ('draft' | 'live' | 'finished')
- `config` (JSON, optional) – playerTracking, cardTracking, substitutions, etc.
- `log` (JSON array) – full match log: score events, cards, substitutions, system events (match start, half time, match end)

So: **one match = one row**; the match log is stored inside that row (no separate “match_events” table unless you later need cross-match queries).

---

## 3. How this fits the current app

- **Current state:** One “current match” in Zustand + `persist` (localStorage). Single session; no history of matches or players across matches.
- **Target:**  
  - **Players** come from DB (by team); stats updated when a match is finished.  
  - **Matches** are created (draft) on “New match” or “Start match”, updated live, then saved with full log when “End match” is pressed.  
  - **“Current match”** = one match loaded from DB (or new in-memory) that the UI edits; when finished, it’s written back to `matches` and optionally players’ stats are updated.

### 3.1 Mapping current Zustand state → DB

- **Teams:** `homeTeam` / `awayTeam` + `homeColor` / `awayColor` → either reuse/update `teams` or store as snapshot on `matches`.
- **Players:** Current `players[]` → read/write from `players` table filtered by `teamId` (and optionally match roster stored on match).
- **Match in progress:** `homeScore`, `awayScore`, `scoreEvents`, `cards`, `substitutions`, `systemEvents`, `currentHalf`, `elapsedSeconds`, etc. → either keep in Zustand and **sync to** `matches` on “End match”, or keep “current match” as a row in `matches` with `status: 'live'` and update that row on every change (simpler long-term: one source of truth in DB).

### 3.2 Offline behaviour

- All reads/writes go to IndexedDB (Dexie). No network calls.
- App works 100% offline. Optional later: “Export” (JSON/file) or “Sync” to a backend (would require API and conflict handling).

---

## 4. Flows

### 4.1 New match

1. User taps **“New match”** (from setup or a “Matches” screen).
2. Create a new **match** row: `status: 'draft'`, optional copy of last match’s teams/players or blank.
3. Load that match into Zustand (or into a “current match” slice that reads from DB). UI = Match setup.
4. On **“Start match”**: set `status: 'live'`, `startedAt = Date.now()`, append “Match started” to `log`, and start timer.

### 4.2 During match

- Either:
  - **A)** Keep live state in Zustand; on “End match” (and optionally on “Next half”), write full state into the match row’s `log` and other fields; or
  - **B)** On every score/card/sub/timer tick, update the match row in DB and read from DB into Zustand (or use Dexie live queries). Prefer **A** for simplicity; **B** if you want “same match open in two tabs” or recovery after crash.

### 4.3 End match

1. Append “Match closed” to `log`, set `endedAt`, `status: 'finished'`, final scores and full `log` on the match row. Save to `matches`.
2. **Update player stats:** for each player who took part (from `log` or from match roster), increment `gamesPlayed`; from `log` update `tries`, `points`, `yellowCards`, `redCards` as needed.
3. Clear “current match” from UI and show Match setup or Match list.

### 4.4 Roster / team management

- **Players** screen: list players by `teamId` (and optionally “all teams”). Add/edit/delete players in `players` table. Stats are read-only from DB (updated when matches finish).
- **Teams:** either a dedicated “Teams” table and “rosters” as players with that `teamId`, or keep teams as names+colours on each match only. Recommendation: **teams** table + **players.teamId** for roster and stats.

---

## 5. Implementation phases

| Phase | What | Delivered |
|-------|------|-----------|
| **1** | Dexie DB + schema | `src/db/` with tables `teams`, `players`, `matches`. App still uses Zustand + persist; DB ready. |
| **2** | Teams & players in DB | Create/default teams; “Manage players” reads/writes `players` table; optional “Teams” screen. |
| **3** | Match persistence | “New match” creates/loads a match row. “Start match” sets live. “End match” saves full log + result to `matches` and updates player stats. |
| **4** | Match list & history | “Matches” screen: list past matches (from `matches` where `status === 'finished'`), tap to view log/result; “New match” from there. |
| **5** | Optional | Export DB to JSON; import; or “Clear all data”. |

---

## 6. File layout (suggested)

```
src/
  db/
    index.ts        # Dexie instance, schema, versioning
    types.ts        # Team, Player, Match, LogEvent types
    teams.ts        # CRUD teams
    players.ts      # CRUD players, update stats
    matches.ts      # CRUD matches, append log, finish match
  store/            # Zustand store(s) – “current match” state, hydrated from DB when needed
  App.tsx           # unchanged structure; store reads/writes via db/ when persisting
```

---

## 7. Summary

- **Database:** IndexedDB via **Dexie.js** (offline-first, no server).
- **Stored:** **Teams**, **Players** (roster + stats), **Matches** (setup, result, full match log in one row).
- **App:** Stays a web app; “current match” can stay in Zustand; create/load/save matches and players via Dexie; “New match” creates a new match row and resets UI; “End match” saves log and updates player stats.
- **Phases:** 1) DB + schema, 2) Players/teams in DB, 3) Match save/load, 4) Match list/history, 5) Export/clear optional.
