// Instant feedback on every Console navigation: the sidebar and toolbar stay
// (layout), and the pane area shows this until the page's data arrives.
export default function DeskLoading() {
  return (
    <div className="flex min-h-0 flex-1 animate-pulse" aria-busy>
      <aside className="w-[272px] flex-shrink-0 border-r border-line bg-pane px-4 pt-6">
        <div className="h-5 w-28 rounded bg-row2" />
        <div className="mt-5 grid gap-3">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-9 rounded-lg bg-row" />)}
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-10 pt-8">
        <div className="h-8 w-56 rounded bg-row2" />
        <div className="mt-3 h-4 w-80 rounded bg-row" />
        <div className="mt-8 grid grid-cols-2 gap-7">
          <div className="h-52 rounded-xl border border-line bg-row" />
          <div className="h-52 rounded-xl border border-line bg-row" />
        </div>
      </main>
    </div>
  );
}
