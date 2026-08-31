"use client";

import { ConfiguracionSidebar } from "@/components/configuracion/ConfiguracionSidebar";

export default function ConfiguracionPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <p className="pz-panel__sub max-w-[60ch]">
        Define qué campos son obligatorios al importar un archivo y cuáles se
        incluyen al exportar en JSON, CSV o XLSX.
      </p>

      <ConfiguracionSidebar />
    </div>
  );
}
