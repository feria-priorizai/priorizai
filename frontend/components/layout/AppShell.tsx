"use client";

/**
 * Contenedor principal de la aplicación.
 * Sidebar nocturno colapsable a la izquierda; a la derecha el header y el área
 * de contenido sobre la retícula de plano que comparte con la landing.
 */

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSesion } from "@/context/SesionContext";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { ConfiguracionProvider } from "@/context/ConfiguracionContext";
import { PreferenciasProvider } from "@/context/PreferenciasContext";
import { SesionProvider } from "@/context/SesionContext";
import { ModalResultadoCarga } from "@/components/interconsultas/ModalResultadoCarga";

interface AppShellProps {
  children: React.ReactNode;
}

/** Componente interno que sí tiene acceso a SesionProvider */
function AppShellInner({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { usuario } = useSesion();

  // Guard de ruta: redirigir a /dashboard si un no-admin intenta acceder a /configuracion
  useEffect(() => {
    if (pathname === "/configuracion" && usuario?.rol !== "administrador") {
      router.push("/dashboard");
    }
  }, [pathname, usuario?.rol, router]);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <PreferenciasProvider>
      <ConfiguracionProvider>
        {/* Primer elemento del tabulador (HDU-20): sin él, cada vista obliga a
            recorrer todo el menú lateral antes de llegar al contenido. */}
        <a
          href="#contenido"
          className="pz-saltar"
          data-testid="saltar-contenido"
          onClick={(e) => {
            // Se enfoca a mano para no dejar #contenido en la URL de cada vista.
            e.preventDefault();
            document.getElementById("contenido")?.focus();
          }}
        >
          Saltar al contenido
        </a>
        <div className="pz-shell flex h-screen overflow-hidden">
          <Sidebar />

          <div className="flex flex-1 flex-col overflow-hidden">
            <Header />
            <main
              id="contenido"
              tabIndex={-1}
              className="pz-blueprint custom-scrollbar flex-1 overflow-y-auto p-[1rem] md:p-[1.5rem]"
            >
              {children}
            </main>
          </div>
        </div>

        <ModalResultadoCarga />
      </ConfiguracionProvider>
    </PreferenciasProvider>
  );
}

export default function AppShell({ children }: AppShellProps) {
  return (
    <SesionProvider>
      <AppShellInner>{children}</AppShellInner>
    </SesionProvider>
  );
}
