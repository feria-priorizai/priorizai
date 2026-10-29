"""Lectura de archivos con interconsultas ya priorizadas para reentrenar.

Acepta .csv, .xlsx y .json. Cada fila se convierte en un ejemplo con el mismo
texto que arma la app para una interconsulta (construir_texto), asi el modelo
aprende con datos del archivo lo mismo que veria al priorizar.

Ademas de las columnas de la carga de la app (ESPEC_ORIGEN, ..., PRIORIDAD)
reconoce los nombres de los datos sinteticos del equipo (especialidad_origen,
diagnostico_primario, ...). Solo PRIORIDAD e HISTORIA_CLINICA son obligatorias.
"""

from __future__ import annotations

import csv
import io
import json
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from openpyxl import load_workbook

from app.entrenamiento.metricas import CLASES
from app.models.interconsulta import Interconsulta
from app.services.priorizador import construir_texto, normalizar_clase

EXTENSIONES = (".csv", ".xlsx", ".json")
MAXIMO_FILAS = 200_000
# Se informan solo las primeras: con un archivo mal armado serian miles.
MAXIMO_RECHAZOS_DETALLE = 20

COLUMNA_PRIORIDAD = "PRIORIDAD"
COLUMNAS_OBLIGATORIAS = (COLUMNA_PRIORIDAD, "HISTORIA_CLINICA")
ALIAS_COLUMNAS = {
    "ESPECIALIDAD_ORIGEN": "ESPEC_ORIGEN",
    "ESPECIALIDAD_DESTINO": "ESPEC_DESTINO",
    "DIAGNOSTICO": "FUNDAMENTOS_DIAGNOSTICO",
    "DIAGNOSTICO_PRIMARIO": "FUNDAMENTOS_DIAGNOSTICO",
    "FUNDAMENTO_DIAGNOSTICO": "FUNDAMENTOS_DIAGNOSTICO",
    "EXAMENES": "EXAMENES_COMPLEMENTARIOS",
    "MOTIVO": "MOTIVO_INTERCONSULTA",
    "PRIORIDAD_ACTUAL": COLUMNA_PRIORIDAD,
    "ETIQUETA": COLUMNA_PRIORIDAD,
}


class ArchivoDatosInvalidoError(Exception):
    """El archivo no se puede leer o no trae las columnas necesarias."""


@dataclass
class DatosLeidos:
    ejemplos: list[dict[str, str]]
    rechazadas: list[dict[str, Any]] = field(default_factory=list)
    n_rechazadas: int = 0

    @property
    def por_clase(self) -> dict[str, int]:
        conteo = Counter(e["etiqueta"] for e in self.ejemplos)
        return {clase: conteo.get(clase, 0) for clase in CLASES}


def _normalizar_columna(nombre: object) -> str:
    texto = unicodedata.normalize("NFKD", str(nombre or ""))
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = "_".join(texto.replace("-", " ").upper().split())
    return ALIAS_COLUMNAS.get(texto, texto)


def _valor(valor: object) -> str:
    if valor is None:
        return ""
    if isinstance(valor, float) and valor.is_integer():
        valor = int(valor)
    return str(valor).replace("﻿", "").replace("\xa0", " ").strip()


# ---------------------------------------------------------------- lectura --
def _filas_csv(contenido: bytes) -> list[dict[str, object]]:
    try:
        texto = contenido.decode("utf-8-sig")
    except UnicodeDecodeError:
        # Excel en Windows guarda los CSV en cp1252 si no se le pide UTF-8.
        texto = contenido.decode("cp1252", errors="replace")
    try:
        dialecto: Any = csv.Sniffer().sniff(texto[:4096], delimiters=",;\t")
    except csv.Error:
        dialecto = csv.excel
    try:
        return list(csv.DictReader(io.StringIO(texto), dialect=dialecto))
    except csv.Error as error:
        raise ArchivoDatosInvalidoError(f"No se pudo leer el CSV: {error}") from error


def _filas_xlsx(contenido: bytes) -> list[dict[str, object]]:
    try:
        libro = load_workbook(io.BytesIO(contenido), read_only=True, data_only=True)
    except Exception as error:
        raise ArchivoDatosInvalidoError(f"No se pudo leer el XLSX: {error}") from error
    filas = libro.active.iter_rows(values_only=True)
    encabezado = next(filas, None)
    if encabezado is None:
        return []
    return [dict(zip(encabezado, fila, strict=False)) for fila in filas]


