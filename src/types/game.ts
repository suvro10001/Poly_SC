export type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'HANGAR' | 'MISSIONS' | 'SETTINGS';

export type BiomeType = 'sunset' | 'cyber' | 'emerald' | 'cosmic';

export interface CraftConfig {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  cost: number;
  unlocked: boolean;
  color: string;
  accentColor: string;
  emissiveColor: string;
  shape: 'falcon' | 'prism' | 'icosa' | 'vortex';
  stats: {
    speed: number;      // 1 - 5
    agility: number;    // 1 - 5
    magnet: number;     // 1 - 5
    boost: number;      // 1 - 5
  };
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  reward: number;
  completed: boolean;
  claimed: boolean;
  type: 'distance' | 'crystals' | 'dodge' | 'boost' | 'score';
}

export interface PlayerStats {
  score: number;
  distance: number;       // meters
  crystals: number;       // run crystals
  totalCrystals: number;  // wallet
  highScore: number;
  bestDistance: number;
  speedKmh: number;
  multiplier: number;
  combo: number;
  nearMisses: number;
}

export interface PowerupTimers {
  shield: number;       // remaining seconds
  magnet: number;
  boost: number;
  multiplier2x: number;
  chrono: number;
}

export type CameraMode = 'chase' | 'high' | 'cockpit';

export interface GameSettings {
  musicVolume: number;
  sfxVolume: number;
  cameraMode: CameraMode;
  selectedBiome: BiomeType | 'auto';
  quality: 'high' | 'medium' | 'low';
}
