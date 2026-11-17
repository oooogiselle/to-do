"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * The list a page is showing (?list=<id>, set by the sidebar), and a setter that keeps the
 * other params (an open task sheet). Callers need a Suspense boundary above them.
 */
export function useListParam() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const setList = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params);
      if (id) next.set("list", id);
      else next.delete("list");
      const qs = next.toString();
      router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
    },
    [router, path, params],
  );
  return [params.get("list"), setList] as const;
}
