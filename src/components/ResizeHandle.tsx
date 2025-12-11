import React, { useCallback, useEffect, useRef, useState } from "react";
import { postToFigma } from "@shared/bridge";
import { RESIZE_THROTTLE_MS, clampSize } from "@shared/resize";
import { useShell } from "../ShellContext";
import { IconArrowsDiagonal } from "@tabler/icons-react";

interface DragSnapshot {
  startX: number;
  startY: number;
  width: number;
  height: number;
}

interface ResizeOptions {
  force?: boolean;
}

export function ResizeHandle() {
  const { state, dispatch } = useShell();
  const [isDragging, setIsDragging] = useState(false);
  const dragSnapshotRef = useRef<DragSnapshot>({
    startX: 0,
    startY: 0,
    width: state.windowSize.width,
    height: state.windowSize.height,
  });
  const pointerIdRef = useRef<number | null>(null);
  const lastSentAtRef = useRef(0);
  const latestSizeRef = useRef(state.windowSize);

  useEffect(() => {
    latestSizeRef.current = state.windowSize;
  }, [state.windowSize]);

  // Add/remove "small" class based on width
  useEffect(() => {
    const sidebar = document.querySelector(".sidebar");
    if (sidebar) {
      if (state.windowSize.width < 700) {
        sidebar.classList.add("small");
      } else {
        sidebar.classList.remove("small");
      }
    }
  }, [state.windowSize.width]);

  const sendResizeRequest = useCallback(
    (width: number, height: number, options?: ResizeOptions) => {
      const nextSize = clampSize(width, height);
      latestSizeRef.current = nextSize;
      dispatch({ type: "SET_WINDOW_SIZE", payload: nextSize });

      const now = Date.now();
      const shouldSend =
        options?.force || now - lastSentAtRef.current >= RESIZE_THROTTLE_MS;

      if (shouldSend) {
        lastSentAtRef.current = now;
        postToFigma({
          target: "shell",
          action: "resize-ui",
          payload: nextSize,
        });
      }

      return nextSize;
    },
    [dispatch],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerIdRef.current) return;

      const { startX, startY, width, height } = dragSnapshotRef.current;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;

      sendResizeRequest(width + deltaX, height + deltaY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerIdRef.current) return;

      pointerIdRef.current = null;
      setIsDragging(false);
      sendResizeRequest(
        latestSizeRef.current.width,
        latestSizeRef.current.height,
        { force: true },
      );
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [isDragging, sendResizeRequest]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      pointerIdRef.current = event.pointerId;
      dragSnapshotRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        width: state.windowSize.width,
        height: state.windowSize.height,
      };

      setIsDragging(true);
    },
    [state.windowSize.height, state.windowSize.width],
  );

  return (
    <button
      type="button"
      className={`resize-handle${isDragging ? " dragging" : ""}`}
      aria-label="Resize plugin window"
      onPointerDown={handlePointerDown}
    >
      <IconArrowsDiagonal size={16} />
    </button>
  );
}
