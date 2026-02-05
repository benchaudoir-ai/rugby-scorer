/**
 * Seed sample data: 2 extra teams and 5 sample matches.
 * Only runs when there are exactly 2 teams (home/away) and no matches yet.
 */

import { db } from './index';
import type { Match } from './types';
import { getTeams, addTeam } from './teams';
import { listMatches } from './matches';

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
