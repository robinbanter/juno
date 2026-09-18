/**
 * Says how many coins a list could not read from the chain, instead of quietly
 * leaving them out.
 *
 * Rendered by list views when `hydratePoolsReport` returns `unavailable` pools:
 * they are in the registry, so they exist, but the RPC refused their live read.
 * Omitting them without a word makes a partial list look complete — and an
 * empty one look like nobody has launched anything.
 *
 * `retryHref` is a plain link, deliberately: a full reload re-runs the server
 * read, which is the only thing that can recover the missing coins.
 */
export function UnavailableNotice({
  missing,
  total,
  names,
  retryHref,
}: {
  missing: number;
  total: number;
  /** A few names, so a visitor looking for a specific coin knows it is one of them. */
  names: string[];
  retryHref: string;
}) {
  if (missing === 0) return null;

  const all = missing === total;
  const shown = names.slice(0, 3).join(", ");
  const more = names.length > 3 ? ` and ${names.length - 3} more` : "";

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-j border border-j-line-strong bg-j-surface px-4 py-3 text-[13px] leading-[1.45]"
    >
      <p className="min-w-0 flex-1 text-j-muted">
        <span className="font-semibold text-j-ink">
          {total === 1
            ? `${names[0] ?? "This coin"} could not be read from Solana right now.`
            : all
              ? `None of the ${total} coins could be read from Solana right now.`
              : `${missing} of ${total} coins could not be read from Solana right now.`}
        </span>{" "}
        The RPC refused the request, most likely because it is rate-limited.{" "}
        {total === 1
          ? "It exists; its live data could not be fetched."
          : all
            ? "They exist; their live data could not be fetched."
            : `Missing: ${shown}${more}.`}
      </p>
      <a
        href={retryHref}
        className="shrink-0 rounded-full border border-j-line-strong px-3 py-1 font-medium text-j-ink hover:bg-j-bg"
      >
        Retry
      </a>
    </div>
  );
}
