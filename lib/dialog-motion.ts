// Capture the real opening control before React mounts a modal and moves focus.
type Origin = { rect: DOMRect; capturedAt: number };
let origin: Origin | null = null;

export function rememberDialogOrigin(event: MouseEvent) {
  if (!(event.target instanceof Element)) return;
  const control = event.target.closest("button, a, [role='button']");
  if (!(control instanceof HTMLElement)) return;
  const source = control.closest("[data-dialog-origin], .customer-card, .card") ?? control;
  const rect = source.getBoundingClientRect();
  if (rect.width && rect.height) origin = { rect, capturedAt: performance.now() };
}

export function prepareDialogMotion(panel: HTMLElement | null) {
  if (!panel) return;
  // Dialogs opened without a recent click still get a centered entrance.
  const source = origin && performance.now() - origin.capturedAt < 1500 ? origin.rect : null;
  const destination = panel.getBoundingClientRect();
  if (!destination.width || !destination.height) return;
  panel.style.setProperty("--modal-x", source ? (source.left + source.width / 2 - destination.left - destination.width / 2) + "px" : "0px");
  panel.style.setProperty("--modal-y", source ? (source.top + source.height / 2 - destination.top - destination.height / 2) + "px" : "24px");
  panel.style.setProperty("--modal-scale-x", source ? String(source.width / destination.width) : ".94");
  panel.style.setProperty("--modal-scale-y", source ? String(source.height / destination.height) : ".94");
  panel.dataset.modalMotion = "ready";
}
