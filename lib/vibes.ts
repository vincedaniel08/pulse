// What a user is in the mood for. A fixed list on purpose: free text on an
// anonymous map would need moderation, a handful of presets needs none.
export const VIBES = {
  chat: { emoji: "💬", label: "Up for a chat" },
  music: { emoji: "🎧", label: "Talk music" },
  night: { emoji: "🌙", label: "Can't sleep" },
  games: { emoji: "🎮", label: "Talk games" },
  study: { emoji: "📚", label: "Study break" },
  travel: { emoji: "✈️", label: "Travel stories" },
} as const;

export type Vibe = keyof typeof VIBES;

export function isVibe(value: unknown): value is Vibe {
  return typeof value === "string" && Object.hasOwn(VIBES, value);
}
