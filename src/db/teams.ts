/**
 * Teams CRUD and seed for Rugby Scorer.
 */

import { db } from './index';
import type { Team } from './types';

const DEFAULT_HOME = { id: 'home', name: 'Our Club', color: '#3b82f6', colors: ['#3b82f6'], isOurTeam: true as boolean, createdAt: 0 };
const DEFAULT_AWAY = { id: 'away', name: 'Away', color: '#ef4444', colors: ['#ef4444'], isOurTeam: false as boolean, createdAt: 0 };

export async function getTeams(): Promise<Team[]> {
  return db.teams.toArray();
}

export async function getTeam(id: string): Promise<Team | undefined> {
  return db.teams.get(id);
}

export async function getHomeAndAway(): Promise<{ home: Team; away: Team }> {
  const [home, away] = await Promise.all([db.teams.get('home'), db.teams.get('away')]);
  return {
    home: home ?? { ...DEFAULT_HOME, createdAt: Date.now() },
    away: away ?? { ...DEFAULT_AWAY, createdAt: Date.now() },
  };
}

export async function putTeam(team: Team): Promise<void> {
  await db.teams.put(team);
}

/** Create a new team (e.g. opposition). Returns the new team id. */
export async function addTeam(name: string, color: string, isOurTeam = false): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.teams.add({
    id,
    name: name.trim(),
    color,
    colors: [color],
    isOurTeam,
    createdAt: now,
  });
  return id;
}

/** Get effective shirt colours for a team (colors array or [color] for legacy). */
export function getTeamColors(team: Team): string[] {
  if (team.colors && team.colors.length > 0) return team.colors;
  return team.color ? [team.color] : [];
}

export async function updateTeam(id: string, updates: Partial<Pick<Team, 'name' | 'color' | 'colors' | 'isOurTeam'>>): Promise<void> {
  const existing = await db.teams.get(id);
  if (!existing) return;
  await db.teams.put({ ...existing, ...updates });
}

/** Get the single team marked as "our" team (the one we manage). */
export async function getOurTeam(): Promise<Team | undefined> {
  return db.teams.filter((t) => t.isOurTeam === true).first();
}

/** Ensure default home/away teams exist. Call on app init. */
export async function seedDefaultTeamsIfNeeded(): Promise<void> {
  const count = await db.teams.count();
  if (count > 0) return;
  const now = Date.now();
  await db.teams.bulkAdd([
    { ...DEFAULT_HOME, colors: DEFAULT_HOME.colors ?? [DEFAULT_HOME.color], createdAt: now },
    { ...DEFAULT_AWAY, colors: DEFAULT_AWAY.colors ?? [DEFAULT_AWAY.color], createdAt: now },
  ]);
}
