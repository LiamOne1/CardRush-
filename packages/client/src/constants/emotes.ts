import type { EmoteType } from "@code-card/shared";

export const EMOTE_OPTIONS: readonly { type: EmoteType; label: string; emoji: string }[] = [
  { type: "happy", label: "Happy", emoji: "😄" },
  { type: "angry", label: "Angry", emoji: "😡" },
  { type: "sad", label: "Sad", emoji: "😢" },
  { type: "shocked", label: "Shocked", emoji: "😲" }
] as const;

export const EMOTE_BY_TYPE: Record<EmoteType, { label: string; emoji: string }> = EMOTE_OPTIONS.reduce(
  (acc, option) => {
    acc[option.type] = { label: option.label, emoji: option.emoji };
    return acc;
  },
  {} as Record<EmoteType, { label: string; emoji: string }>
);

export const EMOTE_DISPLAY_DURATION_MS = 2500;
