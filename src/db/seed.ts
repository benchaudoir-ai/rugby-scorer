/**
 * Seed sample data: 2 extra teams and 5 sample matches.
 * Only runs when there are exactly 2 teams (home/away) and no matches yet.
 *
 * Admin: clearAllData(), seedReedsDemoData(), seedEnglandDemoData() for the hidden /admin screen.
 */

import { db } from './index';
import type { Match } from './types';
import { getTeams, addTeam } from './teams';
import { listMatches } from './matches';
import { addPlayer } from './players';
import { createRoster, getRosterEntries, updateRosterEntry } from './rosters';

/** Clear all data from the database. Used by admin screen. */
export async function clearAllData(): Promise<void> {
  await db.rosterEntries.clear();
  await db.rosters.clear();
  await db.players.clear();
  await db.matches.clear();
  await db.teams.clear();
}

/** Reeds demo team positions (1–19). Slot 9 = Scrum-half. */
const REEDS_POSITIONS = [
  'Loosehead Prop', 'Hooker', 'Tighthead Prop', 'Lock / Second Row', 'Lock / Second Row',
  'Blindside Flanker', 'Openside Flanker', 'Number 8', 'Scrum-half', 'Fly-half',
  'Left Wing', 'Inside Centre', 'Outside Centre', 'Right Wing', 'Full-back',
  'Sub', 'Sub', 'Sub', 'Sub',
];

/** Reeds demo team player names (1–19). */
const REEDS_PLAYER_NAMES = [
  'Mia', 'Jessica', 'Aoife', 'Bella S', 'Aisling', 'Maddy', 'Lucy', 'Lauren', 'Millie',
  'Matilda', 'Zoe', 'Acer', 'Nicole', 'Immy', 'Sofia', 'Bea', 'Mimi', 'Evie', 'Emily',
];

/** Add demo data: Reeds team with 19 players. Used by admin screen. */
export async function seedReedsDemoData(): Promise<void> {
  const teamId = await addTeam('Reeds', '#22c55e', true); // green, mark as our team
  for (let i = 0; i < REEDS_PLAYER_NAMES.length; i++) {
    await addPlayer({
      teamId,
      name: REEDS_PLAYER_NAMES[i],
      number: i + 1,
      position: REEDS_POSITIONS[i] ?? 'Sub',
      isStarter: i < 15,
    });
  }
  // Create a default roster and assign players to slots 1–19 by number
  const rosterId = await createRoster(teamId, 'First XV');
  const entries = await getRosterEntries(rosterId);
  const players = await db.players.where('teamId').equals(teamId).sortBy('number');
  const playerByNumber = new Map(players.map((p) => [p.number, p]));
  for (const entry of entries) {
    const player = playerByNumber.get(entry.number);
    if (player) await updateRosterEntry(entry.id, { playerId: player.id });
  }
}

/** England team positions (1–23). From England v Wales 2026 Six Nations opener. */
const ENGLAND_POSITIONS = [
  'Loosehead Prop', 'Hooker', 'Tighthead Prop', 'Lock / Second Row', 'Lock / Second Row',
  'Blindside Flanker', 'Openside Flanker', 'Number 8', 'Scrum-half', 'Fly-half',
  'Left Wing', 'Inside Centre', 'Outside Centre', 'Right Wing', 'Full-back',
  'Sub', 'Sub', 'Sub', 'Sub', 'Sub', 'Sub', 'Sub', 'Sub',
];

/** England team to face Wales 2026 Guinness Six Nations opener (23 players). */
const ENGLAND_PLAYER_NAMES = [
  'Ellis Genge', 'Jamie George', 'Joe Heyes', 'Alex Coles', 'Ollie Chessum',
  'Guy Pepper', 'Sam Underhill', 'Ben Earl', 'Alex Mitchell', 'George Ford',
  'Henry Arundell', 'Fraser Dingwall', 'Tommy Freeman', 'Immanuel Feyi-Waboso', 'Freddie Steward',
  'Luke Cowan-Dickie', 'Bevan Rodd', 'Trevor Davison', 'Maro Itoje', 'Tom Curry',
  'Henry Pollock', 'Ben Spencer', 'Marcus Smith',
];

