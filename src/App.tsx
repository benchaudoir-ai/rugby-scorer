import React, { useState, useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  AppShell,
  AppShellHeader,
  AppShellMain,
  AppShellFooter,
  Group,
  Button,
  Title,
  Text,
  Card,
  Stack,
  Box,
  ActionIcon,
  SimpleGrid,
  Table,
  ScrollArea,
} from '@mantine/core';
import { IconArrowLeft, IconHome, IconCalendar, IconUsers, IconList } from '@tabler/icons-react';
import { seedDefaultTeamsIfNeeded, getTeams, addTeam, updateTeam, getTeamColors } from './db/teams';
import { getPlayersByTeam, addPlayer as dbAddPlayer, updatePlayer as dbUpdatePlayer, deletePlayer as dbDeletePlayer } from './db/players';
import { saveFinishedMatch, stateToMatchSnapshot, listMatches, getMatch, saveScheduledMatch, updateMatch } from './db/matches';
import { getRostersByTeam, getRosterEntries, createRoster, updateRosterEntry, deleteRoster } from './db/rosters';
import { getPlayer } from './db/players';
import { seedSampleData } from './db/seed';
import type { Player as DbPlayer, Match as DbMatch, LogEvent, Team as DbTeam } from './db/types';

// Types
interface Player {
  id: string;
  number: number;
  name: string;
  position: string;
  isStarter: boolean;
  team: 'home' | 'away';
}

interface ScoreEvent {
  id: string;
  timestamp: number;
  team: 'home' | 'away';
  type: 'try' | 'conversion' | 'penalty' | 'drop-goal' | 'penalty-try';
  points: number;
  player?: string;
  half: number;
  minute: number;
  matchTime: number;
  pending?: boolean;
}

interface Card {
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
}

interface Substitution {
  id: string;
  timestamp: number;
  team: 'home' | 'away';
  offPlayerId: string;
  onPlayerId: string;
  half: number;
  minute: number;
  matchTime: number;
}

interface SystemEvent {
  id: string;
  timestamp: number;
  type: 'match-start' | 'half-time' | 'match-end';
  half: number;
  matchTime: number;
}

interface CardReturnEvent {
  id: string;
  timestamp: number;
  cardId: string;
  team: 'home' | 'away';
  playerId: string;
  matchTime: number;
}

interface MatchConfig {
  homeTeam: string;
  awayTeam: string;
  homeColor: string;
  awayColor: string;
  halfDuration: number;
  playerTracking: boolean;
  cardTracking: boolean;
  substitutions: boolean;
  competition?: string;
  venue?: string;
  referee?: string;
}

interface MatchState extends MatchConfig {
  homeScore: number;
  awayScore: number;
  scoreEvents: ScoreEvent[];
  cards: Card[];
  players: Player[];
  substitutionEvents: Substitution[];
  systemEvents: SystemEvent[];
  cardReturnEvents: CardReturnEvent[];
  currentHalf: number;
  elapsedSeconds: number;
  injuryTime: number;
  isRunning: boolean;
  lastTryTeam: 'home' | 'away' | null;
  matchStarted: boolean;
  /** When starting from a scheduled match, we update this row on End instead of creating new. */
  currentMatchId: string | null;
}

// Zustand Store with full persistence
const useMatchStore = create<MatchState & {
  addScore: (team: 'home' | 'away', type: ScoreEvent['type'], player?: string, pending?: boolean) => void;
  addCard: (team: 'home' | 'away', player: string, type: 'yellow' | 'red') => void;
  addPlayer: (player: Omit<Player, 'id'>) => void;
  setPlayers: (players: Player[]) => void;
  updatePlayer: (id: string, updates: Partial<Player>) => void;
  deletePlayer: (id: string) => void;
  addSubstitution: (team: 'home' | 'away', offPlayerId: string, onPlayerId: string, onPlayer?: Player) => void;
  returnFromSinBin: (cardId: string) => void;
  resolvePendingEvent: (eventId: string, approved: boolean) => void;
  updateScoreEventPlayer: (eventId: string, playerId: string | undefined) => void;
  removeScoreEvent: (eventId: string) => void;
  removeCard: (cardId: string) => void;
  removeSubstitution: (subId: string) => void;
  undo: () => void;
  toggleTimer: () => void;
  tick: () => void;
  addInjuryTime: () => void;
  nextHalf: () => void;
  updateConfig: (config: Partial<MatchConfig>) => void;
  startMatch: () => void;
  endMatch: () => void;
  setCurrentMatchId: (id: string | null) => void;
  showSubstitutionModal: boolean;
  setShowSubstitutionModal: (v: boolean) => void;
}>(
  persist(
    (set, get) => ({
      // Match state
      homeTeam: 'Home',
      awayTeam: 'Away',
      homeScore: 0,
      awayScore: 0,
      scoreEvents: [],
      cards: [],
      players: [],
      substitutionEvents: [],
      systemEvents: [],
      cardReturnEvents: [],
      currentHalf: 1,
      elapsedSeconds: 0,
      injuryTime: 0,
      isRunning: false,
      halfDuration: 40 * 60,
      lastTryTeam: null,
      matchStarted: false,
      currentMatchId: null,

      // Config
      homeColor: '#3b82f6',
      awayColor: '#ef4444',
      playerTracking: true,
      cardTracking: true,
      substitutions: false,
      competition: '',
      venue: '',
      referee: '',

      updateConfig: (config) => set(config),
      
      startMatch: () => {
        const ev: SystemEvent = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: 'match-start',
          half: 1,
          matchTime: 0,
        };
        set({ matchStarted: true, systemEvents: [ev] });
      },

      endMatch: () => set((state) => {
        const closeEv: SystemEvent = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: 'match-end',
          half: state.currentHalf,
          matchTime: state.elapsedSeconds,
        };
        return {
          matchStarted: false,
          homeScore: 0,
          awayScore: 0,
          scoreEvents: [],
          cards: [],
          players: [],
          substitutionEvents: [],
          systemEvents: [...state.systemEvents, closeEv],
          cardReturnEvents: [],
          currentHalf: 1,
          elapsedSeconds: 0,
          injuryTime: 0,
          isRunning: false,
          lastTryTeam: null,
          currentMatchId: null,
        };
      }),
      setCurrentMatchId: (id) => set({ currentMatchId: id }),
      showSubstitutionModal: false,
      setShowSubstitutionModal: (v) => set({ showSubstitutionModal: v }),

      addSubstitution: (team, offPlayerId, onPlayerId, onPlayer) => {
        const state = get();
        const sub: Substitution = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          team,
          offPlayerId,
          onPlayerId,
          half: state.currentHalf,
          minute: Math.floor(state.elapsedSeconds / 60),
          matchTime: state.elapsedSeconds,
        };
        const hasOnPlayer = state.players.some((p) => p.id === onPlayerId);
        if (!hasOnPlayer && onPlayer) {
          set({
            substitutionEvents: [...state.substitutionEvents, sub],
            players: [...state.players, onPlayer],
          });
        } else {
          set({ substitutionEvents: [...state.substitutionEvents, sub] });
        }
        if ('vibrate' in navigator) navigator.vibrate(50);
      },

      updateScoreEventPlayer: (eventId, playerId) => {
        set((state) => ({
          scoreEvents: state.scoreEvents.map((e) =>
            e.id === eventId ? { ...e, player: playerId } : e
          ),
        }));
      },

      removeScoreEvent: (eventId) => {
        set((state) => {
          const scoreEvents = state.scoreEvents.filter((e) => e.id !== eventId);
          let homeScore = 0;
          let awayScore = 0;
          let lastTryTeam: 'home' | 'away' | null = null;
          for (const e of scoreEvents) {
            if (e.pending) continue;
            if (e.team === 'home') homeScore += e.points ?? 0;
            else awayScore += e.points ?? 0;
            if (e.type === 'try' || e.type === 'penalty-try') lastTryTeam = e.team;
            if (e.type === 'conversion') lastTryTeam = e.team;
          }
          return { scoreEvents, homeScore, awayScore, lastTryTeam };
        });
      },

      removeCard: (cardId) => {
        set((state) => ({ cards: state.cards.filter((c) => c.id !== cardId) }));
      },

      removeSubstitution: (subId) => {
        set((state) => ({ substitutionEvents: state.substitutionEvents.filter((s) => s.id !== subId) }));
      },

      addScore: (team, type, player, pending = false) => {
        const state = get();
        
        // Prevent conversion if no recent try or if last try was pending
        if (type === 'conversion') {
          const lastTry = state.scoreEvents
            .filter(e => e.type === 'try' && !e.pending)
            .slice(-1)[0];
          if (!lastTry || lastTry.team !== team) return;
        }

        const points = {
          'try': 5,
          'conversion': 2,
          'penalty': 3,
          'drop-goal': 3,
          'penalty-try': 7,
        }[type];

        const event: ScoreEvent = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          team,
          type,
          points,
          player,
          half: state.currentHalf,
          minute: Math.floor(state.elapsedSeconds / 60),
          matchTime: state.elapsedSeconds,
          pending,
        };

        const scoreKey = team === 'home' ? 'homeScore' : 'awayScore';
        const newScore = pending ? state[scoreKey] : state[scoreKey] + points;
        
        set({
          [scoreKey]: newScore,
          scoreEvents: [...state.scoreEvents, event],
          lastTryTeam: (type === 'try' || type === 'penalty-try') && !pending ? team : null,
        });
        
        // Trigger haptic feedback
        if ('vibrate' in navigator) {
          navigator.vibrate(pending ? 100 : 50);
        }
      },

      addCard: (team, player, type) => {
        const state = get();
        const card: Card = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          team,
          player,
          type,
          half: state.currentHalf,
          minute: Math.floor(state.elapsedSeconds / 60),
          matchTime: state.elapsedSeconds,
          returnTime: type === 'yellow' ? state.elapsedSeconds + 600 : undefined,
          returned: false,
        };

        set({ cards: [...state.cards, card] });
        
        if ('vibrate' in navigator) {
          navigator.vibrate([100, 50, 100]);
        }
      },

      addPlayer: (playerData) => {
        const state = get();
        const player: Player = {
          ...playerData,
          id: crypto.randomUUID(),
        };
        set({ players: [...state.players, player] });
      },

      setPlayers: (players) => set({ players }),

      updatePlayer: (id, updates) => {
        const state = get();
        set({
          players: state.players.map(p => p.id === id ? { ...p, ...updates } : p)
        });
      },

      deletePlayer: (id) => {
        const state = get();
        set({
          players: state.players.filter(p => p.id !== id)
        });
      },

      returnFromSinBin: (cardId) => {
        const state = get();
        const card = state.cards.find(c => c.id === cardId);
        if (!card) return;
        const returnEv: CardReturnEvent = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          cardId,
          team: card.team,
          playerId: card.player,
          matchTime: state.elapsedSeconds,
        };
        set({
          cards: state.cards.map(c => c.id === cardId ? { ...c, returned: true } : c),
          cardReturnEvents: [...state.cardReturnEvents, returnEv],
        });
      },

      resolvePendingEvent: (eventId, approved) => {
        const state = get();
        const event = state.scoreEvents.find(e => e.id === eventId);
        if (!event) return;

        if (approved) {
          const scoreKey = event.team === 'home' ? 'homeScore' : 'awayScore';
          set({
            scoreEvents: state.scoreEvents.map(e => 
              e.id === eventId ? { ...e, pending: false } : e
            ),
            [scoreKey]: state[scoreKey] + event.points,
            lastTryTeam: (event.type === 'try' || event.type === 'penalty-try') ? event.team : null,
          });
        } else {
          set({
            scoreEvents: state.scoreEvents.filter(e => e.id !== eventId)
          });
        }
      },

      undo: () => {
        const state = get();
        const lastEvent = state.scoreEvents[state.scoreEvents.length - 1];
        const lastCard = state.cards[state.cards.length - 1];
        const lastSub = state.substitutionEvents[state.substitutionEvents.length - 1];

        const lastEventTime = lastEvent?.timestamp || 0;
        const lastCardTime = lastCard?.timestamp || 0;
        const lastSubTime = lastSub?.timestamp || 0;

        if (lastSubTime >= lastEventTime && lastSubTime >= lastCardTime && lastSub) {
          set({ substitutionEvents: state.substitutionEvents.slice(0, -1) });
        } else if (lastEventTime > lastCardTime && lastEventTime > lastSubTime && lastEvent) {
          const scoreKey = lastEvent.team === 'home' ? 'homeScore' : 'awayScore';
          const scoreAdjustment = lastEvent.pending ? 0 : lastEvent.points;
          set({
            [scoreKey]: state[scoreKey] - scoreAdjustment,
            scoreEvents: state.scoreEvents.slice(0, -1),
            lastTryTeam: lastEvent.type === 'conversion' ? lastEvent.team :
                        state.scoreEvents[state.scoreEvents.length - 2]?.type === 'try' ?
                        state.scoreEvents[state.scoreEvents.length - 2].team : null,
          });
        } else if (lastCard) {
          set({ cards: state.cards.slice(0, -1) });
        }

        if ('vibrate' in navigator) navigator.vibrate(30);
      },

      toggleTimer: () => set((state) => ({ isRunning: !state.isRunning })),

      tick: () => {
        const state = get();
        if (!state.isRunning) return;
        
        const newElapsed = state.elapsedSeconds + 1;
        set({ elapsedSeconds: newElapsed });
      },

      addInjuryTime: () => {
        set((state) => ({ injuryTime: state.injuryTime + 60 }));
      },

      nextHalf: () => set((state) => {
        const halfEv: SystemEvent = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: 'half-time',
          half: state.currentHalf,
          matchTime: state.elapsedSeconds,
        };
        return {
          systemEvents: [...state.systemEvents, halfEv],
          currentHalf: state.currentHalf + 1,
          elapsedSeconds: 0,
          injuryTime: 0,
          isRunning: false,
        };
      }),
    }),
    {
      name: 'rugby-match-storage',
      version: 5,
      partialize: (state) => {
        const { showSubstitutionModal, setShowSubstitutionModal, ...rest } = state as typeof state & { showSubstitutionModal?: boolean; setShowSubstitutionModal?: (v: boolean) => void };
        return rest;
      },
      migrate: (state: unknown) => {
        const s = state as Record<string, unknown>;
        return { ...s, cardReturnEvents: s.cardReturnEvents ?? [] };
      },
    }
  )
);

