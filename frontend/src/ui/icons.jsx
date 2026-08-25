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

function FilledShape({ d, ...props }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" width="1em" height="1em"
      fill="currentColor" aria-hidden="true" {...props}><path d={d} /></svg>
  );
}

export const HeartShape = (props) => <FilledShape {...props} d="M12 21S3 14.6 3 8.9A5 5 0 0 1 12 6a5 5 0 0 1 9 2.9C21 14.6 12 21 12 21z" />;
export const FlameShape = (props) => <FilledShape {...props} d="M12 2s5 4.6 5 9a5 5 0 0 1-10 0c0-1.4.5-2.6 1.2-3.6.2 1.3.9 2.2 1.8 2.4-.5-2.6.5-5.6 2-7.8z" />;
export const BoltShape = (props) => <FilledShape {...props} d="M13 2 4 13.5h5.5L10 22l9-11.5h-5.5L13 2z" />;
export const StarShape = (props) => <FilledShape {...props} d="m12 2 2.9 6.3 6.8.8-5 4.7 1.3 6.8L12 17.3 5.9 20.6l1.4-6.8-5-4.7 6.8-.8L12 2z" />;

export const REACTIONS = [
  { key: "heart", Icon: HeartShape, label: "Amei" },
  { key: "flame", Icon: FlameShape, label: "Fogo" },
  { key: "bolt", Icon: BoltShape, label: "Chocado" },
  { key: "star", Icon: StarShape, label: "Destaque" }
];

export const REACTION_ICONS = {
  heart: HeartShape,
  flame: FlameShape,
  bolt: BoltShape,
  star: StarShape
};
