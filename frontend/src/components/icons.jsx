export function Sun(props) {
  return (
    <svg className="ic" viewBox="0 0 24 24" width="1em" height="1em" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function Moon(props) {
  return (
    <svg className="ic" viewBox="0 0 24 24" width="1em" height="1em" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" {...props}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

export function PointerIcon({ fill = "currentColor", stroke = "currentColor", ...props }) {
  return (
    <svg viewBox="0 0 18 23" width="1em" height="1em" aria-hidden="true" {...props}>
      <path d="M1 1L16 13L9 14L6 21Z" fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export const REACTIONS = [
  { key: "heart", emoji: "❤️", label: "Amei" },
  { key: "laugh", emoji: "😂", label: "Muito bom" },
  { key: "wow", emoji: "😮", label: "Uau" },
  { key: "fire", emoji: "🔥", label: "Fogo" },
  { key: "clap", emoji: "👏", label: "Aplausos" },
  { key: "thumbsUp", emoji: "👍", label: "Gostei" },
  { key: "party", emoji: "🎉", label: "Boa!" },
  { key: "skull", emoji: "💀", label: "Morri" }
];