// Who is on pitch vs on bench (considering subs, red cards, sin bin)
function getSquadStatus(
  team: 'home' | 'away',
  players: Player[],
  substitutionEvents: Substitution[],
  cards: Card[],
  elapsedSeconds: number
): { onPitch: Player[]; onBench: Player[] } {
  const teamPlayers = players.filter((p) => p.team === team).sort((a, b) => a.number - b.number);
  const teamSubs = substitutionEvents.filter((s: Substitution) => s.team === team);
  const redCardedIds = new Set(
    cards.filter((c) => c.team === team && c.type === 'red').map((c) => c.player)
  );
  const inSinBinIds = new Set(
    cards.filter(
      (c) =>
        c.team === team &&
        c.type === 'yellow' &&
        !c.returned &&
        c.returnTime != null &&
        elapsedSeconds < c.returnTime
    ).map((c) => c.player)
  );

  const currentlyOnPitch = new Set<string>();
  teamPlayers.forEach((p) => {
    if (p.isStarter) currentlyOnPitch.add(p.id);
  });
  teamSubs.forEach((sub: Substitution) => {
    currentlyOnPitch.delete(sub.offPlayerId);
    currentlyOnPitch.add(sub.onPlayerId);
  });

  const onPitch = teamPlayers.filter(
    (p) =>
      currentlyOnPitch.has(p.id) &&
      !redCardedIds.has(p.id) &&
      !inSinBinIds.has(p.id)
  );
  const onBench = teamPlayers.filter((p) => !currentlyOnPitch.has(p.id));

  return { onPitch, onBench };
}

// Timer Effect
const useTimer = () => {
  const tick = useMatchStore((state) => state.tick);
  
  useEffect(() => {
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [tick]);
};

// Prevent sleep during match
const useWakeLock = (isActive: boolean) => {
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) {
        console.log('Wake Lock not supported');
      }
    };

    if (isActive) {
      requestWakeLock();
    }

    return () => {
      if (wakeLock) {
        wakeLock.release();
      }
    };
  }, [isActive]);
};

// Format time
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const getHalfLabel = (half: number) => {
  if (half === 1) return '1st Half';
  if (half === 2) return '2nd Half';
  return `${half}th Half`;
};

// Predefined color palette
const TEAM_COLORS = [
  { name: 'Blue', value: '#3b82f6', contrast: '#ffffff' },
  { name: 'Red', value: '#ef4444', contrast: '#ffffff' },
  { name: 'Green', value: '#22c55e', contrast: '#000000' },
  { name: 'Yellow', value: '#eab308', contrast: '#000000' },
  { name: 'Purple', value: '#a855f7', contrast: '#ffffff' },
  { name: 'Orange', value: '#f97316', contrast: '#ffffff' },
  { name: 'Pink', value: '#ec4899', contrast: '#ffffff' },
  { name: 'Teal', value: '#14b8a6', contrast: '#000000' },
  { name: 'Indigo', value: '#6366f1', contrast: '#ffffff' },
  { name: 'Black', value: '#18181b', contrast: '#ffffff' },
  { name: 'White', value: '#fafafa', contrast: '#000000' },
  { name: 'Navy', value: '#1e3a8a', contrast: '#ffffff' },
];

const DEFAULT_PLAYER_POSITIONS: string[] = [
  'Loosehead Prop',
  'Hooker',
  'Tighthead Prop',
  'Lock / Second Row',
  'Lock / Second Row',
  'Blindside Flanker',
  'Openside Flanker',
  'Number 8',
  'Scrum-half',
  'Fly-half',
  'Left Wing',
  'Inside Centre',
  'Outside Centre',
  'Right Wing',
  'Full-back',
  'Sub',
  'Sub',
  'Sub',
  'Sub',
  'Sub',
  'Sub',
  'Sub',
  'Sub',
];

// Shirt/jersey icon for colour picker
const ShirtIcon: React.FC<{ fill: string; selected?: boolean }> = ({ fill, selected }) => (
  <svg width="48" height="56" viewBox="0 0 48 56" className="block">
    <path
      d="M24 4 L28 12 L36 12 L38 20 L44 20 L44 52 L4 52 L4 20 L10 20 L12 12 L20 12 Z"
      fill={fill}
      stroke={selected ? '#fff' : '#52525b'}
      strokeWidth={selected ? 3 : 1.5}
      strokeLinejoin="round"
    />
    <circle cx="24" cy="28" r="4" fill="rgba(0,0,0,0.15)" />
  </svg>
);

export type AppView = 'home' | 'setup' | 'players' | 'matches';

const NavContext = React.createContext<((view: AppView) => void) | null>(null);

const NAV_ITEMS: { view: AppView; label: string; icon: React.ReactNode }[] = [
  { view: 'home', label: 'Home', icon: <IconHome size={22} /> },
  { view: 'setup', label: 'Setup', icon: <IconCalendar size={22} /> },
  { view: 'players', label: 'Teams', icon: <IconUsers size={22} /> },
  { view: 'matches', label: 'Matches', icon: <IconList size={22} /> },
];

// Layout wrapper: AppShell with header + bottom nav (mobile-first, touch-friendly)
const ShellLayout: React.FC<{
  view: AppView;
  setView: (v: AppView) => void;
  children: React.ReactNode;
}> = ({ view, setView, children }) => (
  <AppShell
    header={{ height: 56 }}
    footer={{ height: 64 }}
    padding="md"
    styles={{
      main: { paddingBottom: 80, minHeight: '100vh' },
    }}
  >
    <AppShellHeader>
      <Group h="100%" px="md" justify="space-between">
        {view !== 'home' ? (
          <ActionIcon
            variant="subtle"
            size="lg"
            onClick={() => setView('home')}
            aria-label="Back to home"
          >
            <IconArrowLeft size={24} />
          </ActionIcon>
        ) : (
          <Box />
        )}
        <Title order={4} style={{ flex: 1, textAlign: 'center' }}>
          Rugby Scorer
        </Title>
        <Box w={40} />
      </Group>
    </AppShellHeader>
    <AppShellMain>{children}</AppShellMain>
    <AppShellFooter>
      <Group justify="space-around" h="100%" px="xs" gap="xs">
        {NAV_ITEMS.map(({ view: v, label, icon }) => (
          <Button
            key={v}
            variant={view === v ? 'filled' : 'subtle'}
            size="md"
            leftSection={icon}
            onClick={() => setView(v)}
            style={{ flex: 1, minWidth: 0 }}
          >
            {label}
          </Button>
        ))}
      </Group>
    </AppShellFooter>
  </AppShell>
);

// Home / Start page – Mantine UI–inspired hero + workflow cards
const HomePage: React.FC<{ onNavigate: (view: AppView) => void }> = ({ onNavigate }) => (
  <Box maw={560} mx="auto" py="xl">
    <Stack gap="xl">
      {/* Hero */}
      <Box ta="center" pb="lg">
        <Title order={1} fw={800} style={{ fontSize: 'clamp(2rem, 5vw, 2.75rem)', lineHeight: 1.2, letterSpacing: '-0.02em' }}>
          Rugby Scorer
        </Title>
        <Text size="lg" c="dimmed" mt="sm" maw={400} mx="auto">
          Score matches live, manage teams and rosters, track results.
        </Text>
      </Box>

      {/* Primary CTA */}
      <Box ta="center">
        <Button
          size="lg"
          radius="md"
          variant="filled"
          leftSection={<IconCalendar size={20} stroke={2} />}
          onClick={() => onNavigate('setup')}
          style={{ fontWeight: 700 }}
        >
          Match setup
        </Button>
        <Text size="xs" c="dimmed" mt="xs">Configure teams and start a match</Text>
      </Box>

      {/* Section: Workflows (Mantine UI–style application cards) */}
      <Box pt="md">
        <Text
          component="span"
          size="sm"
          fw={700}
          tt="uppercase"
          c="dimmed"
          style={{ letterSpacing: '0.05em' }}
        >
          Workflows
        </Text>
        <SimpleGrid cols={1} spacing="md" mt="sm">
          <Card
            shadow="sm"
            padding="lg"
            radius="md"
            withBorder
            component="button"
            onClick={() => onNavigate('players')}
            style={{ textAlign: 'left', cursor: 'pointer' }}
          >
            <Group justify="space-between" wrap="nowrap">
              <Box style={{ minWidth: 0 }}>
                <Title order={4} mb={4}>Manage teams</Title>
                <Text size="sm" c="dimmed">Rosters, players and team setup</Text>
              </Box>
              <ActionIcon variant="subtle" size="lg" radius="md" style={{ flexShrink: 0 }}>
                <IconUsers size={22} stroke={1.5} />
              </ActionIcon>
            </Group>
          </Card>
          <Card
            shadow="sm"
            padding="lg"
            radius="md"
            withBorder
            component="button"
            onClick={() => onNavigate('matches')}
            style={{ textAlign: 'left', cursor: 'pointer' }}
          >
            <Group justify="space-between" wrap="nowrap">
              <Box style={{ minWidth: 0 }}>
                <Title order={4} mb={4}>Match management</Title>
                <Text size="sm" c="dimmed">Past matches and results</Text>
              </Box>
              <ActionIcon variant="subtle" size="lg" radius="md" style={{ flexShrink: 0 }}>
                <IconList size={22} stroke={1.5} />
              </ActionIcon>
            </Group>
          </Card>
        </SimpleGrid>
      </Box>
    </Stack>
  </Box>
);

