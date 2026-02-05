import React, { useState, useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  currentHalf: number;
  elapsedSeconds: number;
  injuryTime: number;
  isRunning: boolean;
  lastTryTeam: 'home' | 'away' | null;
  matchStarted: boolean;
}

// Zustand Store with full persistence
const useMatchStore = create<MatchState & {
  addScore: (team: 'home' | 'away', type: ScoreEvent['type'], player?: string, pending?: boolean) => void;
  addCard: (team: 'home' | 'away', player: string, type: 'yellow' | 'red') => void;
  addPlayer: (player: Omit<Player, 'id'>) => void;
  updatePlayer: (id: string, updates: Partial<Player>) => void;
  deletePlayer: (id: string) => void;
  returnFromSinBin: (cardId: string) => void;
  resolvePendingEvent: (eventId: string, approved: boolean) => void;
  undo: () => void;
  toggleTimer: () => void;
  tick: () => void;
  addInjuryTime: () => void;
  nextHalf: () => void;
  updateConfig: (config: Partial<MatchConfig>) => void;
  startMatch: () => void;
  endMatch: () => void;
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
      currentHalf: 1,
      elapsedSeconds: 0,
      injuryTime: 0,
      isRunning: false,
      halfDuration: 40 * 60,
      lastTryTeam: null,
      matchStarted: false,
      
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
      
      startMatch: () => set({ matchStarted: true }),
      
      endMatch: () => set({ 
        matchStarted: false,
        homeScore: 0,
        awayScore: 0,
        scoreEvents: [],
        cards: [],
        players: [],
        currentHalf: 1,
        elapsedSeconds: 0,
        injuryTime: 0,
        isRunning: false,
        lastTryTeam: null,
      }),

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
        set({
          cards: state.cards.map(c => c.id === cardId ? { ...c, returned: true } : c)
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
        
        const lastEventTime = lastEvent?.timestamp || 0;
        const lastCardTime = lastCard?.timestamp || 0;

        if (lastEventTime > lastCardTime && lastEvent) {
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
        
        if ('vibrate' in navigator) {
          navigator.vibrate(30);
        }
      },

      toggleTimer: () => set((state) => ({ isRunning: !state.isRunning })),

      tick: () => {
        const state = get();
        if (!state.isRunning) return;
        
        const newElapsed = state.elapsedSeconds + 1;
        const regularTime = state.halfDuration;
        
        // Auto-pause at end of regular time
        if (newElapsed >= regularTime && state.elapsedSeconds < regularTime) {
          set({ elapsedSeconds: newElapsed, isRunning: false });
        } else {
          set({ elapsedSeconds: newElapsed });
        }
      },

      addInjuryTime: () => {
        set((state) => ({ injuryTime: state.injuryTime + 60 }));
      },

      nextHalf: () => set((state) => ({
        currentHalf: state.currentHalf + 1,
        elapsedSeconds: 0,
        injuryTime: 0,
        isRunning: false,
      })),
    }),
    {
      name: 'rugby-match-storage',
      version: 1,
    }
  )
);

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

const POSITIONS = [
  'Prop', 'Hooker', 'Lock', 'Flanker', 'Number 8',
  'Scrum-half', 'Fly-half', 'Centre', 'Wing', 'Fullback'
];

