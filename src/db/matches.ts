/**
 * Matches CRUD and match lifecycle for Rugby Scorer.
 * Create match on Start, update on End, update player stats from log.
 */

import { db } from './index';
import type { Match, LogEvent, MatchStatus } from './types';
import { getPlayer, updatePlayer } from './players';

export interface MatchSnapshot {
  homeTeamName: string;
  awayTeamName: string;
  homeColor: string;
  awayColor: string;
  homeScore: number;
  awayScore: number;
  halfDuration: number;
  competition: string;
  venue: string;
  referee: string;
  currentHalf: number;
  elapsedSeconds: number;
  injuryTime: number;
  config: { playerTracking: boolean; cardTracking: boolean; substitutions: boolean };
  scoreEvents: Array<{
    id: string;
    timestamp: number;
    team: 'home' | 'away';
    type: string;
    points: number;
    player?: string;
    half: number;
    minute: number;
    matchTime: number;
    pending?: boolean;
  }>;
  cards: Array<{
    id: string;
    timestamp: number;
    team: 'home' | 'away';
    player: string;
    type: 'yellow' | 'red';
    half: number;
    minute: number;
    matchTime: number;
    returnTime?: number;
    returned?: boolean;
  }>;
  substitutionEvents: Array<{
    id: string;
    timestamp: number;
    team: 'home' | 'away';
    offPlayerId: string;
    onPlayerId: string;
    half: number;
    minute: number;
    matchTime: number;
  }>;
  systemEvents: Array<{
    id: string;
    timestamp: number;
    type: 'match-start' | 'half-time' | 'match-end';
    half: number;
    matchTime: number;
  }>;
  playerIds: string[];
}

function buildLogFromSnapshot(snap: MatchSnapshot): LogEvent[] {
  const log: LogEvent[] = [];
  const push = (ev: LogEvent) => log.push(ev);

  for (const e of snap.scoreEvents) {
    push({
      id: e.id,
      timestamp: e.timestamp,
      type: 'score',
      team: e.team,
      scoreType: e.type,
      points: e.points,
      playerId: e.player,
      pending: e.pending,
      half: e.half,
      matchTime: e.matchTime,
    });
  }
  for (const c of snap.cards) {
    push({
      id: c.id,
      timestamp: c.timestamp,
      type: 'card',
      team: c.team,
      cardType: c.type,
      playerId: c.player,
      returned: c.returned,
      returnTime: c.returnTime,
      half: c.half,
      matchTime: c.matchTime,
    });
  }
  for (const s of snap.substitutionEvents) {
    push({
      id: s.id,
      timestamp: s.timestamp,
      type: 'substitution',
      team: s.team,
      offPlayerId: s.offPlayerId,
      onPlayerId: s.onPlayerId,
      half: s.half,
      matchTime: s.matchTime,
    });
  }
  for (const e of snap.systemEvents) {
    push({
      id: e.id,
      timestamp: e.timestamp,
      type: e.type,
      half: e.half,
      matchTime: e.matchTime,
    });
  }

  log.sort((a, b) => a.timestamp - b.timestamp);
  return log;
}

export async function createMatch(snap: MatchSnapshot, status: MatchStatus = 'playing'): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const log = buildLogFromSnapshot(snap);
  const match: Match = {
    id,
    homeTeamId: 'home',
    awayTeamId: 'away',
    homeTeamName: snap.homeTeamName,
    awayTeamName: snap.awayTeamName,
    homeColor: snap.homeColor,
    awayColor: snap.awayColor,
    homeScore: snap.homeScore,
    awayScore: snap.awayScore,
    halfDuration: snap.halfDuration,
    competition: snap.competition ?? '',
    venue: snap.venue ?? '',
    referee: snap.referee ?? '',
    currentHalf: snap.currentHalf,
    elapsedSeconds: snap.elapsedSeconds,
    injuryTime: snap.injuryTime ?? 0,
    startedAt: now,
    status,
    config: snap.config,
    log,
    createdAt: now,
    updatedAt: now,
  };
  if (status === 'completed') {
    match.endedAt = now;
  }
  await db.matches.add(match);
  return id;
}

export async function getMatch(id: string): Promise<Match | undefined> {
  return db.matches.get(id);
}

