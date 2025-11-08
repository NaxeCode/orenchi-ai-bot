declare module "play-sound" {
  type PlayCallback = (err?: Error | null) => void;

  interface PlayOptions {
    players?: string[];
    player?: string;
  }

  interface PlayerInstance {
    play(file: string, options?: PlayOptions, callback?: PlayCallback): void;
    play(file: string, callback?: PlayCallback): void;
  }

  export default function createPlayer(options?: PlayOptions): PlayerInstance;
}