// Game Setup Screen
const GameSetup: React.FC<{ onBack: () => void; onNavigate: (view: AppView) => void }> = ({ onNavigate }) => {
  const config = useMatchStore();
  const updateConfig = useMatchStore((state) => state.updateConfig);
  const startMatch = useMatchStore((state) => state.startMatch);
  const setPlayers = useMatchStore((state) => state.setPlayers);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [scheduledMatches, setScheduledMatches] = useState<DbMatch[]>([]);
  const [rosterOptions, setRosterOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedRosterId, setSelectedRosterId] = useState<string | null>(null);
  const [awayRosterOptions, setAwayRosterOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedAwayRosterId, setSelectedAwayRosterId] = useState<string | null>(null);
  const [setupTeams, setSetupTeams] = useState<DbTeam[]>([]);
  const [homeTeamId, setHomeTeamId] = useState<string>('home');
  const [awayTeamId, setAwayTeamId] = useState<string>('away');
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [addTeamFor, setAddTeamFor] = useState<'home' | 'away' | null>(null);
  const [newTeamForm, setNewTeamForm] = useState({ name: '', color: '#3b82f6' });
  const setCurrentMatchId = useMatchStore((s) => s.setCurrentMatchId);

  const handleCreateTeamFromSetup = async () => {
    if (!newTeamForm.name.trim() || !addTeamFor) return;
    const id = await addTeam(newTeamForm.name.trim(), newTeamForm.color);
    const teams = await getTeams();
    setSetupTeams(teams);
    if (addTeamFor === 'home') setHomeTeamId(id);
    else setAwayTeamId(id);
    setShowAddTeamModal(false);
    setAddTeamFor(null);
    setNewTeamForm({ name: '', color: '#3b82f6' });
    setIsDirty(true);
  };

  const loadScheduledMatches = async () => {
    const all = await listMatches({ limit: 50 });
    setScheduledMatches(all.filter((m) => m.status !== 'completed'));
  };

  const selectedHomeTeam = setupTeams.find((t) => t.id === homeTeamId);
  const selectedAwayTeam = setupTeams.find((t) => t.id === awayTeamId);
  const homeColors = selectedHomeTeam ? getTeamColors(selectedHomeTeam) : [];
  const awayColors = selectedAwayTeam ? getTeamColors(selectedAwayTeam) : [];

  // Load teams list on mount
  useEffect(() => {
    getTeams().then(setSetupTeams);
  }, []);

  // Sync config when home/away team or colours change
  useEffect(() => {
    if (selectedHomeTeam) {
      updateConfig({ homeTeam: selectedHomeTeam.name });
      if (homeColors.length > 0 && !homeColors.includes(config.homeColor)) updateConfig({ homeColor: homeColors[0] });
    }
    if (selectedAwayTeam) {
      updateConfig({ awayTeam: selectedAwayTeam.name });
      if (awayColors.length > 0 && !awayColors.includes(config.awayColor)) updateConfig({ awayColor: awayColors[0] });
    }
  }, [selectedHomeTeam?.id, selectedAwayTeam?.id, homeColors.join(','), awayColors.join(',')]);

  // Load roster options for both teams and players (from rosters or team pool)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [homeRosters, awayRosters, homePlayers, awayPlayers] = await Promise.all([
        getRostersByTeam(homeTeamId),
        getRostersByTeam(awayTeamId),
        getPlayersByTeam(homeTeamId),
        getPlayersByTeam(awayTeamId),
      ]);
      if (cancelled) return;
      setRosterOptions(homeRosters.map((r) => ({ id: r.id, name: r.name })));
      setAwayRosterOptions(awayRosters.map((r) => ({ id: r.id, name: r.name })));
      let homeMapped: Player[];
      if (selectedRosterId && homeRosters.some((r) => r.id === selectedRosterId)) {
        const entries = await getRosterEntries(selectedRosterId);
        if (cancelled) return;
        homeMapped = await Promise.all(
          entries.map(async (entry) => {
            const p = entry.playerId ? await getPlayer(entry.playerId) : undefined;
            const usePlayer = p && (p as DbPlayer & { active?: boolean }).active !== false;
            return {
              id: usePlayer ? p!.id : `roster-${selectedRosterId}-${entry.number}`,
              number: entry.number,
              name: usePlayer ? p!.name : `Player ${entry.number}`,
              position: entry.position,
              isStarter: entry.number <= 15,
              team: 'home' as const,
            };
          })
        );
      } else {
        homeMapped = homePlayers.map((p) => ({
          id: p.id,
          number: p.number,
          name: p.name,
          position: p.position,
          isStarter: p.isStarter,
          team: 'home' as const,
        }));
      }
      let awayMapped: Player[];
      if (selectedAwayRosterId && awayRosters.some((r) => r.id === selectedAwayRosterId)) {
        const entries = await getRosterEntries(selectedAwayRosterId);
        if (cancelled) return;
        awayMapped = await Promise.all(
          entries.map(async (entry) => {
            const p = entry.playerId ? await getPlayer(entry.playerId) : undefined;
            const usePlayer = p && (p as DbPlayer & { active?: boolean }).active !== false;
            return {
              id: usePlayer ? p!.id : `roster-away-${selectedAwayRosterId}-${entry.number}`,
              number: entry.number,
              name: usePlayer ? p!.name : `Player ${entry.number}`,
              position: entry.position,
              isStarter: entry.number <= 15,
              team: 'away' as const,
            };
          })
        );
      } else {
        awayMapped = awayPlayers.map((p) => ({
          id: p.id,
          number: p.number,
          name: p.name,
          position: p.position,
          isStarter: p.isStarter,
          team: 'away' as const,
        }));
      }
      setPlayers([...homeMapped, ...awayMapped]);
    })();
    return () => { cancelled = true; };
  }, [homeTeamId, awayTeamId, selectedRosterId, selectedAwayRosterId, updateConfig, setPlayers]);

  useEffect(() => {
    loadScheduledMatches();
  }, []);

  const handleFieldChange = (field: string, value: any) => {
    updateConfig({ [field]: value });
    setIsDirty(true);
    if (errors[field]) setErrors({ ...errors, [field]: '' });
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!homeTeamId || !awayTeamId) {
      if (!homeTeamId) newErrors.homeTeam = 'Select home team';
      if (!awayTeamId) newErrors.awayTeam = 'Select away team';
    } else if (homeTeamId === awayTeamId) {
      newErrors.awayTeam = 'Home and away must be different teams';
    }
    
    if (config.homeColor === config.awayColor && config.homeColor) {
      newErrors.awayColor = newErrors.awayTeam || 'Shirt colours must be different';
    }
    
    // halfDuration is stored in seconds, but the UI and validation are in minutes
    const halfDurationMinutes = config.halfDuration / 60;
    if (halfDurationMinutes < 5 || halfDurationMinutes > 60) {
      newErrors.halfDuration = 'Half duration must be between 5 and 60 minutes';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleStartMatch = () => {
    if (validate()) {
      if (isDirty || confirm('Start match with these settings?')) {
        startMatch();
      }
    }
  };

  const handleSaveMatch = async () => {
    if (!validate()) return;
    const scheduledAt = scheduledDate && scheduledTime
      ? new Date(scheduledDate + 'T' + scheduledTime).getTime()
      : Date.now();
    try {
      const id = await saveScheduledMatch({
        id: editingMatchId ?? undefined,
        homeTeamId,
        awayTeamId,
        homeTeamName: config.homeTeam,
        awayTeamName: config.awayTeam,
        homeColor: config.homeColor,
        awayColor: config.awayColor,
        halfDuration: config.halfDuration,
        competition: config.competition ?? '',
        venue: config.venue ?? '',
        referee: config.referee ?? '',
        scheduledAt,
        rosterId: selectedRosterId ?? undefined,
        awayRosterId: selectedAwayRosterId ?? undefined,
        config: {
          playerTracking: config.playerTracking,
          cardTracking: config.cardTracking,
          substitutions: config.substitutions,
        },
      });
      setEditingMatchId(id);
      setIsDirty(false);
      loadScheduledMatches();
    } catch (e) {
      console.error('Failed to save match', e);
    }
  };

  const handleLoadMatchForEdit = (m: DbMatch) => {
    setHomeTeamId(m.homeTeamId);
    setAwayTeamId(m.awayTeamId);
    updateConfig({
      homeTeam: m.homeTeamName,
      awayTeam: m.awayTeamName,
      homeColor: m.homeColor,
      awayColor: m.awayColor,
      halfDuration: m.halfDuration,
      competition: m.competition ?? '',
      venue: m.venue ?? '',
      referee: m.referee ?? '',
      playerTracking: m.config?.playerTracking ?? true,
      cardTracking: m.config?.cardTracking ?? true,
      substitutions: m.config?.substitutions ?? false,
    });
    setScheduledDate(m.scheduledAt ? new Date(m.scheduledAt).toISOString().slice(0, 10) : '');
    setScheduledTime(m.scheduledAt ? new Date(m.scheduledAt).toISOString().slice(11, 16) : '');
    setEditingMatchId(m.id);
    setSelectedRosterId(m.rosterId ?? null);
    setSelectedAwayRosterId(m.awayRosterId ?? null);
    setIsDirty(false);
  };

  const handleStartScheduledMatch = async (m: DbMatch) => {
    const [homeRosters, awayRosters, homePlayers, awayPlayers] = await Promise.all([
      getRostersByTeam(m.homeTeamId),
      getRostersByTeam(m.awayTeamId),
      getPlayersByTeam(m.homeTeamId),
      getPlayersByTeam(m.awayTeamId),
    ]);
    let homeMapped: Player[];
    if (m.rosterId && homeRosters.some((r) => r.id === m.rosterId)) {
      const entries = await getRosterEntries(m.rosterId);
      homeMapped = await Promise.all(
        entries.map(async (entry) => {
          const p = entry.playerId ? await getPlayer(entry.playerId) : undefined;
          const usePlayer = p && (p as DbPlayer & { active?: boolean }).active !== false;
          return {
            id: usePlayer ? p!.id : `roster-${m.rosterId}-${entry.number}`,
            number: entry.number,
            name: usePlayer ? p!.name : `Player ${entry.number}`,
            position: entry.position,
            isStarter: entry.number <= 15,
            team: 'home' as const,
          };
        })
      );
    } else {
      homeMapped = homePlayers.map((p) => ({ id: p.id, number: p.number, name: p.name, position: p.position, isStarter: p.isStarter, team: 'home' as const }));
    }
    let awayMapped: Player[];
    if (m.awayRosterId && awayRosters.some((r) => r.id === m.awayRosterId)) {
      const entries = await getRosterEntries(m.awayRosterId);
      awayMapped = await Promise.all(
        entries.map(async (entry) => {
          const p = entry.playerId ? await getPlayer(entry.playerId) : undefined;
          const usePlayer = p && (p as DbPlayer & { active?: boolean }).active !== false;
          return {
            id: usePlayer ? p!.id : `roster-away-${m.awayRosterId}-${entry.number}`,
            number: entry.number,
            name: usePlayer ? p!.name : `Player ${entry.number}`,
            position: entry.position,
            isStarter: entry.number <= 15,
            team: 'away' as const,
          };
        })
      );
    } else {
      awayMapped = awayPlayers.map((p) => ({ id: p.id, number: p.number, name: p.name, position: p.position, isStarter: p.isStarter, team: 'away' as const }));
    }
    const mapped: Player[] = [...homeMapped, ...awayMapped];
    updateConfig({
      homeTeam: m.homeTeamName,
      awayTeam: m.awayTeamName,
      homeColor: m.homeColor,
      awayColor: m.awayColor,
      halfDuration: m.halfDuration,
      competition: m.competition ?? '',
      venue: m.venue ?? '',
      referee: m.referee ?? '',
      playerTracking: m.config?.playerTracking ?? true,
      cardTracking: m.config?.cardTracking ?? true,
      substitutions: m.config?.substitutions ?? false,
    });
    setPlayers(mapped);
    setCurrentMatchId(m.id);
    await updateMatch(m.id, { status: 'playing', startedAt: Date.now() });
    startMatch();
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Seed default 1–23 for both teams in DB when tracking is on and no players in DB yet
  useEffect(() => {
    if (!config.playerTracking) return;
    (async () => {
      const [homePlayers, awayPlayers] = await Promise.all([
        getPlayersByTeam('home'),
        getPlayersByTeam('away'),
      ]);
      if (homePlayers.length > 0 || awayPlayers.length > 0) return;
      for (const team of ['home', 'away'] as const) {
        for (let i = 1; i <= 23; i++) {
          await dbAddPlayer({
            teamId: team,
            name: `Player ${i}`,
            number: i,
            position: DEFAULT_PLAYER_POSITIONS[i - 1] || 'Sub',
            isStarter: i <= 15,
          });
        }
      }
      const [h, a] = await Promise.all([getPlayersByTeam('home'), getPlayersByTeam('away')]);
      const mapped: Player[] = [
        ...h.map((p) => ({ id: p.id, number: p.number, name: p.name, position: p.position, isStarter: p.isStarter, team: 'home' as const })),
        ...a.map((p) => ({ id: p.id, number: p.number, name: p.name, position: p.position, isStarter: p.isStarter, team: 'away' as const })),
      ];
      setPlayers(mapped);
    })();
  }, [config.playerTracking, setPlayers]);

  const sectionLabelStyle = { letterSpacing: '0.05em' as const };

  return (
    <Box maw={720} mx="auto" py="md">
      <Stack gap="lg">
        <Box>
          <Title order={3} mb={4}>Match setup</Title>
          <Text size="sm" c="dimmed">Configure your rugby match. Use the Teams tab to manage rosters and players.</Text>
        </Box>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mb="sm">Schedule</Text>
          <SimpleGrid cols={2} spacing="md" mb="md">
            <Box>
              <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mb="xs">Date</Text>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => { setScheduledDate(e.target.value); setIsDirty(true); }}
                className="w-full bg-zinc-900 text-white font-bold p-4 rounded-xl border-2 border-zinc-800 focus:border-blue-500 focus:outline-none"
              />
            </Box>
            <Box>
              <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mb="xs">Time</Text>
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => { setScheduledTime(e.target.value); setIsDirty(true); }}
                className="w-full bg-zinc-900 text-white font-bold p-4 rounded-xl border-2 border-zinc-800 focus:border-blue-500 focus:outline-none"
              />
            </Box>
          </SimpleGrid>
          <Box>
            <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mb="xs">Location</Text>
            <input
              type="text"
              value={config.venue}
              onChange={(e) => handleFieldChange('venue', e.target.value)}
              placeholder="e.g. Twickenham Stadium"
              className="w-full bg-zinc-900 text-white text-lg font-bold p-4 rounded-xl border-2 border-zinc-800 focus:border-blue-500 focus:outline-none placeholder:text-zinc-700"
            />
          </Box>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mb="sm">Home Team</Text>
          <select
            value={homeTeamId}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__new__') {
                setAddTeamFor('home');
                setShowAddTeamModal(true);
                return;
              }
              setHomeTeamId(v);
              setIsDirty(true);
            }}
            className="w-full bg-zinc-900 text-white text-2xl font-black p-5 rounded-xl border-4 border-zinc-800 focus:border-blue-500 focus:outline-none"
          >
            {setupTeams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
            <option value="__new__">+ Create new team</option>
          </select>
          {errors.homeTeam && (
            <Text size="sm" c="red" fw={700} mt="xs">⚠ {errors.homeTeam}</Text>
          )}

          <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mt="md" mb="xs">Home shirt colour</Text>
          <div className="grid grid-cols-4 gap-3">
            {(homeColors.length > 0 ? homeColors.map((hex) => ({ value: hex, contrast: '#fff' })) : TEAM_COLORS).map((color) => (
              <button
                key={color.value}
                onClick={() => handleFieldChange('homeColor', color.value)}
                className={`w-14 h-14 rounded-xl font-black text-sm transition-all flex items-center justify-center
                           ${config.homeColor === color.value
                             ? 'ring-4 ring-white scale-95'
                             : 'ring-2 ring-zinc-800 active:scale-90'}`}
                style={{ color: color.contrast }}
              >
                <ShirtIcon fill={color.value} selected={config.homeColor === color.value} />
              </button>
            ))}
          </div>

          <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mt="md" mb="xs">Away team</Text>
          <select
            value={awayTeamId}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__new__') {
                setAddTeamFor('away');
                setShowAddTeamModal(true);
                return;
              }
              setAwayTeamId(v);
              setIsDirty(true);
            }}
            className="w-full bg-zinc-900 text-white text-2xl font-black p-5 rounded-xl border-4 border-zinc-800 focus:border-red-500 focus:outline-none"
          >
            {setupTeams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
            <option value="__new__">+ Create new team</option>
          </select>
          {errors.awayTeam && (
            <Text size="sm" c="red" fw={700} mt="xs">⚠ {errors.awayTeam}</Text>
          )}

          <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mt="md" mb="xs">Away shirt colour</Text>
          <div className="grid grid-cols-4 gap-3">
            {(awayColors.length > 0 ? awayColors.map((hex) => ({ value: hex, contrast: '#fff' })) : TEAM_COLORS).map((color) => (
              <button
                key={color.value}
                onClick={() => handleFieldChange('awayColor', color.value)}
                className={`w-14 h-14 rounded-xl font-black text-sm transition-all flex items-center justify-center
                           ${config.awayColor === color.value
                             ? 'ring-4 ring-white scale-95'
                             : 'ring-2 ring-zinc-800 active:scale-90'}`}
                style={{ color: color.contrast }}
              >
                <ShirtIcon fill={color.value} selected={config.awayColor === color.value} />
              </button>
            ))}
          </div>
          {errors.awayColor && (
            <Text size="sm" c="red" fw={700} mt="xs">⚠ {errors.awayColor}</Text>
          )}

          <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mt="md" mb="xs">Home roster (optional)</Text>
          <select
            value={selectedRosterId ?? ''}
            onChange={(e) => { setSelectedRosterId(e.target.value || null); setIsDirty(true); }}
            className="w-full bg-zinc-900 text-white text-lg font-bold p-4 rounded-xl border-2 border-zinc-800 focus:border-blue-500 focus:outline-none"
          >
            <option value="">No roster (default &quot;Player 1&quot; … &quot;Player 23&quot;)</option>
            {rosterOptions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <Text size="xs" c="dimmed" fw={700} mt="xs">Active players from roster overwrite default names.</Text>

          <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mt="md" mb="xs">Away roster (optional)</Text>
          <select
            value={selectedAwayRosterId ?? ''}
            onChange={(e) => { setSelectedAwayRosterId(e.target.value || null); setIsDirty(true); }}
            className="w-full bg-zinc-900 text-white text-lg font-bold p-4 rounded-xl border-2 border-zinc-800 focus:border-red-500 focus:outline-none"
          >
            <option value="">No roster (default &quot;Player 1&quot; … &quot;Player 23&quot;)</option>
            {awayRosterOptions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <Text size="xs" c="dimmed" fw={700} mt="xs">Active players from roster overwrite default names.</Text>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mb="sm">Minutes per half</Text>
          <SimpleGrid cols={4} spacing="sm" mb="md">
            {[20, 30, 40, 45].map((mins) => (
              <button
                key={mins}
                onClick={() => handleFieldChange('halfDuration', mins * 60)}
                className={`p-4 rounded-xl font-black text-xl transition-all
                           ${config.halfDuration === mins * 60
                             ? 'bg-blue-600 text-white scale-95'
                             : 'bg-zinc-900 text-zinc-400 active:scale-90'}`}
              >
                {mins}
              </button>
            ))}
          </SimpleGrid>
          <input
            type="number"
            value={config.halfDuration / 60}
            onChange={(e) => handleFieldChange('halfDuration', parseInt(e.target.value) * 60)}
            min="5"
            max="60"
            className="w-full bg-zinc-900 text-white text-xl font-black p-4 rounded-xl
                       border-4 border-zinc-800 focus:border-blue-500 focus:outline-none text-center"
          />
          {errors.halfDuration && (
            <Text size="sm" c="red" fw={700} mt="xs">⚠ {errors.halfDuration}</Text>
          )}

          <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mt="md" mb="sm">Features</Text>
          <Stack gap="md">
          <ToggleField
            label="Player Tracking"
            description="Track which players score"
            value={config.playerTracking}
            onChange={(val) => handleFieldChange('playerTracking', val)}
          />
          
          <ToggleField
            label="Card Tracking"
            description="Track yellow & red cards"
            value={config.cardTracking}
            onChange={(val) => handleFieldChange('cardTracking', val)}
          />
          
          <ToggleField
            label="Substitutions"
            description="Track player substitutions"
            value={config.substitutions}
            onChange={(val) => handleFieldChange('substitutions', val)}
          />

          {config.playerTracking && (
            <Button variant="light" color="violet" fullWidth onClick={() => onNavigate('players')} mt="md">
              Manage teams (rosters and player pool)
            </Button>
          )}
          </Stack>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Button variant="subtle" fullWidth onClick={() => setShowAdvanced(!showAdvanced)} c="dimmed" fw={700} size="sm">
            {showAdvanced ? '▼' : '▶'} Advanced options
          </Button>
          {showAdvanced && (
          <Stack gap="md" mt="md">
            <Box>
              <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mb="xs">Competition (optional)</Text>
              <input
                type="text"
                value={config.competition}
                onChange={(e) => handleFieldChange('competition', e.target.value)}
                placeholder="e.g. Six Nations, Rugby World Cup"
                className="w-full bg-zinc-900 text-white text-lg font-bold p-4 rounded-xl
                           border-2 border-zinc-800 focus:border-zinc-600 focus:outline-none
                           placeholder:text-zinc-700"
              />
            </Box>
            <Box>
              <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mb="xs">Referee (optional)</Text>
              <input
                type="text"
                value={config.referee}
                onChange={(e) => handleFieldChange('referee', e.target.value)}
                placeholder="e.g. Wayne Barnes"
                className="w-full bg-zinc-900 text-white text-lg font-bold p-4 rounded-xl
                           border-2 border-zinc-800 focus:border-zinc-600 focus:outline-none
                           placeholder:text-zinc-700"
              />
            </Box>
          </Stack>
          )}
        </Card>

        {scheduledMatches.length > 0 && (
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mb="sm">Scheduled matches</Text>
            <Stack gap="sm">
              {scheduledMatches.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 p-4 rounded-xl bg-zinc-900 border-2 border-zinc-700"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-black text-white truncate">{m.homeTeamName} vs {m.awayTeamName}</div>
                    <div className="text-zinc-500 text-sm font-bold">
                      {m.scheduledAt ? new Date(m.scheduledAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                      {m.venue ? ` · ${m.venue}` : ''}
                    </div>
                    <span className={`text-xs font-bold ${m.status === 'playing' ? 'text-amber-400' : 'text-zinc-500'}`}>
                      {m.status === 'playing' ? 'Playing' : 'Not played'}
                    </span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleLoadMatchForEdit(m)}
                      className="bg-zinc-700 text-white font-bold px-3 py-2 rounded-lg active:bg-zinc-600"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleStartScheduledMatch(m)}
                      disabled={m.status === 'playing'}
                      className="bg-green-600 text-white font-bold px-3 py-2 rounded-lg active:bg-green-700 disabled:opacity-50"
                    >
                      Start
                    </button>
                  </div>
                </div>
              ))}
            </Stack>
            <Button variant="subtle" size="sm" c="dimmed" onClick={() => { setEditingMatchId(null); setScheduledDate(''); setScheduledTime(''); setIsDirty(true); }} mt="sm">
              + New match
            </Button>
          </Card>
        )}

        {showAddTeamModal && addTeamFor && (
          <Box pos="fixed" inset={0} bg="rgba(0,0,0,0.7)" style={{ zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => { setShowAddTeamModal(false); setAddTeamFor(null); }}>
            <Card shadow="lg" padding="lg" radius="md" withBorder style={{ width: '100%', maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
              <Title order={4} mb="md">Create new team</Title>
              <input
                type="text"
                value={newTeamForm.name}
                onChange={(e) => setNewTeamForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Team name"
                className="w-full bg-zinc-800 text-white font-bold p-3 rounded-lg border-2 border-zinc-700 mb-3"
              />
              <div className="flex flex-wrap gap-2 mb-4">
                {TEAM_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setNewTeamForm((f) => ({ ...f, color: c.value }))}
                    className={`w-10 h-10 rounded-lg ${newTeamForm.color === c.value ? 'ring-2 ring-white' : ''}`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
              <Group gap="sm" mt="md">
                <Button variant="default" fullWidth onClick={() => { setShowAddTeamModal(false); setAddTeamFor(null); setNewTeamForm({ name: '', color: '#3b82f6' }); }}>Cancel</Button>
                <Button color="green" fullWidth onClick={handleCreateTeamFromSetup} disabled={!newTeamForm.name.trim()}>Save</Button>
              </Group>
            </Card>
          </Box>
        )}

        <Stack gap="md" pt="xl" pb={100}>
          <Button size="lg" variant="light" onClick={handleSaveMatch} fullWidth>Save match</Button>
          <Button size="xl" onClick={handleStartMatch} fullWidth>Start match →</Button>
        </Stack>
      </Stack>
    </Box>
  );
};

// Shirt colours editor for a team (Manage Teams)
const ShirtColoursEditor: React.FC<{ teamId: string; team: DbTeam; onUpdate: () => void }> = ({ teamId, team, onUpdate }) => {
  const colors = getTeamColors(team);
  const addColor = async (hex: string) => {
    const next = colors.includes(hex) ? colors : [...colors, hex];
    await updateTeam(teamId, { colors: next, color: next[0] });
    onUpdate();
  };
  const removeColor = async (hex: string) => {
    if (colors.length <= 1) return;
    const next = colors.filter((c) => c !== hex);
    await updateTeam(teamId, { colors: next, color: next[0] });
    onUpdate();
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      {colors.map((c) => (
        <div key={c} className="flex items-center gap-1">
          <div className="w-10 h-10 rounded-lg border-2 border-zinc-600" style={{ backgroundColor: c }} title={c} />
          <button type="button" onClick={() => removeColor(c)} disabled={colors.length <= 1} className="text-red-400 font-bold text-sm disabled:opacity-40">×</button>
        </div>
      ))}
      <div className="flex flex-wrap gap-1">
        {TEAM_COLORS.filter((c) => !colors.includes(c.value)).map((c) => (
          <button key={c.value} type="button" onClick={() => addColor(c.value)} className="w-8 h-8 rounded-lg border border-zinc-600 hover:ring-2 hover:ring-white" style={{ backgroundColor: c.value }} title={c.name} />
        ))}
      </div>
      {colors.length === 0 && <span className="text-zinc-500 text-sm">Add at least one colour</span>}
    </div>
  );
};

// Manage Teams (DB) – Team → Roster → Players
const ManageTeamsPage: React.FC<{ onBack: () => void }> = () => {
  const [teams, setTeams] = useState<DbTeam[]>([]);
  const [players, setPlayers] = useState<DbPlayer[]>([]);
  const [rosters, setRosters] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', number: '', position: DEFAULT_PLAYER_POSITIONS[0], isStarter: true, active: true });
  const [selectedRosterId, setSelectedRosterId] = useState<string | null>(null);
  const [rosterEntries, setRosterEntries] = useState<Array<{ id: string; number: number; position: string; playerId?: string }>>([]);
  const [showAddTeamForm, setShowAddTeamForm] = useState(false);
  const [addTeamForm, setAddTeamForm] = useState({ name: '', color: '#3b82f6' });

  const loadTeams = async () => {
    const list = await getTeams();
    setTeams(list);
    return list;
  };
  const loadPlayers = async () => {
    if (!selectedTeamId) return;
    const list = await getPlayersByTeam(selectedTeamId);
    setPlayers(list);
  };
  const loadRosters = async () => {
    if (!selectedTeamId) return;
    const list = await getRostersByTeam(selectedTeamId);
    setRosters(list.map((r) => ({ id: r.id, name: r.name })));
  };

  useEffect(() => {
    loadTeams().then((list) => {
      if (list.length > 0) {
        setSelectedTeamId((current) => (current && list.some((t) => t.id === current)) ? current : list[0].id);
      }
    });
  }, []);
  useEffect(() => { loadPlayers(); }, [selectedTeamId]);
  useEffect(() => { loadRosters(); }, [selectedTeamId]);
  useEffect(() => {
    if (!selectedRosterId) { setRosterEntries([]); return; }
    getRosterEntries(selectedRosterId).then((entries) =>
      setRosterEntries(entries.map((e) => ({ id: e.id, number: e.number, position: e.position, playerId: e.playerId })))
    );
  }, [selectedRosterId]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.number) return;
    if (!selectedTeamId) return;
    const num = parseInt(form.number, 10);
    if (editingId) {
      await dbUpdatePlayer(editingId, { name: form.name.trim(), number: num, position: form.position, isStarter: form.isStarter, active: form.active });
    } else {
      await dbAddPlayer({ teamId: selectedTeamId, name: form.name.trim(), number: num, position: form.position, isStarter: form.isStarter });
    }
    setForm({ name: '', number: '', position: DEFAULT_PLAYER_POSITIONS[0], isStarter: true, active: true });
    setEditingId(null);
    setShowForm(false);
    loadPlayers();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this player?')) return;
    await dbDeletePlayer(id);
    loadPlayers();
  };

  const handleAddRoster = async () => {
    if (!selectedTeamId) return;
    const name = prompt('Roster name (e.g. First XV)');
    if (!name?.trim()) return;
    await createRoster(selectedTeamId, name.trim());
    loadRosters();
  };

  const handleRosterEntryPlayer = async (entryId: string, playerId: string | undefined) => {
    await updateRosterEntry(entryId, { playerId });
    setRosterEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, playerId } : e)));
  };

  const handleDeleteRoster = async (id: string) => {
    if (!confirm('Delete this roster and all its slot assignments?')) return;
    await deleteRoster(id);
    if (selectedRosterId === id) setSelectedRosterId(null);
    loadRosters();
  };

  const handleAddTeam = async () => {
    if (!addTeamForm.name.trim()) return;
    const id = await addTeam(addTeamForm.name.trim(), addTeamForm.color);
    setAddTeamForm({ name: '', color: '#3b82f6' });
    setShowAddTeamForm(false);
    await loadTeams();
    setSelectedTeamId(id);
  };

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);
  const sectionLabelStyle = { letterSpacing: '0.05em' as const };

  return (
    <Box maw={720} mx="auto" py="md" pb={80}>
      <Stack gap="lg">
        <Box>
          <Title order={3} mb={4}>Manage teams</Title>
          <Text size="sm" c="dimmed">Rosters and player pool (saved in database)</Text>
        </Box>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mb="sm">Teams</Text>
          <Group gap="sm" mb="sm">
            {teams.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTeamId(t.id)}
                className={`p-4 rounded-xl font-black text-lg min-w-[120px] ${selectedTeamId === t.id ? 'ring-2 ring-white' : 'opacity-80'}`}
                style={{ backgroundColor: t.color, color: '#fff' }}
              >
                {t.name}
              </button>
            ))}
            <Button variant="default" leftSection={<span>+</span>} onClick={() => setShowAddTeamForm(true)} style={{ minWidth: 120 }}>
              Add team
            </Button>
          </Group>
          {showAddTeamForm && (
            <Box p="md" style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 12, border: '2px solid var(--mantine-color-violet-6)' }}>
              <Title order={5} mb="sm">New team</Title>
              <input
                type="text"
                value={addTeamForm.name}
                onChange={(e) => setAddTeamForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Team name"
                className="w-full bg-zinc-800 text-white p-3 rounded-lg font-bold mb-3"
              />
              <div className="mb-3">
                <span className="text-zinc-400 text-sm font-bold block mb-2">Color</span>
                <div className="grid grid-cols-4 gap-2">
                  {TEAM_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setAddTeamForm((f) => ({ ...f, color: c.value }))}
                      className={`w-10 h-10 rounded-lg ${addTeamForm.color === c.value ? 'ring-2 ring-white' : ''}`}
                      style={{ backgroundColor: c.value }}
                      title={c.value}
                    />
                  ))}
                </div>
              </div>
              <Group gap="sm" mt="md">
                <Button variant="default" fullWidth onClick={() => { setShowAddTeamForm(false); setAddTeamForm({ name: '', color: '#3b82f6' }); }}>Cancel</Button>
                <Button color="green" fullWidth onClick={handleAddTeam} disabled={!addTeamForm.name.trim()}>Save</Button>
              </Group>
            </Box>
          )}
        </Card>

        {selectedTeam && (
        <>
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mb="xs">Shirt colours — {selectedTeam.name}</Text>
          <Text size="xs" c="dimmed" fw={700} mb="sm">Add colours here; select which kit to use in Match setup.</Text>
          <ShirtColoursEditor teamId={selectedTeam.id} team={selectedTeam} onUpdate={loadTeams} />
        </Card>
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mb="sm">Rosters — {selectedTeam.name}</Text>
          <div className="space-y-2 mb-2">
            {rosters.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-700">
                <span className="font-bold text-white">{r.name}</span>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedRosterId(selectedRosterId === r.id ? null : r.id)} className="text-blue-400 font-bold text-sm">Edit slots</button>
                  <button onClick={() => handleDeleteRoster(r.id)} className="text-red-400 font-bold text-sm">Del</button>
                </div>
              </div>
            ))}
          </div>
          <Button variant="subtle" size="sm" color="violet" onClick={handleAddRoster}>+ Add roster</Button>
          {selectedRosterId && rosterEntries.length > 0 && (
            <Box mt="md" p="md" style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 12, border: '2px solid var(--mantine-color-violet-6)' }}>
              <Text size="sm" fw={800} mb="sm">Assign players to slots (active players overwrite “Player N” in match)</Text>
              <div className="space-y-2 max-h-64 overflow-auto">
                {rosterEntries.map((e) => (
                  <div key={e.id} className="flex items-center gap-2">
                    <span className="w-8 font-bold text-zinc-400">{e.number}</span>
                    <span className="w-32 text-zinc-500 text-sm truncate">{e.position}</span>
                    <select
                      value={e.playerId ?? ''}
                      onChange={(ev) => handleRosterEntryPlayer(e.id, ev.target.value || undefined)}
                      className="flex-1 bg-zinc-800 text-white text-sm p-2 rounded-lg font-bold"
                    >
                      <option value="">— Default</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} (#{p.number})</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </Box>
          )}
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mb="sm">Players — {selectedTeam.name}</Text>
          <ScrollArea>
          <Table withTableBorder withColumnBorders style={{ minWidth: 320 }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>No.</Table.Th>
                <Table.Th>Name</Table.Th>
                <Table.Th>Position</Table.Th>
                <Table.Th ta="center" title="Active">✓</Table.Th>
                <Table.Th>Games</Table.Th>
                <Table.Th>Tries</Table.Th>
                <Table.Th>Pts</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {players.map((p) => (
                <Table.Tr key={p.id}>
                  <Table.Td fw={700}>{p.number}</Table.Td>
                  <Table.Td fw={700}>{p.name}</Table.Td>
                  <Table.Td c="dimmed"><Text size="sm">{p.position}</Text></Table.Td>
                  <Table.Td ta="center">{(p as DbPlayer & { active?: boolean }).active !== false ? '✓' : '—'}</Table.Td>
                  <Table.Td ta="center" c="dimmed">{p.gamesPlayed}</Table.Td>
                  <Table.Td ta="center" c="dimmed">{p.tries}</Table.Td>
                  <Table.Td ta="center" c="dimmed">{p.points}{p.yellowCards > 0 && ' 🟨'}{p.redCards > 0 && ' 🟥'}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Button variant="subtle" size="xs" color="blue" onClick={() => { setForm({ name: p.name, number: String(p.number), position: p.position, isStarter: p.isStarter, active: (p as DbPlayer & { active?: boolean }).active !== false }); setEditingId(p.id); setShowForm(true); }}>Edit</Button>
                      <Button variant="subtle" size="xs" color="red" onClick={() => handleDelete(p.id)}>Del</Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          </ScrollArea>
          {!showForm && (
            <Button color="violet" fullWidth mt="md" onClick={() => { setForm({ name: '', number: '', position: DEFAULT_PLAYER_POSITIONS[0], isStarter: true, active: true }); setEditingId(null); setShowForm(true); }}>+ Add player</Button>
          )}
          {showForm && (
            <Box mt="md" p="md" style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 12, border: '2px solid var(--mantine-color-violet-6)' }}>
              <Title order={5} mb="md">{editingId ? 'Edit player' : 'Add player'}</Title>
            <Stack gap="sm" mb="md">
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="w-full bg-zinc-800 text-white p-3 rounded-lg font-bold" />
              <input type="number" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="Number (1–23)" min={1} max={23} className="w-full bg-zinc-800 text-white p-3 rounded-lg font-bold" />
              <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className="w-full bg-zinc-800 text-white p-3 rounded-lg font-bold">
                {DEFAULT_PLAYER_POSITIONS.map((pos, i) => <option key={`${pos}-${i}`} value={pos}>{pos}</option>)}
              </select>
              <label className="flex items-center gap-2 text-white font-bold">
                <input type="checkbox" checked={form.isStarter} onChange={(e) => setForm({ ...form, isStarter: e.target.checked })} />
                Starting XV
              </label>
              <label className="flex items-center gap-2 text-white font-bold">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Active (overwrites default “Player N” when roster is used in match)
              </label>
            </Stack>
            <Group gap="sm">
              <Button variant="default" fullWidth onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
              <Button color="green" fullWidth onClick={handleSave} disabled={!form.name.trim() || !form.number}>Save</Button>
            </Group>
            </Box>
          )}
        </Card>
        </>
        )}
        {!selectedTeam && teams.length === 0 && (
          <Text size="sm" c="dimmed">Add a team to get started.</Text>
        )}
      </Stack>
    </Box>
  );
};

