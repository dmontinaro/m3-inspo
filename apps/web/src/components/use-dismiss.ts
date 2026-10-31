import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

/**
 * Closes a popover menu on a pointer down outside its container or on Escape
 * (one nothing inside has handled with `preventDefault`).
 * Put the returned ref on the element that holds both the button and the menu.
 *
 * ```tsx
 * const [open, setOpen] = useState(false);
 * const container = useDismiss(open, setOpen);
 * return <div ref={container}>…</div>;
 * ```
 */
export function useDismiss(open: boolean, setOpen: Dispatch<SetStateAction<boolean>>) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    }
    // An Escape something inside already handled (a dialog over the popover) is not for the popover.
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, setOpen]);

  return container;
}
