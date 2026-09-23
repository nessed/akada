export type IconName =
  | 'read' | 'write' | 'upload' | 'download' | 'plus' | 'trash' | 'search' | 'rail' | 'railOpen'
  | 'settings' | 'contents' | 'notes' | 'copy' | 'close' | 'fold' | 'unfold' | 'split' | 'check';

const paths: Record<IconName, React.ReactNode> = {
  read: <path d="M4 5.5h6a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H4zM20 5.5h-6a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2h6z" />,
  write: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  upload: <path d="M12 15V4m-4 4 4-4 4 4M5 14v5h14v-5" />,
  download: <path d="M12 4v11m-4-4 4 4 4-4M5 14v5h14v-5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <path d="M5 7h14M10 7V4.5h4V7m3 0-.8 12.5H7.8L7 7" />,
  search: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.2-4.2" /></>,
  rail: <path d="M4 5h16M4 12h10M4 19h16" />,
  railOpen: <path d="M4 5h16M4 12h16M4 19h16" />,
  settings: <><path d="M4 7h9M19 7h1M4 17h3M13 17h7" /><circle cx="16" cy="7" r="2.2" /><circle cx="10" cy="17" r="2.2" /></>,
  contents: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  notes: <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM4 19a2 2 0 0 1 2-2h12" />,
  copy: <><rect x="8" y="8" width="11" height="12" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h9" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  fold: <path d="M7 9l5-5 5 5M7 15l5 5 5-5" />,
  unfold: <path d="M7 4l5 5 5-5M7 20l5-5 5 5" />,
  split: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M12 4.5v15" /></>,
  check: <path d="M4.5 12.5 9 17l10.5-10.5" />,
};

export default function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
