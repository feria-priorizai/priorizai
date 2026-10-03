"use client";

/**
 * Contenedor principal de la aplicación.
 * Sidebar nocturno colapsable a la izquierda; a la derecha el header y el área
 * de contenido sobre la retícula de plano que comparte con la landing.
 */

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { ConfiguracionProvider } from "@/context/ConfiguracionContext";
import { SesionProvider } from "@/context/SesionContext";
import { ModalErroresCarga } from "@/components/configuracion/ModalErroresCarga";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <SesionProvider>
      <ConfiguracionProvider>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />

          <div className="flex flex-1 flex-col overflow-hidden">
            <Header />
            <main className="pz-blueprint custom-scrollbar flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </div>

        <ModalErroresCarga />
      </ConfiguracionProvider>
    </SesionProvider>
  );
}
