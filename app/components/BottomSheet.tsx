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

export default function BottomSheet({ state, onStateChange, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);

  const handleDragStart = useCallback((clientY: number) => {
    if (!sheetRef.current) return;
    dragRef.current = {
      startY: clientY,
      startHeight: sheetRef.current.getBoundingClientRect().height,
    };
  }, []);

  const handleDragMove = useCallback((clientY: number) => {
    if (!dragRef.current) return;
    const diff = dragRef.current.startY - clientY;
    const newHeight = Math.max(64, dragRef.current.startHeight + diff);
    setDragHeight(newHeight);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (!dragRef.current || dragHeight === null) {
      dragRef.current = null;
      return;
    }
    dragRef.current = null;

    const vh = window.innerHeight;
    if (dragHeight < vh * 0.2) {
      onStateChange("collapsed");
    } else if (dragHeight < vh * 0.6) {
      onStateChange("half");
    } else {
      onStateChange("full");
    }
    setDragHeight(null);
  }, [dragHeight, onStateChange]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => handleDragMove(e.clientY);
    const handleMouseUp = () => handleDragEnd();
    const handleTouchMove = (e: TouchEvent) => handleDragMove(e.touches[0].clientY);
    const handleTouchEnd = () => handleDragEnd();

    if (dragRef.current) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove);
      window.addEventListener("touchend", handleTouchEnd);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleDragMove, handleDragEnd]);

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
      {/* Drag handle */}
      <div
        className="flex justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
        onMouseDown={(e) => handleDragStart(e.clientY)}
        onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
      >
        <div className="w-10 h-1 bg-neutral-600 rounded-full" />
      </div>

      {/* Content */}
      <div className="overflow-y-auto px-4 pb-8" style={{ maxHeight: "calc(100% - 3rem)" }}>
        {children}
      </div>
    </div>
  );
}
