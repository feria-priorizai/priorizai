"use client";

/**
 * Sesión del usuario (HDU-15). Nada de la aplicación se muestra hasta que el
 * backend confirma la sesión; sin ella, se va al login.
 *
 * Esto es comodidad, no seguridad: quien protege los datos es la API, que
 * responde 401 a cualquier llamada sin sesión.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { Usuario } from "@/types/usuario";
import { cerrarSesion, obtenerSesion } from "@/services/auth";
import { irAlLogin } from "@/services/api";
import EstadoVista from "@/components/ui/EstadoVista";
import CambioPasswordObligatorio from "@/components/auth/CambioPasswordObligatorio";

interface SesionState {
  usuario: Usuario | null;
  cerrarSesion: () => Promise<void>;
}

const SesionContext = createContext<SesionState | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();
  const enLogin = pathname === "/login";

  useEffect(() => {
    let vigente = true;
    obtenerSesion()
      .then((actual) => {
        if (!vigente) return;
        if (actual) {
          setUsuario(actual);
        } else if (!enLogin) {
          // Solo redirigir al login si NO estamos ya en /login
          irAlLogin();
        }
      })
      .catch(() => {
        if (vigente) setError("No se pudo contactar al servidor. Intenta nuevamente.");
      });
    return () => {
      vigente = false;
    };
  }, [enLogin]);

  const salir = useCallback(async () => {
    await cerrarSesion().catch(() => undefined);
    window.location.assign("/login");
  }, []);

  if (error) {
    return (
      <div className="pz-blueprint flex h-screen items-center justify-center">
        <EstadoVista tipo="error" texto={error} />
      </div>
    );
  }

  if (!usuario) {
    if (enLogin) {
      // En /login no mostramos spinner: la página de login maneja su UI
      // PERO seguimos proveyendo el contexto (vacío) para que useSesion() no falle
      return (
        <SesionContext.Provider value={{ usuario: null, cerrarSesion: salir }}>
          {children}
        </SesionContext.Provider>
      );
    }
    return (
      <div className="pz-blueprint flex h-screen items-center justify-center">
        <EstadoVista tipo="cargando" texto="Verificando sesión…" />
      </div>
    );
  }

  if (usuario.debe_cambiar_password) {
    return (
      <CambioPasswordObligatorio
        usuario={usuario}
        onCambiada={setUsuario}
        onCerrarSesion={salir}
      />
    );
  }

  return (
    <SesionContext.Provider value={{ usuario, cerrarSesion: salir }}>
      {children}
    </SesionContext.Provider>
  );
}

export function useSesion(): SesionState {
  const contexto = useContext(SesionContext);
  if (!contexto) {
    throw new Error("useSesion debe usarse dentro de SesionProvider");
  }
  return contexto;
}