// Game Setup Screen
const GameSetup: React.FC = () => {
  const config = useMatchStore();
  const updateConfig = useMatchStore((state) => state.updateConfig);
  const startMatch = useMatchStore((state) => state.startMatch);
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const handleFieldChange = (field: string, value: any) => {
    updateConfig({ [field]: value });
    setIsDirty(true);
    if (errors[field]) {
      setErrors({ ...errors, [field]: '' });
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!config.homeTeam.trim() || config.homeTeam.length < 2) {
      newErrors.homeTeam = 'Team name must be at least 2 characters';
    }
    
    if (!config.awayTeam.trim() || config.awayTeam.length < 2) {
      newErrors.awayTeam = 'Team name must be at least 2 characters';
    }
    
    if (config.homeTeam.trim().toLowerCase() === config.awayTeam.trim().toLowerCase()) {
      newErrors.awayTeam = 'Team names must be different';
    }
    
    if (config.homeColor === config.awayColor) {
      newErrors.awayColor = 'Team colors must be different';
    }
    
    if (config.halfDuration < 5 || config.halfDuration > 60) {
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

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-32">
      <div className="max-w-2xl mx-auto p-6">
        <div className="mb-8 pt-4">
          <h1 className="text-white font-black text-5xl mb-2">MATCH SETUP</h1>
          <p className="text-zinc-400 text-lg font-bold">Configure your rugby match</p>
        </div>

        <div className="mb-8">
          <label className="block text-zinc-400 font-black text-sm mb-3 uppercase tracking-wide">
            Home Team
          </label>
          <input
            type="text"
            value={config.homeTeam}
            onChange={(e) => handleFieldChange('homeTeam', e.target.value)}
            placeholder="Enter team name"
            className="w-full bg-zinc-900 text-white text-2xl font-black p-5 rounded-xl
                       border-4 border-zinc-800 focus:border-blue-500 focus:outline-none
                       placeholder:text-zinc-700"
          />
          {errors.homeTeam && (
            <p className="text-red-400 text-sm font-bold mt-2">⚠ {errors.homeTeam}</p>
          )}
        </div>

        <div className="mb-8">
          <label className="block text-zinc-400 font-black text-sm mb-3 uppercase tracking-wide">
            Home Team Color
          </label>
          <div className="grid grid-cols-4 gap-3">
            {TEAM_COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => handleFieldChange('homeColor', color.value)}
                className={`aspect-square rounded-xl font-black text-sm transition-all
                           ${config.homeColor === color.value 
                             ? 'ring-4 ring-white scale-95' 
                             : 'ring-2 ring-zinc-800 active:scale-90'}`}
                style={{ 
                  backgroundColor: color.value,
                  color: color.contrast,
                }}
              >
                {config.homeColor === color.value && '✓'}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-8">
          <label className="block text-zinc-400 font-black text-sm mb-3 uppercase tracking-wide">
            Away Team
          </label>
          <input
            type="text"
            value={config.awayTeam}
            onChange={(e) => handleFieldChange('awayTeam', e.target.value)}
            placeholder="Enter team name"
            className="w-full bg-zinc-900 text-white text-2xl font-black p-5 rounded-xl
                       border-4 border-zinc-800 focus:border-red-500 focus:outline-none
                       placeholder:text-zinc-700"
          />
          {errors.awayTeam && (
            <p className="text-red-400 text-sm font-bold mt-2">⚠ {errors.awayTeam}</p>
          )}
        </div>

        <div className="mb-8">
          <label className="block text-zinc-400 font-black text-sm mb-3 uppercase tracking-wide">
            Away Team Color
          </label>
          <div className="grid grid-cols-4 gap-3">
            {TEAM_COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => handleFieldChange('awayColor', color.value)}
                className={`aspect-square rounded-xl font-black text-sm transition-all
                           ${config.awayColor === color.value 
                             ? 'ring-4 ring-white scale-95' 
                             : 'ring-2 ring-zinc-800 active:scale-90'}`}
                style={{ 
                  backgroundColor: color.value,
                  color: color.contrast,
                }}
              >
                {config.awayColor === color.value && '✓'}
              </button>
            ))}
          </div>
          {errors.awayColor && (
            <p className="text-red-400 text-sm font-bold mt-2">⚠ {errors.awayColor}</p>
          )}
        </div>

        <div className="mb-8">
          <label className="block text-zinc-400 font-black text-sm mb-3 uppercase tracking-wide">
            Minutes Per Half
          </label>
          <div className="grid grid-cols-4 gap-3 mb-3">
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
          </div>
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
            <p className="text-red-400 text-sm font-bold mt-2">⚠ {errors.halfDuration}</p>
          )}
        </div>

        <div className="mb-8 space-y-4">
          <label className="block text-zinc-400 font-black text-sm mb-3 uppercase tracking-wide">
            Features
          </label>
          
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
        </div>

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full bg-zinc-900 text-zinc-400 font-black p-4 rounded-xl mb-4
                     active:bg-zinc-800 transition-all"
        >
          {showAdvanced ? '▼' : '▶'} ADVANCED OPTIONS
        </button>

        {showAdvanced && (
          <div className="space-y-6 mb-8">
            <div>
              <label className="block text-zinc-400 font-black text-sm mb-3 uppercase tracking-wide">
                Competition Name (Optional)
              </label>
              <input
                type="text"
                value={config.competition}
                onChange={(e) => handleFieldChange('competition', e.target.value)}
                placeholder="e.g. Six Nations, Rugby World Cup"
                className="w-full bg-zinc-900 text-white text-lg font-bold p-4 rounded-xl
                           border-2 border-zinc-800 focus:border-zinc-600 focus:outline-none
                           placeholder:text-zinc-700"
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-black text-sm mb-3 uppercase tracking-wide">
                Venue (Optional)
              </label>
              <input
                type="text"
                value={config.venue}
                onChange={(e) => handleFieldChange('venue', e.target.value)}
                placeholder="e.g. Twickenham Stadium"
                className="w-full bg-zinc-900 text-white text-lg font-bold p-4 rounded-xl
                           border-2 border-zinc-800 focus:border-zinc-600 focus:outline-none
                           placeholder:text-zinc-700"
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-black text-sm mb-3 uppercase tracking-wide">
                Referee (Optional)
              </label>
              <input
                type="text"
                value={config.referee}
                onChange={(e) => handleFieldChange('referee', e.target.value)}
                placeholder="e.g. Wayne Barnes"
                className="w-full bg-zinc-900 text-white text-lg font-bold p-4 rounded-xl
                           border-2 border-zinc-800 focus:border-zinc-600 focus:outline-none
                           placeholder:text-zinc-700"
              />
            </div>
          </div>
        )}

        <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent">
          <button
            onClick={handleStartMatch}
            className="w-full max-w-2xl mx-auto bg-gradient-to-r from-blue-600 to-blue-500 
                       text-white font-black text-2xl p-6 rounded-xl
                       active:scale-98 transition-all shadow-2xl
                       border-4 border-blue-400"
          >
            START MATCH →
          </button>
        </div>
      </div>
    </div>
  );
};

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
      className={`w-16 h-9 rounded-full transition-all flex items-center p-1 min-w-16
                  ${value ? 'bg-green-600' : 'bg-zinc-700'}`}
    >
      <div className={`w-7 h-7 bg-white rounded-full transition-all shadow-lg
                      ${value ? 'translate-x-7' : 'translate-x-0'}`} />
    </button>
  </div>
);

