import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cambiarEstadoUsuario,
  cambiarPassword,
  cerrarSesion,
  crearUsuario,
  editarUsuario,
  eliminarUsuario,
  iniciarSesion,
  listarUsuarios,
  obtenerSesion,
} from "@/services/auth";
import type { Usuario } from "@/types/usuario";
import { respuestaJson } from "./fabricas";

const usuario: Usuario = {
  id: "u-1",
  alias: "medico1",
  nombre: "Ana Pérez",
  correo: null,
  rol: "medico",
  especialidad: "Cardiología",
  activo: true,
  debe_cambiar_password: false,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

function cuerpoEnviado(llamada = 0): unknown {
  return JSON.parse(fetchMock.mock.calls[llamada][1].body as string);
}

describe("inicio y cierre de sesión", () => {
  it("envía alias y contraseña y devuelve el usuario", async () => {
    fetchMock.mockResolvedValue(respuestaJson(usuario));

    await expect(iniciarSesion("medico1", "clave-segura")).resolves.toEqual(usuario);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/login");
    expect(cuerpoEnviado()).toEqual({ alias: "medico1", password: "clave-segura" });
  });

  it("muestra el mensaje del backend si las credenciales no sirven", async () => {
    fetchMock.mockResolvedValue(
      respuestaJson({ detail: "alias o contraseña incorrectos" }, { status: 401 }),
    );

    await expect(iniciarSesion("medico1", "mala")).rejects.toThrow(
      "alias o contraseña incorrectos",
    );
  });

  it("usa un mensaje por defecto si la respuesta no es JSON", async () => {
    fetchMock.mockResolvedValue(new Response("error interno", { status: 500 }));

    await expect(iniciarSesion("medico1", "x")).rejects.toThrow("No se pudo iniciar sesión");
  });

  it("cierra la sesión en el backend", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await cerrarSesion();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("obtenerSesion", () => {
  it("devuelve el usuario de la sesión vigente", async () => {
    fetchMock.mockResolvedValue(respuestaJson(usuario));
    await expect(obtenerSesion()).resolves.toEqual(usuario);
  });

  it("devuelve null sin sesión, sin redirigir", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(obtenerSesion()).resolves.toBeNull();
  });

  it("falla si el servidor no responde bien", async () => {
    fetchMock.mockResolvedValue(respuestaJson({}, { status: 503 }));
    await expect(obtenerSesion()).rejects.toThrow("No se pudo verificar la sesión");
  });
});

describe("cuentas", () => {
  it("cambia la contraseña propia con los nombres de campo del backend", async () => {
    fetchMock.mockResolvedValue(respuestaJson(usuario));

    await cambiarPassword("actual-123", "nueva-segura-456");

    expect(cuerpoEnviado()).toEqual({
      password_actual: "actual-123",
      password_nueva: "nueva-segura-456",
    });
  });

  it("informa si la contraseña actual es incorrecta", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ detail: "Contraseña actual incorrecta" }, { status: 400 }));
    await expect(cambiarPassword("x", "y")).rejects.toThrow("Contraseña actual incorrecta");
  });

  it("lista las cuentas", async () => {
    fetchMock.mockResolvedValue(respuestaJson([usuario]));
    await expect(listarUsuarios()).resolves.toEqual([usuario]);
  });

  it("falla al listar sin permisos", async () => {
    fetchMock.mockResolvedValue(respuestaJson({}, { status: 403 }));
    await expect(listarUsuarios()).rejects.toThrow("No se pudo cargar la lista de usuarios");
  });

  it("crea una cuenta y manda null si no hay especialidad", async () => {
    fetchMock.mockResolvedValue(respuestaJson(usuario));

    await crearUsuario({
      alias: "admin2",
      password: "clave-segura",
      nombre: "Admin",
      correo: "",
      rol: "administrador",
      especialidad: "",
    });

    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(cuerpoEnviado()).toMatchObject({ alias: "admin2", especialidad: null });
  });

  it("edita una cuenta", async () => {
    fetchMock.mockResolvedValue(respuestaJson(usuario));

    await editarUsuario("u-1", {
      nombre: "Ana",
      correo: "",
      rol: "medico",
      especialidad: "Cardiología",
      password_temporal: null,
    });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/usuarios/u-1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(cuerpoEnviado()).toMatchObject({ especialidad: "Cardiología" });
  });

  it("explica si no pudo bloquear o desbloquear la cuenta", async () => {
    fetchMock.mockResolvedValue(respuestaJson({}, { status: 500 }));
    await expect(cambiarEstadoUsuario("u-1", false)).rejects.toThrow("No se pudo bloquear la cuenta");
    fetchMock.mockResolvedValue(respuestaJson({}, { status: 500 }));
    await expect(cambiarEstadoUsuario("u-1", true)).rejects.toThrow(
      "No se pudo desbloquear la cuenta",
    );
  });

  it("elimina una cuenta", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(eliminarUsuario("u-1")).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });

  it("informa si no pudo eliminar la cuenta", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ detail: "No puedes eliminar tu propia cuenta" }, { status: 400 }));
    await expect(eliminarUsuario("u-1")).rejects.toThrow("No puedes eliminar tu propia cuenta");
  });
});
