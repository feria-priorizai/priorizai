"""Reentrenamiento del modelo de priorizacion y sus versiones.

El entrenamiento corre en un proceso aparte (app/entrenamiento/entrenar.py) que
este modulo lanza y sigue en un hilo: lee su salida, guarda el avance y el log
en la base cada pocos segundos y, al terminar, registra un modelo nuevo por
configuracion. Ninguno entra en uso solo: el administrador lo activa.

Como la cola de explicaciones, supone un solo proceso de uvicorn. Si el backend
se reinicia a mitad de un entrenamiento, al volver lo marca como interrumpido.
"""

from __future__ import annotations

import json
import logging
import os
import random
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import zipfile
from collections import Counter, deque
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import IO, Any, Protocol
from uuid import uuid4

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.tiempo import utc_now
from app.entrenamiento.entrenar import PREFIJO_EVENTO
from app.entrenamiento.metricas import CLASES
from app.models.interconsulta import Interconsulta
from app.models.modificacion_prioridad import ModificacionPrioridad
from app.models.reentrenamiento import (
    ArchivoEntrenamiento,
    CambioModelo,
    Reentrenamiento,
    VersionModelo,
)
from app.models.usuario import Usuario
from app.services.datos_entrenamiento import DatosLeidos
from app.services.priorizador import construir_texto, normalizar_clase, resolver_labels

logger = logging.getLogger(__name__)

MAXIMO_CONFIGURACIONES = 3
# Con menos de esto en alguna prioridad no alcanza para tener ejemplos de ella
# en entrenamiento, validacion y evaluacion a la vez.
MINIMO_POR_CLASE = 5
PORCENTAJE_VALIDACION = 10
SEMILLA_DIVISION = 13
LINEAS_DE_LOG = 500
INTERVALO_GUARDADO_S = 2.0

# "El sistema elige por ti": RoBERTa con estos valores.
PARAMETROS_POR_DEFECTO: dict[str, Any] = {
    "epocas": 4,
    "learning_rate": 2e-5,
    "batch_size": 16,
    "max_length": 256,
    "paciencia": 2,
}

# Lo unico que se acepta (y se entrega) de un modelo. Solo pesos .safetensors:
# un .bin de PyTorch es un pickle y cargarlo puede ejecutar codigo arbitrario.
ARCHIVOS_MODELO = frozenset(
    {
        "config.json",
        "model.safetensors",
        "tokenizer.json",
        "tokenizer_config.json",
        "special_tokens_map.json",
        "added_tokens.json",
        "vocab.json",
        "vocab.txt",
        "merges.txt",
        "sentencepiece.bpe.model",
    }
)
ARCHIVOS_OBLIGATORIOS = frozenset({"config.json", "model.safetensors"})
ARCHIVOS_TOKENIZER = frozenset({"tokenizer.json", "tokenizer_config.json"})
# Va dentro del zip que se descarga: lleva el orden de clases y las metricas,
# para que otro servidor pueda importar el modelo sin preguntar nada.
METADATOS_ZIP = "priorizai.json"

RAIZ_BACKEND = Path(__file__).resolve().parents[2]


class ReentrenamientoError(Exception):
    """Base de los errores que la API traduce a una respuesta."""


class ConflictoError(ReentrenamientoError):
    """Hay un reentrenamiento en curso, la version ya esta en uso, etc."""


class DatosInsuficientesError(ReentrenamientoError):
    pass


class ModeloInvalidoError(ReentrenamientoError):
    pass


# ------------------------------------------------------------------ datos --
def _condicion_revisadas() -> Any:
    """Interconsultas cuya prioridad confirmo (estado revisada) o corrigio
    (tiene una modificacion) un medico. Una prioridad que solo puso el modelo
    o una bandera roja no se usa: el modelo aprenderia de si mismo."""
    corregidas = select(ModificacionPrioridad.interconsulta_id)
    return or_(Interconsulta.estado == "revisada", Interconsulta.id.in_(corregidas))


def _etiqueta(prioridad: str | None) -> str | None:
    if prioridad is None:
        return None
    clase = normalizar_clase(prioridad)
    return clase if clase in CLASES else None


def contar_disponibles(db: Session) -> dict[str, int]:
    prioridades = db.scalars(
        select(Interconsulta.prioridad_actual).where(_condicion_revisadas())
    )
    conteo = Counter(_etiqueta(p) for p in prioridades)
    return {clase: conteo.get(clase, 0) for clase in CLASES}


