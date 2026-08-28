import csv
import io
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openpyxl import load_workbook
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.interconsultas import router as interconsultas_router
from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.models import Base, Interconsulta
from app.services.banderas_rojas import aplicar_banderas_a_interconsulta
from app.services.priorizador import aplicar_resultado, get_priorizador

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
             motivo_interconsulta, fecha_emision, estado, bandera_roja,
             prioridad_forzada_por_regla, created_at, updated_at)
            VALUES
            (:id, :espec_origen, :edad, :sexo, :espec_destino, :prioridad_original_csv,
             :historia_clinica, :fundamentos_diagnostico, :examenes_complementarios,
             :motivo_interconsulta, :fecha_emision, :estado, :bandera_roja,
             :prioridad_forzada_por_regla, :created_at, :updated_at)
            """)

        ids_insertados: list[str] = []
        for fila_json in filas_json:
            interconsulta_id = str(uuid4())
            ahora = datetime.now(UTC)
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
                "fecha_emision": _parsear_fecha_emision(fila_json.get("FECHA_EMISION")),
                "estado": "pendiente",
                "bandera_roja": False,
                "prioridad_forzada_por_regla": False,
                "created_at": ahora,
                "updated_at": ahora,
            }
            session.execute(insert_sql, params)
            ids_insertados.append(interconsulta_id)

        priorizadas = _priorizar_interconsultas_insertadas(session, ids_insertados)
        session.commit()
        return {
            "inserted": len(filas_json),
            "stored": len(filas_json),
            "file_type": tipo_archivo,
            "prioritized": priorizadas,
            "prioritization_status": _estado_priorizacion(
                total=len(filas_json),
                priorizadas=priorizadas,
            ),
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


COLUMNAS_NUEVAS = {
    "estado": "VARCHAR(20) DEFAULT 'pendiente' NOT NULL",
    "motivo_sin_prioridad": "TEXT",
    "fecha_emision": "TIMESTAMP",
    "bandera_roja": "BOOLEAN DEFAULT false NOT NULL",
    "terminos_bandera_roja": "TEXT",
    "prioridad_forzada_por_regla": "BOOLEAN DEFAULT false NOT NULL",
}


def _asegurar_columnas_interconsultas() -> None:
    inspector = inspect(engine)
    columnas = {columna["name"] for columna in inspector.get_columns("interconsultas")}
    faltantes = {
        nombre: definicion
        for nombre, definicion in COLUMNAS_NUEVAS.items()
        if nombre not in columnas
    }
    if not faltantes:
        return

    with engine.begin() as connection:
        for nombre, definicion in faltantes.items():
            connection.execute(
                text(f"ALTER TABLE interconsultas ADD COLUMN {nombre} {definicion}")
            )


def _priorizar_interconsultas_insertadas(session: Session, ids: list[str]) -> int:
    interconsultas = list(
        session.scalars(
            select(Interconsulta).where(Interconsulta.id.in_(ids)),
        ).all(),
    )
    validas = [
        interconsulta
        for interconsulta in interconsultas
        if _tiene_informacion_clinica(interconsulta)
    ]

    for interconsulta in validas:
        aplicar_banderas_a_interconsulta(interconsulta, ya_modificada_por_medico=False)

    try:
        resultados = get_priorizador().predecir(validas)
    except Exception as exc:
        for interconsulta in validas:
            interconsulta.motivo_sin_prioridad = (
                f"No se pudo ejecutar el modelo predictivo: {exc}"
            )
        return 0

    por_id = {interconsulta.id: interconsulta for interconsulta in validas}
    for resultado in resultados:
        aplicar_resultado(por_id[resultado.id], resultado)

    return len(resultados)


def _tiene_informacion_clinica(interconsulta: Interconsulta) -> bool:
    campos = [
        interconsulta.historia_clinica,
        interconsulta.fundamentos_diagnostico,
        interconsulta.examenes_complementarios,
        interconsulta.motivo_interconsulta,
    ]
    return any(bool(campo and campo.strip()) for campo in campos)


def _estado_priorizacion(total: int, priorizadas: int) -> str:
    if priorizadas == total:
        return "completed"
    if priorizadas == 0:
        return "skipped"
    return "partial"


FORMATOS_FECHA_EMISION = ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y")


def _parsear_fecha_emision(valor: object) -> datetime | None:
    """FECHA_EMISION es opcional (HU3-c1): no viene en COLUMNAS_ESPERADAS y aun no
    se conoce el formato real del archivo del sistema hospitalario (D18). Si no
    esta presente o no calza con un formato conocido, se guarda como None en vez
    de romper la carga completa."""
    texto = str(valor or "").strip()
    if not texto:
        return None

    for formato in FORMATOS_FECHA_EMISION:
        try:
            return datetime.strptime(texto, formato).replace(tzinfo=UTC)
        except ValueError:
            continue
    return None


def _normalizar_encabezado(valor: object) -> str:
    return _normalizar_valor(valor).upper()


def _normalizar_valor(valor: object) -> str:
    if valor is None:
        return ""
    if isinstance(valor, float) and valor.is_integer():
        valor = int(valor)
    return str(valor).replace("\ufeff", "").replace("\xa0", " ").strip()


_asegurar_columnas_interconsultas()
