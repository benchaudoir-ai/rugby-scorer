/**
 * Dexie (IndexedDB) database for Rugby Scorer.
 * Offline-first; no server required.
 *
 * @see docs/DATABASE_STRATEGY.md
 * @see docs/WORKFLOWS.md
 */

import Dexie, { type Table } from 'dexie';
import type { Team, Player, Match, Roster, RosterEntry } from './types';

export class RugbyScorerDB extends Dexie {
  teams!: Table<Team, string>;
  players!: Table<Player, string>;
  matches!: Table<Match, string>;
  rosters!: Table<Roster, string>;
  rosterEntries!: Table<RosterEntry, string>;

  constructor() {
    super('RugbyScorerDB');
    this.version(1).stores({
      teams: 'id, name, createdAt',
      players: 'id, teamId, number, createdAt',
      matches: 'id, status, startedAt, endedAt, homeTeamId, awayTeamId, createdAt',
    });
    this.version(2)
      .stores({
        rosters: 'id, teamId, createdAt',
        rosterEntries: 'id, rosterId, number, createdAt',
        matches: 'id, status, startedAt, endedAt, scheduledAt, homeTeamId, awayTeamId, createdAt',
      })
      .upgrade((tx) => {
        return tx
          .table('matches')
          .toCollection()
          .modify((m: Record<string, unknown>) => {
            const s = m.status as string;
            if (s === 'draft') m.status = 'not_played';
            if (s === 'live') m.status = 'playing';
            if (s === 'finished') m.status = 'completed';
            if (m.scheduledAt == null && m.startedAt) m.scheduledAt = m.startedAt;
          });
      });
  }
}

export const db = new RugbyScorerDB();

export type { Team, Player, Match, Roster, RosterEntry } from './types';
export type { LogEvent, MatchStatus } from './types';
