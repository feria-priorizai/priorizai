"use client";

import { useState, type ReactNode } from "react";

interface AccordionProps {
  titulo: string;
  children: ReactNode;
  abiertoPorDefecto?: boolean;
  icono?: ReactNode;
  className?: string;
  onToggle?: (abierto: boolean) => void;
}

export function Accordion({ titulo, children, abiertoPorDefecto = false, icono, className, onToggle }: AccordionProps) {
  const [abierto, setAbierto] = useState(abiertoPorDefecto);

  const manejarToggle = () => {
    const nuevoEstado = !abierto;
    setAbierto(nuevoEstado);
    onToggle?.(nuevoEstado);
  };

  return (
    <div className={`border border-[var(--border)] rounded-xl bg-[var(--surface)] overflow-hidden ${className ?? ""}`}>
      <button
        type="button"
        onClick={manejarToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
        aria-expanded={abierto}
      >
        <div className="flex items-center gap-2">
          {icono && <span className="text-[var(--text-muted)]">{icono}</span>}
          <span className="font-medium text-[var(--text-primary)]">{titulo}</span>
        </div>
        <svg
          aria-hidden="true"
          className={`h-5 w-5 text-[var(--text-muted)] transition-transform ${abierto ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div
        className={`grid transition-all duration-200 ${abierto ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
        role="region"
        aria-label={titulo}
      >
        <div className="overflow-hidden">
          <div className="border-t border-[var(--border)] p-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}