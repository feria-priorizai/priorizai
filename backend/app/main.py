import csv
import io
from datetime import datetime
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openpyxl import load_workbook
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.interconsultas import router as interconsultas_router
from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.models import Base

UPLOAD_FILE = File(...)

COLUMNAS_ESPERADAS = [
    "ESPEC_ORIGEN",
    "EDAD",
    "SEXO",
    "ESPEC_DESTINO",
    "PRIORIDAD",
    "HISTORIA_CLINICA",
    "FUNDAMENTOS_DIAGNOSTICO",
    "EXAMENES_COMPLEMENTARIOS",
    "MOTIVO_INTERCONSULTA",
]

app = FastAPI()

Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(interconsultas_router)


@app.get("/")
def root() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy"}


@app.post("/upload-csv")
async def upload_csv(file: UploadFile = UPLOAD_FILE) -> dict[str, object]:
    filename = (file.filename or "").lower()
    es_csv = filename.endswith(".csv")
    es_xlsx = filename.endswith(".xlsx")
    if not (es_csv or es_xlsx):
        raise HTTPException(
            status_code=400,
            detail="El archivo debe ser CSV o XLSX valido",
        )

    contenido = await file.read()
    if es_xlsx:
        filas = _leer_xlsx(contenido)
        tipo_archivo = "xlsx"
    else:
        filas = _leer_csv(contenido)
        tipo_archivo = "csv"

    filas_json = _validar_filas(filas)
    return _guardar_interconsultas(filas_json, tipo_archivo)


def _leer_csv(contenido: bytes) -> list[dict[str, str]]:
    try:
        texto = contenido.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="El CSV debe estar codificado en UTF-8",
        ) from None

    try:
        dialect = csv.Sniffer().sniff(texto[:4096], delimiters=",;")
    except csv.Error:
        dialect = csv.excel

    try:
        reader_rows = list(csv.reader(io.StringIO(texto), dialect=dialect))
    except csv.Error as error:
        raise HTTPException(
            status_code=400,
            detail=f"Error al parsear el CSV: {error}",
        ) from error

    if not reader_rows:
        raise HTTPException(status_code=400, detail="El CSV no contiene filas")

    header = [_normalizar_valor(cell) for cell in reader_rows[0]]
    filas = []
    for idx, row in enumerate(reader_rows[1:], start=2):
        row = [_normalizar_valor(cell) for cell in row]
        if not row or all(not cell for cell in row):
            continue
        if len(row) != len(header):
            sample = " | ".join(row[:6])
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Fila CSV {idx} invalida: se esperaban {len(header)} columnas "
                    f"y llegaron {len(row)}. Sample: {sample}"
                ),
            )
        filas.append(dict(zip(header, row, strict=True)))
    return filas


def _leer_xlsx(contenido: bytes) -> list[dict[str, str]]:
    try:
        workbook = load_workbook(io.BytesIO(contenido), read_only=True, data_only=True)
    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail=f"No se pudo leer el XLSX: {error}",
        ) from error

    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(status_code=400, detail="El XLSX no contiene filas")

    header = [_normalizar_valor(cell) for cell in rows[0]]
    filas = []
    for idx, row in enumerate(rows[1:], start=2):
        valores = [_normalizar_valor(cell) for cell in row[: len(header)]]
        if not valores or all(not cell for cell in valores):
            continue
        extra = row[len(header) :]
        if any(_normalizar_valor(cell) for cell in extra):
            raise HTTPException(
                status_code=400,
                detail=f"Fila XLSX {idx} invalida: contiene columnas extra con datos",
            )
        filas.append(dict(zip(header, valores, strict=True)))
    return filas


def _validar_filas(filas: list[dict[str, str]]) -> list[dict[str, object]]:
    if not filas:
        raise HTTPException(
            status_code=400,
            detail="El archivo no contiene filas de datos",
        )

    encabezados = [_normalizar_encabezado(h) for h in filas[0]]
    faltantes = [h for h in COLUMNAS_ESPERADAS if h not in encabezados]
    if faltantes:
        raise HTTPException(
            status_code=400,
            detail=f"Faltan encabezados obligatorios: {', '.join(faltantes)}",
        )

    filas_validadas: list[dict[str, object]] = []
    for idx, fila in enumerate(filas, start=2):
        datos: dict[str, object] = {
            _normalizar_encabezado(clave): _normalizar_valor(valor)
            for clave, valor in fila.items()
            if clave is not None
        }
        raw_edad = str(datos.get("EDAD", ""))
        raw_edad_clean = raw_edad.replace(".", "").replace(",", "").replace(" ", "")

        if raw_edad_clean == "":
            raise HTTPException(
                status_code=400,
                detail=f"El campo EDAD esta vacio en la fila {idx}",
            )

        try:
            datos["EDAD"] = int(raw_edad_clean)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"El campo EDAD debe ser un numero entero en la fila {idx}. "
                    f"Valor recibido: '{raw_edad}'"
                ),
            ) from None
        filas_validadas.append(datos)
    return filas_validadas


def _guardar_interconsultas(
    filas_json: list[dict[str, object]], tipo_archivo: str
) -> dict[str, object]:
    session = SessionLocal()
    try:
        insert_sql = text("""
            INSERT INTO interconsultas
            (id, espec_origen, edad, sexo, espec_destino, prioridad_original_csv,
             historia_clinica, fundamentos_diagnostico, examenes_complementarios,
             motivo_interconsulta, created_at, updated_at)
            VALUES
            (:id, :espec_origen, :edad, :sexo, :espec_destino, :prioridad_original_csv,
             :historia_clinica, :fundamentos_diagnostico, :examenes_complementarios,
             :motivo_interconsulta, :created_at, :updated_at)
            """)

        ids_insertados: list[str] = []
        for fila_json in filas_json:
            interconsulta_id = str(uuid4())
            ahora = datetime.utcnow()
            params: dict[str, object | None] = {
                "id": interconsulta_id,
                "espec_origen": fila_json.get("ESPEC_ORIGEN", ""),
                "edad": fila_json.get("EDAD"),
                "sexo": fila_json.get("SEXO", ""),
                "espec_destino": fila_json.get("ESPEC_DESTINO", ""),
                "prioridad_original_csv": fila_json.get("PRIORIDAD", ""),
                "historia_clinica": fila_json.get("HISTORIA_CLINICA", ""),
                "fundamentos_diagnostico": fila_json.get("FUNDAMENTOS_DIAGNOSTICO", ""),
                "examenes_complementarios": fila_json.get(
                    "EXAMENES_COMPLEMENTARIOS", ""
                ),
                "motivo_interconsulta": fila_json.get("MOTIVO_INTERCONSULTA", ""),
                "created_at": ahora,
                "updated_at": ahora,
            }
            session.execute(insert_sql, params)
            ids_insertados.append(interconsulta_id)

        session.commit()
        return {
            "inserted": len(filas_json),
            "stored": len(filas_json),
            "file_type": tipo_archivo,
            "prioritized": 0,
            "prioritization_status": "pending",
            "ids": ids_insertados,
        }
    except HTTPException:
        session.rollback()
        raise
    except SQLAlchemyError as error:
        session.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error en la base de datos: {error}",
        ) from error
    finally:
        session.close()


def _normalizar_encabezado(valor: object) -> str:
    return _normalizar_valor(valor).upper()


def _normalizar_valor(valor: object) -> str:
    if valor is None:
        return ""
    if isinstance(valor, float) and valor.is_integer():
        valor = int(valor)
    return str(valor).replace("\ufeff", "").replace("\xa0", " ").strip()
