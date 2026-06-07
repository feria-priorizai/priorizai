/**
 * Contenedor principal de la aplicación.
 * Compone el layout con Sidebar fijo a la izquierda y el contenido
 * principal a la derecha (Header + children).
 *
 * Este componente envuelve todas las páginas de la aplicación
 * para mantener una estructura visual consistente.
 */

import Sidebar from "./Sidebar";
import Header from "./Header";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar fijo */}
      <Sidebar />

      {/* Área de contenido principal */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto bg-[var(--background)] p-6 custom-scrollbar">
          {children}
        </main>
      </div>
    </div>
  );
}
