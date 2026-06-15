import { useMemo, useState, useEffect } from "react";

export function usePager<T>(items: T[], pageSize = 10, resetKey?: unknown) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [resetKey, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  return { page, setPage, totalPages, pageItems, total: items.length, pageSize };
}

export function Pager({
  page,
  totalPages,
  onChange,
  total,
  pageSize,
  className = "",
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
  total: number;
  pageSize: number;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  // Compact page list with ellipses
  const pages: (number | "…")[] = [];
  const add = (n: number | "…") => pages.push(n);
  const window = 1;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - window && i <= page + window)) {
      add(i);
    } else if (pages[pages.length - 1] !== "…") {
      add("…");
    }
  }

  return (
    <nav
      aria-label="Pagination"
      className={`mt-4 flex items-center justify-between gap-3 flex-wrap ${className}`}
    >
      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-foreground/40">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-foreground/[0.05] hover:bg-foreground/[0.1] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          aria-label="Previous page"
        >
          ←
        </button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span
              key={`e-${i}`}
              className="px-1.5 text-xs font-mono text-foreground/40 select-none"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              aria-current={p === page ? "page" : undefined}
              className={`min-w-8 px-2.5 py-1.5 rounded-lg text-xs font-mono tabular-nums transition-colors ${
                p === page
                  ? "bg-foreground text-background"
                  : "bg-foreground/[0.05] hover:bg-foreground/[0.1] text-foreground/70"
              }`}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-foreground/[0.05] hover:bg-foreground/[0.1] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          aria-label="Next page"
        >
          →
        </button>
      </div>
    </nav>
  );
}