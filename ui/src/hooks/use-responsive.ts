import { useSyncExternalStore } from "react";
import { MOBILE_BREAKPOINT } from "@/lib/constants";

function subscribe(cb: () => void) {
  const mql = window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT}px)`);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function getServerSnapshot() {
  return false;
}

export function useResponsive() {
  const isMobile = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { isMobile };
}
