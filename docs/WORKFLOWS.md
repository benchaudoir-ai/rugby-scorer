# Workflows & structure – Rugby Scorer

App is used to **manage a single team** (yours) with different opposition each week.

---

## 1. Match status

- **not_played** – Scheduled; date, time and location set; not started.
- **playing** – Currently in progress (timer running or paused).
- **completed** – Finished; has final score and winner or draw.

Only **completed** matches have a winning team or draw. Not_played and playing have no result.

---

## 2. Match setup (independent, in advance)

- Match setup is **separate** from “Manage teams/players”.
- You can create **multiple matches** (date, time, location, opposition, options) and start one later.
- **Fields:** Our team name, Opposition name, **Date**, **Time**, **Location** (venue), half duration, competition, referee, toggles (player/card tracking, substitutions).
- Saving creates or updates a match with status **not_played**.
- **Start match** loads that match, sets status to **playing**, and opens the in-game screen.
- **End match** saves result and log, sets status to **completed**, updates player stats.

---

## 3. Team > Roster > Players

- **Manage teams** (renamed from “Manage players”): manage **teams**, their **rosters**, and **players** (pool).
- **Team** – e.g. “Our Club” (your team) or “Opposition” (optional; opposition can be just a name per match).
- **Roster** – A named squad for a team (e.g. “First XV”, “A Team”). Each roster has **23 slots** (number 1–23, position, optional player from the team’s player pool).
- **Players** – Belong to a team (player pool). Can be assigned to roster slots. **Active** players are used when a roster is selected: they overwrite the default “Player 1” … “Player 23” labels.

---

## 4. Match setup and rosters

- **Manage teams** is separate from match setup (no picking players inside setup).
- In **match setup** you optionally **select a roster** (for your team).
  - **No roster selected** → use defaults: “Player 1” … “Player 23” with default positions.
  - **Roster selected** → slots come from the roster; any slot with an **active** player in the DB shows that player’s name/details; others stay as default “Player N”.

---

## 5. Match management

- Lists all matches (not_played, playing, completed) with **date, time, location**.
- **Status** shown: Not played / Playing / Completed.
- **Completed** matches show score and winner or draw.
- From here you can open a scheduled (not_played) match to edit or start it.

---

## 6. Data model summary

| Entity       | Purpose |
|-------------|---------|
| **Team**    | Your team or opposition; has `isOurTeam` for “my team”. |
| **Player**  | Team’s player pool; has `active` (used in roster to overwrite defaults). |
| **Roster**  | Named squad for a team; 23 slots. |
| **RosterEntry** | One slot: number (1–23), position, optional `playerId`. |
| **Match**    | scheduledAt, venue (location), status (not_played \| playing \| completed), teams, result when completed. |
