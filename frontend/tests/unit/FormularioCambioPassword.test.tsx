import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FormularioCambioPassword from "@/components/auth/FormularioCambioPassword";
import { respuestaJson } from "./fabricas";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

async function completar(actual: string, nueva: string, confirmacion = nueva) {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByTestId("password-actual"), actual);
  await usuario.type(screen.getByTestId("password-nueva"), nueva);
  await usuario.type(screen.getByTestId("password-confirmacion"), confirmacion);
  await usuario.click(screen.getByTestId("cambio-password-submit"));
}

describe("FormularioCambioPassword (HDU-15)", () => {
  it("rechaza contraseñas de menos de 8 caracteres sin llamar a la API", async () => {
    render(<FormularioCambioPassword onCambiada={vi.fn()} />);
    // minLength del input se salta para probar la validación propia.
    screen.getByTestId("password-nueva").removeAttribute("minLength");

    await completar("actual-123", "corta");

    expect(screen.getByRole("alert")).toHaveTextContent("al menos 8 caracteres");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rechaza una confirmación distinta", async () => {
    render(<FormularioCambioPassword onCambiada={vi.fn()} />);

    await completar("actual-123", "nueva-segura-1", "nueva-segura-2");

    expect(screen.getByRole("alert")).toHaveTextContent("no coinciden");
  });

  it("rechaza repetir la contraseña actual", async () => {
    render(<FormularioCambioPassword onCambiada={vi.fn()} />);

    await completar("misma-clave-1", "misma-clave-1");

    expect(screen.getByRole("alert")).toHaveTextContent("distinta de la actual");
  });

  it("cambia la contraseña y avisa al contenedor", async () => {
    const usuario = { id: "u-1", debe_cambiar_password: false };
    fetchMock.mockResolvedValue(respuestaJson(usuario));
    const onCambiada = vi.fn();
    render(<FormularioCambioPassword onCambiada={onCambiada} textoBoton="Guardar y continuar" />);

    expect(screen.getByTestId("cambio-password-submit")).toHaveTextContent("Guardar y continuar");
    await completar("actual-123", "nueva-segura-456");

    expect(onCambiada).toHaveBeenCalledWith(usuario);
    expect(screen.getByTestId("password-nueva")).toHaveValue("");
  });

  it("muestra el error del backend y limpia solo la contraseña actual", async () => {
    fetchMock.mockResolvedValue(
      respuestaJson({ detail: "La contraseña actual no es correcta" }, { status: 400 }),
    );
    render(<FormularioCambioPassword onCambiada={vi.fn()} />);

    await completar("equivocada", "nueva-segura-456");

    expect(await screen.findByRole("alert")).toHaveTextContent("La contraseña actual no es correcta");
    expect(screen.getByTestId("password-actual")).toHaveValue("");
    expect(screen.getByTestId("password-nueva")).toHaveValue("nueva-segura-456");
  });
});