// Match management – all matches: date, time, location, status; completed = winner/draw
const MatchManagementPage: React.FC<{ onBack: () => void }> = () => {
  const [matches, setMatches] = useState<DbMatch[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMatches({ limit: 100 }).then((list) => {
      setMatches(list);
      setLoading(false);
    });
  }, []);

  const sectionLabelStyle = { letterSpacing: '0.05em' as const };

  return (
    <Box maw={720} mx="auto" py="md" pb={80}>
      <Stack gap="lg">
        <Box>
          <Title order={3} mb={4}>Match management</Title>
          <Text size="sm" c="dimmed">Date, time, location · Not played / Playing / Completed</Text>
        </Box>
        {loading ? (
          <Text size="sm" c="dimmed">Loading…</Text>
        ) : selectedId ? (
          <MatchDetailView matchId={selectedId} onBack={() => setSelectedId(null)} />
        ) : matches.length === 0 ? (
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text size="sm" c="dimmed">No matches yet. Save a match in Match setup or end a match from the in-game menu.</Text>
          </Card>
        ) : (
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mb="sm">Matches</Text>
            <ScrollArea>
              <Table withTableBorder withColumnBorders>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Home</Table.Th>
                    <Table.Th ta="center">Score</Table.Th>
                    <Table.Th>Away</Table.Th>
                    <Table.Th>Date / Time</Table.Th>
                    <Table.Th>Location</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Result</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {matches.map((m) => (
                    <Table.Tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedId(m.id)}>
                      <Table.Td fw={700}>{m.homeTeamName}</Table.Td>
                      <Table.Td ta="center" c="dimmed" fw={700}>{m.status === 'completed' ? `${m.homeScore} – ${m.awayScore}` : 'vs'}</Table.Td>
                      <Table.Td fw={700}>{m.awayTeamName}</Table.Td>
                      <Table.Td c="dimmed"><Text size="sm">{m.scheduledAt ? new Date(m.scheduledAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : m.startedAt ? new Date(m.startedAt).toLocaleString() : '—'}</Text></Table.Td>
                      <Table.Td c="dimmed"><Text size="sm">{m.venue || '—'}</Text></Table.Td>
                      <Table.Td>
                        <Text size="xs" fw={700} component="span" c={m.status === 'completed' ? 'green' : m.status === 'playing' ? 'yellow' : 'dimmed'}>
                          {m.status === 'not_played' ? 'Not played' : m.status === 'playing' ? 'Playing' : 'Completed'}
                        </Text>
                      </Table.Td>
                      <Table.Td c="dimmed"><Text size="sm">{m.status === 'completed' ? (m.homeScore > m.awayScore ? `${m.homeTeamName} won` : m.awayScore > m.homeScore ? `${m.awayTeamName} won` : 'Draw') : '—'}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Card>
        )}
      </Stack>
    </Box>
  );
};

const MatchDetailView: React.FC<{ matchId: string; onBack: () => void }> = ({ matchId, onBack }) => {
  const [match, setMatch] = useState<DbMatch | null>(null);
  const sectionLabelStyle = { letterSpacing: '0.05em' as const };
  useEffect(() => {
    getMatch(matchId).then((m) => setMatch(m ?? null));
  }, [matchId]);
  if (!match) return <Text size="sm" c="dimmed" fw={700}>Loading…</Text>;
  return (
    <Stack gap="lg">
      <Button variant="subtle" color="green" size="sm" leftSection={<span>←</span>} onClick={onBack}>Back to list</Button>
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Group justify="space-between" wrap="nowrap" mb="xs">
          <Text fw={800}>{match.homeTeamName}</Text>
          <Text fw={800} size="xl">{match.homeScore} – {match.awayScore}</Text>
          <Text fw={800}>{match.awayTeamName}</Text>
        </Group>
        <Text size="sm" c="dimmed" fw={700}>
          {match.startedAt ? new Date(match.startedAt).toLocaleString() : ''}
          {match.competition && ` · ${match.competition}`}
          {match.venue && ` · ${match.venue}`}
        </Text>
      </Card>
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Text size="sm" fw={700} tt="uppercase" c="dimmed" style={sectionLabelStyle} mb="sm">Match log</Text>
        <ScrollArea style={{ maxHeight: '50vh' }}>
          <Stack gap="xs">
          {match.log.length === 0 ? (
            <Text size="sm" c="dimmed">No events</Text>
          ) : (
            match.log.map((ev) => (
              <LogEventRow key={ev.id} ev={ev} />
            ))
          )}
          </Stack>
        </ScrollArea>
      </Card>
    </Stack>
  );
};

function LogEventRow({ ev }: { ev: LogEvent }) {
  const timeStr = ev.matchTime != null ? `${Math.floor(ev.matchTime / 60)}'` : '';
  if (ev.type === 'match-start') return <div className="text-zinc-500 text-sm py-1">● Match started</div>;
  if (ev.type === 'half-time') return <div className="text-zinc-500 text-sm py-1">● Half time (H{ev.half})</div>;
  if (ev.type === 'match-end') return <div className="text-zinc-500 text-sm py-1">● Match closed</div>;
  if (ev.type === 'score') {
    const label = ev.scoreType === 'try' ? 'Try' : ev.scoreType === 'conversion' ? 'Conversion' : ev.scoreType === 'penalty' ? 'Penalty' : ev.scoreType === 'drop-goal' ? 'Drop goal' : ev.scoreType === 'penalty-try' ? 'Penalty try' : ev.scoreType ?? 'Score';
    return (
      <div className="flex items-center gap-2 py-1 text-sm">
        <span className="text-zinc-500 w-8 shrink-0">{timeStr}</span>
        <span className={ev.team === 'home' ? 'text-blue-400' : 'text-red-400'}>{ev.team === 'home' ? 'H' : 'A'}</span>
        <span className="text-white font-bold">{label}{ev.points != null ? ` +${ev.points}` : ''}</span>
        {ev.pending && <span className="text-yellow-400 text-xs">(TMO)</span>}
      </div>
    );
  }
  if (ev.type === 'card') {
    return (
      <div className="flex items-center gap-2 py-1 text-sm">
        <span className="text-zinc-500 w-8 shrink-0">{timeStr}</span>
        <span className={ev.team === 'home' ? 'text-blue-400' : 'text-red-400'}>{ev.team === 'home' ? 'H' : 'A'}</span>
        <span className="text-white font-bold">{ev.cardType === 'red' ? 'Red card' : 'Yellow card'}</span>
      </div>
    );
  }
  if (ev.type === 'substitution') {
    return (
      <div className="flex items-center gap-2 py-1 text-sm">
        <span className="text-zinc-500 w-8 shrink-0">{timeStr}</span>
        <span className={ev.team === 'home' ? 'text-blue-400' : 'text-red-400'}>{ev.team === 'home' ? 'H' : 'A'}</span>
        <span className="text-white font-bold">Substitution</span>
      </div>
    );
  }
  return null;
}

const ToggleField: React.FC<{
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, description, value, onChange }) => (
  <div className="flex items-center justify-between bg-zinc-900 p-5 rounded-xl">
    <div className="flex-1">
      <div className="text-white font-black text-lg mb-1">{label}</div>
      <div className="text-zinc-500 text-sm font-bold">{description}</div>
    </div>
    <button
      onClick={() => onChange(!value)}
      className={`w-20 h-9 rounded-full transition-all flex items-center px-1 min-w-20
                  ${value ? 'bg-green-600' : 'bg-zinc-700'}`}
    >
      <div className={`w-7 h-7 bg-white rounded-full transition-all shadow-lg
                      ${value ? 'translate-x-9' : 'translate-x-0'}`} />
      <span className="ml-2 text-xs font-black text-white">
        {value ? 'ON' : 'OFF'}
      </span>
    </button>
  </div>
);

// Shared style for game action buttons (match timer / next half / end match size)
const ACTION_BUTTON_STYLE = {
  minHeight: 48,
  padding: '12px 20px',
  borderRadius: 16,
  fontWeight: 800,
  fontSize: 16,
  fontFamily: 'inherit',
  transition: 'all 75ms',
} as const;

// Components
const ScoreButton: React.FC<{
  label: string;
  points: number;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'penalty';
}> = ({ label, points, onClick, disabled, variant = 'primary' }) => {
  const [lastTap, setLastTap] = useState(0);
  const handleClick = () => {
    const now = Date.now();
    if (now - lastTap < 300) return;
    setLastTap(now);
    onClick();
  };
  const bg = disabled ? '#3f3f46' : variant === 'secondary' ? '#059669' : variant === 'penalty' ? '#000' : '#000';
  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      style={{
        ...ACTION_BUTTON_STYLE,
        background: bg,
        color: '#fff',
        border: 'none',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span style={{ display: 'block', fontSize: 16, opacity: 0.95 }}>{label}</span>
      <span style={{ display: 'block', fontSize: 16 }}>+{points}</span>
    </button>
  );
};

const CardButton: React.FC<{
  type: 'yellow' | 'red';
  onClick: () => void;
}> = ({ type, onClick }) => {
  const [lastTap, setLastTap] = useState(0);
  const handleClick = () => {
    const now = Date.now();
    if (now - lastTap < 300) return;
    setLastTap(now);
    onClick();
  };
  const bg = type === 'yellow' ? '#facc15' : '#b91c1c';
  const color = type === 'yellow' ? '#000' : '#fff';
  return (
    <button
      onClick={handleClick}
      style={{
        ...ACTION_BUTTON_STYLE,
        background: bg,
        color,
        border: 'none',
      }}
    >
      {type === 'yellow' ? '🟨' : '🟥'} {type.toUpperCase()}
    </button>
  );
};

// Sin Bin Timer Component
const SinBinTimers: React.FC = () => {
  const cards = useMatchStore((state) => state.cards);
  const elapsedSeconds = useMatchStore((state) => state.elapsedSeconds);
  const returnFromSinBin = useMatchStore((state) => state.returnFromSinBin);
  const players = useMatchStore((state) => state.players);
  const homeTeam = useMatchStore((state) => state.homeTeam);
  const awayTeam = useMatchStore((state) => state.awayTeam);

  const activeSinBins = cards.filter(
    c => c.type === 'yellow' && !c.returned && c.returnTime && elapsedSeconds < c.returnTime
  );

  if (activeSinBins.length === 0) return null;

  return (
    <Box style={{ background: 'rgba(234,179,8,0.15)', border: '2px solid #eab308', borderRadius: 12, padding: 12, marginTop: 12 }}>
      <Text size="xs" fw={800} c="yellow.8" mb="xs">Sin Bin</Text>
      {activeSinBins.map((card) => {
        const timeLeft = (card.returnTime || 0) - elapsedSeconds;
        const player = players.find(p => p.id === card.player);
        const isWarning = timeLeft <= 60;
        
        return (
          <Box
            key={card.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#e8e8ec',
              padding: 12,
              borderRadius: 8,
              marginBottom: 8,
              border: isWarning ? '2px solid #eab308' : undefined,
            }}
          >
            <Box>
              <Text size="sm" fw={700} c="dark.8">
                {card.team === 'home' ? homeTeam : awayTeam}
                {player ? ` – ${player.name} (#${player.number})` : ` – #${card.player}`}
              </Text>
              <Text size="xs" c="dark.5" fw={700}>{Math.floor(card.matchTime / 60)}'</Text>
            </Box>
            <Group gap="sm">
              <Text fw={800} size="lg" c={isWarning ? 'yellow.8' : 'dark.8'}>{formatTime(timeLeft)}</Text>
              <Button size="xs" color="green" onClick={() => returnFromSinBin(card.id)}>Return</Button>
            </Group>
          </Box>
        );
      })}
    </Box>
  );
};

const UNKNOWN_PLAYER_ID = '__unknown__';

function isShirtColorBlack(hex: string): boolean {
  const h = hex.replace(/^#/, '');
  if (h === '000' || h === '000000') return true;
  if (h.length !== 6 && h.length !== 3) return false;
  const r = h.length === 6 ? parseInt(h.slice(0, 2), 16) : parseInt(h[0] + h[0], 16);
  const g = h.length === 6 ? parseInt(h.slice(2, 4), 16) : parseInt(h[1] + h[1], 16);
  const b = h.length === 6 ? parseInt(h.slice(4, 6), 16) : parseInt(h[2] + h[2], 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.25;
}

const TeamSection: React.FC<{
  team: 'home' | 'away';
  isTop?: boolean;
}> = ({ team, isTop = false }) => {
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [selectedAction, setSelectedAction] = useState<'score' | 'card' | null>(null);
  const [scoreType, setScoreType] = useState<ScoreEvent['type']>('try');
  const [cardType, setCardType] = useState<'yellow' | 'red'>('yellow');

  const teamName = useMatchStore((state) => team === 'home' ? state.homeTeam : state.awayTeam);
  const teamColor = useMatchStore((state) => team === 'home' ? state.homeColor : state.awayColor);
  const score = useMatchStore((state) => team === 'home' ? state.homeScore : state.awayScore);
  const lastTryTeam = useMatchStore((state) => state.lastTryTeam);
  const playerTracking = useMatchStore((state) => state.playerTracking);
  const cardTracking = useMatchStore((state) => state.cardTracking);
  const substitutionsEnabled = useMatchStore((state) => state.substitutions);
  const addScore = useMatchStore((state) => state.addScore);
  const addCard = useMatchStore((state) => state.addCard);
  const players = useMatchStore((state) => state.players);
  const substitutionEvents = useMatchStore((state) => state.substitutionEvents);
  const cards = useMatchStore((state) => state.cards);
  const elapsedSeconds = useMatchStore((state) => state.elapsedSeconds);

  const { onPitch } = getSquadStatus(team, players, substitutionEvents, cards, elapsedSeconds);
  const playersForCard = players.filter((p) => p.team === team).sort((a, b) => a.number - b.number);

  const canConvert = lastTryTeam === team;

  const handleScoreClick = (type: ScoreEvent['type']) => {
    if (type === 'penalty-try' || !playerTracking) {
      addScore(team, type);
    } else {
      setScoreType(type);
      setSelectedAction('score');
      setShowPlayerPicker(true);
    }
  };

  const handleCardClick = (type: 'yellow' | 'red') => {
    if (!playerTracking) return;
    setCardType(type);
    setSelectedAction('card');
    setShowPlayerPicker(true);
  };

  const handlePlayerSubmit = (playerId: string) => {
    if (selectedAction === 'score') {
      addScore(team, scoreType, playerId === UNKNOWN_PLAYER_ID ? undefined : playerId);
    } else if (selectedAction === 'card') {
      addCard(team, playerId, cardType);
    }
    setShowPlayerPicker(false);
  };

  const pickerPlayers = selectedAction === 'score' ? onPitch : playersForCard;
  // 4x4 grid: players then "Unknown" at end for score picker
  const gridItems: { id: string; number: number; name: string }[] = selectedAction === 'score'
    ? [...pickerPlayers.map((p) => ({ id: p.id, number: p.number, name: p.name })), { id: UNKNOWN_PLAYER_ID, number: 0, name: 'Unknown' }]
    : pickerPlayers.map((p) => ({ id: p.id, number: p.number, name: p.name }));

  return (
    <Box style={{ position: 'relative', paddingBottom: isTop ? 24 : 0, paddingTop: isTop ? 0 : 24 }}>
      <Box style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', marginBottom: 16 }}>
        <Box
          ta="center"
          py="sm"
          px="md"
          style={{
            backgroundColor: teamColor,
            color: isShirtColorBlack(teamColor) ? '#fff' : '#000',
            borderRadius: 0,
            width: '100%',
            marginBottom: 8,
          }}
        >
          <Title order={2} fw={800} style={{ color: isShirtColorBlack(teamColor) ? '#fff' : '#000' }}>{teamName}</Title>
        </Box>
        <Text ta="center" fw={800} style={{ fontSize: '4rem', lineHeight: 1, color: '#1a1a1a' }}>{score}</Text>
      </Box>

      <Box mb="sm">
        <SimpleGrid cols={4} spacing="sm" mb="sm">
          <ScoreButton label="Try" points={5} onClick={() => handleScoreClick('try')} />
          <ScoreButton
            label="Conv"
            points={2}
            onClick={() => handleScoreClick('conversion')}
            disabled={!canConvert}
            variant="secondary"
          />
          <ScoreButton label="Pen" points={3} onClick={() => handleScoreClick('penalty')} variant="penalty" />
          <ScoreButton label="DG" points={3} onClick={() => handleScoreClick('drop-goal')} variant="penalty" />
        </SimpleGrid>
        <SimpleGrid cols={4} spacing="sm" mb="sm">
          <button
            onClick={() => handleScoreClick('penalty-try')}
            style={{ ...ACTION_BUTTON_STYLE, background: '#b91c1c', color: '#fff', border: 'none' }}
          >
            Penalty try (+7)
          </button>
          {cardTracking && (
            <>
              <CardButton type="yellow" onClick={() => handleCardClick('yellow')} />
              <CardButton type="red" onClick={() => handleCardClick('red')} />
            </>
          )}
        </SimpleGrid>
        <SimpleGrid cols={4} spacing="sm">
          {substitutionsEnabled && (
            <button
              onClick={() => useMatchStore.getState().setShowSubstitutionModal(true)}
              style={{ ...ACTION_BUTTON_STYLE, background: '#059669', color: '#fff', border: 'none' }}
            >
              🔄 Substitution
            </button>
          )}
        </SimpleGrid>
      </Box>

      {showPlayerPicker && playerTracking && (
        <Box
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.9)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <Box style={{ background: '#2d2d2d', borderRadius: 16, padding: 24, maxWidth: 420, width: '100%' }}>
            <Title order={4} mb="md" c="white" ta="center">
              {selectedAction === 'score' ? scoreType.toUpperCase() : `${cardType.toUpperCase()} CARD`}
            </Title>
            <SimpleGrid cols={4} spacing="xs" mb="md">
              {gridItems.map((player) => (
                <button
                  key={player.id}
                  onClick={() => handlePlayerSubmit(player.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 8,
                    borderRadius: 16,
                    fontWeight: 700,
                    fontSize: 12,
                    minHeight: 56,
                    color: '#fff',
                    border: '2px solid rgba(255,255,255,0.3)',
                    backgroundColor: player.id === UNKNOWN_PLAYER_ID ? '#78716c' : teamColor,
                  }}
                >
                  {player.id === UNKNOWN_PLAYER_ID ? (
                    'Unknown'
                  ) : (
                    <>
                      <span style={{ opacity: 0.9 }}>#{player.number}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', textAlign: 'center', fontSize: 11 }}>{player.name}</span>
                    </>
                  )}
                </button>
              ))}
            </SimpleGrid>
            {(pickerPlayers.length === 0 && selectedAction !== 'score') && (
              <Text size="sm" c="dimmed" ta="center" mb="md">No players added. Add players in setup.</Text>
            )}
            {(selectedAction === 'score' && onPitch.length === 0 && pickerPlayers.length === 0) && (
              <Text size="sm" c="dimmed" ta="center" mb="md">No players on pitch. Use Unknown or add subs.</Text>
            )}
            <Button variant="filled" color="dark" fullWidth onClick={() => setShowPlayerPicker(false)}>
              Cancel
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
};

// Undo + Log panel: buttons side by side; log opens as table in panel below
const UndoAndLogPanel: React.FC = () => {
  const undo = useMatchStore((state) => state.undo);
  const [showLog, setShowLog] = useState(false);
  const [assigningEventId, setAssigningEventId] = useState<string | null>(null);
  const scoreEvents = useMatchStore((state) => state.scoreEvents);
  const cards = useMatchStore((state) => state.cards);
  const substitutionEvents = useMatchStore((state) => state.substitutionEvents);
  const systemEvents = useMatchStore((state) => state.systemEvents);
  const cardReturnEvents = useMatchStore((state) => state.cardReturnEvents);
  const players = useMatchStore((state) => state.players);
  const homeTeam = useMatchStore((state) => state.homeTeam);
  const awayTeam = useMatchStore((state) => state.awayTeam);
  const resolvePendingEvent = useMatchStore((state) => state.resolvePendingEvent);
  const updateScoreEventPlayer = useMatchStore((state) => state.updateScoreEventPlayer);
  const removeScoreEvent = useMatchStore((state) => state.removeScoreEvent);
  const removeCard = useMatchStore((state) => state.removeCard);
  const removeSubstitution = useMatchStore((state) => state.removeSubstitution);
  const homeColor = useMatchStore((state) => state.homeColor);
  const awayColor = useMatchStore((state) => state.awayColor);

  const allEventsChrono = [...scoreEvents, ...cards, ...substitutionEvents, ...cardReturnEvents, ...systemEvents]
    .sort((a, b) => a.timestamp - b.timestamp);

  // Running score at each event (for table "match score" column)
  const scoreAtEvent = new Map<string, string>();
  let h = 0, a = 0;
  for (const ev of allEventsChrono) {
    const se = ev as ScoreEvent;
    if ('points' in ev && !('offPlayerId' in ev) && !se.pending) {
      if (se.team === 'home') h += se.points ?? 0;
      else a += se.points ?? 0;
    }
    scoreAtEvent.set(ev.id, `${h} – ${a}`);
  }

  const allEvents = [...scoreEvents, ...cards, ...substitutionEvents, ...cardReturnEvents, ...systemEvents]
    .sort((a, b) => b.timestamp - a.timestamp);
  const pendingEvents = scoreEvents.filter(e => e.pending);
  const assigningEvent = assigningEventId ? scoreEvents.find(e => e.id === assigningEventId) : null;
  const assignTeamPlayers = assigningEvent
    ? players.filter(p => p.team === assigningEvent.team).sort((a, b) => a.number - b.number)
    : [];

  type LogEventItem = ScoreEvent | Card | Substitution | CardReturnEvent | SystemEvent;
  const getEventLabel = (event: LogEventItem): string => {
    const sys = event as SystemEvent;
    if ('type' in sys && sys.type === 'match-start') return 'Game started';
    if ('type' in sys && sys.type === 'half-time') return `Half time (H${sys.half})`;
    if ('type' in sys && sys.type === 'match-end') return 'Match closed';
    if ('cardId' in event) return 'Yellow card returned';
    const ev = event as ScoreEvent | Card | Substitution;
    if ('offPlayerId' in ev) return 'Substitution';
    if ('points' in ev) {
      const s = ev as ScoreEvent;
      return `${s.type.toUpperCase()}${s.pending ? ' (TMO)' : ''} +${s.points ?? 0}`;
    }
    const c = ev as Card;
    return `${c.type.toUpperCase()} CARD`;
  };

  const getTeamForEvent = (event: LogEventItem): string => {
    if ('team' in event && (event.team === 'home' || event.team === 'away')) return event.team === 'home' ? homeTeam : awayTeam;
    return '—';
  };

  const getPlayerLabel = (event: LogEventItem): string => {
    if ('cardId' in event) {
      const cre = event as CardReturnEvent;
      const p = players.find(x => x.id === cre.playerId);
      return p ? `${p.name} (#${p.number})` : '—';
    }
    const ev = event as ScoreEvent | Card | Substitution;
    if ('offPlayerId' in ev) {
      const sub = ev as Substitution;
      const offP = players.find(p => p.id === sub.offPlayerId);
      const onP = players.find(p => p.id === sub.onPlayerId);
      return offP && onP ? `${offP.name} → ${onP.name}` : '—';
    }
    if ('player' in ev && ev.player) {
      const p = players.find(x => x.id === ev.player);
      return p ? `${p.name} (#${p.number})` : '—';
    }
    if ('points' in ev && (ev as ScoreEvent).player == null && !(ev as ScoreEvent).pending) return 'Unknown';
    return '—';
  };

  return (
    <>
      <Group justify="center" gap="md" mb={showLog ? 'md' : 0}>
        <Button variant="filled" color="dark" onClick={undo} leftSection={<span>↶</span>} style={{ minWidth: 100 }}>
          Undo
        </Button>
        <Button
          variant="light"
          color="dark"
          onClick={() => setShowLog(!showLog)}
          style={{ minWidth: 100 }}
        >
          📋 Log {allEvents.length > 0 ? `(${allEvents.length})` : ''}
          {pendingEvents.length > 0 ? ` · ${pendingEvents.length} TMO` : ''}
        </Button>
      </Group>

      {showLog && (
        <Box mt="md">
          {pendingEvents.length > 0 && (
            <Box mb="md" p="sm" style={{ background: 'rgba(234,179,8,0.15)', border: '2px solid #eab308', borderRadius: 8 }}>
              <Text fw={700} size="sm" c="dark.8" mb="xs">TMO REVIEW</Text>
              {pendingEvents.map((event) => {
                const teamName = event.team === 'home' ? homeTeam : awayTeam;
                const player = players.find(p => p.id === event.player);
                return (
                  <Box key={event.id} mb="xs" p="xs">
                    <Text fw={700}>{teamName}{player ? ` – ${player.name} (#${player.number})` : ''}</Text>
                    <Text size="xs" c="dark.5">{event.type.toUpperCase()} – PENDING</Text>
                    <Group gap="xs" mt="xs">
                      <Button size="xs" color="red" onClick={() => resolvePendingEvent(event.id, false)}>✗ No try</Button>
                      <Button size="xs" color="green" onClick={() => resolvePendingEvent(event.id, true)}>✓ Try</Button>
                    </Group>
                  </Box>
                );
              })}
            </Box>
          )}
          <ScrollArea>
            <Table withTableBorder withColumnBorders style={{ background: '#fff' }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Time</Table.Th>
                  <Table.Th>Team</Table.Th>
                  <Table.Th>Event</Table.Th>
                  <Table.Th>Player</Table.Th>
                  <Table.Th>Match score</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {allEvents.map((event) => {
                  const ev = event as ScoreEvent | Card | Substitution | CardReturnEvent | SystemEvent;
                  const timeStr = 'matchTime' in ev ? formatTime(ev.matchTime) : '—';
                  const scoreStr = scoreAtEvent.get(event.id) ?? '–';
                  const scoreEv = 'points' in event && !('offPlayerId' in event) ? (event as ScoreEvent) : null;
                  const isUnknown = scoreEv && !scoreEv.pending && scoreEv.player == null;
                  const isScore = scoreEv != null;
                  const isCard = !('points' in event) && !('offPlayerId' in event) && !('cardId' in event) && 'type' in event && ((event as Card).type === 'yellow' || (event as Card).type === 'red');
                  const isSub = 'offPlayerId' in event;
                  const isSystem = 'type' in event && ((event as SystemEvent).type === 'match-start' || (event as SystemEvent).type === 'half-time' || (event as SystemEvent).type === 'match-end');
                  const canRemove = isScore || isCard || isSub;
                  return (
                    <Table.Tr key={event.id}>
                      <Table.Td>{timeStr}</Table.Td>
                      <Table.Td>{getTeamForEvent(event)}</Table.Td>
                      <Table.Td>{getEventLabel(event)}</Table.Td>
                      <Table.Td>{getPlayerLabel(event)}</Table.Td>
                      <Table.Td>{scoreStr}</Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          {isScore && scoreEv && (
                            <Button
                              size="xs"
                              variant="subtle"
                              color="green"
                              onClick={() => setAssigningEventId(scoreEv.id)}
                            >
                              {isUnknown ? 'Assign' : 'Edit'}
                            </Button>
                          )}
                          {canRemove && (
                            <Button
                              size="xs"
                              variant="subtle"
                              color="red"
                              onClick={() => {
                                if (isScore) removeScoreEvent(event.id);
                                else if (isCard) removeCard(event.id);
                                else if (isSub) removeSubstitution(event.id);
                              }}
                            >
                              Remove
                            </Button>
                          )}
                          {(isSystem || 'cardId' in event) && <Text size="xs" c="dimmed">—</Text>}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea>
          {allEvents.length === 0 && (
            <Text size="sm" c="dimmed" ta="center" py="md">No events yet</Text>
          )}
        </Box>
      )}

      {assigningEventId && assigningEvent && (
        <Box
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <Box style={{ background: '#2d2d2d', borderRadius: 16, padding: 24, maxWidth: 420, width: '100%' }}>
            <Title order={4} mb="md" c="white" ta="center">Assign player to score</Title>
            <SimpleGrid cols={4} spacing="xs" mb="md">
              {assignTeamPlayers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    updateScoreEventPlayer(assigningEventId, p.id);
                    setAssigningEventId(null);
                  }}
                  style={{
                    ...PLAYER_GRID_BUTTON_STYLE,
                    backgroundColor: (assigningEvent.team === 'home' ? homeColor : awayColor),
                    borderColor: 'rgba(255,255,255,0.3)',
                  }}
                >
                  <span style={{ opacity: 0.9 }}>#{p.number}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', textAlign: 'center', fontSize: 11 }}>{p.name}</span>
                </button>
              ))}
            </SimpleGrid>
            <Button variant="filled" color="dark" fullWidth onClick={() => setAssigningEventId(null)} style={{ ...ACTION_BUTTON_STYLE }}>
              Cancel
            </Button>
          </Box>
        </Box>
      )}
    </>
  );
};

// Player grid button style (same as scoring player picker: rounded, shirt color, 4x4)
const PLAYER_GRID_BUTTON_STYLE = {
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'center',
  padding: 8,
  borderRadius: 16,
  fontWeight: 700,
  fontSize: 12,
  minHeight: 56,
  color: '#fff',
  border: '2px solid rgba(255,255,255,0.3)',
};

// Substitution modal: same format as scoring picker — 4x4 grids with shirt colour buttons
const SubstitutionModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [team, setTeam] = useState<'home' | 'away'>('home');
  const [offId, setOffId] = useState<string>('');
  const [onId, setOnId] = useState<string>('');

  const players = useMatchStore((state) => state.players);
  const substitutionEvents = useMatchStore((state) => state.substitutionEvents);
  const cards = useMatchStore((state) => state.cards);
  const elapsedSeconds = useMatchStore((state) => state.elapsedSeconds);
  const addSubstitution = useMatchStore((state) => state.addSubstitution);
  const homeTeam = useMatchStore((state) => state.homeTeam);
  const awayTeam = useMatchStore((state) => state.awayTeam);
  const homeColor = useMatchStore((state) => state.homeColor);
  const awayColor = useMatchStore((state) => state.awayColor);

  const { onPitch, onBench } = getSquadStatus(team, players, substitutionEvents, cards, elapsedSeconds);
  const teamColor = team === 'home' ? homeColor : awayColor;

  const handleConfirm = () => {
    if (!offId || !onId) return;
    const onPlayer = onBench.find((p) => p.id === onId);
    addSubstitution(team, offId, onId, onPlayer);
    onClose();
  };

  return (
    <Box
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.9)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <Box style={{ background: '#2d2d2d', borderRadius: 16, padding: 24, maxWidth: 420, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
        <Title order={4} mb="md" c="white" ta="center">Substitution</Title>

        <SimpleGrid cols={2} spacing="sm" mb="md">
          <button
            type="button"
            onClick={() => setTeam('home')}
            style={{
              ...ACTION_BUTTON_STYLE,
              background: team === 'home' ? homeColor : '#52525b',
              color: '#fff',
              border: team === 'home' ? '2px solid #fff' : 'none',
            }}
          >
            {homeTeam}
          </button>
          <button
            type="button"
            onClick={() => setTeam('away')}
            style={{
              ...ACTION_BUTTON_STYLE,
              background: team === 'away' ? awayColor : '#52525b',
              color: '#fff',
              border: team === 'away' ? '2px solid #fff' : 'none',
            }}
          >
            {awayTeam}
          </button>
        </SimpleGrid>

        <Text size="sm" fw={700} c="dimmed" mb="xs">Player going off</Text>
        <SimpleGrid cols={4} spacing="xs" mb="md">
          {onPitch.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setOffId(p.id)}
              style={{
                ...PLAYER_GRID_BUTTON_STYLE,
                backgroundColor: offId === p.id ? teamColor : '#52525b',
                borderColor: offId === p.id ? '#fff' : 'rgba(255,255,255,0.2)',
              }}
            >
              <span style={{ opacity: 0.9 }}>#{p.number}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', textAlign: 'center', fontSize: 11 }}>{p.name}</span>
            </button>
          ))}
        </SimpleGrid>
        {onPitch.length === 0 && <Text size="sm" c="dimmed" mb="md">No one on pitch</Text>}

        <Text size="sm" fw={700} c="dimmed" mb="xs">Player coming on</Text>
        <SimpleGrid cols={4} spacing="xs" mb="md">
          {onBench.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setOnId(p.id)}
              style={{
                ...PLAYER_GRID_BUTTON_STYLE,
                backgroundColor: onId === p.id ? '#059669' : '#52525b',
                borderColor: onId === p.id ? '#fff' : 'rgba(255,255,255,0.2)',
              }}
            >
              <span style={{ opacity: 0.9 }}>#{p.number}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', textAlign: 'center', fontSize: 11 }}>{p.name}</span>
            </button>
          ))}
        </SimpleGrid>
        {onBench.length === 0 && <Text size="sm" c="dimmed" mb="md">No one on bench</Text>}

        <Group gap="sm">
          <Button variant="filled" color="dark" style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="filled" color="green" style={{ flex: 1 }} onClick={handleConfirm} disabled={!offId || !onId}>
            Confirm
          </Button>
        </Group>
      </Box>
    </Box>
  );
};

