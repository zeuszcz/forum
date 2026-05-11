/** Curated emoji catalogue for the shoutbox picker. ~80 most-used picks,
 * grouped. We deliberately avoid bundling the full Unicode CLDR — that's a
 * megabyte we don't need for casual chat. */

export interface EmojiGroup {
  name: string;
  emojis: string[];
}

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    name: "Эмоции",
    emojis: [
      "😀", "😂", "🤣", "😅", "😊", "😎", "😍", "🤩",
      "🥲", "🤔", "🙃", "😴", "😭", "😱", "🤯", "🥶",
      "😤", "😡", "💀", "🤡", "👻", "🤖", "🥴", "😈",
    ],
  },
  {
    name: "Жесты",
    emojis: [
      "👍", "👎", "👌", "✌️", "🤞", "🤘", "🫡", "🙏",
      "👏", "🤝", "💪", "🤙", "🫶", "🤌", "🖕", "🫵",
    ],
  },
  {
    name: "Реакции",
    emojis: [
      "❤️", "🔥", "✨", "⚡", "💯", "🎉", "🎯", "🏆",
      "🚀", "💎", "👀", "🧠", "🦾", "🫨", "‼️", "❓",
    ],
  },
  {
    name: "Игра",
    emojis: [
      "🎮", "🕹️", "🎲", "🪙", "🃏", "🎰", "🥇", "🥈",
      "🥉", "🛡️", "⚔️", "🔫", "💣", "🎯", "🚨", "🟩",
    ],
  },
];