/** Create or update a scheduled match (not_played) with date, time, location. */
export async function saveScheduledMatch(params: {
  id?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeTeamName: string;
  awayTeamName: string;
  homeColor: string;
  awayColor: string;
  halfDuration: number;
  competition: string;
  venue: string;
  referee: string;
  scheduledAt: number;
  rosterId?: string;
  awayRosterId?: string;
  config: { playerTracking: boolean; cardTracking: boolean; substitutions: boolean };
}): Promise<string> {
  const now = Date.now();
  const homeId = params.homeTeamId ?? 'home';
  const awayId = params.awayTeamId ?? 'away';
  if (params.id) {
    const existing = await db.matches.get(params.id);
    if (existing && (existing.status === 'not_played' || existing.status === 'playing')) {
      const updated: Match = {
        ...existing,
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeTeamName: params.homeTeamName,
        awayTeamName: params.awayTeamName,
        homeColor: params.homeColor,
        awayColor: params.awayColor,
        halfDuration: params.halfDuration,
        competition: params.competition ?? '',
        venue: params.venue ?? '',
        referee: params.referee ?? '',
        scheduledAt: params.scheduledAt,
        rosterId: params.rosterId,
        awayRosterId: params.awayRosterId,
        config: params.config,
        updatedAt: now,
      };
      await db.matches.put(updated);
      return params.id;
    }
  }
  const id = crypto.randomUUID();
  const match: Match = {
    id,
    homeTeamId: homeId,
    awayTeamId: awayId,
    homeTeamName: params.homeTeamName,
    awayTeamName: params.awayTeamName,
    homeColor: params.homeColor,
    awayColor: params.awayColor,
    homeScore: 0,
    awayScore: 0,
    halfDuration: params.halfDuration,
    competition: params.competition ?? '',
    venue: params.venue ?? '',
    referee: params.referee ?? '',
    scheduledAt: params.scheduledAt,
    rosterId: params.rosterId,
    awayRosterId: params.awayRosterId,
    currentHalf: 1,
    elapsedSeconds: 0,
    injuryTime: 0,
    startedAt: 0,
    status: 'not_played',
    config: params.config,
    log: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.matches.add(match);
  return id;
}

export async function updateMatch(
  id: string,
  updates: Partial<Omit<Match, 'id' | 'createdAt'>>
): Promise<void> {
  const existing = await db.matches.get(id);
  if (!existing) return;
  const updated = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  };
  await db.matches.put(updated);
}

export async function listMatches(options?: {
  status?: MatchStatus;
  limit?: number;
}): Promise<Match[]> {
  let matches = await db.matches.toArray();
  if (options?.status) {
    matches = matches.filter((m) => m.status === options.status);
  }
  matches.sort((a, b) => {
    const aTime = a.scheduledAt ?? a.updatedAt ?? a.createdAt;
    const bTime = b.scheduledAt ?? b.updatedAt ?? b.createdAt;
    return bTime - aTime;
  });
  return options?.limit ? matches.slice(0, options.limit) : matches;
}

/** Save finished match (full snapshot + log) and update player stats. If matchId given, updates that match; else creates new. */
export async function saveFinishedMatch(snap: MatchSnapshot, existingMatchId?: string): Promise<string> {
  const log = buildLogFromSnapshot(snap);
  const now = Date.now();
  const startedAt = snap.systemEvents[0]?.timestamp ?? now;
  if (existingMatchId) {
    const existing = await db.matches.get(existingMatchId);
    if (existing) {
      const updated: Match = {
        ...existing,
        homeTeamName: snap.homeTeamName,
        awayTeamName: snap.awayTeamName,
        homeColor: snap.homeColor,
        awayColor: snap.awayColor,
        homeScore: snap.homeScore,
        awayScore: snap.awayScore,
        currentHalf: snap.currentHalf,
        elapsedSeconds: snap.elapsedSeconds,
        injuryTime: snap.injuryTime ?? 0,
        startedAt,
        endedAt: now,
        status: 'completed',
        config: snap.config,
        log,
        updatedAt: now,
      };
      await db.matches.put(updated);
      await updatePlayerStatsFromLog(log, snap.playerIds);
      return existingMatchId;
    }
  }
  const id = crypto.randomUUID();
  const match: Match = {
    id,
    homeTeamId: 'home',
    awayTeamId: 'away',
    homeTeamName: snap.homeTeamName,
    awayTeamName: snap.awayTeamName,
    homeColor: snap.homeColor,
    awayColor: snap.awayColor,
    homeScore: snap.homeScore,
    awayScore: snap.awayScore,
    halfDuration: snap.halfDuration,
    competition: snap.competition ?? '',
    venue: snap.venue ?? '',
    referee: snap.referee ?? '',
    currentHalf: snap.currentHalf,
    elapsedSeconds: snap.elapsedSeconds,
    injuryTime: snap.injuryTime ?? 0,
    startedAt,
    endedAt: now,
    status: 'completed',
    config: snap.config,
    log,
    createdAt: now,
    updatedAt: now,
  };
  await db.matches.add(match);
  await updatePlayerStatsFromLog(log, snap.playerIds);
  return id;
}

