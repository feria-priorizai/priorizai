"use client";

import { useSesion } from "@/context/SesionContext";
import { redirect } from "next/navigation";
import MatrizCampos from "@/components/configuracion/MatrizCampos";
import PlazosRevision from "@/components/configuracion/PlazosRevision";

export default function ConfiguracionPage() {
  const { usuario } = useSesion();

  // Solo un administrador puede acceder a la configuración: campos y plazos
  // de revisión (HDU-22).
  if (!usuario || usuario.rol !== "administrador") {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col gap-7">
      <PlazosRevision />
      <MatrizCampos />
    </div>
  );
}
