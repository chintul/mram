"use client";

import { useState, useRef, useEffect } from "react";

const LAYER_OPTIONS = [
  { value: "cmcs_licenses", label: "Уул уурхайн ТЗ (CMCS)" },
  { value: "spa", label: "Тусгай хамгаалалттай газар" },
  { value: "protection_zones", label: "Хамгаалалтын бүс" },
  { value: "land_parcels", label: "Газар эзэмшил" },
  { value: "mining_conservation", label: "Уул уурхайн хамгаалалт" },
] as const;

type SubmitStatus = "idle" | "loading" | "success" | "already" | "error";

export default function SubscribeBell() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [layers, setLayers] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const modalRef = useRef<HTMLDivElement>(null);

  // Close modal on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const toggleLayer = (value: string) => {
    setLayers((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || layers.size === 0) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, layers: Array.from(layers) }),
      });

      if (res.status === 409) {
        setStatus("already");
      } else if (res.ok) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  const resetAndClose = () => {
    setOpen(false);
    // Reset after animation
    setTimeout(() => {
      setStatus("idle");
      setEmail("");
      setLayers(new Set());
    }, 200);
  };

  return (
    <>
      {/* Floating bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed z-[999] flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800 text-neutral-200 shadow-lg transition-colors hover:bg-neutral-700 active:bg-neutral-600 animate-bell-pulse"
        style={{ bottom: "5rem", right: "1rem" }}
        aria-label="Шинэчлэл хүлээн авах"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-[999] flex items-end justify-end p-4 sm:items-center sm:justify-center">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />

          {/* Modal */}
          <div
            ref={modalRef}
            className="relative w-full max-w-sm rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl sm:mb-0"
            style={{ marginBottom: "6rem", marginRight: "0.5rem" }}
          >
            {/* Close button */}
            <button
              onClick={resetAndClose}
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
              aria-label="Хаах"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>

            {/* Success / Already / Error states */}
            {status === "success" ? (
              <div className="py-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-600/20 text-green-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </div>
                <p className="text-sm text-neutral-200">Баталгаажуулах имэйл илгээлээ</p>
              </div>
            ) : status === "already" ? (
              <div className="py-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600/20 text-blue-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg>
                </div>
                <p className="text-sm text-neutral-200">Аль хэдийн бүртгүүлсэн байна</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <h2 className="mb-4 text-base font-semibold text-neutral-200">
                  Шинэчлэл хүлээн авах
                </h2>

                {/* Email input */}
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Имэйл хаяг"
                  className="mb-4 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 outline-none transition-colors focus:border-neutral-500"
                />

                {/* Layer checkboxes */}
                <div className="mb-4 space-y-2">
                  {LAYER_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex cursor-pointer items-center gap-2 text-sm text-neutral-300"
                    >
                      <input
                        type="checkbox"
                        checked={layers.has(opt.value)}
                        onChange={() => toggleLayer(opt.value)}
                        className="accent-blue-500"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>

                {/* Error message */}
                {status === "error" && (
                  <p className="mb-3 text-xs text-red-400">
                    Алдаа гарлаа, дахин оролдоно уу
                  </p>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={status === "loading" || !email || layers.size === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === "loading" ? (
                    <>
                      <svg
                        className="h-4 w-4 animate-spin"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Илгээж байна...
                    </>
                  ) : (
                    "Бүртгүүлэх"
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

    </>
  );
}
