import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FormularioModificarPrioridad from "@/components/interconsultas/FormularioModificarPrioridad";

function renderizar(onModificar = vi.fn().mockResolvedValue(true)) {
  const usuario = userEvent.setup();
  const vista = render(
    <FormularioModificarPrioridad
      prioridadActual="media"
      medicoResponsable="Dra. Soto"
      onModificar={onModificar}
    />,
  );
  return { usuario, onModificar, ...vista };
}

describe("FormularioModificarPrioridad (HDU-2)", () => {
  it("no permite confirmar sin elegir una prioridad distinta", () => {
    renderizar();
    expect(screen.getByTestId("solicitar-cambio-prioridad")).toBeDisabled();
  });

  it("exige un motivo antes de guardar", async () => {
    const { usuario, onModificar } = renderizar();

    await usuario.click(screen.getByTestId("nueva-prioridad-alta"));
    await usuario.click(screen.getByTestId("solicitar-cambio-prioridad"));

    expect(screen.getByRole("alert")).toHaveTextContent("Debe ingresar un motivo");
    expect(onModificar).not.toHaveBeenCalled();
  });

  it("exige un motivo de al menos 10 caracteres", async () => {
    const { usuario, onModificar } = renderizar();

    await usuario.click(screen.getByTestId("nueva-prioridad-alta"));
    await usuario.type(screen.getByTestId("motivo-modificacion"), "corto");
    await usuario.click(screen.getByTestId("solicitar-cambio-prioridad"));

    expect(screen.getByRole("alert")).toHaveTextContent("al menos 10 caracteres");
    expect(screen.getByTestId("motivo-modificacion")).toHaveAttribute("aria-invalid", "true");
    expect(onModificar).not.toHaveBeenCalled();
  });

  it("pide confirmación y guarda el cambio con el motivo limpio", async () => {
    const { usuario, onModificar } = renderizar();

    await usuario.click(screen.getByTestId("nueva-prioridad-alta"));
    await usuario.type(screen.getByTestId("motivo-modificacion"), "  Dolor torácico en reposo  ");
    await usuario.click(screen.getByTestId("solicitar-cambio-prioridad"));

    expect(screen.getByText(/a nombre de Dra. Soto/)).toBeInTheDocument();
    await usuario.click(screen.getByTestId("confirmar-modificacion"));

    expect(onModificar).toHaveBeenCalledWith("alta", "Dolor torácico en reposo");
    expect(await screen.findByRole("status")).toHaveTextContent("Prioridad modificada");
    expect(screen.getByTestId("motivo-modificacion")).toHaveValue("");
  });

  it("permite cancelar la confirmación sin guardar", async () => {
    const { usuario, onModificar } = renderizar();

    await usuario.click(screen.getByTestId("nueva-prioridad-baja"));
    await usuario.type(screen.getByTestId("motivo-modificacion"), "Paciente estable y controlado");
    await usuario.click(screen.getByTestId("solicitar-cambio-prioridad"));
    await usuario.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onModificar).not.toHaveBeenCalled();
    expect(screen.getByTestId("solicitar-cambio-prioridad")).toBeEnabled();
  });

  it("avisa si el backend no guardó el cambio", async () => {
    const { usuario } = renderizar(vi.fn().mockResolvedValue(false));

    await usuario.click(screen.getByTestId("nueva-prioridad-alta"));
    await usuario.type(screen.getByTestId("motivo-modificacion"), "Empeoramiento clínico");
    await usuario.click(screen.getByTestId("solicitar-cambio-prioridad"));
    await usuario.click(screen.getByTestId("confirmar-modificacion"));

    expect(await screen.findByRole("alert")).toHaveTextContent("El cambio no fue guardado");
  });

  it("se sincroniza cuando cambia la prioridad vigente", async () => {
    const { usuario, rerender } = renderizar();

    await usuario.click(screen.getByTestId("nueva-prioridad-alta"));
    rerender(
      <FormularioModificarPrioridad
        prioridadActual="alta"
        medicoResponsable="Dra. Soto"
        onModificar={vi.fn()}
      />,
    );

    expect(screen.getByTestId("nueva-prioridad-alta")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("solicitar-cambio-prioridad")).toBeDisabled();
  });
});