// Match time panel: title-style clock, half on separate line (e.g. 1st Half: mm:ss)
const MatchTimePanel: React.FC = () => {
  const currentHalf = useMatchStore((state) => state.currentHalf);
  const elapsedSeconds = useMatchStore((state) => state.elapsedSeconds);
  const injuryTime = useMatchStore((state) => state.injuryTime);
  const halfDuration = useMatchStore((state) => state.halfDuration);
  const isOvertime = elapsedSeconds > halfDuration;
  const displayTime = elapsedSeconds;

  return (
    <Box py="md" px="md" style={{ background: '#e8e8ec', borderBottom: '1px solid #ccc' }}>
      <Title order={3} ta="center" fw={700} style={{ userSelect: 'none', color: '#1a1a1a', marginBottom: 4 }}>
        {formatTime(displayTime)}
        {isOvertime && (
          <Text component="span" size="sm" c="red" ml="xs">+{formatTime(displayTime - halfDuration)}</Text>
        )}
        {injuryTime > 0 && (
          <Text component="span" size="xs" fw={700} c="yellow.8" ml="xs">+{injuryTime / 60}' injury</Text>
        )}
      </Title>
      <Text ta="center" size="sm" fw={700} c="dark.5" style={{ color: '#555' }}>
        {getHalfLabel(currentHalf)}: {formatTime(displayTime)}
      </Text>
      <SinBinTimers />
    </Box>
  );
};

