const Icon = ({ size }: { size: number }) => (
  <svg aria-hidden width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 12.5v1h11v-1" />
  </svg>
);

const SIZE = {
  hero: "gap-2.5 rounded-[10px] px-6 py-3.5 text-[16.5px]",
  card: "gap-2.5 rounded-[10px] px-6 py-3 text-[15.5px]",
  nav: "gap-2 rounded-lg px-3.5 py-2 text-[13px]",
} as const;

export function DownloadButton({ size = "hero", className = "" }: { size?: keyof typeof SIZE; className?: string }) {
  return (
    <a href="/download" className={`inline-flex items-center bg-accent2 font-display font-semibold tracking-[-.01em] text-white transition-[background-color,transform] duration-[120ms] hover:-translate-y-px hover:bg-[#b4453d] active:translate-y-0 active:duration-[60ms] ${SIZE[size]} ${className}`}>
      <Icon size={size === "nav" ? 14 : 18} />Download for Mac
    </a>
  );
}