/** Increment gamesPlayed for all participants; add tries/points/cards from log. */
async function updatePlayerStatsFromLog(log: LogEvent[], playerIds: string[]): Promise<void> {
  const triesDelta: Record<string, number> = {};
  const pointsDelta: Record<string, number> = {};
  const yellowDelta: Record<string, number> = {};
  const redDelta: Record<string, number> = {};
  playerIds.forEach((id) => {
    triesDelta[id] = 0;
    pointsDelta[id] = 0;
    yellowDelta[id] = 0;
    redDelta[id] = 0;
  });

  for (const ev of log) {
    if (ev.type === 'score' && ev.playerId && ev.points != null && !ev.pending) {
      pointsDelta[ev.playerId] = (pointsDelta[ev.playerId] ?? 0) + ev.points;
      if (ev.scoreType === 'try' || ev.scoreType === 'penalty-try') {
        triesDelta[ev.playerId] = (triesDelta[ev.playerId] ?? 0) + 1;
      }
    }
    if (ev.type === 'card' && ev.playerId) {
      if (ev.cardType === 'yellow') yellowDelta[ev.playerId] = (yellowDelta[ev.playerId] ?? 0) + 1;
      if (ev.cardType === 'red') redDelta[ev.playerId] = (redDelta[ev.playerId] ?? 0) + 1;
    }
  }

  for (const id of playerIds) {
    const player = await getPlayer(id);
    if (!player) continue;
    await updatePlayer(id, {
      gamesPlayed: player.gamesPlayed + 1,
      tries: player.tries + (triesDelta[id] ?? 0),
      points: player.points + (pointsDelta[id] ?? 0),
      yellowCards: player.yellowCards + (yellowDelta[id] ?? 0),
      redCards: player.redCards + (redDelta[id] ?? 0),
    });
  }
}

/** Convert in-memory state to MatchSnapshot. Used when starting (live) or finishing a match. */
export function stateToMatchSnapshot(state: {
  homeTeam: string;
  awayTeam: string;
  homeColor: string;
  awayColor: string;
  homeScore: number;
  awayScore: number;
  halfDuration: number;
  competition?: string;
  venue?: string;
  referee?: string;
  currentHalf: number;
  elapsedSeconds: number;
  injuryTime: number;
  playerTracking: boolean;
  cardTracking: boolean;
  substitutions: boolean;
  scoreEvents: MatchSnapshot['scoreEvents'];
  cards: MatchSnapshot['cards'];
  substitutionEvents: MatchSnapshot['substitutionEvents'];
  systemEvents: MatchSnapshot['systemEvents'];
  players: Array<{ id: string }>;
}): MatchSnapshot {
  return {
    homeTeamName: state.homeTeam,
    awayTeamName: state.awayTeam,
    homeColor: state.homeColor,
    awayColor: state.awayColor,
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    halfDuration: state.halfDuration,
    competition: state.competition ?? '',
    venue: state.venue ?? '',
    referee: state.referee ?? '',
    currentHalf: state.currentHalf,
    elapsedSeconds: state.elapsedSeconds,
    injuryTime: state.injuryTime,
    config: {
      playerTracking: state.playerTracking,
      cardTracking: state.cardTracking,
      substitutions: state.substitutions,
    },
    scoreEvents: state.scoreEvents,
    cards: state.cards,
    substitutionEvents: state.substitutionEvents,
    systemEvents: state.systemEvents,
    playerIds: state.players.map((p) => p.id),
  };
}
