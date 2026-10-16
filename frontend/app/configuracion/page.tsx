"use client";

import { useSesion } from "@/context/SesionContext";
import { redirect } from "next/navigation";
import MatrizCampos from "@/components/configuracion/MatrizCampos";

export default function ConfiguracionPage() {
  const { usuario } = useSesion();

  // Solo un administrador puede acceder a la configuración de campos.
  if (!usuario || usuario.rol !== "administrador") {
    redirect("/dashboard");
  }

  return <MatrizCampos />;
}
