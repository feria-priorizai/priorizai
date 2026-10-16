"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { leerOrdenLista } from "@/utils/ordenLista";

interface NavegacionInterconsultasProps {
  id: string;
}

/**
 * Anterior y siguiente dentro de la lista que el médico venía revisando
 * (HDU-12), en el mismo orden y con los mismos filtros con que la vio. Si la
 * interconsulta no viene de la lista —enlace directo, pestaña nueva— los dos
 * botones quedan deshabilitados.
 */
export default function NavegacionInterconsultas({
  id,
}: NavegacionInterconsultasProps) {
  const router = useRouter();
  // Solo se monta con sesión confirmada, así que el almacenamiento ya existe.
  const [orden] = useState(leerOrdenLista);

  const posicion = orden.indexOf(id);
  const anterior = posicion > 0 ? orden[posicion - 1] : null;
  const siguiente =
    posicion >= 0 && posicion < orden.length - 1 ? orden[posicion + 1] : null;

  return (
    <nav className="pz-navegador" aria-label="Navegación entre interconsultas">
      <Link href="/interconsultas" className="pz-btn pz-btn--claro pz-btn--mini">
        ← Lista de espera
      </Link>

      <div className="pz-navegador__pasos">
        <button
          type="button"
          className="pz-btn pz-btn--claro pz-btn--mini"
          disabled={!anterior}
          onClick={() => anterior && router.push(`/interconsultas/${anterior}`)}
        >
          ‹ Anterior
        </button>
        <span className="pz-navegador__pos" aria-live="polite">
          {posicion >= 0 ? (
            <>
              <strong>{posicion + 1}</strong> de {orden.length}
            </>
          ) : (
            "Fuera de la lista"
          )}
        </span>
        <button
          type="button"
          className="pz-btn pz-btn--azul pz-btn--mini"
          disabled={!siguiente}
          onClick={() => siguiente && router.push(`/interconsultas/${siguiente}`)}
        >
          Siguiente ›
        </button>
      </div>
    </nav>
  );
}
