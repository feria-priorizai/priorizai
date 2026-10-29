"""Modulo de reentrenamiento: datos, ejecucion, versiones e import/export.

El proceso que entrena se reemplaza por uno falso que escupe las mismas lineas
que el real (el real se prueba en test_entrenamiento.py).

El proceso falso no habla hasta que el test le da `arrancar`: la base de los
tests es una sola conexion SQLite compartida, y si el hilo que sigue al proceso
escribe mientras la peticion cierra su sesion, el ROLLBACK de esa sesion se
lleva lo que el hilo aun no confirmaba. Con Postgres cada sesion tiene su
conexion y esto no pasa.
"""

import io
import json
import threading
import zipfile
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

import app.api.reentrenamiento as api_module
from app.core.config import settings
from app.entrenamiento.entrenar import PREFIJO_EVENTO
from app.main import app
from app.models.interconsulta import Interconsulta
from app.models.modificacion_prioridad import ModificacionPrioridad
from app.models.reentrenamiento import (
    ArchivoEntrenamiento,
    CambioModelo,
    Reentrenamiento,
    VersionModelo,
)
from app.services import reentrenamiento as servicio
from app.services.reentrenamiento import (
    Reentrenador,
    get_priorizador_local,
    get_reentrenador,
)
from tests.conftest import USUARIO_ADMIN_PRUEBA

CrearInterconsulta = Callable[..., Interconsulta]

METRICAS = {
    "n": 9,
    "exactitud": 0.8,
    "f1_macro": 0.75,
    "sensibilidad_alta": 0.9,
    "f1_por_clase": {"baja": 0.8, "media": 0.6, "alta": 0.85},
    "matriz_confusion": [[3, 0, 0], [1, 1, 1], [0, 0, 3]],
}


def evento(**datos: Any) -> str:
    return PREFIJO_EVENTO + json.dumps(datos)


def salida_exitosa(configuraciones: int = 1) -> list[str]:
    lineas = [
        "Dispositivo: cpu.",
        evento(tipo="progreso", etapa="Evaluando el modelo en uso", porcentaje=0.0),
        evento(tipo="modelo_actual", metricas={**METRICAS, "f1_macro": 0.7}),
    ]
    for i in range(configuraciones):
        lineas += [
            f"Configuración {i + 1} · época 1/1: pérdida 0.5",
            evento(
                tipo="resultado",
                indice=i,
                metricas=METRICAS,
                mejor_epoca=1,
                epocas_corridas=1,
            ),
        ]
    lineas.append(evento(tipo="progreso", etapa="Terminado", porcentaje=100.0))
    return lineas


class ProcesoFalso:
    """Se parece a un Popen: escupe sus lineas y termina con `codigo`. Con
    `bloquear`, despues de sus lineas se queda "corriendo" hasta `liberar`."""

    def __init__(
        self, lineas: list[str], codigo: int = 0, bloquear: bool = False
    ) -> None:
        self._lineas = lineas
        self.codigo = codigo
        self.terminado = False
        self.arrancar = threading.Event()
        # Se marca cuando el hilo ya proceso (y guardo) todas las lineas.
        self.esperando = threading.Event()
        self.liberar = threading.Event()
        if not bloquear:
            self.liberar.set()
        self.stdout: Iterator[str] = self._salida()

    def _salida(self) -> Iterator[str]:
        self.arrancar.wait(10)
        for linea in self._lineas:
            yield linea + "\n"
        self.esperando.set()
        self.liberar.wait(10)

    def wait(self) -> int:
        return -15 if self.terminado else self.codigo

    def terminate(self) -> None:
        self.terminado = True


class Lanzador:
    def __init__(self) -> None:
        self.proceso = ProcesoFalso(salida_exitosa())
        self.llamadas: list[tuple[Path, str]] = []

    def __call__(self, ruta: Path, dispositivo: str) -> ProcesoFalso:
        self.llamadas.append((ruta, dispositivo))
        # El proceso real crea las carpetas de salida; el falso tambien.
        trabajo = json.loads(ruta.read_text(encoding="utf-8"))
        for config in trabajo["configuraciones"]:
            Path(config["salida"]).mkdir(parents=True)
            (Path(config["salida"]) / "config.json").write_text(
                json.dumps({"id2label": {"0": "baja", "1": "media", "2": "alta"}})
            )
        return self.proceso

    @property
    def trabajo(self) -> dict[str, Any]:
        datos: dict[str, Any] = json.loads(
            self.llamadas[-1][0].read_text(encoding="utf-8")
        )
        return datos


class PriorizadorQueCambia:
    def __init__(self) -> None:
        self.cambios: list[tuple[str, tuple[str, ...]]] = []

    def usar_modelo(self, path: str, labels: tuple[str, ...]) -> None:
        self.cambios.append((path, labels))


def guardar_modelo_falso(
    carpeta: Path,
    id2label: dict[str, str] | None = None,
    archivos: tuple[str, ...] = ("model.safetensors", "tokenizer.json"),
) -> Path:
    carpeta.mkdir(parents=True, exist_ok=True)
    config = {"id2label": id2label or {"0": "LABEL_0", "1": "LABEL_1", "2": "LABEL_2"}}
    (carpeta / "config.json").write_text(json.dumps(config), encoding="utf-8")
    for nombre in archivos:
        (carpeta / nombre).write_bytes(b"pesos")
    return carpeta


