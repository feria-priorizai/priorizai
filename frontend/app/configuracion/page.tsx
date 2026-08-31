"use client";

import { ConfiguracionSidebar } from "@/components/configuracion/ConfiguracionSidebar";

export default function ConfiguracionPage() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Configuración
        </h1>
        <p className="mt-1 text-[var(--text-secondary)]">
          Gestiona los campos obligatorios para import y los campos visibles en export.
        </p>
      </div>

      <ConfiguracionSidebar />
    </div>
  );
}