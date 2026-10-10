// The handful of icons the UI needs, drawn inline so we don't ship an icon
// library for eight glyphs. All are 24x24 strokes that inherit currentColor.

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const VideoIcon = () => (
  <Icon>
    <rect x="3" y="6" width="12" height="12" rx="3" />
    <path d="m15 10 6-3v10l-6-3" />
  </Icon>
);

export const VideoOffIcon = () => (
  <Icon>
    <path d="M15 14v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a3 3 0 0 1 2-2.8" />
    <path d="M10 6h2a3 3 0 0 1 3 3v1l6-3v10" />
    <path d="m3 3 18 18" />
  </Icon>
);

export const MicIcon = () => (
  <Icon>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Icon>
);

export const MicOffIcon = () => (
  <Icon>
    <path d="M9 9v2a3 3 0 0 0 5 2.2M15 9.5V6a3 3 0 0 0-5.7-1.3" />
    <path d="M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.4 2.3M12 18v3" />
    <path d="m3 3 18 18" />
  </Icon>
);

export const SendIcon = () => (
  <Icon>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const LockIcon = () => (
  <Icon>
    <rect x="5" y="11" width="14" height="9" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
);

export const PinIcon = () => (
  <Icon>
    <path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </Icon>
);

export const GhostIcon = () => (
  <Icon>
    <path d="M5 21V10a7 7 0 0 1 14 0v11l-3-2-2 2-2-2-2 2-2-2-3 2Z" />
    <path d="M9.5 10h.01M14.5 10h.01" />
  </Icon>
);
