import csv
import io

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.interconsultas import router as interconsultas_router
from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.models import Base

UPLOAD_CSV_FILE = File(...)

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
async def upload_csv(file: UploadFile = UPLOAD_CSV_FILE) -> dict[str, int]:
    allowed_types = {"text/csv", "application/vnd.ms-excel", "application/csv"}
    filename = (file.filename or "").lower()
    if not (file.content_type in allowed_types or filename.endswith(".csv")):
        raise HTTPException(
            status_code=400,
            detail="El archivo debe ser un CSV válido",
        )

    contenido = await file.read()
    try:
        texto = contenido.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="El CSV debe estar codificado en UTF-8",
        ) from None

    sample = texto[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;")
    except csv.Error:
        dialect = csv.excel

    # Use csv on an in-memory text stream. Passing the full text to
    # io.StringIO lets the csv module correctly handle fields that
    # contain commas and embedded newlines when they are quoted.
    f = io.StringIO(texto)
    try:
        reader_rows = list(csv.reader(f, dialect=dialect))
    except csv.Error as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error al parsear el CSV: {e}",
        ) from e

    if not reader_rows:
        raise HTTPException(
            status_code=400,
            detail="El CSV no contiene filas",
        )

    # Normalize header and use it to build dicts for each row
    header = [h.strip() for h in reader_rows[0]]
    expected_count = len(header)

    # Detect rows with mismatched column counts and build row dicts
    data_rows: list[dict[str, str]] = []
    for i, row in enumerate(reader_rows[1:], start=1):
        if len(row) != expected_count:
            sample = " | ".join(row[:6])
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Column count mismatch at CSV data row {i}: expected {expected_count} columns but got {len(row)}. "
                    f"Fila sample: {sample}. Verifica el separador y las comillas del CSV."
                ),
            )
        fila_dict = {header[j]: row[j] for j in range(expected_count)}
        data_rows.append(fila_dict)
    esperados = [
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

    if not header:
        raise HTTPException(
            status_code=400,
            detail="El CSV debe contener encabezados",
        )

    encabezados = [nombre.upper() for nombre in header]
    faltantes = [h for h in esperados if h not in encabezados]
    if faltantes:
        raise HTTPException(
            status_code=400,
            detail=f"Faltan encabezados obligatorios: {', '.join(faltantes)}",
        )

    # Map data_rows keys to normalized header names (uppercased)
    filas = []
    for dr in data_rows:
        mapped = {k.strip().upper(): (v or "") for k, v in dr.items()}
        filas.append(mapped)
    if not filas:
        raise HTTPException(
            status_code=400,
            detail="El CSV no contiene filas de datos",
        )

    session = SessionLocal()
    try:
        filas_json: list[dict[str, object]] = []
        for idx, fila in enumerate(filas, start=1):
            # Normalizar claves y valores: quitar BOM, NBSP y espacios extra
            datos: dict[str, object] = {}
            for clave, valor in fila.items():
                if clave is None:
                    continue
                clave_norm = (
                    clave.replace("\ufeff", "").replace("\xa0", " ").strip().upper()
                )
                valor_norm = valor or ""
                if isinstance(valor_norm, str):
                    valor_norm = (
                        valor_norm.replace("\ufeff", "").replace("\xa0", " ").strip()
                    )
                datos[clave_norm] = valor_norm

            # Validar y convertir EDAD con mensajes útiles
            raw_edad = str(datos.get("EDAD", "")).strip()
            # Eliminar separadores comunes (miles) que podrían venir en algunos CSV
            raw_edad_clean = raw_edad.replace(".", "").replace(",", "").replace(" ", "")

            if raw_edad_clean == "":
                raise HTTPException(
                    status_code=400,
                    detail=f"El campo EDAD está vacío en la fila {idx}",
                )

            try:
                datos["EDAD"] = int(raw_edad_clean)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"El campo EDAD debe ser un número entero en la fila {idx}. "
                        f"Valor recibido: '{raw_edad}'"
                    ),
                ) from None
            filas_json.append(datos)

        # Insert each parsed fila into the table, populating existing columns.
        # Do NOT store the JSON blob — user requested column storage.
        insert_sql = text("""
            INSERT INTO interconsultas
            ("ESPEC_ORIGEN", "EDAD", "SEXO", "ESPEC_DESTINO", "PRIORIDAD",
             "HISTORIA_CLINICA", "FUNDAMENTOS_DIAGNOSTICO", "EXAMENES_COMPLEMENTARIOS",
             "MOTIVO_INTERCONSULTA")
            VALUES
            (:ESPEC_ORIGEN, :EDAD, :SEXO, :ESPEC_DESTINO, :PRIORIDAD,
             :HISTORIA_CLINICA, :FUNDAMENTOS_DIAGNOSTICO, :EXAMENES_COMPLEMENTARIOS,
             :MOTIVO_INTERCONSULTA)
            """)

        for fila_json in filas_json:
            params: dict[str, object | None] = {
                "ESPEC_ORIGEN": fila_json.get("ESPEC_ORIGEN", ""),
                "EDAD": fila_json.get("EDAD"),
                "SEXO": fila_json.get("SEXO", ""),
                "ESPEC_DESTINO": fila_json.get("ESPEC_DESTINO", ""),
                "PRIORIDAD": fila_json.get("PRIORIDAD", ""),
                "HISTORIA_CLINICA": fila_json.get("HISTORIA_CLINICA", ""),
                "FUNDAMENTOS_DIAGNOSTICO": fila_json.get("FUNDAMENTOS_DIAGNOSTICO", ""),
                "EXAMENES_COMPLEMENTARIOS": fila_json.get(
                    "EXAMENES_COMPLEMENTARIOS", ""
                ),
                "MOTIVO_INTERCONSULTA": fila_json.get("MOTIVO_INTERCONSULTA", ""),
            }
            session.execute(insert_sql, params)

        session.commit()
        return {"inserted": len(filas_json), "stored": len(filas_json)}
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
