// What a user is in the mood for. A fixed list on purpose: free text on an
// anonymous map would need moderation, a handful of presets needs none.
export const VIBES = {
  chat: "Up for a chat",
  music: "Talk music",
  night: "Can't sleep",
  games: "Talk games",
  study: "Study break",
  travel: "Travel stories",
} as const;

export type Vibe = keyof typeof VIBES;

export function isVibe(value: unknown): value is Vibe {
  return typeof value === "string" && Object.hasOwn(VIBES, value);
}
