import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PreferenciasInterfaz from "@/components/cuenta/PreferenciasInterfaz";
import { PreferenciasProvider, usePreferencias } from "@/context/PreferenciasContext";
import { guardarPreferencias } from "@/services/auth";
import { crearUsuario } from "./fabricas";

vi.mock("@/context/SesionContext", () => ({
  useSesion: () => ({
    usuario: crearUsuario({ tema: "claro", tamano_letra: "grande" }),
  }),
}));

vi.mock("@/services/auth", () => ({ guardarPreferencias: vi.fn() }));

const guardar = vi.mocked(guardarPreferencias);
const raiz = document.documentElement;

function montar() {
  render(
    <PreferenciasProvider>
      <PreferenciasInterfaz />
    </PreferenciasProvider>,
  );
  return userEvent.setup();
}

const opcion = (nombre: string | RegExp) =>
  screen.getByRole("button", { name: nombre });

beforeEach(() => {
  localStorage.clear();
  guardar.mockReset();
  guardar.mockResolvedValue(crearUsuario());
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

describe("PreferenciasInterfaz", () => {
  it("parte de lo guardado en la cuenta", () => {
    montar();

    expect(opcion("Claro")).toHaveAttribute("aria-pressed", "true");
    expect(opcion(/^Grande/)).toHaveAttribute("aria-pressed", "true");
    expect(opcion("Estándar")).toHaveAttribute("aria-pressed", "true");
    expect(raiz.dataset.letra).toBe("grande");
  });

  it("aplica de inmediato, antes de que responda el backend", async () => {
    guardar.mockReturnValue(new Promise(() => {}));
    const usuarioEvento = montar();

    await usuarioEvento.click(opcion("Oscuro"));

    expect(raiz.dataset.tema).toBe("oscuro");
    expect(opcion("Oscuro")).toHaveAttribute("aria-pressed", "true");
  });

  it("envía solo lo que cambió", async () => {
    const usuarioEvento = montar();

    await usuarioEvento.click(opcion(/^Muy grande/));

    expect(guardar).toHaveBeenCalledExactlyOnceWith({
      tamano_letra: "muy_grande",
    });
  });

  it("elegir Sistema borra la elección y sigue al sistema operativo", async () => {
    const usuarioEvento = montar();

    await usuarioEvento.click(opcion("Sistema"));

    expect(guardar).toHaveBeenCalledExactlyOnceWith({ tema: null });
    expect(raiz.dataset.tema).toBe("oscuro");
  });

  it("guarda la copia local para el primer cuadro de la próxima carga", async () => {
    const usuarioEvento = montar();

    await usuarioEvento.click(opcion("Legacy"));

    expect(JSON.parse(localStorage.getItem("pz:preferencias") ?? "{}")).toEqual({
      tema: "claro",
      tamano_letra: "grande",
      modo_interfaz: "legacy",
    });
  });

  it("si el backend falla mantiene el cambio y avisa", async () => {
    guardar.mockRejectedValue(new Error("sin red"));
    const usuarioEvento = montar();

    await usuarioEvento.click(opcion("Oscuro"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "no se pudo guardar en tu cuenta",
    );
    expect(raiz.dataset.tema).toBe("oscuro");
  });

  it("borra el aviso al volver a intentar", async () => {
    guardar.mockRejectedValueOnce(new Error("sin red"));
    const usuarioEvento = montar();
    await usuarioEvento.click(opcion("Oscuro"));
    await screen.findByRole("alert");

    await usuarioEvento.click(opcion("Claro"));

    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
  });
});

describe("usePreferencias", () => {
  it("exige estar dentro del proveedor", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Consumidor = () => {
      usePreferencias();
      return null;
    };

    expect(() => render(<Consumidor />)).toThrow(/PreferenciasProvider/);
  });
});