def ejemplos_revisadas(db: Session) -> list[dict[str, str]]:
    ejemplos = []
    for interconsulta in db.scalars(
        select(Interconsulta).where(_condicion_revisadas()).order_by(Interconsulta.id)
    ):
        etiqueta = _etiqueta(interconsulta.prioridad_actual)
        if etiqueta is not None:
            ejemplos.append(
                {"texto": construir_texto(interconsulta), "etiqueta": etiqueta}
            )
    return ejemplos


def ejemplos_para_entrenar(
    db: Session,
    usar_revisadas: bool = True,
    archivos: Iterable[ArchivoEntrenamiento] = (),
) -> list[dict[str, str]]:
    """Junta las fuentes elegidas. Lo que ya vino en una fuente anterior (la
    misma interconsulta revisada en la app y en un archivo) no se vuelve a
    sumar: si quedara en entrenamiento y en evaluacion, las metricas saldrian
    infladas. Dentro de una misma fuente no se toca nada, como hasta ahora."""
    fuentes = [ejemplos_revisadas(db)] if usar_revisadas else []
    fuentes += [leer_ejemplos_archivo(archivo) for archivo in archivos]
    vistos: set[str] = set()
    ejemplos = []
    for fuente in fuentes:
        # Sin importar espacios: construir_texto deja dos seguidos cuando un
        # campo viene vacio, y el texto de un archivo llega sin ellos.
        claves = [" ".join(ejemplo["texto"].split()) for ejemplo in fuente]
        ejemplos += [e for e, c in zip(fuente, claves, strict=True) if c not in vistos]
        vistos.update(claves)
    return ejemplos


def motivo_bloqueo(por_clase: dict[str, int], minimo: int) -> str | None:
    total = sum(por_clase.values())
    if total < minimo:
        return (
            f"Hay {total} interconsultas con prioridad para entrenar y se "
            f"necesitan al menos {minimo}."
        )
    escasas = [c for c in CLASES if por_clase.get(c, 0) < MINIMO_POR_CLASE]
    if escasas:
        return (
            f"Se necesitan al menos {MINIMO_POR_CLASE} interconsultas de cada "
            f"prioridad. Faltan de: {', '.join(escasas)}."
        )
    return None


# ---------------------------------------------------- archivos con datos --
def carpeta_archivos() -> Path:
    return Path(settings.modelos_versiones_dir) / "datos"


def guardar_archivo(
    db: Session, nombre: str, datos: DatosLeidos, usuario: Usuario
) -> ArchivoEntrenamiento:
    """Deja los ejemplos en el disco del servidor, como los modelos: los datos
    del hospital no salen de ahi."""
    if not datos.ejemplos:
        raise DatosInsuficientesError(
            "El archivo no trae ninguna interconsulta con prioridad válida."
        )
    archivo_id = str(uuid4())
    ruta = carpeta_archivos() / f"{archivo_id}.jsonl"
    ruta.parent.mkdir(parents=True, exist_ok=True)
    _escribir_jsonl(ruta, datos.ejemplos)
    archivo = ArchivoEntrenamiento(
        id=archivo_id,
        nombre=nombre[:255],
        ruta=str(ruta),
        n_registros=len(datos.ejemplos),
        registros_por_clase=datos.por_clase,
        n_rechazadas=datos.n_rechazadas,
        creado_por=usuario.nombre,
    )
    db.add(archivo)
    db.commit()
    return archivo


def leer_ejemplos_archivo(archivo: ArchivoEntrenamiento) -> list[dict[str, str]]:
    ruta = Path(archivo.ruta)
    if not ruta.is_file():
        raise DatosInsuficientesError(
            f"No se encuentran los datos de «{archivo.nombre}» en el servidor. "
            "Bórralo y vuelve a subirlo."
        )
    with ruta.open(encoding="utf-8") as lineas:
        return [json.loads(linea) for linea in lineas if linea.strip()]


def eliminar_archivo(db: Session, archivo: ArchivoEntrenamiento) -> None:
    Path(archivo.ruta).unlink(missing_ok=True)
    db.delete(archivo)
    db.commit()