/** Add England team (v Wales 2026 Six Nations). Used by admin screen. */
export async function seedEnglandDemoData(): Promise<void> {
  const teamId = await addTeam('England', '#cf0824', false); // England red
  for (let i = 0; i < ENGLAND_PLAYER_NAMES.length; i++) {
    await addPlayer({
      teamId,
      name: ENGLAND_PLAYER_NAMES[i],
      number: i + 1,
      position: ENGLAND_POSITIONS[i] ?? 'Sub',
      isStarter: i < 15,
    });
  }
  const rosterId = await createRoster(teamId, 'v Wales 2026');
  const entries = await getRosterEntries(rosterId);
  const players = await db.players.where('teamId').equals(teamId).sortBy('number');
  const playerByNumber = new Map(players.map((p) => [p.number, p]));
  for (const entry of entries) {
    const player = playerByNumber.get(entry.number);
    if (player) await updateRosterEntry(entry.id, { playerId: player.id });
  }
}

export async function seedSampleData(): Promise<void> {
  const teams = await getTeams();
  const existingMatches = await listMatches({ limit: 10 });

  // Add 2 new teams only if we still have just the default two
  if (teams.length === 2) {
    await addTeam('Thunder RFC', '#f59e0b', false); // amber
    await addTeam('Eagles RFC', '#10b981', false);  // emerald
  }

  // Add 5 sample matches only if there are no matches yet
  if (existingMatches.length > 0) return;

  const now = Date.now();
  const inOneDay = now + 24 * 60 * 60 * 1000;
  const inOneWeek = now + 7 * 24 * 60 * 60 * 1000;
  const lastWeek = now - 7 * 24 * 60 * 60 * 1000;
  const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

  const config = { playerTracking: true, cardTracking: true, substitutions: true };
  const baseMatch: Omit<Match, 'id' | 'homeTeamName' | 'awayTeamName' | 'homeColor' | 'awayColor' | 'homeScore' | 'awayScore' | 'scheduledAt' | 'startedAt' | 'endedAt' | 'status' | 'log' | 'createdAt' | 'updatedAt'> = {
    homeTeamId: 'home',
    awayTeamId: 'away',
    halfDuration: 40 * 60,
    competition: '',
    venue: '',
    referee: '',
    currentHalf: 1,
    elapsedSeconds: 0,
    injuryTime: 0,
    config,
  };

  const sampleMatches: Partial<Match>[] = [
    {
      ...baseMatch,
      homeTeamName: 'Our Club',
      awayTeamName: 'Thunder RFC',
      homeColor: '#3b82f6',
      awayColor: '#f59e0b',
      homeScore: 24,
      awayScore: 19,
      scheduledAt: twoWeeksAgo,
      startedAt: twoWeeksAgo,
      endedAt: twoWeeksAgo + 90 * 60 * 1000,
      status: 'completed',
      venue: 'Main Pitch',
      competition: 'League Round 1',
      log: [
        { id: crypto.randomUUID(), timestamp: twoWeeksAgo, type: 'match-start', half: 1, matchTime: 0 },
        { id: crypto.randomUUID(), timestamp: twoWeeksAgo + 60 * 60 * 1000, type: 'half-time', half: 1, matchTime: 40 * 60 },
        { id: crypto.randomUUID(), timestamp: twoWeeksAgo + 90 * 60 * 1000, type: 'match-end', half: 2, matchTime: 80 * 60 },
      ],
    },
    {
      ...baseMatch,
      homeTeamName: 'Our Club',
      awayTeamName: 'Eagles RFC',
      homeColor: '#3b82f6',
      awayColor: '#10b981',
      homeScore: 31,
      awayScore: 31,
      scheduledAt: lastWeek,
      startedAt: lastWeek,
      endedAt: lastWeek + 95 * 60 * 1000,
      status: 'completed',
      venue: 'Riverside Stadium',
      competition: 'League Round 2',
      log: [
        { id: crypto.randomUUID(), timestamp: lastWeek, type: 'match-start', half: 1, matchTime: 0 },
        { id: crypto.randomUUID(), timestamp: lastWeek + 45 * 60 * 1000, type: 'half-time', half: 1, matchTime: 40 * 60 },
        { id: crypto.randomUUID(), timestamp: lastWeek + 95 * 60 * 1000, type: 'match-end', half: 2, matchTime: 80 * 60 },
      ],
    },
    {
      ...baseMatch,
      homeTeamName: 'Our Club',
      awayTeamName: 'Away',
      homeColor: '#3b82f6',
      awayColor: '#ef4444',
      homeScore: 14,
      awayScore: 21,
      scheduledAt: now - 2 * 60 * 60 * 1000,
      startedAt: now - 2 * 60 * 60 * 1000,
      endedAt: now - 30 * 60 * 1000,
      status: 'completed',
      venue: 'Home Ground',
      competition: 'Friendly',
      log: [
        { id: crypto.randomUUID(), timestamp: now - 2 * 60 * 60 * 1000, type: 'match-start', half: 1, matchTime: 0 },
        { id: crypto.randomUUID(), timestamp: now - 80 * 60 * 1000, type: 'half-time', half: 1, matchTime: 40 * 60 },
        { id: crypto.randomUUID(), timestamp: now - 30 * 60 * 1000, type: 'match-end', half: 2, matchTime: 80 * 60 },
      ],
    },
    {
      ...baseMatch,
      homeTeamName: 'Our Club',
      awayTeamName: 'Thunder RFC',
      homeColor: '#3b82f6',
      awayColor: '#f59e0b',
      homeScore: 0,
      awayScore: 0,
      scheduledAt: inOneDay,
      startedAt: 0,
      status: 'not_played',
      venue: 'Main Pitch',
      competition: 'League Round 3',
      log: [],
    },
    {
      ...baseMatch,
      homeTeamName: 'Eagles RFC',
      awayTeamName: 'Our Club',
      homeColor: '#10b981',
      awayColor: '#3b82f6',
      homeScore: 0,
      awayScore: 0,
      scheduledAt: inOneWeek,
      startedAt: 0,
      status: 'not_played',
      venue: 'Eagles Park',
      competition: 'League Round 4',
      log: [],
    },
  ];

  for (const m of sampleMatches) {
    const id = crypto.randomUUID();
    const created = now - Math.random() * 7 * 24 * 60 * 60 * 1000;
    await db.matches.add({
      id,
      homeTeamId: m.homeTeamId ?? 'home',
      awayTeamId: m.awayTeamId ?? 'away',
      homeTeamName: m.homeTeamName!,
      awayTeamName: m.awayTeamName!,
      homeColor: m.homeColor!,
      awayColor: m.awayColor!,
      homeScore: m.homeScore ?? 0,
      awayScore: m.awayScore ?? 0,
      halfDuration: m.halfDuration ?? 40 * 60,
      competition: m.competition ?? '',
      venue: m.venue ?? '',
      referee: m.referee ?? '',
      scheduledAt: m.scheduledAt,
      currentHalf: m.currentHalf ?? 1,
      elapsedSeconds: m.elapsedSeconds ?? 0,
      injuryTime: m.injuryTime ?? 0,
      startedAt: m.startedAt ?? 0,
      endedAt: m.endedAt,
      status: m.status ?? 'not_played',
      config: m.config ?? config,
      log: m.log ?? [],
      createdAt: created,
      updatedAt: created,
    });
  }
}
