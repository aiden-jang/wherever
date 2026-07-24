import { useEffect } from "react";

/**
 * Lock page scroll while a modal/sheet is open, so only the modal's own content scrolls and the
 * background stays put.
 *
 * `overflow: hidden` on <body> is NOT enough — the scroll root is often <html>, and iOS Safari
 * ignores overflow locks entirely. The reliable technique on every platform is to pin <body> in
 * place at the current scroll offset (position: fixed) and restore the exact position on unmount.
 */
export function useScrollLock(): void {
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, []);
}