def buscar_archivos(db: Session, ids: Iterable[str]) -> list[ArchivoEntrenamiento]:
    pedidos = list(dict.fromkeys(ids))
    archivos = {
        a.id: a
        for a in db.scalars(
            select(ArchivoEntrenamiento).where(ArchivoEntrenamiento.id.in_(pedidos))
        )
    }
    if len(archivos) != len(pedidos):
        raise DatosInsuficientesError(
            "Uno de los archivos elegidos ya no existe. Recarga la página."
        )
    return [archivos[i] for i in pedidos]


def dividir_estratificado(
    ejemplos: list[dict[str, str]],
    porcentaje_evaluacion: int,
    porcentaje_validacion: int = PORCENTAJE_VALIDACION,
    semilla: int = SEMILLA_DIVISION,
) -> tuple[list[dict[str, str]], list[dict[str, str]], list[dict[str, str]]]:
    """Separa entrenamiento, validacion (para quedarse con la mejor epoca) y
    evaluacion (para comparar con el modelo en uso), con la misma proporcion
    de cada prioridad en las tres."""
    azar = random.Random(semilla)
    entrenamiento: list[dict[str, str]] = []
    validacion: list[dict[str, str]] = []
    evaluacion: list[dict[str, str]] = []
    for clase in CLASES:
        grupo = [e for e in ejemplos if e["etiqueta"] == clase]
        azar.shuffle(grupo)
        n_eval = max(1, round(len(grupo) * porcentaje_evaluacion / 100))
        resto = len(grupo) - n_eval
        n_val = max(1, round(resto * porcentaje_validacion / 100))
        evaluacion += grupo[:n_eval]
        validacion += grupo[n_eval : n_eval + n_val]
        entrenamiento += grupo[n_eval + n_val :]
    for conjunto in (entrenamiento, validacion, evaluacion):
        azar.shuffle(conjunto)
    return entrenamiento, validacion, evaluacion


def _escribir_jsonl(ruta: Path, ejemplos: Iterable[dict[str, str]]) -> None:
    with ruta.open("w", encoding="utf-8") as archivo:
        for ejemplo in ejemplos:
            archivo.write(json.dumps(ejemplo, ensure_ascii=False) + "\n")


def gpu_disponible() -> bool:
    try:
        import torch
    except ImportError:  # pragma: no cover - el backend siempre trae torch
        return False
    return bool(torch.cuda.is_available())


# -------------------------------------------------------------- versiones --
def version_activa(db: Session) -> VersionModelo | None:
    return db.scalar(select(VersionModelo).where(VersionModelo.activa.is_(True)))


def asegurar_version_inicial(db: Session) -> VersionModelo:
    """Registra el modelo de MODEL_PATH como version inicial, y la mantiene al
    dia si MODEL_PATH o MODEL_LABELS cambian entre despliegues."""
    inicial = db.scalar(select(VersionModelo).where(VersionModelo.origen == "inicial"))
    if inicial is None:
        inicial = VersionModelo(
            nombre="Modelo inicial",
            origen="inicial",
            ruta=settings.model_path,
            labels=list(settings.model_labels),
            activa=version_activa(db) is None,
            creado_por="Sistema",
        )
        db.add(inicial)
    else:
        inicial.ruta = settings.model_path
        inicial.labels = list(settings.model_labels)
    db.commit()
    return inicial


def labels_de_version(version: VersionModelo) -> list[str]:
    """Orden de clases resuelto leyendo solo config.json, sin cargar pesos."""
    config = json.loads((Path(version.ruta) / "config.json").read_text("utf-8"))
    id2label = config.get("id2label") or {}
    num_labels = len(id2label) or int(config.get("num_labels", len(CLASES)))
    return resolver_labels(num_labels, id2label, tuple(version.labels))


def modelo_presente(version: VersionModelo) -> bool:
    return (Path(version.ruta) / "config.json").is_file()


class PriorizadorIntercambiable(Protocol):
    def usar_modelo(self, path: str, labels: tuple[str, ...]) -> None: ...


def aplicar_version_activa(db: Session, priorizador: PriorizadorIntercambiable) -> None:
    activa = version_activa(db)
    if activa is not None:
        priorizador.usar_modelo(activa.ruta, tuple(activa.labels))


