/**
 * Database types for Rugby Scorer.
 * Used by Dexie schema and app logic.
 *
 * @see docs/WORKFLOWS.md
 */

export interface Team {
  id: string;
  name: string;
  /** Single colour (legacy). Prefer colours when present. */
  color: string;
  /** Shirt colours for this team (e.g. home kit, away kit). Used in match setup to pick one. */
  colors?: string[];
  /** True for the single team the user manages (e.g. "Our Club"). */
  isOurTeam?: boolean;
  createdAt: number;
}

export interface Player {
  id: string;
  teamId: string;
  name: string;
  number: number;
  position: string;
  isStarter: boolean;
  /** When true, this player overwrites default "Player N" when roster is used in match setup. */
  active: boolean;
  gamesPlayed: number;
  tries: number;
  points: number;
  yellowCards: number;
  redCards: number;
  createdAt: number;
  updatedAt: number;
}

/** One slot in a roster: shirt number, position, optional player from team pool. */
export interface RosterEntry {
  id: string;
  rosterId: string;
  number: number; // 1–23
  position: string;
  playerId?: string;
  createdAt: number;
}

export interface Roster {
  id: string;
  teamId: string;
  name: string;
  createdAt: number;
}

export type MatchStatus = 'not_played' | 'playing' | 'completed';

/** One log entry: score, card, substitution, or system event */
export interface LogEvent {
  id: string;
  timestamp: number;
  type: 'score' | 'card' | 'substitution' | 'match-start' | 'half-time' | 'match-end';
  team?: 'home' | 'away';
  scoreType?: string;
  points?: number;
  playerId?: string;
  pending?: boolean;
  cardType?: 'yellow' | 'red';
  returned?: boolean;
  returnTime?: number;
  offPlayerId?: string;
  onPlayerId?: string;
  half?: number;
  matchTime?: number;
}

export interface Match {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeColor: string;
  awayColor: string;
  homeScore: number;
  awayScore: number;
  halfDuration: number;
  competition: string;
  /** Location / venue for the match. */
  venue: string;
  referee: string;
  /** Scheduled date+time (ms). Set when match is created in setup. */
  scheduledAt?: number;
  currentHalf: number;
  elapsedSeconds: number;
  injuryTime: number;
  startedAt: number;
  endedAt?: number;
  status: MatchStatus;
  /** Optional roster id used for home team for this match. */
  rosterId?: string;
  /** Optional roster id used for away team for this match. */
  awayRosterId?: string;
  config: {
    playerTracking: boolean;
    cardTracking: boolean;
    substitutions: boolean;
  };
  log: LogEvent[];
  createdAt: number;
  updatedAt: number;
}