@pytest.fixture
def entorno(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    inicial = guardar_modelo_falso(tmp_path / "inicial")
    monkeypatch.setattr(settings, "model_path", str(inicial))
    monkeypatch.setattr(settings, "model_labels", ("baja", "media", "alta"))
    monkeypatch.setattr(settings, "modelos_versiones_dir", str(tmp_path / "versiones"))
    monkeypatch.setattr(settings, "reentrenamiento_minimo", 15)
    monkeypatch.setattr(servicio, "gpu_disponible", lambda: False)
    monkeypatch.setattr(api_module.servicio, "gpu_disponible", lambda: False)
    return tmp_path


@pytest.fixture
def lanzador() -> Lanzador:
    return Lanzador()


@pytest.fixture
def reentrenador(
    session_factory: sessionmaker[Session], lanzador: Lanzador
) -> Reentrenador:
    return Reentrenador(fabrica_sesiones=session_factory, lanzar=lanzador)


@pytest.fixture
def priorizador_local() -> PriorizadorQueCambia:
    return PriorizadorQueCambia()


@pytest.fixture
def api(
    entorno: Path,
    client_admin: TestClient,
    reentrenador: Reentrenador,
    priorizador_local: PriorizadorQueCambia,
    db: Session,
) -> TestClient:
    app.dependency_overrides[get_reentrenador] = lambda: reentrenador
    app.dependency_overrides[get_priorizador_local] = lambda: priorizador_local
    servicio.asegurar_version_inicial(db)
    return client_admin


@pytest.fixture
def revisadas(guardar_interconsulta: CrearInterconsulta) -> Callable[..., None]:
    def crear(por_clase: int = 6, **campos: Any) -> None:
        for clase in ("baja", "media", "alta"):
            for i in range(por_clase):
                guardar_interconsulta(
                    id=f"ic-{clase}-{i:03d}",
                    prioridad_actual=clase,
                    estado="revisada",
                    historia_clinica=f"historia {clase} {i}",
                    **campos,
                )

    return crear


def _iniciar(api: TestClient, **cuerpo: Any) -> Any:
    cuerpo.setdefault("dispositivo", "cpu")
    cuerpo.setdefault("configuraciones", [{}])
    return api.post("/api/reentrenamiento/trabajos", json=cuerpo)


def _terminado(
    api: TestClient, reentrenador: Reentrenador, lanzador: Lanzador, respuesta: Any
) -> dict[str, Any]:
    assert respuesta.status_code == 202, respuesta.text
    lanzador.proceso.arrancar.set()
    lanzador.proceso.liberar.set()
    reentrenador.esperar(timeout=10)
    trabajo: dict[str, Any] = api.get(
        f"/api/reentrenamiento/trabajos/{respuesta.json()['id']}"
    ).json()
    return trabajo


# ----------------------------------------------------------------- acceso --
@pytest.mark.parametrize(
    ("metodo", "ruta"),
    [
        ("get", "/api/reentrenamiento/resumen"),
        ("get", "/api/reentrenamiento/trabajos"),
        ("post", "/api/reentrenamiento/trabajos"),
        ("get", "/api/reentrenamiento/versiones"),
        ("post", "/api/reentrenamiento/versiones/v-1/activar"),
        ("get", "/api/reentrenamiento/cambios"),
    ],
)
def test_un_medico_no_puede_usar_el_modulo(
    client: TestClient, metodo: str, ruta: str
) -> None:
    respuesta = getattr(client, metodo)(ruta)

    assert respuesta.status_code == 403


# ------------------------------------------------------------------ datos --
def test_solo_cuentan_las_revisadas_o_corregidas_por_un_medico(
    api: TestClient,
    guardar_interconsulta: CrearInterconsulta,
    db: Session,
) -> None:
    guardar_interconsulta(id="ic-revisada", prioridad_actual="alta", estado="revisada")
    guardar_interconsulta(
        id="ic-corregida", prioridad_actual="Media", estado="pendiente"
    )
    db.add(
        ModificacionPrioridad(
            interconsulta_id="ic-corregida",
            prioridad_anterior="baja",
            prioridad_nueva="media",
            motivo="Ajuste clinico",
            medico_responsable="Dra. Test",
        )
    )
    # Pendiente sin corregir: la prioridad la puso el modelo, no un medico.
    guardar_interconsulta(id="ic-modelo", prioridad_actual="baja", estado="pendiente")
    guardar_interconsulta(
        id="ic-sin-prioridad", prioridad_actual=None, estado="revisada"
    )
    db.commit()

    resumen = api.get("/api/reentrenamiento/resumen").json()

    assert resumen["registros_por_clase"] == {"baja": 0, "media": 1, "alta": 1}
    assert resumen["registros_disponibles"] == 2
    assert resumen["puede_iniciar"] is False
    assert "se necesitan al menos 15" in resumen["motivo_bloqueo"]
    assert resumen["gpu_disponible"] is False
    assert resumen["parametros_por_defecto"]["epocas"] == 4


def test_con_datos_suficientes_el_resumen_deja_iniciar(
    api: TestClient, revisadas: Callable[..., None]
) -> None:
    revisadas()

    resumen = api.get("/api/reentrenamiento/resumen").json()

    assert resumen["puede_iniciar"] is True
    assert resumen["motivo_bloqueo"] is None
    assert resumen["en_curso_id"] is None


def test_falta_de_una_prioridad_bloquea_aunque_el_total_alcance() -> None:
    motivo = servicio.motivo_bloqueo({"baja": 50, "media": 50, "alta": 2}, 100)

    assert motivo is not None and "alta" in motivo


def test_la_division_mantiene_cada_prioridad_en_los_tres_conjuntos() -> None:
    ejemplos = [
        {"texto": f"{clase} {i}", "etiqueta": clase}
        for clase, n in (("baja", 50), ("media", 30), ("alta", 20))
        for i in range(n)
    ]

    entrenamiento, validacion, evaluacion = servicio.dividir_estratificado(ejemplos, 20)

    assert len(entrenamiento) + len(validacion) + len(evaluacion) == 100
    assert sorted(e["etiqueta"] for e in evaluacion).count("alta") == 4
    for conjunto in (entrenamiento, validacion, evaluacion):
        assert {e["etiqueta"] for e in conjunto} == {"baja", "media", "alta"}
    textos = [e["texto"] for e in entrenamiento + validacion + evaluacion]
    assert len(set(textos)) == 100
    # Misma semilla, misma division: el conjunto de evaluacion es reproducible.
    assert servicio.dividir_estratificado(ejemplos, 20)[2] == evaluacion


# -------------------------------------------------------------- ejecucion --
def test_iniciar_con_pocos_datos_se_bloquea(
    api: TestClient, revisadas: Callable[..., None]
) -> None:
    revisadas(por_clase=2)

    respuesta = _iniciar(api)

    assert respuesta.status_code == 422
    assert "se necesitan al menos 15" in respuesta.json()["detail"]


def test_un_reentrenamiento_completo_deja_versiones_sin_activar(
    api: TestClient,
    reentrenador: Reentrenador,
    lanzador: Lanzador,
    revisadas: Callable[..., None],
    priorizador_local: PriorizadorQueCambia,
    db: Session,
) -> None:
    revisadas()
    lanzador.proceso = ProcesoFalso(salida_exitosa(configuraciones=2))

    respuesta = _iniciar(
        api,
        porcentaje_evaluacion=20,
        configuraciones=[{"epocas": 3}, {"learning_rate": 3e-5, "batch_size": 8}],
    )
    inicial = respuesta.json()
    assert inicial["estado"] == "en_curso"
    assert inicial["n_registros"] == 18
    assert inicial["registros_por_clase"] == {"baja": 6, "media": 6, "alta": 6}
    assert inicial["iniciado_por"] == USUARIO_ADMIN_PRUEBA.nombre

    detalle = _terminado(api, reentrenador, lanzador, respuesta)

    assert detalle["estado"] == "terminado"
    assert detalle["terminado_en"] is not None
    assert "Configuración 2 · época 1/1" in detalle["log"]
    assert detalle["progreso"]["etapa"] == "Terminado"
    resultados = detalle["resultados"]
    assert resultados["modelo_actual"]["f1_macro"] == 0.7
    assert [c["parametros"]["epocas"] for c in resultados["configuraciones"]] == [3, 4]
    assert resultados["configuraciones"][1]["parametros"]["batch_size"] == 8

    # El proceso recibio el modelo en uso para compararlo, con sus clases.
    trabajo = lanzador.trabajo
    assert lanzador.llamadas[-1][1] == "cpu"
    assert trabajo["modelo_actual"]["ruta"] == settings.model_path
    assert trabajo["modelo_actual"]["labels"] == ["baja", "media", "alta"]
    assert trabajo["modelo_base"] == settings.reentrenamiento_modelo_base
    evaluacion = Path(trabajo["evaluacion"]).read_text(encoding="utf-8").splitlines()
    assert len(evaluacion) == detalle["n_evaluacion"] == 3
    assert (Path(trabajo["evaluacion"]).parent / "log.txt").is_file()

    nuevas = db.scalars(
        select(VersionModelo).where(VersionModelo.origen == "reentrenamiento")
    ).all()
    assert len(nuevas) == 2
    assert not any(v.activa for v in nuevas)
    assert nuevas[0].metricas == METRICAS
    assert nuevas[0].labels == ["baja", "media", "alta"]
    assert nuevas[0].n_registros == 18
    assert sorted(v.nombre for v in nuevas) == [
        "Reentrenamiento 1 · entrenamiento 1",
        "Reentrenamiento 1 · entrenamiento 2",
    ]
    # Nada entra en uso solo.
    assert priorizador_local.cambios == []


def test_el_sistema_elige_por_ti_usa_una_configuracion_por_defecto(
    api: TestClient,
    reentrenador: Reentrenador,
    lanzador: Lanzador,
    revisadas: Callable[..., None],
) -> None:
    revisadas()

    detalle = _terminado(
        api,
        reentrenador,
        lanzador,
        _iniciar(api, automatico=True, configuraciones=[{"epocas": 9}, {}]),
    )

    assert detalle["automatico"] is True
    assert detalle["configuraciones"] == [servicio.PARAMETROS_POR_DEFECTO]
    (config,) = lanzador.trabajo["configuraciones"]
    assert config["epocas"] == 4


def test_sin_configuraciones_ni_automatico_es_invalido(api: TestClient) -> None:
    respuesta = _iniciar(api, configuraciones=[])

    assert respuesta.status_code == 422


def test_mas_de_tres_configuraciones_es_invalido(api: TestClient) -> None:
    respuesta = _iniciar(api, configuraciones=[{}, {}, {}, {}])

    assert respuesta.status_code == 422


def test_pedir_gpu_sin_gpu_se_rechaza(
    api: TestClient, revisadas: Callable[..., None]
) -> None:
    revisadas()

    respuesta = _iniciar(api, dispositivo="gpu")

    assert respuesta.status_code == 409
    assert "GPU" in respuesta.json()["detail"]


def test_con_gpu_se_lanza_en_gpu(
    api: TestClient,
    reentrenador: Reentrenador,
    lanzador: Lanzador,
    revisadas: Callable[..., None],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    revisadas()
    monkeypatch.setattr(servicio, "gpu_disponible", lambda: True)

    detalle = _terminado(api, reentrenador, lanzador, _iniciar(api, dispositivo="gpu"))

    assert detalle["dispositivo"] == "gpu"
    assert lanzador.llamadas[-1][1] == "gpu"


def test_no_se_puede_lanzar_un_segundo_mientras_hay_uno_en_curso(
    api: TestClient,
    reentrenador: Reentrenador,
    lanzador: Lanzador,
    revisadas: Callable[..., None],
) -> None:
    revisadas()
    lanzador.proceso = ProcesoFalso(["Dispositivo: cpu."], bloquear=True)
    primero = _iniciar(api)
    assert primero.status_code == 202

    segundo = _iniciar(api)
    resumen = api.get("/api/reentrenamiento/resumen").json()

    assert segundo.status_code == 409
    assert resumen["en_curso_id"] == primero.json()["id"]
    assert resumen["puede_iniciar"] is False
    _terminado(api, reentrenador, lanzador, primero)


def test_cancelar_detiene_el_proceso_y_borra_lo_entrenado(
    api: TestClient,
    reentrenador: Reentrenador,
    lanzador: Lanzador,
    revisadas: Callable[..., None],
) -> None:
    revisadas()
    lanzador.proceso = ProcesoFalso(["Dispositivo: cpu."], bloquear=True)
    respuesta = _iniciar(api)
    id_ = respuesta.json()["id"]

    cancelar = api.post(f"/api/reentrenamiento/trabajos/{id_}/cancelar")
    detalle = _terminado(api, reentrenador, lanzador, respuesta)

    assert cancelar.status_code == 202
    assert lanzador.proceso.terminado is True
    assert detalle["estado"] == "cancelado"
    assert USUARIO_ADMIN_PRUEBA.nombre in detalle["error"]
    for config in lanzador.trabajo["configuraciones"]:
        assert not Path(config["salida"]).exists()


def test_un_error_del_proceso_queda_registrado(
    api: TestClient,
    reentrenador: Reentrenador,
    lanzador: Lanzador,
    revisadas: Callable[..., None],
    db: Session,
) -> None:
    revisadas()
    lanzador.proceso = ProcesoFalso(
        ["Traceback ...", evento(tipo="error", mensaje="CUDA out of memory")], codigo=1
    )

    detalle = _terminado(api, reentrenador, lanzador, _iniciar(api))

    assert detalle["estado"] == "error"
    assert detalle["error"] == "CUDA out of memory"
    assert "Traceback ..." in detalle["log"]
    assert (
        db.scalars(
            select(VersionModelo).where(VersionModelo.origen == "reentrenamiento")
        ).all()
        == []
    )


def test_un_proceso_que_muere_sin_resultados_es_un_error(
    api: TestClient,
    reentrenador: Reentrenador,
    lanzador: Lanzador,
    revisadas: Callable[..., None],
) -> None:
    revisadas()
    lanzador.proceso = ProcesoFalso(["Killed", f"{PREFIJO_EVENTO}no es json"], codigo=0)

    detalle = _terminado(api, reentrenador, lanzador, _iniciar(api))

    assert detalle["estado"] == "error"
    assert "sin entregar todos sus resultados" in detalle["error"]
    assert f"{PREFIJO_EVENTO}no es json" in detalle["log"]


def test_si_no_se_puede_lanzar_el_proceso_queda_en_error(
    api: TestClient,
    reentrenador: Reentrenador,
    revisadas: Callable[..., None],
) -> None:
    revisadas()

    def lanzar_roto(ruta: Path, dispositivo: str) -> Any:
        raise OSError("sin memoria")

    reentrenador._lanzar = lanzar_roto
    respuesta = _iniciar(api)

    assert respuesta.status_code == 202
    assert respuesta.json()["estado"] == "error"
    assert "sin memoria" in respuesta.json()["error"]
    assert reentrenador.en_curso() is None


def test_un_fallo_leyendo_la_salida_cierra_el_reentrenamiento(
    api: TestClient,
    reentrenador: Reentrenador,
    lanzador: Lanzador,
    revisadas: Callable[..., None],
) -> None:
    revisadas()

    def salida_rota() -> Iterator[str]:
        lanzador.proceso.arrancar.wait(10)
        yield "Dispositivo: cpu.\n"
        raise RuntimeError("tuberia rota")

    lanzador.proceso.stdout = salida_rota()

    detalle = _terminado(api, reentrenador, lanzador, _iniciar(api))

    assert detalle["estado"] == "error"
    assert "tuberia rota" in detalle["error"]


def test_el_avance_se_guarda_mientras_corre(
    api: TestClient,
    reentrenador: Reentrenador,
    lanzador: Lanzador,
    revisadas: Callable[..., None],
    monkeypatch: pytest.MonkeyPatch,
    db: Session,
) -> None:
    revisadas()
    monkeypatch.setattr(servicio, "INTERVALO_GUARDADO_S", 0.0)
    lanzador.proceso = ProcesoFalso(
        [
            evento(
                tipo="progreso",
                etapa="Entrenando configuración 1 de 1",
                porcentaje=40.0,
            )
        ],
        bloquear=True,
    )
    respuesta = _iniciar(api)
    lanzador.proceso.arrancar.set()
    assert lanzador.proceso.esperando.wait(10)

    registro = db.get(Reentrenamiento, respuesta.json()["id"])

    assert registro is not None and registro.progreso is not None
    assert registro.progreso["porcentaje"] == 40.0
    assert registro.estado == "en_curso"
    _terminado(api, reentrenador, lanzador, respuesta)


def test_cancelar_uno_colgado_tras_un_reinicio(api: TestClient, db: Session) -> None:
    db.add(_registro_en_curso("re-colgado"))
    db.commit()

    respuesta = api.post("/api/reentrenamiento/trabajos/re-colgado/cancelar")

    assert respuesta.status_code == 202
    db.expire_all()
    registro = db.get(Reentrenamiento, "re-colgado")
    assert registro is not None and registro.estado == "cancelado"


def test_cancelar_uno_que_no_esta_en_curso_es_un_conflicto(api: TestClient) -> None:
    respuesta = api.post("/api/reentrenamiento/trabajos/no-existe/cancelar")

    assert respuesta.status_code == 409


def test_listar_y_obtener_reentrenamientos(api: TestClient, db: Session) -> None:
    db.add(_registro_en_curso("re-1", estado="terminado"))
    db.commit()

    lista = api.get("/api/reentrenamiento/trabajos").json()

    assert [r["id"] for r in lista] == ["re-1"]
    assert "log" not in lista[0]
    assert api.get("/api/reentrenamiento/trabajos/re-1").json()["log"] == ""
    assert api.get("/api/reentrenamiento/trabajos/otro").status_code == 404


def _registro_en_curso(id_: str, estado: str = "en_curso") -> Reentrenamiento:
    return Reentrenamiento(
        id=id_,
        estado=estado,
        dispositivo="cpu",
        configuraciones=[servicio.PARAMETROS_POR_DEFECTO],
        porcentaje_evaluacion=20,
        n_registros=100,
        registros_por_clase={"baja": 40, "media": 30, "alta": 30},
        n_evaluacion=20,
        iniciado_por="Admin",
    )


# -------------------------------------------------------------- versiones --
def _version(db: Session, carpeta: Path, **campos: Any) -> VersionModelo:
    guardar_modelo_falso(carpeta, {"0": "baja", "1": "media", "2": "alta"})
    version = VersionModelo(
        nombre=campos.pop("nombre", "Reentrenamiento"),
        ruta=str(carpeta),
        origen=campos.pop("origen", "reentrenamiento"),
        labels=campos.pop("labels", ["baja", "media", "alta"]),
        **campos,
    )
    db.add(version)
    db.commit()
    return version


def test_activar_una_version_cambia_el_modelo_y_lo_registra(
    api: TestClient,
    entorno: Path,
    priorizador_local: PriorizadorQueCambia,
    guardar_interconsulta: CrearInterconsulta,
    db: Session,
) -> None:
    guardar_interconsulta(
        id="ic-ya", prioridad_actual="baja", prioridad_sugerida_modelo="baja"
    )
    nueva = _version(db, entorno / "nueva")
    inicial_id = _activa(db).id

    respuesta = api.post(f"/api/reentrenamiento/versiones/{nueva.id}/activar")

    assert respuesta.status_code == 200, respuesta.text
    cambio = respuesta.json()
    assert cambio["accion"] == "activar"
    assert cambio["version_anterior_id"] == inicial_id
    assert cambio["usuario"] == USUARIO_ADMIN_PRUEBA.nombre
    assert priorizador_local.cambios == [(nueva.ruta, ("baja", "media", "alta"))]
    db.expire_all()
    assert _activa(db).id == nueva.id
    # Lo ya priorizado queda como estaba.
    interconsulta = db.get(Interconsulta, "ic-ya")
    assert interconsulta is not None and interconsulta.prioridad_actual == "baja"

    versiones = api.get("/api/reentrenamiento/versiones").json()
    assert [v["activa"] for v in versiones].count(True) == 1


def test_volver_a_una_version_anterior_es_revertir(
    api: TestClient,
    entorno: Path,
    priorizador_local: PriorizadorQueCambia,
    db: Session,
) -> None:
    inicial = _activa(db)
    nueva = _version(db, entorno / "nueva")
    api.post(f"/api/reentrenamiento/versiones/{nueva.id}/activar")

    respuesta = api.post(f"/api/reentrenamiento/versiones/{inicial.id}/activar")

    assert respuesta.json()["accion"] == "revertir"
    assert priorizador_local.cambios[-1] == (
        settings.model_path,
        ("baja", "media", "alta"),
    )
    cambios = api.get("/api/reentrenamiento/cambios").json()
    assert [c["accion"] for c in cambios] == ["revertir", "activar"]


def test_activar_la_que_ya_esta_en_uso_es_un_conflicto(
    api: TestClient, db: Session
) -> None:
    activa = _activa(db)

    respuesta = api.post(f"/api/reentrenamiento/versiones/{activa.id}/activar")

    assert respuesta.status_code == 409


def test_activar_una_version_sin_archivos_es_un_conflicto(
    api: TestClient, entorno: Path, db: Session
) -> None:
    version = VersionModelo(
        nombre="Borrada", ruta=str(entorno / "no-existe"), origen="subido", labels=[]
    )
    db.add(version)
    db.commit()

    respuesta = api.post(f"/api/reentrenamiento/versiones/{version.id}/activar")
    versiones = api.get("/api/reentrenamiento/versiones").json()

    assert respuesta.status_code == 409
    assert next(v for v in versiones if v["id"] == version.id)["disponible"] is False


def test_activar_un_modelo_con_clases_irresolubles_es_un_conflicto(
    api: TestClient, entorno: Path, db: Session
) -> None:
    version = _version(db, entorno / "rara", labels=["baja", "media"])

    respuesta = api.post(f"/api/reentrenamiento/versiones/{version.id}/activar")

    assert respuesta.status_code == 409
    assert "no se puede usar" in respuesta.json()["detail"]


def test_activar_una_version_inexistente_es_404(api: TestClient) -> None:
    assert api.post("/api/reentrenamiento/versiones/nada/activar").status_code == 404


def test_con_servicio_remoto_no_se_reentrena_ni_se_activa(
    api: TestClient,
    entorno: Path,
    revisadas: Callable[..., None],
    monkeypatch: pytest.MonkeyPatch,
    db: Session,
) -> None:
    revisadas()
    monkeypatch.setattr(api_module, "usar_servicio_remoto", lambda: True)
    nueva = _version(db, entorno / "nueva")

    resumen = api.get("/api/reentrenamiento/resumen").json()
    iniciar = _iniciar(api)
    activar = api.post(f"/api/reentrenamiento/versiones/{nueva.id}/activar")

    assert resumen["servicio_remoto"] is True
    assert resumen["puede_iniciar"] is False
    assert iniciar.status_code == 409
    assert activar.status_code == 409


# ------------------------------------------------------------- arranque --
def test_preparar_registra_la_inicial_aplica_la_activa_y_cierra_colgados(
    entorno: Path, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    db.add(_registro_en_curso("re-colgado"))
    db.commit()
    priorizador = PriorizadorQueCambia()

    servicio.preparar(db, priorizador)

    inicial = servicio.version_activa(db)
    assert inicial is not None and inicial.origen == "inicial"
    assert priorizador.cambios == [(settings.model_path, ("baja", "media", "alta"))]
    colgado = db.get(Reentrenamiento, "re-colgado")
    assert colgado is not None and colgado.estado == "error"
    assert colgado.error is not None and "reinició" in colgado.error

    # Si MODEL_PATH cambia entre despliegues, la inicial lo sigue.
    monkeypatch.setattr(settings, "model_path", str(entorno / "otro"))
    servicio.preparar(db, priorizador)
    assert db.scalars(select(VersionModelo)).all() == [inicial]
    assert inicial.ruta == str(entorno / "otro")


def test_la_inicial_no_se_activa_si_ya_hay_otra_activa(
    entorno: Path, db: Session
) -> None:
    otra = _version(db, entorno / "otra", activa=True)

    inicial = servicio.asegurar_version_inicial(db)

    assert inicial.activa is False
    assert _activa(db).id == otra.id


def test_sin_version_activa_no_se_cambia_el_modelo(db: Session) -> None:
    priorizador = PriorizadorQueCambia()

    servicio.aplicar_version_activa(db, priorizador)

    assert priorizador.cambios == []


def test_sin_archivos_del_modelo_en_uso_no_se_compara(
    entorno: Path, db: Session
) -> None:
    rota = VersionModelo(
        nombre="x", ruta=str(entorno / "nada"), origen="subido", labels=[]
    )
    rara = _version(db, entorno / "rara", labels=["baja"])

    assert Reentrenador._descripcion_modelo_actual(None) is None
    assert Reentrenador._descripcion_modelo_actual(rota) is None
    assert Reentrenador._descripcion_modelo_actual(rara) is None


# ---------------------------------------------------- importar y exportar --
def _activa(db: Session) -> VersionModelo:
    version = servicio.version_activa(db)
    assert version is not None
    return version


def _zip(archivos: dict[str, bytes | str]) -> bytes:
    memoria = io.BytesIO()
    with zipfile.ZipFile(memoria, "w") as z:
        for nombre, contenido in archivos.items():
            z.writestr(nombre, contenido)
    return memoria.getvalue()


def _config(id2label: dict[str, str] | None = None) -> str:
    return json.dumps(
        {"id2label": id2label or {"0": "baja", "1": "media", "2": "alta"}}
    )


def _subir(api: TestClient, contenido: bytes, **campos: str) -> Any:
    return api.post(
        "/api/reentrenamiento/versiones/subir",
        files={"archivo": ("modelo-hospital.zip", contenido, "application/zip")},
        data=campos,
    )


def test_subir_un_modelo_lo_deja_como_version_sin_activar(
    api: TestClient, entorno: Path
) -> None:
    contenido = _zip(
        {
            "modelo/config.json": _config({"0": "alta", "1": "baja", "2": "media"}),
            "modelo/model.safetensors": b"pesos",
            "modelo/tokenizer.json": "{}",
            "modelo/pytorch_model.bin": b"pickle peligroso",
            "../../fuera.txt": b"no",
        }
    )

    respuesta = _subir(api, contenido)

    assert respuesta.status_code == 201, respuesta.text
    version = respuesta.json()
    assert version["origen"] == "subido"
    assert version["activa"] is False
    assert version["nombre"] == "Subido: modelo-hospital"
    assert version["labels"] == ["alta", "baja", "media"]
    assert sorted(p.name for p in Path(version["ruta"]).iterdir()) == [
        "config.json",
        "model.safetensors",
        "tokenizer.json",
    ]
    assert not (entorno / "fuera.txt").exists()


def test_subir_con_clases_genericas_pide_el_orden(api: TestClient) -> None:
    archivos: dict[str, bytes | str] = {
        "config.json": _config({"0": "LABEL_0", "1": "LABEL_1", "2": "LABEL_2"}),
        "model.safetensors": b"pesos",
        "tokenizer_config.json": "{}",
    }

    sin_orden = _subir(api, _zip(archivos))
    con_orden = _subir(
        api, _zip(archivos), orden_clases="media, alta, baja", nombre="Hospital X"
    )

    assert sin_orden.status_code == 422
    assert "orden de clases" in sin_orden.json()["detail"]
    assert con_orden.status_code == 201
    assert con_orden.json()["labels"] == ["media", "alta", "baja"]
    assert con_orden.json()["nombre"] == "Hospital X"


@pytest.mark.parametrize(
    ("archivos", "mensaje"),
    [
        ({"config.json": _config(), "tokenizer.json": "{}"}, "safetensors"),
        ({"config.json": _config(), "model.safetensors": b"x"}, "tokenizer"),
        (
            {
                "config.json": "{no es json",
                "model.safetensors": b"x",
                "tokenizer.json": "{}",
            },
            "JSON",
        ),
        (
            {
                "config.json": _config({"0": "baja", "1": "alta"}),
                "model.safetensors": b"x",
                "tokenizer.json": "{}",
            },
            "2 salidas",
        ),
        (
            {
                "a/config.json": _config(),
                "b/config.json": _config(),
                "model.safetensors": b"x",
                "tokenizer.json": "{}",
            },
            "más de un config.json",
        ),
    ],
)
def test_subir_un_modelo_invalido_se_rechaza(
    api: TestClient, archivos: dict[str, Any], mensaje: str
) -> None:
    respuesta = _subir(api, _zip(archivos))

    assert respuesta.status_code == 422
    assert mensaje in respuesta.json()["detail"]


def test_subir_algo_que_no_es_zip_se_rechaza(api: TestClient) -> None:
    respuesta = _subir(api, b"esto no es un zip")

    assert respuesta.status_code == 422
    assert ".zip" in respuesta.json()["detail"]


def test_subir_un_orden_de_clases_invalido_se_rechaza(api: TestClient) -> None:
    archivos: dict[str, bytes | str] = {
        "config.json": _config(),
        "model.safetensors": b"x",
        "tokenizer.json": "{}",
    }

    respuesta = _subir(api, _zip(archivos), orden_clases="baja,media,urgente")

    assert respuesta.status_code == 422
    assert "urgente" in respuesta.json()["detail"]


def test_subir_un_archivo_demasiado_grande_se_rechaza(
    api: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "modelo_subido_max_mb", 0)
    archivos: dict[str, bytes | str] = {
        "config.json": _config(),
        "model.safetensors": b"x",
        "tokenizer.json": "{}",
    }

    respuesta = _subir(api, _zip(archivos))

    assert respuesta.status_code == 413


def test_un_zip_que_descomprime_demasiado_se_rechaza(tmp_path: Path) -> None:
    contenido = _zip(
        {
            "config.json": _config(),
            "model.safetensors": b"x" * 1000,
            "tokenizer.json": "{}",
        }
    )

    with pytest.raises(servicio.ModeloInvalidoError, match="tamaño máximo"):
        servicio.importar_modelo_zip(
            io.BytesIO(contenido), tmp_path / "m", maximo_bytes=10
        )


def test_descargar_y_volver_a_subir_conserva_el_modelo(
    api: TestClient, db: Session
) -> None:
    inicial = _activa(db)

    descarga = api.get(f"/api/reentrenamiento/versiones/{inicial.id}/descargar")

    assert descarga.status_code == 200
    assert descarga.headers["content-type"] == "application/zip"
    assert "priorizai-modelo-" in descarga.headers["content-disposition"]
    with zipfile.ZipFile(io.BytesIO(descarga.content)) as z:
        assert sorted(z.namelist()) == [
            "config.json",
            "model.safetensors",
            "priorizai.json",
            "tokenizer.json",
        ]
        assert json.loads(z.read("priorizai.json"))["labels"] == [
            "baja",
            "media",
            "alta",
        ]

    # El config trae LABEL_0..2: el orden viaja en priorizai.json.
    resubida = _subir(api, descarga.content)
    assert resubida.status_code == 201, resubida.text
    assert resubida.json()["labels"] == ["baja", "media", "alta"]


def test_descargar_una_version_sin_archivos_es_un_conflicto(
    api: TestClient, entorno: Path, db: Session
) -> None:
    version = VersionModelo(
        nombre="x", ruta=str(entorno / "nada"), origen="subido", labels=[]
    )
    db.add(version)
    db.commit()

    assert (
        api.get(f"/api/reentrenamiento/versiones/{version.id}/descargar").status_code
        == 409
    )
    assert api.get("/api/reentrenamiento/versiones/otra/descargar").status_code == 404


def test_cambio_registrado_apunta_a_la_version(
    api: TestClient, entorno: Path, db: Session
) -> None:
    nueva = _version(db, entorno / "nueva")
    api.post(f"/api/reentrenamiento/versiones/{nueva.id}/activar")

    cambio = db.scalar(select(CambioModelo))

    assert cambio is not None and cambio.version_id == nueva.id


def test_el_arranque_prepara_las_versiones_con_su_propia_sesion(
    entorno: Path,
    session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
    db: Session,
) -> None:
    import app.main as main_module

    priorizador = PriorizadorQueCambia()
    monkeypatch.setattr(main_module, "SessionLocal", session_factory)
    monkeypatch.setattr(main_module, "get_priorizador_local", lambda: priorizador)

    main_module._preparar_versiones_modelo()

    assert _activa(db).origen == "inicial"
    assert priorizador.cambios == [(settings.model_path, ("baja", "media", "alta"))]


# ------------------------------------------------- archivos con datos --
def _archivo_json(filas: list[dict[str, str]], nombre: str = "datos.json") -> Any:
    return {"archivo": (nombre, json.dumps(filas).encode(), "application/json")}


def _filas(por_clase: int = 6, prefijo: str = "archivo") -> list[dict[str, str]]:
    return [
        {"HISTORIA_CLINICA": f"{prefijo} {clase} {i}", "PRIORIDAD": clase}
        for clase in ("baja", "media", "alta")
        for i in range(por_clase)
    ]


def _subir_datos(api: TestClient, filas: list[dict[str, str]]) -> dict[str, Any]:
    respuesta = api.post("/api/reentrenamiento/datos", files=_archivo_json(filas))
    assert respuesta.status_code == 201, respuesta.text
    datos: dict[str, Any] = respuesta.json()
    return datos


def _ruta_datos(db: Session, archivo_id: str) -> Path:
    registro = db.get(ArchivoEntrenamiento, archivo_id)
    assert registro is not None
    return Path(registro.ruta)


@pytest.mark.parametrize(
    ("metodo", "ruta"),
    [
        ("get", "/api/reentrenamiento/datos"),
        ("post", "/api/reentrenamiento/datos"),
        ("delete", "/api/reentrenamiento/datos/a-1"),
    ],
)
def test_un_medico_no_puede_usar_los_archivos(
    client: TestClient, metodo: str, ruta: str
) -> None:
    assert getattr(client, metodo)(ruta).status_code == 403


def test_subir_un_archivo_lo_guarda_en_el_servidor(
    api: TestClient, entorno: Path, db: Session
) -> None:
    filas = [*_filas(por_clase=2), {"HISTORIA_CLINICA": "sin prioridad"}]

    subida = _subir_datos(api, filas)

    archivo = subida["archivo"]
    assert archivo["nombre"] == "datos.json"
    assert archivo["n_registros"] == 6
    assert archivo["registros_por_clase"] == {"baja": 2, "media": 2, "alta": 2}
    assert archivo["n_rechazadas"] == 1
    assert archivo["creado_por"] == USUARIO_ADMIN_PRUEBA.nombre
    assert subida["rechazadas"] == [{"fila": 7, "motivo": "Sin prioridad."}]
    registro = db.get(ArchivoEntrenamiento, archivo["id"])
    assert registro is not None
    assert Path(registro.ruta).parent == entorno / "versiones" / "datos"
    assert len(Path(registro.ruta).read_text(encoding="utf-8").splitlines()) == 6
    assert [a["id"] for a in api.get("/api/reentrenamiento/datos").json()] == [
        archivo["id"]
    ]


def test_subir_un_archivo_sin_filas_validas_se_rechaza(api: TestClient) -> None:
    respuesta = api.post(
        "/api/reentrenamiento/datos",
        files=_archivo_json([{"HISTORIA_CLINICA": "x", "PRIORIDAD": "urgente"}]),
    )

    assert respuesta.status_code == 422
    assert "ninguna interconsulta" in respuesta.json()["detail"]


def test_subir_un_archivo_sin_las_columnas_se_rechaza(api: TestClient) -> None:
    respuesta = api.post(
        "/api/reentrenamiento/datos", files=_archivo_json([{"TEXTO": "x"}])
    )

    assert respuesta.status_code == 422
    assert "PRIORIDAD" in respuesta.json()["detail"]


def test_subir_un_archivo_de_datos_demasiado_grande_se_rechaza(
    api: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "datos_subidos_max_mb", 0)

    respuesta = api.post("/api/reentrenamiento/datos", files=_archivo_json(_filas()))

    assert respuesta.status_code == 413


def test_borrar_un_archivo_quita_sus_datos(api: TestClient, db: Session) -> None:
    archivo = _subir_datos(api, _filas())["archivo"]
    ruta = _ruta_datos(db, archivo["id"])

    respuesta = api.delete(f"/api/reentrenamiento/datos/{archivo['id']}")

    assert respuesta.status_code == 204
    assert not ruta.exists()
    assert api.get("/api/reentrenamiento/datos").json() == []
    assert api.delete(f"/api/reentrenamiento/datos/{archivo['id']}").status_code == 404


def test_se_puede_entrenar_solo_con_un_archivo(
    api: TestClient, reentrenador: Reentrenador, lanzador: Lanzador
) -> None:
    archivo = _subir_datos(api, _filas())["archivo"]
    # Sin revisadas en la app, el resumen no deja iniciar con esa fuente sola,
    # pero nada bloquea reentrenar con otras.
    resumen = api.get("/api/reentrenamiento/resumen").json()
    assert resumen["puede_iniciar"] is False
    assert resumen["bloqueo_general"] is None

    detalle = _terminado(
        api,
        reentrenador,
        lanzador,
        _iniciar(api, usar_revisadas=False, archivos=[archivo["id"]]),
    )

    assert detalle["estado"] == "terminado"
    assert detalle["n_registros"] == 18
    lineas = [
        json.loads(linea)
        for conjunto in ("entrenamiento", "validacion", "evaluacion")
        for linea in Path(lanzador.trabajo[conjunto]).read_text("utf-8").splitlines()
    ]
    assert sorted(e["texto"] for e in lineas) == sorted(
        f["HISTORIA_CLINICA"] for f in _filas()
    )


def test_revisadas_y_archivo_se_suman_sin_repetir(
    api: TestClient,
    reentrenador: Reentrenador,
    lanzador: Lanzador,
    revisadas: Callable[..., None],
    db: Session,
) -> None:
    revisadas(por_clase=6)
    # La primera revisada tambien viene en el archivo: se usa una sola vez.
    repetida = db.get(Interconsulta, "ic-baja-000")
    assert repetida is not None
    filas = [
        *_filas(por_clase=3),
        {
            "ESPEC_ORIGEN": repetida.espec_origen,
            "EDAD": str(repetida.edad),
            "SEXO": repetida.sexo,
            "ESPEC_DESTINO": repetida.espec_destino,
            "HISTORIA_CLINICA": repetida.historia_clinica,
            "FUNDAMENTOS_DIAGNOSTICO": repetida.fundamentos_diagnostico,
            "MOTIVO_INTERCONSULTA": repetida.motivo_interconsulta,
            "PRIORIDAD": "baja",
        },
    ]
    archivo = _subir_datos(api, filas)["archivo"]

    respuesta = _iniciar(api, archivos=[archivo["id"]])

    assert respuesta.json()["n_registros"] == 18 + 9
    assert respuesta.json()["registros_por_clase"] == {"baja": 9, "media": 9, "alta": 9}
    _terminado(api, reentrenador, lanzador, respuesta)


def test_sin_ninguna_fuente_no_se_puede_iniciar(api: TestClient) -> None:
    respuesta = _iniciar(api, usar_revisadas=False)

    assert respuesta.status_code == 422
    assert "Elige con qué datos entrenar" in respuesta.json()["detail"]


def test_un_archivo_que_ya_no_existe_no_se_puede_usar(
    api: TestClient, revisadas: Callable[..., None]
) -> None:
    revisadas()

    respuesta = _iniciar(api, archivos=["no-existe"])

    assert respuesta.status_code == 422
    assert "ya no existe" in respuesta.json()["detail"]


def test_un_archivo_sin_sus_datos_en_disco_avisa(api: TestClient, db: Session) -> None:
    archivo = _subir_datos(api, _filas())["archivo"]
    _ruta_datos(db, archivo["id"]).unlink()

    respuesta = _iniciar(api, usar_revisadas=False, archivos=[archivo["id"]])

    assert respuesta.status_code == 422
    assert "vuelve a subirlo" in respuesta.json()["detail"]
