// Only the reading pane blinks while a Team page loads; the list pane is the
// group layout and stays put.
export default function TeamLoading() {
  return (
    <main className="min-w-0 flex-1 animate-pulse px-10 pt-8" aria-busy>
      <div className="h-8 w-56 rounded bg-row2" />
      <div className="mt-3 h-4 w-80 rounded bg-row" />
      <div className="mt-8 grid grid-cols-2 gap-7">
        <div className="h-52 rounded-xl border border-line bg-row" />
        <div className="h-52 rounded-xl border border-line bg-row" />
      </div>
    </main>
  );
}
