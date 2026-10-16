import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, obtenerMensajeError, SesionExpiradaError } from "@/services/api";

const assign = vi.fn();

beforeEach(() => {
  assign.mockReset();
  vi.stubGlobal("location", {
    ...window.location,
    pathname: "/interconsultas/abc",
    search: "?vista=tabla",
    assign,
  });
});

describe("apiFetch", () => {
  it("envía la cookie de sesión del mismo origen", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/interconsultas", { method: "GET" });

    expect(fetchMock).toHaveBeenCalledWith("/api/interconsultas", {
      credentials: "same-origin",
      method: "GET",
    });
  });

  it("con la sesión vencida lleva al login y vuelve a la página actual", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(apiFetch("/api/interconsultas")).rejects.toBeInstanceOf(SesionExpiradaError);
    expect(assign).toHaveBeenCalledWith(
      `/login?next=${encodeURIComponent("/interconsultas/abc?vista=tabla")}`,
    );
  });

  it("deja que el login maneje su propio 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    const respuesta = await apiFetch("/api/auth/login", { method: "POST" });

    expect(respuesta.status).toBe(401);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("obtenerMensajeError", () => {
  it("usa el detalle de texto del backend", () => {
    expect(obtenerMensajeError("Alias en uso", "fallback")).toBe("Alias en uso");
  });

  it("usa el mensaje de un detalle estructurado", () => {
    expect(obtenerMensajeError({ message: "Archivo vacío" }, "fallback")).toBe("Archivo vacío");
  });

  it.each([null, undefined, 42, { message: 3 }, { otro: "x" }])(
    "usa el texto por defecto si el detalle no sirve (%j)",
    (detalle) => {
      expect(obtenerMensajeError(detalle, "fallback")).toBe("fallback");
    },
  );
});
