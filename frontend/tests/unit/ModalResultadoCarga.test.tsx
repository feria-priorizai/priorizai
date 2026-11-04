import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModalResultadoCarga } from "@/components/interconsultas/ModalResultadoCarga";
import { EVENTO_RESULTADO_CARGA, type ResultadoCarga } from "@/services/interconsultas";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function avisarCarga(resultado: ResultadoCarga) {
  act(() => {
    window.dispatchEvent(new CustomEvent(EVENTO_RESULTADO_CARGA, { detail: resultado }));
  });
}

/** Como en el menú lateral: el botón de carga tiene el foco cuando llega el resumen. */
function renderizar() {
  const usuario = userEvent.setup();
  render(
    <>
      <button type="button">Cargar archivo</button>
      <ModalResultadoCarga />
    </>,
  );
  const abridor = screen.getByRole("button", { name: "Cargar archivo" });
  abridor.focus();
  return { usuario, abridor };
}

const cargaCompleta: ResultadoCarga = {
  archivo: "interconsultas.csv",
  guardadas: 2,
  priorizadas: 2,
  explicaciones: 0,
  rechazadas: [],
};

describe("ModalResultadoCarga con teclado (HDU-20)", () => {
  it("al abrirse enfoca el botón de cerrar", () => {
    renderizar();
    avisarCarga(cargaCompleta);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus();
  });

  it("el tabulador no sale del diálogo", async () => {
    const { usuario } = renderizar();
    avisarCarga(cargaCompleta);

    await usuario.tab();
    expect(screen.getByRole("button", { name: "Ver lista de espera" })).toHaveFocus();
    await usuario.tab();
    expect(screen.getByTestId("cerrar-resultado-carga")).toHaveFocus();
    await usuario.tab();
    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus();
    await usuario.tab({ shift: true });
    expect(screen.getByTestId("cerrar-resultado-carga")).toHaveFocus();
  });

  it("Esc lo cierra y el foco vuelve al botón de carga", async () => {
    const { usuario, abridor } = renderizar();
    avisarCarga({ archivo: "notas.txt", error: "El archivo debe ser CSV o XLSX." });

    await usuario.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(abridor).toHaveFocus();
  });

  it("al cerrarlo con Enter el foco también vuelve al botón de carga", async () => {
    const { usuario, abridor } = renderizar();
    avisarCarga(cargaCompleta);

    screen.getByTestId("cerrar-resultado-carga").focus();
    await usuario.keyboard("{Enter}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(abridor).toHaveFocus();
  });
});