def _filas_json(contenido: bytes) -> list[dict[str, object]]:
    try:
        datos = json.loads(contenido.decode("utf-8-sig"))
    except (UnicodeDecodeError, ValueError) as error:
        raise ArchivoDatosInvalidoError("El archivo no es un JSON válido.") from error
    if isinstance(datos, dict):
        # {"interconsultas": [...]} o cualquier objeto con una sola lista.
        listas = [v for v in datos.values() if isinstance(v, list)]
        datos = listas[0] if len(listas) == 1 else None
    if not isinstance(datos, list) or not all(isinstance(f, dict) for f in datos):
        raise ArchivoDatosInvalidoError(
            "El JSON debe ser una lista de interconsultas, cada una un objeto con "
            "sus campos (o un objeto con esa lista adentro)."
        )
    return datos


def leer_archivo(nombre: str, contenido: bytes) -> DatosLeidos:
    extension = nombre.lower().rsplit(".", 1)[-1] if "." in nombre else ""
    lectores = {"csv": _filas_csv, "xlsx": _filas_xlsx, "json": _filas_json}
    if extension not in lectores:
        raise ArchivoDatosInvalidoError("El archivo debe ser .csv, .xlsx o .json.")
    filas = lectores[extension](contenido)
    if len(filas) > MAXIMO_FILAS:
        raise ArchivoDatosInvalidoError(
            f"El archivo tiene más de {MAXIMO_FILAS:,} filas.".replace(",", ".")
        )
    # En CSV y XLSX la fila 1 es el encabezado; en JSON se cuenta desde 1.
    return convertir_filas(filas, primera_fila=1 if extension == "json" else 2)


# ------------------------------------------------------------- conversion --
def convertir_filas(
    filas: list[dict[str, object]], primera_fila: int = 2
) -> DatosLeidos:
    filas_normalizadas = [
        {_normalizar_columna(k): _valor(v) for k, v in fila.items() if k is not None}
        for fila in filas
    ]
    columnas = set().union(*filas_normalizadas) if filas_normalizadas else set()
    faltan = [c for c in COLUMNAS_OBLIGATORIAS if c not in columnas]
    if faltan:
        raise ArchivoDatosInvalidoError(
            f"Faltan columnas obligatorias: {', '.join(faltan)}."
        )

    datos = DatosLeidos(ejemplos=[])
    for numero, fila in enumerate(filas_normalizadas, start=primera_fila):
        if not any(fila.values()):
            continue
        motivo = _motivo_rechazo(fila)
        if motivo:
            datos.n_rechazadas += 1
            if len(datos.rechazadas) < MAXIMO_RECHAZOS_DETALLE:
                datos.rechazadas.append({"fila": numero, "motivo": motivo})
            continue
        datos.ejemplos.append(
            {
                # Sin los espacios que dejan los campos vacios del archivo.
                "texto": " ".join(construir_texto(_interconsulta(fila)).split()),
                "etiqueta": normalizar_clase(fila[COLUMNA_PRIORIDAD]),
            }
        )
    return datos


def _motivo_rechazo(fila: dict[str, str]) -> str | None:
    prioridad = fila.get(COLUMNA_PRIORIDAD, "")
    if not prioridad:
        return "Sin prioridad."
    if normalizar_clase(prioridad) not in CLASES:
        return f"Prioridad «{prioridad}» no válida: debe ser alta, media o baja."
    if not fila.get("HISTORIA_CLINICA"):
        return "Sin historia clínica."
    return None


def _interconsulta(fila: dict[str, str]) -> Interconsulta:
    """Interconsulta sin guardar, solo para armar su texto igual que la app.
    Los campos que el archivo no trae quedan en None y no aparecen."""

    def campo(nombre: str) -> str | None:
        return fila.get(nombre) or None

    return Interconsulta(
        espec_origen=campo("ESPEC_ORIGEN"),
        # construir_texto hace str(edad): sin edad iria la palabra "None".
        edad=campo("EDAD") or "",
        sexo=campo("SEXO"),
        espec_destino=campo("ESPEC_DESTINO"),
        historia_clinica=campo("HISTORIA_CLINICA"),
        fundamentos_diagnostico=campo("FUNDAMENTOS_DIAGNOSTICO"),
        examenes_complementarios=campo("EXAMENES_COMPLEMENTARIOS"),
        motivo_interconsulta=campo("MOTIVO_INTERCONSULTA"),
    )
