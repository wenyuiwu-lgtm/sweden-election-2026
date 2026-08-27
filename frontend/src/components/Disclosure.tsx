"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState(0);
  const contentId = useId();
  const innerRef = useRef<HTMLDivElement>(null);

  // Measures the content's actual height so it can be transitioned via
  // max-height — CSS alone can't animate to an intrinsic ("auto") size.
  useLayoutEffect(() => {
    if (open && innerRef.current) {
      setHeight(innerRef.current.scrollHeight);
    }
  }, [open]);

  return (
    <div className="rounded-lg border border-border bg-bg-elevated card-shadow overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={contentId}
        className="w-full flex items-center justify-between gap-4 p-5 text-left"
      >
        <h2 className="font-serif-display text-lg font-semibold">{title}</h2>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-ink-faint shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div
        id={contentId}
        style={{ maxHeight: open ? height : 0 }}
        className="overflow-hidden transition-[max-height] duration-300 ease-out"
      >
        <div ref={innerRef} className="px-5 pb-5 text-[13px] leading-relaxed text-ink-muted space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
}
