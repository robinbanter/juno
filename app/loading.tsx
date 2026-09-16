// Shown while the dynamic feed (and other server work) resolves, instead of a
// blank screen. Applies to any route segment without its own loading file.
export default function Loading() {
  return (
    <main
      className="flex min-h-dvh flex-1 items-center justify-center"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      <span
        className="border-hairline-strong size-8 rounded-full border-2 border-t-[color:var(--primary)]"
        style={{ animation: "vspin .7s linear infinite" }}
      />
    </main>
  );
}
