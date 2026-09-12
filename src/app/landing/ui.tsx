// ============================================================================
// The page's vocabulary, drawn from the app's own.
//
// Every visual on the landing page is built from these four primitives, which
// are the shapes the product actually uses: a status dot, a session row, a
// panel, and terminal output. The page argues by showing the instrument, not
// by describing it — so these carry the weight that paragraphs used to.
// ============================================================================

export type Tone = "go" | "wait" | "stop" | "idle";

const TONE_BG: Record<Tone, string> = { go: "bg-go", wait: "bg-wait", stop: "bg-stop", idle: "bg-faint" };

export function Dot({ tone, className = "" }: { tone: Tone; className?: string }) {
  return <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${TONE_BG[tone]} ${className}`} />;
}

/** A live session, the way the panel lists one. */
export function Row({
  tone,
  name,
  host,
  children,
  flag,
  className = "",
}: {
  tone: Tone;
  name: string;
  host?: string;
  children: React.ReactNode;
  flag?: "stop" | "go";
  className?: string;
}) {
  const edge =
    flag === "stop"
      ? "border-[var(--wg-stop-line)] bg-[var(--wg-stop-bg)]"
      : flag === "go"
        ? "border-[var(--wg-go-line)] bg-[var(--wg-go-bg)]"
        : "border-line bg-row";
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${edge} ${className}`}>
      <div className="flex items-center gap-2">
        <Dot tone={tone} />
        <span className={`text-[12.5px] font-medium ${flag === "stop" ? "text-stop" : "text-txt"}`}>{name}</span>
        {host && <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[.09em] text-muted">{host}</span>}
      </div>
      <div className={`mt-1 text-[12px] leading-[1.5] ${flag ? "text-body" : "text-muted"}`}>{children}</div>
    </div>
  );
}

/** A file path, a count, a branch — anything that is data. */
export const Mono = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-[11.5px] text-body">{children}</span>
);

export function Panel({ title, tone, children, className = "" }: { title: string; tone: "bad" | "good"; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col rounded-xl border ${tone === "bad" ? "border-line2" : "border-[var(--wg-coral-line)]"} bg-pane ${className}`}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Dot tone={tone === "bad" ? "stop" : "go"} />
        <span className="text-[12.5px] font-medium text-txt">{title}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-4">{children}</div>
    </div>
  );
}

/** What the agent printed. */
export function Terminal({ head, children, foot }: { head: string; children: string; foot?: string }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-line2 bg-codebg">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <Dot tone="wait" />
        <span className="font-mono text-[10.5px] uppercase tracking-[.1em] text-white/55">{head}</span>
      </div>
      <pre className="whitespace-pre-wrap px-5 py-5 font-mono text-[12px] leading-[1.8] text-codefg sm:text-[13px]">{children}</pre>
      {foot && <figcaption className="border-t border-white/10 px-5 py-3 text-[12px] text-white/45">{foot}</figcaption>}
    </figure>
  );
}
