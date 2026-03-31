"use client";

import { useRef, useState, useCallback, useEffect } from "react";

type SheetState = "collapsed" | "half" | "full";

interface BottomSheetProps {
  state: SheetState;
  onStateChange: (state: SheetState) => void;
  children: React.ReactNode;
}

const SNAP_POINTS: Record<SheetState, string> = {
  collapsed: "4rem",
  half: "45vh",
  full: "85vh",
};

const CYCLE_ORDER: SheetState[] = ["collapsed", "half", "full"];

export default function BottomSheet({ state, onStateChange, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const dragMovedRef = useRef(false);

  const handleDragStart = useCallback((clientY: number) => {
    if (!sheetRef.current) return;
    dragRef.current = {
      startY: clientY,
      startHeight: sheetRef.current.getBoundingClientRect().height,
    };
    dragMovedRef.current = false;
    setDragging(true);
  }, []);

  const handleDragMove = useCallback((clientY: number) => {
    if (!dragRef.current) return;
    const diff = dragRef.current.startY - clientY;
    if (Math.abs(diff) > 4) dragMovedRef.current = true;
    const newHeight = Math.max(64, dragRef.current.startHeight + diff);
    setDragHeight(newHeight);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (!dragRef.current) {
      setDragging(false);
      return;
    }

    // If barely moved, treat as a click — cycle to next state
    if (!dragMovedRef.current || dragHeight === null) {
      dragRef.current = null;
      setDragging(false);
      setDragHeight(null);
      const idx = CYCLE_ORDER.indexOf(state);
      const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
      onStateChange(next);
      return;
    }

    dragRef.current = null;
    setDragging(false);

    const vh = window.innerHeight;
    if (dragHeight < vh * 0.2) {
      onStateChange("collapsed");
    } else if (dragHeight < vh * 0.6) {
      onStateChange("half");
    } else {
      onStateChange("full");
    }
    setDragHeight(null);
  }, [dragHeight, onStateChange, state]);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => handleDragMove(e.clientY);
    const handleMouseUp = () => handleDragEnd();
    const handleTouchMove = (e: TouchEvent) => handleDragMove(e.touches[0].clientY);
    const handleTouchEnd = () => handleDragEnd();

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [dragging, handleDragMove, handleDragEnd]);

  const height = dragHeight !== null ? `${dragHeight}px` : SNAP_POINTS[state];

  return (
    <div
      ref={sheetRef}
      className="absolute bottom-0 left-0 right-0 bg-neutral-900 rounded-t-2xl transition-[height] duration-300 ease-out overflow-hidden"
      style={{
        height,
        zIndex: 1000,
        transition: dragHeight !== null ? "none" : undefined,
      }}
    >
      {/* Drag handle — large hit area */}
      <div
        className="flex flex-col items-center justify-center py-4 cursor-grab active:cursor-grabbing touch-none select-none"
        onMouseDown={(e) => {
          e.preventDefault();
          handleDragStart(e.clientY);
        }}
        onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
      >
        <div className="w-12 h-1.5 bg-neutral-500 rounded-full" />
      </div>

      {/* Content */}
      <div className="overflow-y-auto px-4 pb-8" style={{ maxHeight: "calc(100% - 3.5rem)" }}>
        {children}
      </div>
    </div>
  );
}
