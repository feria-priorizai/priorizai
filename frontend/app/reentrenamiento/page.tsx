"use client";

import { useSesion } from "@/context/SesionContext";
import { redirect } from "next/navigation";
import ModuloReentrenamiento from "@/components/reentrenamiento/ModuloReentrenamiento";

export default function ReentrenamientoPage() {
  const { usuario } = useSesion();

  // Solo un administrador reentrena el modelo. La API aplica la misma regla.
  if (!usuario || usuario.rol !== "administrador") {
    redirect("/dashboard");
  }

  return <ModuloReentrenamiento />;
}