def activar_version(
    db: Session,
    version: VersionModelo,
    usuario: Usuario,
    priorizador: PriorizadorIntercambiable,
) -> CambioModelo:
    """Pone una version en uso. Las interconsultas ya priorizadas no se tocan:
    el modelo nuevo solo prioriza lo que llegue despues."""
    anterior = version_activa(db)
    if anterior is not None and anterior.id == version.id:
        raise ConflictoError("Esa versión ya es la que está en uso.")
    if not modelo_presente(version):
        raise ConflictoError(
            f"No se encuentran los archivos del modelo en {version.ruta}."
        )
    try:
        labels_de_version(version)
    except ValueError as error:
        raise ConflictoError(f"El modelo no se puede usar: {error}") from error

    accion = (
        "revertir"
        if anterior is not None and version.created_at < anterior.created_at
        else "activar"
    )
    if anterior is not None:
        anterior.activa = False
        # Sin este flush, el UPDATE de la nueva podria salir antes y dejar dos
        # activas un instante.
        db.flush()
    version.activa = True
    cambio = CambioModelo(
        version_id=version.id,
        version_anterior_id=anterior.id if anterior else None,
        accion=accion,
        usuario=usuario.nombre,
    )
    db.add(cambio)
    db.commit()
    priorizador.usar_modelo(version.ruta, tuple(version.labels))
    return cambio


# ------------------------------------------------------- importar/exportar --
def importar_modelo_zip(
    archivo: IO[bytes],
    destino: Path,
    orden_clases: tuple[str, ...] = (),
    maximo_bytes: int | None = None,
) -> list[str]:
    """Extrae un modelo subido por el administrador y devuelve su orden de
    clases. Solo se escriben los archivos conocidos y por su nombre base, asi
    que un zip con rutas como ../../algo no puede salir de `destino`."""
    try:
        zip_modelo = zipfile.ZipFile(archivo)
    except zipfile.BadZipFile as error:
        raise ModeloInvalidoError("El archivo no es un .zip válido.") from error

    with zip_modelo:
        entradas: dict[str, zipfile.ZipInfo] = {}
        for info in zip_modelo.infolist():
            nombre = PurePosixPath(info.filename).name
            if info.is_dir() or nombre not in ARCHIVOS_MODELO | {METADATOS_ZIP}:
                continue
            if nombre in entradas:
                raise ModeloInvalidoError(f"El .zip trae más de un {nombre}.")
            entradas[nombre] = info

        faltan = sorted(ARCHIVOS_OBLIGATORIOS - entradas.keys())
        if faltan:
            raise ModeloInvalidoError(
                f"Al modelo le faltan archivos: {', '.join(faltan)}. Se aceptan "
                "solo pesos en formato .safetensors."
            )
        if not ARCHIVOS_TOKENIZER & entradas.keys():
            raise ModeloInvalidoError(
                "Al modelo le falta el tokenizer (tokenizer.json o tokenizer_config.json)."
            )
        tamano = sum(info.file_size for info in entradas.values())
        if maximo_bytes is not None and tamano > maximo_bytes:
            raise ModeloInvalidoError(
                "El modelo descomprimido supera el tamaño máximo permitido."
            )

        try:
            config = json.loads(zip_modelo.read(entradas["config.json"]))
            metadatos = (
                json.loads(zip_modelo.read(entradas[METADATOS_ZIP]))
                if METADATOS_ZIP in entradas
                else {}
            )
        except ValueError as error:
            raise ModeloInvalidoError("config.json no es un JSON válido.") from error

        labels = _labels_del_modelo_subido(config, orden_clases, metadatos)

        destino.mkdir(parents=True, exist_ok=False)
        for nombre, info in entradas.items():
            if nombre == METADATOS_ZIP:
                continue
            with (
                zip_modelo.open(info) as origen,
                (destino / nombre).open("wb") as salida,
            ):
                shutil.copyfileobj(origen, salida)
    return labels


