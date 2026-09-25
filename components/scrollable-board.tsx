"use client";
import { useRef, useState, type ReactNode } from "react";

export function ScrollableBoard({ children }: { children: ReactNode }) {
  const drag = useRef<{ id: number; x: number; left: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [panning, setPanning] = useState(false);
  return <div className={`board premium-board${panning ? " pan-active" : ""}`}
    tabIndex={0} role="region" aria-label="Colunas de vencimentos. Arraste para os lados ou use as setas."
    onPointerDown={e => {
      suppressClick.current = false;
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('input,textarea,select,a,[draggable="true"],button:not(.card-body)')) return;
      drag.current = { id: e.pointerId, x: e.clientX, left: e.currentTarget.scrollLeft, moved: false };
    }}
    onPointerMove={e => {
      const state = drag.current;
      if (!state || state.id !== e.pointerId) return;
      const distance = e.clientX - state.x;
      if (!state.moved && Math.abs(distance) < 5) return;
      if (!state.moved) {
        state.moved = true;
        suppressClick.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        setPanning(true);
      }
      e.preventDefault();
      e.currentTarget.scrollLeft = state.left - distance;
    }}
    onPointerUp={e => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      drag.current = null;
      setPanning(false);
    }}
    onPointerCancel={() => { drag.current = null; suppressClick.current = false; setPanning(false); }}
    onLostPointerCapture={() => { drag.current = null; setPanning(false); }}
    onPointerLeave={() => { if (!drag.current?.moved) drag.current = null; }}
    onClickCapture={e => {
      if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; }
    }}
    onKeyDown={e => {
      if (e.target !== e.currentTarget || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      e.currentTarget.scrollBy({ left: e.key === "ArrowRight" ? 294 : -294, behavior: "smooth" });
    }}
  >{children}</div>;
}
