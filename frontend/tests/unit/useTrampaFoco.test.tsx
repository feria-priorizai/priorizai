import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { useTrampaFoco } from "@/hooks/useTrampaFoco";

/** Página mínima con un botón que abre un diálogo de tres controles. */
function PaginaConDialogo({ conFocoInicial = false }: { conFocoInicial?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const dialogoRef = useRef<HTMLDivElement | null>(null);
  const focoInicialRef = useRef<HTMLButtonElement | null>(null);
  useTrampaFoco(abierto, dialogoRef, () => setAbierto(false), conFocoInicial ? focoInicialRef : undefined);

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}>
        Abrir
      </button>
      <button type="button">Detrás del diálogo</button>
      {abierto && (
        <div ref={dialogoRef} role="dialog" aria-modal="true" aria-label="Diálogo">
          <button type="button">Primero</button>
          <input aria-label="Medio" />
          <button type="button" ref={focoInicialRef} onClick={() => setAbierto(false)}>
            Cerrar
          </button>
        </div>
      )}
    </>
  );
}

function renderizar(props?: { conFocoInicial?: boolean }) {
  const usuario = userEvent.setup();
  render(<PaginaConDialogo {...props} />);
  return { usuario };
}

describe("useTrampaFoco (HDU-20)", () => {
  it("al abrir enfoca el primer control del diálogo", async () => {
    const { usuario } = renderizar();

    await usuario.click(screen.getByRole("button", { name: "Abrir" }));

    expect(screen.getByRole("button", { name: "Primero" })).toHaveFocus();
  });

  it("enfoca el control indicado cuando se le pasa uno", async () => {
    const { usuario } = renderizar({ conFocoInicial: true });

    await usuario.click(screen.getByRole("button", { name: "Abrir" }));

    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus();
  });

  it("el tabulador da la vuelta dentro del diálogo en los dos sentidos", async () => {
    const { usuario } = renderizar();
    await usuario.click(screen.getByRole("button", { name: "Abrir" }));

    await usuario.tab();
    expect(screen.getByRole("textbox", { name: "Medio" })).toHaveFocus();
    await usuario.tab();
    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus();
    await usuario.tab();
    expect(screen.getByRole("button", { name: "Primero" })).toHaveFocus();
    await usuario.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus();
  });

  it("si el foco quedó fuera, el siguiente Tab lo trae de vuelta", async () => {
    const { usuario } = renderizar();
    await usuario.click(screen.getByRole("button", { name: "Abrir" }));

    screen.getByRole("button", { name: "Detrás del diálogo" }).focus();
    await usuario.tab();

    expect(screen.getByRole("button", { name: "Primero" })).toHaveFocus();
  });

  it("Esc cierra el diálogo y devuelve el foco a quien lo abrió", async () => {
    const { usuario } = renderizar();
    await usuario.click(screen.getByRole("button", { name: "Abrir" }));

    await usuario.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir" })).toHaveFocus();
  });

  it("también devuelve el foco cuando se cierra con un botón", async () => {
    const { usuario } = renderizar();
    await usuario.click(screen.getByRole("button", { name: "Abrir" }));

    await usuario.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(screen.getByRole("button", { name: "Abrir" })).toHaveFocus();
  });
});