def _labels_del_modelo_subido(
    config: dict[str, Any],
    orden_clases: tuple[str, ...],
    metadatos: dict[str, Any],
) -> list[str]:
    id2label = config.get("id2label") or {}
    num_labels = len(id2label) or int(config.get("num_labels", 0))
    if num_labels != len(CLASES):
        raise ModeloInvalidoError(
            f"El modelo tiene {num_labels} salidas y la app prioriza en "
            f"{len(CLASES)} (baja, media y alta)."
        )
    configurados = orden_clases or tuple(metadatos.get("labels") or ())
    declarados = [normalizar_clase(str(v)) for v in id2label.values()]
    if not configurados and sorted(declarados) != sorted(CLASES):
        # resolver_labels caeria a un orden supuesto: con un modelo ajeno es
        # mejor preguntar que arriesgar todas las prioridades al reves.
        raise ModeloInvalidoError(
            "El modelo no declara a qué prioridad corresponde cada salida "
            "(id2label). Indica el orden de clases, por ejemplo: baja,media,alta."
        )
    try:
        return resolver_labels(num_labels, id2label, configurados)
    except ValueError as error:
        raise ModeloInvalidoError(str(error)) from error


def empaquetar_version(version: VersionModelo) -> Path:
    """Zip del modelo para llevarlo a otro servidor. Sin compresion: los pesos
    casi no se comprimen y armarlo seria mucho mas lento."""
    carpeta = Path(version.ruta)
    archivos = (
        sorted(p for p in carpeta.iterdir() if p.name in ARCHIVOS_MODELO)
        if carpeta.is_dir()
        else []
    )
    if not any(p.name == "config.json" for p in archivos):
        raise ConflictoError(
            f"No se encuentran los archivos del modelo en {version.ruta}."
        )
    descriptor, ruta = tempfile.mkstemp(suffix=".zip", prefix="priorizai-modelo-")
    os.close(descriptor)
    with zipfile.ZipFile(ruta, "w", compression=zipfile.ZIP_STORED) as zip_modelo:
        for archivo in archivos:
            zip_modelo.write(archivo, archivo.name)
        zip_modelo.writestr(
            METADATOS_ZIP,
            json.dumps(
                {
                    "nombre": version.nombre,
                    "labels": labels_de_version(version),
                    "metricas": version.metricas,
                    "parametros": version.parametros,
                },
                ensure_ascii=False,
                indent=2,
            ),
        )
    return Path(ruta)


# ------------------------------------------------------------ ejecucion --
class Proceso(Protocol):
    @property
    def stdout(self) -> Iterable[str] | None: ...

    def wait(self) -> int: ...

    def terminate(self) -> None: ...


Lanzador = Callable[[Path, str], Proceso]


