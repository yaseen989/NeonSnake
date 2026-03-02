
export interface Point {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  segments: Point[];
  direction: Point;
  angle: number;
  score: number;
  isAlive: boolean;
}

export interface Food {
  id: string;
  position: Point;
  velocity: Point;
}

export interface GameState {
  players: Record<string, Player>;
  foods: Food[];
  width: number;
  height: number;
}

export const GRID_SIZE = 15;
export const TICK_RATE = 16; // ~60 FPS server updates
export const GAME_WIDTH = 4000;
export const GAME_HEIGHT = 4000;
export const INITIAL_SNAKE_LENGTH = 30;
export const SNAKE_SPEED = 2.5;

export type ServerMessage = 
  | { type: 'init'; state: GameState; playerId: string }
  | { type: 'update'; state: GameState }
  | { type: 'playerJoined'; player: Player }
  | { type: 'playerLeft'; playerId: string };

export type ClientMessage = 
  | { type: 'join'; name: string }
  | { type: 'move'; angle: number };
