/**
 * Rosters and roster entries CRUD.
 * Roster = named squad (e.g. "First XV"); entries = 23 slots (number, position, optional playerId).
 */

import { db } from './index';
import type { Roster, RosterEntry } from './types';

const DEFAULT_POSITIONS = [
  'Loosehead Prop', 'Hooker', 'Tighthead Prop', 'Lock', 'Lock', 'Blindside Flanker', 'Openside Flanker', 'Number 8',
  'Scrum Half', 'Fly Half', 'Left Wing', 'Inside Centre', 'Outside Centre', 'Right Wing', 'Full Back',
  'Sub', 'Sub', 'Sub', 'Sub', 'Sub', 'Sub', 'Sub', 'Sub',
];

export async function getRostersByTeam(teamId: string): Promise<Roster[]> {
  return db.rosters.where('teamId').equals(teamId).sortBy('createdAt');
}

export async function getRoster(id: string): Promise<Roster | undefined> {
  return db.rosters.get(id);
}

export async function getRosterEntries(rosterId: string): Promise<RosterEntry[]> {
  return db.rosterEntries.where('rosterId').equals(rosterId).sortBy('number');
}

export async function createRoster(teamId: string, name: string): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.rosters.add({ id, teamId, name, createdAt: now });
  for (let n = 1; n <= 23; n++) {
    await db.rosterEntries.add({
      id: crypto.randomUUID(),
      rosterId: id,
      number: n,
      position: DEFAULT_POSITIONS[n - 1] ?? 'Sub',
      createdAt: now,
    });
  }
  return id;
}

export async function updateRoster(id: string, updates: Partial<Pick<Roster, 'name'>>): Promise<void> {
  const existing = await db.rosters.get(id);
  if (!existing) return;
  await db.rosters.put({ ...existing, ...updates });
}

export async function updateRosterEntry(
  id: string,
  updates: Partial<Pick<RosterEntry, 'number' | 'position' | 'playerId'>>
): Promise<void> {
  const existing = await db.rosterEntries.get(id);
  if (!existing) return;
  await db.rosterEntries.put({ ...existing, ...updates });
}

export async function deleteRoster(id: string): Promise<void> {
  await db.rosterEntries.where('rosterId').equals(id).delete();
  await db.rosters.delete(id);
}