// Match controls: Start/Pause, Next half, End match (no menu; substitution is in team panel)
const MatchControlsPanel: React.FC = () => {
  const navigateAfterEnd = React.useContext(NavContext);
  const isRunning = useMatchStore((state) => state.isRunning);
  const toggleTimer = useMatchStore((state) => state.toggleTimer);
  const nextHalf = useMatchStore((state) => state.nextHalf);
  const endMatch = useMatchStore((state) => state.endMatch);

  return (
    <Box py="md" px="md" style={{ background: '#e8e8ec', borderBottom: '1px solid #ccc' }}>
      <Group justify="center" gap="md">
        <Button
          size="lg"
          color={isRunning ? 'red' : 'green'}
          onClick={toggleTimer}
          style={{ minWidth: 120, borderRadius: 16 }}
        >
          {isRunning ? '⏸ Pause' : '▶ Start'}
        </Button>
        <Button size="lg" variant="light" color="blue" onClick={nextHalf} style={{ minWidth: 120, borderRadius: 16 }}>
          Next half
        </Button>
        <Button
          size="lg"
          variant="filled"
          color="red"
          onClick={async () => {
            if (!confirm('End match? Result and log will be saved to Match management.')) return;
            const state = useMatchStore.getState();
            const snap = stateToMatchSnapshot(state);
            try {
              await saveFinishedMatch(snap, state.currentMatchId ?? undefined);
            } catch (e) {
              console.error('Failed to save match', e);
            }
            endMatch();
            if (navigateAfterEnd) navigateAfterEnd('matches');
          }}
          style={{ minWidth: 120, borderRadius: 16 }}
        >
          End match
        </Button>
      </Group>
    </Box>
  );
};

