/**
 * Players CRUD for Rugby Scorer (roster + stats).
 */

import { db } from './index';
import type { Player } from './types';

export async function getPlayersByTeam(teamId: string): Promise<Player[]> {
  return db.players.where('teamId').equals(teamId).sortBy('number');
}

export async function getAllPlayers(): Promise<Player[]> {
  const byTeam = await db.players.orderBy('teamId').toArray();
  return byTeam.sort((a, b) => a.number - b.number);
}

export async function getPlayer(id: string): Promise<Player | undefined> {
  return db.players.get(id);
}

export async function addPlayer(
  player: Omit<Player, 'id' | 'createdAt' | 'updatedAt' | 'gamesPlayed' | 'tries' | 'points' | 'yellowCards' | 'redCards' | 'active'>
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.players.add({
    ...player,
    id,
    active: true,
    gamesPlayed: 0,
    tries: 0,
    points: 0,
    yellowCards: 0,
    redCards: 0,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updatePlayer(
  id: string,
  updates: Partial<Omit<Player, 'id' | 'teamId' | 'createdAt'>>
): Promise<void> {
  const existing = await db.players.get(id);
  if (!existing) return;
  const updated = { ...existing, ...updates, updatedAt: Date.now() };
  await db.players.put(updated);
}

export async function deletePlayer(id: string): Promise<void> {
  await db.players.delete(id);
}
