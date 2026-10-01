"use client";

/**
 * Cuentas de acceso (HDU-15). Solo administradores: en un sistema con datos
 * clínicos nadie se registra solo. La API aplica la misma regla; ocultar la
 * vista es solo para no mostrar algo que no funcionaría.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSesion } from "@/context/SesionContext";
import {
  cambiarEstadoUsuario,
  crearUsuario,
  editarUsuario,
  eliminarUsuario,
  listarUsuarios,
  type DatosCuenta,
} from "@/services/auth";
import { ETIQUETAS_ROL, type RolUsuario, type Usuario } from "@/types/usuario";
import EstadoVista from "@/components/ui/EstadoVista";

const PASSWORD_MINIMA = 8;
const PASSWORD_MAXIMA = 128;
const PATRON_ALIAS = "[a-z0-9._\\-]{3,64}";

interface Formulario extends DatosCuenta {
  alias: string;
  password: string;
  confirmacion: string;
}

const FORMULARIO_VACIO: Formulario = {
  alias: "",
  nombre: "",
  correo: "",
  rol: "medico_especialista",
  especialidad: "",
  password: "",
  confirmacion: "",
};

interface Aviso {
  tipo: "ok" | "error";
  texto: string;
}

export default function UsuariosPage() {
  const { usuario } = useSesion();

  if (usuario.rol !== "administrador") {
    return (
      <EstadoVista
        tipo="error"
        texto="Solo un administrador puede gestionar las cuentas de acceso."
      />
    );
  }

  return <GestionUsuarios propia={usuario} />;
}

function GestionUsuarios({ propia }: { propia: Usuario }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorListado, setErrorListado] = useState<string | null>(null);

  const [editando, setEditando] = useState<Usuario | null>(null);
  const [formulario, setFormulario] = useState<Formulario>(FORMULARIO_VACIO);
  const [enviando, setEnviando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(
    () =>
      listarUsuarios()
        .then((lista) => {
          setUsuarios(lista);
          setErrorListado(null);
        })
        .catch((error: unknown) => {
          setErrorListado(
            error instanceof Error ? error.message : "No se pudo cargar la lista de usuarios",
          );
        })
        .finally(() => setCargando(false)),
    [],
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  const actualizar = <K extends keyof Formulario>(campo: K, valor: Formulario[K]) =>
    setFormulario((prev) => ({ ...prev, [campo]: valor }));

  const empezarEdicion = (u: Usuario) => {
    setEditando(u);
    setErrorForm(null);
    setFormulario({
      alias: u.alias,
      nombre: u.nombre,
      correo: u.correo ?? "",
      rol: u.rol,
      especialidad: u.especialidad ?? "",
      password: "",
      confirmacion: "",
    });
  };

  const cancelarEdicion = () => {
    setEditando(null);
    setErrorForm(null);
    setFormulario(FORMULARIO_VACIO);
  };

  /** Valida la contraseña del formulario. En edición es opcional: vacía
   *  significa que no se restablece. */
  const validarPassword = (): string | null => {
    const { password, confirmacion } = formulario;
    if (editando && !password && !confirmacion) return null;
    if (password.length < PASSWORD_MINIMA) {
      return `La contraseña debe tener al menos ${PASSWORD_MINIMA} caracteres.`;
    }
    if (password.length > PASSWORD_MAXIMA) {
      return `La contraseña no puede tener más de ${PASSWORD_MAXIMA} caracteres.`;
    }
    if (password !== confirmacion) return "Las contraseñas no coinciden.";
    return null;
  };

  const manejarEnvio = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAviso(null);

    const errorPassword = validarPassword();
    if (errorPassword) {
      setErrorForm(errorPassword);
      return;
    }

    const datos: DatosCuenta = {
      nombre: formulario.nombre,
      correo: formulario.correo,
      rol: formulario.rol,
      especialidad: formulario.especialidad,
    };

    setEnviando(true);
    setErrorForm(null);
    try {
      if (editando) {
        const editada = await editarUsuario(editando.id, {
          ...datos,
          password_temporal: formulario.password || null,
        });
        setAviso({
          tipo: "ok",
          texto: formulario.password
            ? `Cuenta ${editada.alias} actualizada. Su contraseña temporal deberá cambiarla en el siguiente ingreso.`
            : `Cuenta ${editada.alias} actualizada.`,
        });
        cancelarEdicion();
      } else {
        const nueva = await crearUsuario({
          ...datos,
          alias: formulario.alias,
          password: formulario.password,
        });
        setAviso({
          tipo: "ok",
          texto: `Cuenta ${nueva.alias} creada. Entrégale la contraseña por un canal seguro: deberá cambiarla en su primer ingreso.`,
        });
        setFormulario(FORMULARIO_VACIO);
      }
      await cargar();
    } catch (error) {
      setErrorForm(error instanceof Error ? error.message : "No se pudo guardar la cuenta");
    } finally {
      setEnviando(false);
    }
  };

  /** Ejecuta una acción sobre una fila y recarga la lista, dejando el
   *  resultado en el aviso de la tabla. */
  const accionSobre = async (u: Usuario, accion: () => Promise<unknown>, exito: string) => {
    setOcupado(u.id);
    setAviso(null);
    try {
      await accion();
      setAviso({ tipo: "ok", texto: exito });
      if (editando?.id === u.id) cancelarEdicion();
      await cargar();
    } catch (error) {
      setAviso({
        tipo: "error",
        texto: error instanceof Error ? error.message : "No se pudo completar la acción",
      });
    } finally {
      setOcupado(null);
    }
  };

  const alternarBloqueo = (u: Usuario) =>
    accionSobre(
      u,
      () => cambiarEstadoUsuario(u.id, !u.activo),
      u.activo
        ? `Cuenta ${u.alias} bloqueada. Sus sesiones abiertas se cerraron.`
        : `Cuenta ${u.alias} desbloqueada.`,
    );

  const eliminar = (u: Usuario) => {
    const confirmado = window.confirm(
      `¿Eliminar la cuenta ${u.alias} (${u.nombre})? Esta acción no se puede deshacer. El historial de cambios de prioridad se conserva.`,
    );
    if (!confirmado) return;
    void accionSobre(u, () => eliminarUsuario(u.id), `Cuenta ${u.alias} eliminada.`);
  };

  const esPropia = editando?.id === propia.id;

  return (
    <div className="row g-4">
      <div className="col-12 col-xl-4">
        <section className="pz-panel" aria-labelledby="titulo-formulario">
          <div className="pz-panel__head">
            <span className={`pz-eyebrow ${editando ? "" : "pz-eyebrow--green"}`}>
              {editando ? "Edición" : "Alta"}
            </span>
            <h2 id="titulo-formulario" className="pz-panel__title">
              {editando ? `Editar ${editando.alias}` : "Nueva cuenta"}
            </h2>
            <p className="pz-panel__sub">
              {editando
                ? "El alias no se puede cambiar: es con lo que la persona inicia sesión."
                : "La persona entra con este alias y una contraseña inicial que deberá cambiar en su primer ingreso."}
            </p>
          </div>

          <form className="pz-form pz-panel__body flex flex-col gap-3" onSubmit={manejarEnvio}>
            <div>
              <label htmlFor="cuenta-nombre" className="form-label">
                Nombre completo
              </label>
              <input
                id="cuenta-nombre"
                className="form-control"
                required
                maxLength={255}
                autoComplete="off"
                value={formulario.nombre}
                onChange={(e) => actualizar("nombre", e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="cuenta-correo" className="form-label">
                Correo
              </label>
              <input
                id="cuenta-correo"
                type="email"
                className="form-control"
                required
                maxLength={255}
                autoComplete="off"
                value={formulario.correo}
                onChange={(e) => actualizar("correo", e.target.value)}
              />
            </div>

            {!editando && (
              <div>
                <label htmlFor="cuenta-alias" className="form-label">
                  Alias
                </label>
                <input
                  id="cuenta-alias"
                  className="form-control"
                  required
                  pattern={PATRON_ALIAS}
                  title="Entre 3 y 64 caracteres: letras minúsculas, números, punto, guion o guion bajo"
                  maxLength={64}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={formulario.alias}
                  onChange={(e) => actualizar("alias", e.target.value.toLowerCase())}
                  aria-describedby="ayuda-alias"
                />
                <p
                  id="ayuda-alias"
                  className="mt-1.5 mb-0"
                  style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink-3)" }}
                >
                  Minúsculas, números, punto, guion o guion bajo. Por ejemplo: jperez.
                </p>
              </div>
            )}

            <div className="row g-3">
              <div className="col-12 col-sm-6 col-xl-12">
                <label htmlFor="cuenta-rol" className="form-label">
                  Rol
                </label>
                <select
                  id="cuenta-rol"
                  className="form-select"
                  value={formulario.rol}
                  disabled={esPropia}
                  title={esPropia ? "No puedes cambiar tu propio rol" : undefined}
                  onChange={(e) => actualizar("rol", e.target.value as RolUsuario)}
                >
                  {(Object.keys(ETIQUETAS_ROL) as RolUsuario[]).map((rol) => (
                    <option key={rol} value={rol}>
                      {ETIQUETAS_ROL[rol]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-sm-6 col-xl-12">
                <label htmlFor="cuenta-especialidad" className="form-label">
                  Especialidad (opcional)
                </label>
                <input
                  id="cuenta-especialidad"
                  className="form-control"
                  maxLength={255}
                  autoComplete="off"
                  value={formulario.especialidad}
                  onChange={(e) => actualizar("especialidad", e.target.value)}
                />
              </div>
            </div>

            {!esPropia && (
              <fieldset className="flex flex-col gap-3">
                {editando && (
                  <legend
                    className="mb-0"
                    style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink-2)" }}
                  >
                    Restablecer contraseña: déjalo vacío para no cambiarla.
                  </legend>
                )}
                <div>
                  <label htmlFor="cuenta-password" className="form-label">
                    {editando ? "Contraseña temporal" : "Contraseña inicial"}
                  </label>
                  <input
                    id="cuenta-password"
                    type="password"
                    className="form-control"
                    required={!editando}
                    minLength={PASSWORD_MINIMA}
                    maxLength={PASSWORD_MAXIMA}
                    autoComplete="new-password"
                    value={formulario.password}
                    onChange={(e) => actualizar("password", e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="cuenta-confirmacion" className="form-label">
                    Repetir contraseña
                  </label>
                  <input
                    id="cuenta-confirmacion"
                    type="password"
                    className="form-control"
                    required={!editando}
                    maxLength={PASSWORD_MAXIMA}
                    autoComplete="new-password"
                    value={formulario.confirmacion}
                    onChange={(e) => actualizar("confirmacion", e.target.value)}
                  />
                </div>
              </fieldset>
            )}

            {errorForm && (
              <p role="alert" className="mb-0" style={{ color: "var(--pz-alta)", fontSize: "var(--fs-sm)" }}>
                {errorForm}
              </p>
            )}

            <button
              type="submit"
              className="pz-btn pz-btn--verde pz-btn--block mt-1"
              disabled={enviando}
            >
              {enviando ? "Guardando…" : editando ? "Guardar cambios" : "Crear cuenta"}
            </button>
            {editando && (
              <button
                type="button"
                className="pz-btn pz-btn--claro pz-btn--block"
                onClick={cancelarEdicion}
                disabled={enviando}
              >
                Cancelar
              </button>
            )}
          </form>
        </section>
      </div>

      <div className="col-12 col-xl-8">
        <section className="pz-panel" aria-labelledby="titulo-cuentas">
          <div className="pz-panel__head">
            <span className="pz-eyebrow">Acceso</span>
            <h2 id="titulo-cuentas" className="pz-panel__title">
              Cuentas
            </h2>
            <p className="pz-panel__sub">
              Una cuenta bloqueada no puede iniciar sesión y pierde sus sesiones abiertas.
            </p>
          </div>

          {aviso && (
            <p
              role={aviso.tipo === "error" ? "alert" : "status"}
              className="mx-4 mt-3 mb-0 px-3 py-2.5"
              style={{
                fontSize: "var(--fs-sm)",
                borderRadius: "var(--radius-sm)",
                color: aviso.tipo === "error" ? "var(--pz-alta-fuerte)" : "var(--pz-green-ink)",
                background: aviso.tipo === "error" ? "var(--pz-alta-bg)" : "var(--pz-baja-bg)",
              }}
            >
              {aviso.texto}
            </p>
          )}

          {cargando ? (
            <EstadoVista tipo="cargando" texto="Cargando cuentas…" />
          ) : errorListado ? (
            <EstadoVista tipo="error" texto={errorListado} />
          ) : (
            <div className="table-responsive">
              <table className="table pz-table">
                <thead>
                  <tr>
                    <th scope="col">Nombre</th>
                    <th scope="col">Correo</th>
                    <th scope="col">Rol</th>
                    <th scope="col">Estado</th>
                    <th scope="col" className="text-end">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => {
                    const propiaFila = u.id === propia.id;
                    const deshabilitada = ocupado === u.id;
                    return (
                      <tr key={u.id}>
                        <td>
                          <span style={{ color: "var(--pz-ink)", fontWeight: 600 }}>{u.nombre}</span>
                          <span className="pz-mono-cell d-block">{u.alias}</span>
                        </td>
                        <td style={{ overflowWrap: "anywhere" }}>{u.correo ?? "—"}</td>
                        <td>
                          {ETIQUETAS_ROL[u.rol] ?? u.rol}
                          {u.especialidad && (
                            <span className="d-block" style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink-3)" }}>
                              {u.especialidad}
                            </span>
                          )}
                        </td>
                        <td>
                          {u.activo ? (
                            <span className="pz-chip pz-chip--baja">Activa</span>
                          ) : (
                            <span className="pz-chip pz-chip--alta">Bloqueada</span>
                          )}
                          {u.activo && u.debe_cambiar_password && (
                            <span
                              className="d-block mt-1"
                              style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink-3)" }}
                            >
                              Falta cambiar contraseña
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <button
                              type="button"
                              className="pz-btn pz-btn--claro pz-btn--mini"
                              onClick={() => empezarEdicion(u)}
                              disabled={deshabilitada}
                              aria-label={`Editar ${u.alias}`}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="pz-btn pz-btn--claro pz-btn--mini"
                              onClick={() => void alternarBloqueo(u)}
                              disabled={deshabilitada || propiaFila}
                              title={propiaFila ? "No puedes bloquear tu propia cuenta" : undefined}
                              aria-label={`${u.activo ? "Bloquear" : "Desbloquear"} ${u.alias}`}
                            >
                              {u.activo ? "Bloquear" : "Desbloquear"}
                            </button>
                            <button
                              type="button"
                              className="pz-btn pz-btn--rojo pz-btn--mini"
                              onClick={() => eliminar(u)}
                              disabled={deshabilitada || propiaFila}
                              title={propiaFila ? "No puedes eliminar tu propia cuenta" : undefined}
                              aria-label={`Eliminar ${u.alias}`}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