// Main App
const App: React.FC = () => {
  useTimer();
  const [view, setView] = useState<AppView>('home');
  const matchStarted = useMatchStore((state) => state.matchStarted);
  const isRunning = useMatchStore((state) => state.isRunning);
  const homeTeam = useMatchStore((state) => state.homeTeam);
  const awayTeam = useMatchStore((state) => state.awayTeam);
  const homeScore = useMatchStore((state) => state.homeScore);
  const awayScore = useMatchStore((state) => state.awayScore);
  const showSubModal = useMatchStore((state) => state.showSubstitutionModal);
  const setShowSubModal = useMatchStore((state) => state.setShowSubstitutionModal);

  useWakeLock(matchStarted && isRunning);

  useEffect(() => {
    seedDefaultTeamsIfNeeded()
      .then(() => seedSampleData())
      .catch(() => {});
  }, []);

  if (!matchStarted) {
    let content: React.ReactNode;
    if (view === 'home') content = <HomePage onNavigate={setView} />;
    else if (view === 'setup') content = <GameSetup onBack={() => setView('home')} onNavigate={setView} />;
    else if (view === 'players') content = <ManageTeamsPage onBack={() => setView('home')} />;
    else if (view === 'matches') content = <MatchManagementPage onBack={() => setView('home')} />;
    else content = <HomePage onNavigate={setView} />;
    return (
      <ShellLayout view={view} setView={setView}>
        {content}
      </ShellLayout>
    );
  }

  return (
    <NavContext.Provider value={setView}>
    <Box className="min-h-screen overflow-hidden" style={{ background: 'var(--mantine-color-dark-8)' }}>
      <style>{`
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
        .animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
      `}</style>
      <Box maw={720} mx="auto">
        <Box py="sm" px="md" style={{ background: '#e8e8ec', borderBottom: '1px solid #ccc' }}>
          <Title order={3} ta="center" fw={800} style={{ color: '#1a1a1a' }}>
            {homeTeam} {homeScore} — {awayScore} {awayTeam}
          </Title>
        </Box>
        <MatchTimePanel />
        <MatchControlsPanel />
        <Box p="md" style={{ background: '#e8e8ec', borderBottom: '1px solid #ccc' }}>
          <TeamSection team="home" />
        </Box>
        <Box p="md" style={{ background: '#e8e8ec', borderBottom: '1px solid #ccc' }}>
          <TeamSection team="away" isTop />
        </Box>
        <Box p="md" style={{ background: '#e8e8ec', borderBottom: '1px solid #ccc' }}>
          <UndoAndLogPanel />
        </Box>
      </Box>
      {showSubModal && <SubstitutionModal onClose={() => setShowSubModal(false)} />}
    </Box>
    </NavContext.Provider>
  );
};

export default App;