def lanzar_proceso(ruta_trabajo: Path, dispositivo: str) -> Proceso:
    entorno = os.environ.copy()
    entorno["PYTHONUNBUFFERED"] = "1"
    entorno["TOKENIZERS_PARALLELISM"] = "false"
    # Las barras de progreso de Hugging Face reescriben la linea con retornos de
    # carro: en un log que se lee despues son solo ruido.
    entorno["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
    # El reporte de pesos nuevos al cargar la base (la capa de clasificacion
    # siempre "falta") no le dice nada a un administrador. Los errores igual
    # salen.
    entorno.setdefault("TRANSFORMERS_VERBOSITY", "error")
    if dispositivo == "cpu":
        # Que el proceso ni vea la GPU: asi "CPU" es CPU aunque haya una.
        entorno["CUDA_VISIBLE_DEVICES"] = ""
    return subprocess.Popen(
        [sys.executable, "-m", "app.entrenamiento.entrenar", str(ruta_trabajo)],
        cwd=RAIZ_BACKEND,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        env=entorno,
    )


@dataclass
class _Ejecucion:
    id: str
    proceso: Proceso
    carpeta: Path
    configuraciones: list[dict[str, Any]]
    log: deque[str] = field(default_factory=lambda: deque(maxlen=LINEAS_DE_LOG))
    progreso: dict[str, Any] | None = None
    metricas_actual: dict[str, Any] | None = None
    resultados: dict[int, dict[str, Any]] = field(default_factory=dict)
    error: str | None = None
    cancelado_por: str | None = None
    hilo: threading.Thread | None = None


class Reentrenador:
    def __init__(
        self,
        fabrica_sesiones: Callable[[], Session] | None = None,
        lanzar: Lanzador = lanzar_proceso,
    ) -> None:
        self._fabrica = fabrica_sesiones
        self._lanzar = lanzar
        self._lock = threading.Lock()
        self._ejecucion: _Ejecucion | None = None

    def _sesion(self) -> Session:
        if self._fabrica is not None:
            return self._fabrica()
        from app.core.database import SessionLocal

        return SessionLocal()

    def en_curso(self) -> str | None:
        ejecucion = self._ejecucion
        return ejecucion.id if ejecucion else None

    # --------------------------------------------------------------- API --
    def iniciar(
        self,
        db: Session,
        usuario: Usuario,
        *,
        dispositivo: str,
        automatico: bool,
        porcentaje_evaluacion: int,
        configuraciones: list[dict[str, Any]],
        usar_revisadas: bool = True,
        archivos_ids: Iterable[str] = (),
    ) -> Reentrenamiento:
        with self._lock:
            if self._ejecucion is not None or db.scalar(
                select(Reentrenamiento.id).where(Reentrenamiento.estado == "en_curso")
            ):
                raise ConflictoError(
                    "Ya hay un reentrenamiento en curso. Espera a que termine o cancélalo."
                )
            if dispositivo == "gpu" and not gpu_disponible():
                raise ConflictoError(
                    "Este servidor no tiene una GPU disponible. Elige CPU."
                )
            if automatico:
                configuraciones = [dict(PARAMETROS_POR_DEFECTO)]
            if not 1 <= len(configuraciones) <= MAXIMO_CONFIGURACIONES:
                raise DatosInsuficientesError(
                    f"Elige entre 1 y {MAXIMO_CONFIGURACIONES} configuraciones."
                )

            archivos = buscar_archivos(db, archivos_ids)
            if not usar_revisadas and not archivos:
                raise DatosInsuficientesError(
                    "Elige con qué datos entrenar: las interconsultas revisadas en "
                    "la app, uno o más archivos, o ambos."
                )
            ejemplos = ejemplos_para_entrenar(db, usar_revisadas, archivos)
            por_clase = Counter(e["etiqueta"] for e in ejemplos)
            conteo = {clase: por_clase.get(clase, 0) for clase in CLASES}
            motivo = motivo_bloqueo(conteo, settings.reentrenamiento_minimo)
            if motivo:
                raise DatosInsuficientesError(motivo)

            entrenamiento, validacion, evaluacion = dividir_estratificado(
                ejemplos, porcentaje_evaluacion
            )
            activa = version_activa(db)
            registro = Reentrenamiento(
                id=str(uuid4()),
                estado="en_curso",
                dispositivo=dispositivo,
                automatico=automatico,
                configuraciones=configuraciones,
                porcentaje_evaluacion=porcentaje_evaluacion,
                n_registros=len(ejemplos),
                registros_por_clase=conteo,
                n_evaluacion=len(evaluacion),
                version_base_id=activa.id if activa else None,
                progreso={"etapa": "Preparando", "porcentaje": 0.0},
                iniciado_por=usuario.nombre,
            )

            carpeta = Path(settings.modelos_versiones_dir) / registro.id
            trabajo_dir = carpeta / "trabajo"
            trabajo_dir.mkdir(parents=True)
            for nombre, conjunto in (
                ("entrenamiento", entrenamiento),
                ("validacion", validacion),
                ("evaluacion", evaluacion),
            ):
                _escribir_jsonl(trabajo_dir / f"{nombre}.jsonl", conjunto)
            trabajo: dict[str, Any] = {
                "modelo_base": settings.reentrenamiento_modelo_base,
                "dispositivo": dispositivo,
                "entrenamiento": str(trabajo_dir / "entrenamiento.jsonl"),
                "validacion": str(trabajo_dir / "validacion.jsonl"),
                "evaluacion": str(trabajo_dir / "evaluacion.jsonl"),
                "modelo_actual": self._descripcion_modelo_actual(activa),
                "configuraciones": [
                    {**config, "salida": str(carpeta / f"configuracion_{i + 1}")}
                    for i, config in enumerate(configuraciones)
                ],
            }
            ruta_trabajo = trabajo_dir / "trabajo.json"
            ruta_trabajo.write_text(
                json.dumps(trabajo, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            db.add(registro)
            db.commit()
            # Se lee entero ahora: desde que arranca el hilo, la fila la escribe
            # el, y la respuesta no debe ir a la base a buscarla a medias.
            db.refresh(registro)

            try:
                proceso = self._lanzar(ruta_trabajo, dispositivo)
            except OSError as error:
                registro.estado = "error"
                registro.error = f"No se pudo lanzar el entrenamiento: {error}"
                registro.terminado_en = utc_now()
                db.commit()
                return registro

            ejecucion = _Ejecucion(
                id=registro.id,
                proceso=proceso,
                carpeta=carpeta,
                configuraciones=trabajo["configuraciones"],
            )
            ejecucion.hilo = threading.Thread(
                target=self._seguir,
                args=(ejecucion,),
                name="reentrenamiento",
                daemon=True,
            )
            self._ejecucion = ejecucion
            ejecucion.hilo.start()
            return registro

    def cancelar(self, db: Session, reentrenamiento_id: str, usuario: Usuario) -> None:
        ejecucion = self._ejecucion
        if ejecucion is not None and ejecucion.id == reentrenamiento_id:
            ejecucion.cancelado_por = usuario.nombre
            ejecucion.proceso.terminate()
            return
        registro = db.get(Reentrenamiento, reentrenamiento_id)
        if registro is None or registro.estado != "en_curso":
            raise ConflictoError("Ese reentrenamiento no está en curso.")
        # Quedo "en curso" sin proceso detras (un reinicio a medias).
        registro.estado = "cancelado"
        registro.error = f"Cancelado por {usuario.nombre}"
        registro.terminado_en = utc_now()
        db.commit()

    def esperar(self, timeout: float | None = None) -> None:
        """Bloquea hasta que termine el reentrenamiento en curso (tests)."""
        ejecucion = self._ejecucion
        if ejecucion is not None and ejecucion.hilo is not None:
            ejecucion.hilo.join(timeout)

    # -------------------------------------------------------- internos --
    @staticmethod
    def _descripcion_modelo_actual(
        activa: VersionModelo | None,
    ) -> dict[str, Any] | None:
        if activa is None or not modelo_presente(activa):
            return None
        try:
            labels = labels_de_version(activa)
        except ValueError:
            logger.warning("No se pudo resolver el orden de clases de %s", activa.ruta)
            return None
        return {
            "ruta": activa.ruta,
            "labels": labels,
            "max_length": settings.model_max_length,
            "batch_size": settings.model_batch_size,
        }

    def _seguir(self, ejecucion: _Ejecucion) -> None:
        codigo = -1
        ruta_log = ejecucion.carpeta / "trabajo" / "log.txt"
        try:
            ultimo_guardado = time.monotonic()
            with ruta_log.open("a", encoding="utf-8") as log_completo:
                for linea in ejecucion.proceso.stdout or ():
                    linea = linea.rstrip("\r\n")
                    self._procesar_linea(ejecucion, linea, log_completo)
                    if time.monotonic() - ultimo_guardado >= INTERVALO_GUARDADO_S:
                        self._guardar_avance(ejecucion)
                        ultimo_guardado = time.monotonic()
            codigo = ejecucion.proceso.wait()
        except Exception as error:
            logger.exception("Fallo siguiendo el reentrenamiento %s", ejecucion.id)
            ejecucion.error = ejecucion.error or f"Error interno: {error}"
        finally:
            try:
                self._finalizar(ejecucion, codigo)
            except Exception:
                logger.exception(
                    "No se pudo cerrar el reentrenamiento %s", ejecucion.id
                )
            finally:
                self._ejecucion = None

    @staticmethod
    def _procesar_linea(
        ejecucion: _Ejecucion, linea: str, log_completo: IO[str]
    ) -> None:
        if linea.startswith(PREFIJO_EVENTO):
            try:
                evento = json.loads(linea[len(PREFIJO_EVENTO) :])
            except ValueError:
                evento = None
            if isinstance(evento, dict):
                tipo = evento.pop("tipo", None)
                if tipo == "progreso":
                    ejecucion.progreso = evento
                elif tipo == "modelo_actual":
                    ejecucion.metricas_actual = evento.get("metricas")
                elif tipo == "resultado":
                    ejecucion.resultados[int(evento["indice"])] = evento
                elif tipo == "error":
                    ejecucion.error = str(evento.get("mensaje") or "Error desconocido")
                return
        ejecucion.log.append(linea)
        log_completo.write(linea + "\n")

    def _guardar_avance(self, ejecucion: _Ejecucion) -> None:
        with self._sesion() as db:
            registro = db.get(Reentrenamiento, ejecucion.id)
            if registro is None:
                return
            registro.progreso = ejecucion.progreso
            registro.log = "\n".join(ejecucion.log)
            db.commit()

    def _finalizar(self, ejecucion: _Ejecucion, codigo: int) -> None:
        with self._sesion() as db:
            registro = db.get(Reentrenamiento, ejecucion.id)
            if registro is None:
                return
            registro.log = "\n".join(ejecucion.log)
            registro.progreso = ejecucion.progreso
            registro.terminado_en = utc_now()
            completo = len(ejecucion.resultados) == len(ejecucion.configuraciones)

            if ejecucion.cancelado_por is not None:
                registro.estado = "cancelado"
                registro.error = f"Cancelado por {ejecucion.cancelado_por}"
            elif codigo == 0 and completo:
                registro.estado = "terminado"
                registro.resultados = self._registrar_versiones(db, registro, ejecucion)
            else:
                registro.estado = "error"
                registro.error = ejecucion.error or (
                    f"El entrenamiento terminó con código {codigo} sin entregar "
                    "todos sus resultados. Revisa el log."
                )

            if registro.estado != "terminado":
                # Los pesos a medio entrenar no sirven y pesan cientos de MB.
                for config in ejecucion.configuraciones:
                    shutil.rmtree(config["salida"], ignore_errors=True)
            db.commit()

    @staticmethod
    def _registrar_versiones(
        db: Session, registro: Reentrenamiento, ejecucion: _Ejecucion
    ) -> dict[str, Any]:
        # Numero correlativo y no la hora: created_at esta en UTC y la pantalla
        # muestra la hora de Chile, asi que una hora en el nombre no calzaria.
        numero = db.scalar(
            select(func.count())
            .select_from(Reentrenamiento)
            .where(Reentrenamiento.created_at <= registro.created_at)
        )
        total = len(ejecucion.configuraciones)
        configuraciones = []
        for indice, config in enumerate(ejecucion.configuraciones):
            resultado = ejecucion.resultados[indice]
            parametros = {k: v for k, v in config.items() if k != "salida"}
            version = VersionModelo(
                id=str(uuid4()),
                nombre=(
                    f"Reentrenamiento {numero}"
                    + (f" · entrenamiento {indice + 1}" if total > 1 else "")
                ),
                ruta=config["salida"],
                origen="reentrenamiento",
                labels=list(CLASES),
                metricas=resultado.get("metricas"),
                parametros={
                    **parametros,
                    "mejor_epoca": resultado.get("mejor_epoca"),
                    "epocas_corridas": resultado.get("epocas_corridas"),
                    "dispositivo": registro.dispositivo,
                },
                n_registros=registro.n_registros,
                reentrenamiento_id=registro.id,
                creado_por=registro.iniciado_por,
            )
            db.add(version)
            configuraciones.append(
                {
                    "indice": indice,
                    "version_id": version.id,
                    "parametros": parametros,
                    "metricas": resultado.get("metricas"),
                    "mejor_epoca": resultado.get("mejor_epoca"),
                    "epocas_corridas": resultado.get("epocas_corridas"),
                }
            )
        return {
            "modelo_actual": ejecucion.metricas_actual,
            "configuraciones": configuraciones,
        }


def marcar_interrumpidos(db: Session) -> int:
    """Al arrancar: lo que quedo "en curso" murio con el proceso anterior."""
    interrumpidos = list(
        db.scalars(select(Reentrenamiento).where(Reentrenamiento.estado == "en_curso"))
    )
    for registro in interrumpidos:
        registro.estado = "error"
        registro.error = (
            "El backend se reinició durante el reentrenamiento. Vuelve a lanzarlo."
        )
        registro.terminado_en = utc_now()
    db.commit()
    return len(interrumpidos)


def preparar(db: Session, priorizador: PriorizadorIntercambiable) -> None:
    """Arranque: version inicial registrada, modelo activo cargado y
    entrenamientos colgados cerrados."""
    asegurar_version_inicial(db)
    aplicar_version_activa(db, priorizador)
    marcar_interrumpidos(db)


reentrenador = Reentrenador()


def get_reentrenador() -> Reentrenador:
    return reentrenador


def get_priorizador_local() -> PriorizadorIntercambiable:
    """El priorizador en proceso, que es el que cambia de modelo. Con un
    servicio de modelos externo, activar una version no le llega."""
    from app.services.priorizador import priorizador

    return priorizador