// Player Management Screen
const PlayerManagement: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const players = useMatchStore((state) => state.players);
  const addPlayer = useMatchStore((state) => state.addPlayer);
  const updatePlayer = useMatchStore((state) => state.updatePlayer);
  const deletePlayer = useMatchStore((state) => state.deletePlayer);
  const homeTeam = useMatchStore((state) => state.homeTeam);
  const awayTeam = useMatchStore((state) => state.awayTeam);
  
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<'home' | 'away'>('home');
  const [newPlayer, setNewPlayer] = useState({
    name: '',
    number: '',
    position: POSITIONS[0],
    isStarter: true,
  });

  const homePlayers = players.filter(p => p.team === 'home').sort((a, b) => a.number - b.number);
  const awayPlayers = players.filter(p => p.team === 'away').sort((a, b) => a.number - b.number);

  const handleAddPlayer = () => {
    if (!newPlayer.name.trim() || !newPlayer.number) return;
    
    addPlayer({
      name: newPlayer.name.trim(),
      number: parseInt(newPlayer.number),
      position: newPlayer.position,
      isStarter: newPlayer.isStarter,
      team: selectedTeam,
    });
    
    setNewPlayer({ name: '', number: '', position: POSITIONS[0], isStarter: true });
    setShowAddPlayer(false);
  };

  return (
    <div className="fixed inset-0 bg-zinc-950 z-50 overflow-auto">
      <div className="max-w-2xl mx-auto p-6 pb-32">
        <div className="flex justify-between items-center mb-6 sticky top-0 bg-zinc-950 py-4 z-10">
          <h2 className="text-white font-black text-3xl">PLAYERS</h2>
          <button
            onClick={onClose}
            className="bg-zinc-800 text-white font-black px-4 py-2 rounded-lg active:bg-zinc-700"
          >
            CLOSE
          </button>
        </div>

        {/* Team Toggle */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={() => setSelectedTeam('home')}
            className={`p-4 rounded-xl font-black text-lg transition-all
                       ${selectedTeam === 'home'
                         ? 'bg-blue-600 text-white'
                         : 'bg-zinc-900 text-zinc-400'}`}
          >
            {homeTeam}
          </button>
          <button
            onClick={() => setSelectedTeam('away')}
            className={`p-4 rounded-xl font-black text-lg transition-all
                       ${selectedTeam === 'away'
                         ? 'bg-red-600 text-white'
                         : 'bg-zinc-900 text-zinc-400'}`}
          >
            {awayTeam}
          </button>
        </div>

        {/* Players List */}
        <div className="space-y-3 mb-6">
          {(selectedTeam === 'home' ? homePlayers : awayPlayers).map((player) => (
            <div key={player.id} className="bg-zinc-900 p-4 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="bg-zinc-800 text-white font-black text-lg w-12 h-12 
                                  rounded-lg flex items-center justify-center">
                    {player.number}
                  </div>
                  <div>
                    <div className="text-white font-black text-lg">{player.name}</div>
                    <div className="text-zinc-500 text-sm font-bold">{player.position}</div>
                  </div>
                </div>
                <button
                  onClick={() => deletePlayer(player.id)}
                  className="text-red-400 font-black text-sm px-3 py-2 rounded active:bg-zinc-800"
                >
                  DELETE
                </button>
              </div>
              <button
                onClick={() => updatePlayer(player.id, { isStarter: !player.isStarter })}
                className={`w-full p-2 rounded-lg font-bold text-sm
                           ${player.isStarter 
                             ? 'bg-green-600/20 text-green-400' 
                             : 'bg-zinc-800 text-zinc-500'}`}
              >
                {player.isStarter ? '✓ STARTING XV' : 'BENCH'}
              </button>
            </div>
          ))}
          
          {(selectedTeam === 'home' ? homePlayers : awayPlayers).length === 0 && (
            <div className="text-zinc-600 text-center py-8 font-bold">
              No players added yet
            </div>
          )}
        </div>

        {/* Add Player Button */}
        {!showAddPlayer && (
          <button
            onClick={() => setShowAddPlayer(true)}
            className="w-full bg-blue-600 text-white font-black p-5 rounded-xl
                       active:bg-blue-700 transition-all"
          >
            + ADD PLAYER
          </button>
        )}

        {/* Add Player Form */}
        {showAddPlayer && (
          <div className="bg-zinc-900 p-6 rounded-xl border-4 border-blue-600">
            <h3 className="text-white font-black text-xl mb-4">ADD PLAYER</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-zinc-400 font-bold text-sm mb-2">Name</label>
                <input
                  type="text"
                  value={newPlayer.name}
                  onChange={(e) => setNewPlayer({ ...newPlayer, name: e.target.value })}
                  placeholder="Player name"
                  className="w-full bg-zinc-800 text-white text-lg font-bold p-3 rounded-lg
                             border-2 border-zinc-700 focus:border-blue-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-bold text-sm mb-2">Number</label>
                <input
                  type="number"
                  value={newPlayer.number}
                  onChange={(e) => setNewPlayer({ ...newPlayer, number: e.target.value })}
                  placeholder="1-23"
                  min="1"
                  max="23"
                  className="w-full bg-zinc-800 text-white text-lg font-bold p-3 rounded-lg
                             border-2 border-zinc-700 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-bold text-sm mb-2">Position</label>
                <select
                  value={newPlayer.position}
                  onChange={(e) => setNewPlayer({ ...newPlayer, position: e.target.value })}
                  className="w-full bg-zinc-800 text-white text-lg font-bold p-3 rounded-lg
                             border-2 border-zinc-700 focus:border-blue-500 focus:outline-none"
                >
                  {POSITIONS.map(pos => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
              </div>

              <ToggleField
                label="Starting XV"
                description="Include in starting lineup"
                value={newPlayer.isStarter}
                onChange={(val) => setNewPlayer({ ...newPlayer, isStarter: val })}
              />

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => setShowAddPlayer(false)}
                  className="bg-zinc-700 text-white font-black p-4 rounded-lg active:bg-zinc-600"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleAddPlayer}
                  disabled={!newPlayer.name.trim() || !newPlayer.number}
                  className="bg-blue-600 text-white font-black p-4 rounded-lg active:bg-blue-700
                             disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ADD
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

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
    if (now - lastTap < 300) return; // Prevent double-tap
    setLastTap(now);
    onClick();
  };
  
  const bgColor = disabled ? 'bg-zinc-700' : 
                 variant === 'penalty' ? 'bg-amber-600 active:bg-amber-700' :
                 variant === 'secondary' ? 'bg-emerald-600 active:bg-emerald-700' :
                 'bg-blue-600 active:bg-blue-700';
  
  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`${bgColor} text-white font-black text-lg p-4 rounded-lg
                  transition-all duration-75 shadow-lg min-h-[48px]
                  ${disabled ? 'opacity-40 cursor-not-allowed' : 'active:scale-95 active:shadow-md'}`}
    >
      <div className="text-sm opacity-80 font-bold">{label}</div>
      <div className="text-3xl">+{points}</div>
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
  
  return (
    <button
      onClick={handleClick}
      className={`${type === 'yellow' ? 'bg-yellow-400' : 'bg-red-600'} 
                  text-black font-black text-sm p-3 rounded-lg min-h-[48px]
                  transition-all duration-75 shadow-lg active:scale-95`}
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
  
  const activeSinBins = cards.filter(
    c => c.type === 'yellow' && !c.returned && c.returnTime && elapsedSeconds < c.returnTime
  );

  if (activeSinBins.length === 0) return null;

  return (
    <div className="bg-yellow-400/10 border-2 border-yellow-400 rounded-xl p-3 mb-4">
      <div className="text-yellow-400 font-black text-xs mb-2 uppercase">Sin Bin</div>
      {activeSinBins.map((card) => {
        const timeLeft = (card.returnTime || 0) - elapsedSeconds;
        const player = players.find(p => p.id === card.player);
        const isWarning = timeLeft <= 60;
        
        return (
          <div
            key={card.id}
            className={`flex items-center justify-between bg-zinc-900 p-3 rounded-lg mb-2 last:mb-0
                       ${isWarning ? 'ring-2 ring-yellow-400 animate-pulse' : ''}`}
          >
            <div>
              <div className="text-white font-black text-sm">
                {player ? `${player.name} (#${player.number})` : `#${card.player}`}
              </div>
              <div className="text-zinc-500 text-xs font-bold">
                {Math.floor(card.matchTime / 60)}'
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className={`font-black text-xl ${isWarning ? 'text-yellow-400' : 'text-white'}`}>
                {formatTime(timeLeft)}
              </div>
              <button
                onClick={() => returnFromSinBin(card.id)}
                className="bg-green-600 text-white font-black text-xs px-3 py-2 rounded
                           active:bg-green-700 min-h-[48px]"
              >
                RETURN
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const TeamSection: React.FC<{
  team: 'home' | 'away';
  isTop?: boolean;
}> = ({ team, isTop = false }) => {
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [selectedAction, setSelectedAction] = useState<'score' | 'card' | null>(null);
  const [scoreType, setScoreType] = useState<ScoreEvent['type']>('try');
  const [cardType, setCardType] = useState<'yellow' | 'red'>('yellow');
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');

  const teamName = useMatchStore((state) => team === 'home' ? state.homeTeam : state.awayTeam);
  const teamColor = useMatchStore((state) => team === 'home' ? state.homeColor : state.awayColor);
  const score = useMatchStore((state) => team === 'home' ? state.homeScore : state.awayScore);
  const lastTryTeam = useMatchStore((state) => state.lastTryTeam);
  const playerTracking = useMatchStore((state) => state.playerTracking);
  const cardTracking = useMatchStore((state) => state.cardTracking);
  const addScore = useMatchStore((state) => state.addScore);
  const addCard = useMatchStore((state) => state.addCard);
  const players = useMatchStore((state) => state.players.filter(p => p.team === team).sort((a, b) => a.number - b.number));

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

  const handlePlayerSubmit = () => {
    if (!selectedPlayer) return;

    if (selectedAction === 'score') {
      addScore(team, scoreType, selectedPlayer);
    } else if (selectedAction === 'card') {
      addCard(team, selectedPlayer, cardType);
    }

    setShowPlayerPicker(false);
    setSelectedPlayer('');
  };

  return (
    <div className={`relative ${isTop ? 'pb-6' : 'pt-6'}`}>
      <div className={`flex items-center justify-between mb-4 ${isTop ? 'flex-col-reverse' : 'flex-col'}`}>
        <div 
          className="text-center font-black text-2xl px-6 py-2 rounded-full w-full mb-2"
          style={{ backgroundColor: teamColor, color: '#ffffff' }}
        >
          {teamName}
        </div>
        <div className="text-white font-black text-7xl tracking-tighter">{score}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <ScoreButton label="TRY" points={5} onClick={() => handleScoreClick('try')} />
        <ScoreButton 
          label="CONVERSION" 
          points={2} 
          onClick={() => handleScoreClick('conversion')}
          disabled={!canConvert}
          variant="secondary"
        />
        <ScoreButton label="PENALTY" points={3} onClick={() => handleScoreClick('penalty')} variant="penalty" />
        <ScoreButton label="DROP GOAL" points={3} onClick={() => handleScoreClick('drop-goal')} variant="penalty" />
      </div>
      
      <button
        onClick={() => handleScoreClick('penalty-try')}
        className="w-full bg-red-700 text-white font-black text-sm p-3 rounded-lg mb-3
                   transition-all duration-75 shadow-lg active:scale-95 min-h-[48px]"
      >
        PENALTY TRY (+7)
      </button>

      {cardTracking && (
        <div className="grid grid-cols-2 gap-3">
          <CardButton type="yellow" onClick={() => handleCardClick('yellow')} />
          <CardButton type="red" onClick={() => handleCardClick('red')} />
        </div>
      )}

      {showPlayerPicker && playerTracking && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-sm border-4 border-white max-h-[80vh] overflow-auto">
            <h3 className="text-white font-black text-2xl mb-4 text-center">
              {selectedAction === 'score' ? `${scoreType.toUpperCase()}` : `${cardType.toUpperCase()} CARD`}
            </h3>
            
            <div className="space-y-2 mb-4 max-h-96 overflow-auto">
              {players.map((player) => (
                <button
                  key={player.id}
                  onClick={() => setSelectedPlayer(player.id)}
                  className={`w-full text-left p-4 rounded-lg font-bold transition-all
                             ${selectedPlayer === player.id 
                               ? 'bg-blue-600 text-white' 
                               : 'bg-zinc-800 text-zinc-300 active:bg-zinc-700'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-zinc-900 text-white font-black text-lg w-10 h-10 
                                    rounded flex items-center justify-center">
                      {player.number}
                    </div>
                    <div>
                      <div className="text-lg">{player.name}</div>
                      <div className="text-xs opacity-70">{player.position}</div>
                    </div>
                  </div>
                </button>
              ))}
              
              {players.length === 0 && (
                <div className="text-zinc-500 text-center py-8">
                  No players added. Add players in the Players menu.
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setShowPlayerPicker(false);
                  setSelectedPlayer('');
                }}
                className="bg-zinc-700 text-white font-black p-4 rounded-lg active:bg-zinc-600 min-h-[48px]"
              >
                CANCEL
              </button>
              <button
                onClick={handlePlayerSubmit}
                disabled={!selectedPlayer}
                className="bg-blue-600 text-white font-black p-4 rounded-lg active:bg-blue-700
                           disabled:opacity-40 disabled:cursor-not-allowed min-h-[48px]"
              >
                CONFIRM
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MatchControls: React.FC = () => {
  const [showMenu, setShowMenu] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);
  const currentHalf = useMatchStore((state) => state.currentHalf);
  const elapsedSeconds = useMatchStore((state) => state.elapsedSeconds);
  const injuryTime = useMatchStore((state) => state.injuryTime);
  const isRunning = useMatchStore((state) => state.isRunning);
  const halfDuration = useMatchStore((state) => state.halfDuration);
  const toggleTimer = useMatchStore((state) => state.toggleTimer);
  const nextHalf = useMatchStore((state) => state.nextHalf);
  const addInjuryTime = useMatchStore((state) => state.addInjuryTime);
  const undo = useMatchStore((state) => state.undo);
  const endMatch = useMatchStore((state) => state.endMatch);
  const competition = useMatchStore((state) => state.competition);
  const venue = useMatchStore((state) => state.venue);
  const playerTracking = useMatchStore((state) => state.playerTracking);

  const isOvertime = elapsedSeconds > halfDuration;
  const displayTime = elapsedSeconds + (isOvertime ? 0 : 0);

  return (
    <>
      <div className="sticky top-0 bg-zinc-900/95 backdrop-blur-sm z-40 border-y-4 border-white py-3">
        {(competition || venue) && (
          <div className="text-center text-zinc-400 text-xs font-bold mb-2 px-4">
            {competition && <span>{competition}</span>}
            {competition && venue && <span className="mx-2">•</span>}
            {venue && <span>{venue}</span>}
          </div>
        )}
        
        <div className="flex items-center justify-between px-4 mb-3">
          <button
            onClick={undo}
            className="bg-zinc-800 text-white font-black text-sm px-4 py-3 rounded-lg
                       active:bg-zinc-700 active:scale-95 transition-all shadow-lg min-h-[48px]"
          >
            ↶ UNDO
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleTimer}
              className={`${isRunning ? 'bg-red-600' : 'bg-green-600'} 
                         text-white font-black px-6 py-3 rounded-lg
                         active:scale-95 transition-all shadow-lg min-h-[48px]`}
            >
              {isRunning ? '⏸' : '▶'}
            </button>
            
            <div className="text-center">
              <div className="text-white font-black text-xs opacity-60">
                HALF {currentHalf}
              </div>
              <div className={`font-black text-2xl tracking-tighter ${isOvertime ? 'text-red-400' : 'text-white'}`}>
                {formatTime(displayTime)}
                {isOvertime && <span className="text-red-400 text-sm ml-1">+{formatTime(displayTime - halfDuration)}</span>}
              </div>
              {injuryTime > 0 && (
                <div className="text-yellow-400 text-xs font-bold">
                  +{injuryTime / 60}' injury
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => setShowMenu(true)}
            className="bg-zinc-800 text-white font-black text-sm px-4 py-3 rounded-lg
                       active:bg-zinc-700 active:scale-95 transition-all shadow-lg min-h-[48px]"
          >
            ⋯
          </button>
        </div>

        <SinBinTimers />
      </div>

      {showMenu && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-sm border-4 border-white">
            <h3 className="text-white font-black text-2xl mb-6">MATCH CONTROLS</h3>
            
            <div className="space-y-3">
              {playerTracking && (
                <button
                  onClick={() => {
                    setShowMenu(false);
                    setShowPlayers(true);
                  }}
                  className="w-full bg-purple-600 text-white font-black p-4 rounded-lg active:bg-purple-700 min-h-[48px]"
                >
                  👥 MANAGE PLAYERS
                </button>
              )}
              
              <button
                onClick={() => {
                  addInjuryTime();
                  setShowMenu(false);
                }}
                className="w-full bg-yellow-600 text-white font-black p-4 rounded-lg active:bg-yellow-700 min-h-[48px]"
              >
                + 1 MIN INJURY TIME
              </button>
              
              <button
                onClick={() => {
                  nextHalf();
                  setShowMenu(false);
                }}
                className="w-full bg-blue-600 text-white font-black p-4 rounded-lg active:bg-blue-700 min-h-[48px]"
              >
                NEXT HALF
              </button>
              
              <button
                onClick={() => {
                  if (confirm('End match and return to setup? Current match data will be cleared.')) {
                    endMatch();
                    setShowMenu(false);
                  }
                }}
                className="w-full bg-red-600 text-white font-black p-4 rounded-lg active:bg-red-700 min-h-[48px]"
              >
                END MATCH
              </button>
              
              <button
                onClick={() => setShowMenu(false)}
                className="w-full bg-zinc-700 text-white font-black p-4 rounded-lg active:bg-zinc-600 min-h-[48px]"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {showPlayers && <PlayerManagement onClose={() => setShowPlayers(false)} />}
    </>
  );
};

const EventLog: React.FC = () => {
  const [showLog, setShowLog] = useState(false);
  const scoreEvents = useMatchStore((state) => state.scoreEvents);
  const cards = useMatchStore((state) => state.cards);
  const players = useMatchStore((state) => state.players);
  const homeTeam = useMatchStore((state) => state.homeTeam);
  const awayTeam = useMatchStore((state) => state.awayTeam);
  const resolvePendingEvent = useMatchStore((state) => state.resolvePendingEvent);

  const allEvents = [...scoreEvents, ...cards]
    .sort((a, b) => b.timestamp - a.timestamp);

  const pendingEvents = scoreEvents.filter(e => e.pending);

  return (
    <>
      <button
        onClick={() => setShowLog(true)}
        className="fixed bottom-4 right-4 bg-zinc-800 text-white font-black text-sm px-5 py-3 rounded-full
                   shadow-2xl active:scale-95 transition-all z-30 border-2 border-white min-h-[48px]"
      >
        📋 LOG ({allEvents.length})
        {pendingEvents.length > 0 && (
          <span className="ml-2 bg-yellow-400 text-black px-2 py-1 rounded-full text-xs">
            {pendingEvents.length} TMO
          </span>
        )}
      </button>

      {showLog && (
        <div className="fixed inset-0 bg-black/95 z-50 overflow-auto">
          <div className="p-4">
            <div className="flex justify-between items-center mb-6 sticky top-0 bg-black py-4 z-10">
              <h2 className="text-white font-black text-3xl">MATCH LOG</h2>
              <button
                onClick={() => setShowLog(false)}
                className="bg-zinc-800 text-white font-black px-4 py-2 rounded-lg min-h-[48px]"
              >
                CLOSE
              </button>
            </div>

            {/* Pending TMO Reviews */}
            {pendingEvents.length > 0 && (
              <div className="mb-6">
                <h3 className="text-yellow-400 font-black text-xl mb-3">TMO REVIEW</h3>
                {pendingEvents.map((event) => {
                  const teamName = event.team === 'home' ? homeTeam : awayTeam;
                  const player = players.find(p => p.id === event.player);
                  
                  return (
                    <div key={event.id} className="bg-yellow-400/10 border-2 border-yellow-400 p-4 rounded-xl mb-3">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="text-white font-black text-lg">
                            {teamName}
                            {player && ` - ${player.name} (#${player.number})`}
                          </div>
                          <div className="text-yellow-400 font-bold text-sm">
                            {event.type.toUpperCase()} - PENDING REVIEW
                          </div>
                        </div>
                        <div className="text-zinc-500 text-sm font-bold">
                          H{event.half} {event.minute}'
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => resolvePendingEvent(event.id, false)}
                          className="bg-red-600 text-white font-black p-3 rounded-lg active:bg-red-700"
                        >
                          ✗ NO TRY
                        </button>
                        <button
                          onClick={() => resolvePendingEvent(event.id, true)}
                          className="bg-green-600 text-white font-black p-3 rounded-lg active:bg-green-700"
                        >
                          ✓ TRY
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* All Events */}
            <div className="space-y-2">
              {allEvents.map((event) => {
                const isScore = 'points' in event;
                const teamName = event.team === 'home' ? homeTeam : awayTeam;
                const player = players.find(p => p.id === event.player);
                
                return (
                  <div
                    key={event.id}
                    className={`bg-zinc-900 border-l-4 p-4 rounded-lg
                               ${(event as ScoreEvent).pending ? 'border-yellow-400 opacity-50' : 'border-white'}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-white font-black text-lg">
                          {teamName}
                          {player && ` - ${player.name} (#${player.number})`}
                        </div>
                        <div className="text-zinc-400 font-bold text-sm">
                          {isScore ? (
                            <>
                              {(event as ScoreEvent).type.toUpperCase()} 
                              {(event as ScoreEvent).pending && <span className="text-yellow-400 ml-2">(PENDING TMO)</span>}
                              {!(event as ScoreEvent).pending && <span className="text-green-400 ml-2">+{(event as ScoreEvent).points}</span>}
                            </>
                          ) : (
                            <span className={(event as Card).type === 'yellow' ? 'text-yellow-400' : 'text-red-400'}>
                              {(event as Card).type.toUpperCase()} CARD
                              {(event as Card).returned && ' (RETURNED)'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-zinc-500 text-sm font-bold text-right">
                        H{event.half}<br/>{event.minute}'
                      </div>
                    </div>
                  </div>
                );
              })}

              {allEvents.length === 0 && (
                <div className="text-zinc-600 text-center py-12 font-bold">
                  No events yet
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Main App
const App: React.FC = () => {
  useTimer();
  const matchStarted = useMatchStore((state) => state.matchStarted);
  const isRunning = useMatchStore((state) => state.isRunning);
  
  useWakeLock(matchStarted && isRunning);

  if (!matchStarted) {
    return <GameSetup />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white overflow-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;700;900&display=swap');
        
        * {
          font-family: 'Roboto Condensed', sans-serif;
          -webkit-tap-highlight-color: transparent;
        }
        
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        
        input[type="number"] {
          -moz-appearance: textfield;
        }

        input, select, textarea {
          font-size: 16px;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        
        .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>

      <div className="max-w-2xl mx-auto">
        <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 p-4">
          <TeamSection team="away" isTop />
        </div>

        <MatchControls />

        <div className="bg-gradient-to-t from-zinc-900 to-zinc-950 p-4">
          <TeamSection team="home" />
        </div>
      </div>

      <EventLog />
    </div>
  );
};

export default App;
