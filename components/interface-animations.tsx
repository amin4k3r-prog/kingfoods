"use client";

import { useEffect } from "react";
import { rememberDialogOrigin } from "@/lib/dialog-motion";

/**
 * Anime.js feedback for navigation and buttons.
 * Dialog enter/exit animations use CSS so Radix can retain closing content.
 * Works on the rendered nodes; it never clones React elements or takes over events.
 */
export function InterfaceAnimations() {
  useEffect(() => {
    document.addEventListener("click", rememberDialogOrigin, true);
    return () => document.removeEventListener("click", rememberDialogOrigin, true);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let disposed = false;

    void import("animejs").then(({ animate }) => {
      if (disposed) return;

      // Visual feedback only. Click, submit, navigation and form handlers remain React-owned.
      const animateWorkspace = () => {
        requestAnimationFrame(() => {
          const workspace = document.querySelector(".workspace-shell");
          if (!(workspace instanceof HTMLElement)) return;
          const panels = workspace.querySelectorAll<HTMLElement>('[role="tabpanel"][data-state="active"], [role="tabpanel"]:not([hidden])');
          panels.forEach(panel => animate(panel, {
            opacity: [0.35, 1],
            translateY: [12, 0],
            duration: 420,
            ease: "out(3)",
          }));
        });
      };
      const onNavClick = (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const nav = target.closest(".app-sidebar button");
        if (!(nav instanceof HTMLButtonElement) || nav.disabled) return;
        animate(nav, { scale: [0.94, 1], duration: 280, ease: "out(3)" });
        requestAnimationFrame(animateWorkspace);
      };
      document.addEventListener("click", onNavClick);
      const onPointerDown = (event: PointerEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest("button");
        if (!(button instanceof HTMLButtonElement) || button.disabled) return;
        if (button.closest('[data-slot="dialog-content"], [data-slot="alert-dialog-content"]')) return;
        animate(button, { scale: [1, 0.93], duration: 130, ease: "out(2)" });
      };
      const onPointerUp = (event: PointerEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest("button");
        if (!(button instanceof HTMLButtonElement)) return;
        animate(button, { scale: 1, duration: 260, ease: "out(3)" });
      };
      document.addEventListener("pointerdown", onPointerDown, { passive: true });
      document.addEventListener("pointerup", onPointerUp, { passive: true });
      document.addEventListener("pointercancel", onPointerUp, { passive: true });

      cleanupHandlers = () => {
        document.removeEventListener("click", onNavClick);
        document.removeEventListener("pointerdown", onPointerDown);
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("pointercancel", onPointerUp);
      };
    }).catch(() => {
      // An optional visual enhancement must never break the financial UI.
    });

    let cleanupHandlers = () => {};
    return () => {
      disposed = true;
      cleanupHandlers();
    };
  }, []);

  return null;
}
