"""
Predicción de prioridad de interconsultas (alta / media / baja) con un modelo
RigoBERTa fine-tuneado ("BestRigoberta").

Lee un CSV con las columnas de interconsultas, une todas las columnas de texto en
un único prompt por fila, corre el modelo de clasificación y escribe un CSV de
salida con el porcentaje de probabilidad de cada clase + la clase predicha.

Se deben ajustar las rutas de entrada/salida y del modelo, y opcionalmente las columnas a usar como texto (si el modelo fue entrenado solo con algunas columnas).

Uso básico:
    python predict_interconsultas.py

Dependencias: pandas, torch, transformers
    pip install pandas torch transformers
"""

from __future__ import annotations

import argparse
import sys
import unicodedata
from pathlib import Path

import pandas as pd
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

# Ruta de la CARPETA del modelo fine-tuneado. from_pretrained carga desde el
# directorio (que adentro tiene model.safetensors, config.json y el tokenizer),
# no desde el archivo .safetensors suelto.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = PROJECT_ROOT / "models"

# Ruta del CSV de entrada (las interconsultas a priorizar).
INPUT_PATH = PROJECT_ROOT / "ic_historicas_new.xlsx - Sheet 1.csv"

# Ruta del CSV de salida (las predicciones con probabilidades).
OUTPUT_PATH = PROJECT_ROOT / "data" / "predicciones_ic_historicas.csv"

# Columnas del CSV que se concatenan (en este orden) para formar el texto de
# entrada del modelo. Son las columnas del dataset de interconsultas.
# Si tu modelo fue fine-tuneado SOLO con las columnas de texto largo, podés
# acotar esta lista (o pasar --text-columns en la línea de comandos).
TEXT_COLUMNS = [
    "ESPEC_ORIGEN",
    "EDAD",
    "SEXO",
    "ESPEC_DESTINO",
    "HISTORIA_CLINICA",
    "FUNDAMENTOS_DIAGNOSTICO",
    "EXAMENES_COMPLEMENTARIOS",
    "MOTIVO_INTERCONSULTA",
]

# Orden canónico de las clases que querés en la salida.
PRIORITY_ORDER = ["baja", "media", "alta"]

# Fallback de mapeo índice -> clase, SOLO usado si el config.json del modelo no
# trae un id2label con nombres reconocibles (p. ej. trae "LABEL_0", "LABEL_1"...).
# TODO: si tu modelo tiene labels genéricos, ajustá este orden al que usaste al
# entrenar. Ejemplo: si entrenaste con 0=baja, 1=media, 2=alta, dejalo así.
FALLBACK_ID2LABEL = {0: "baja", 1: "media", 2: "alta"}


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def validate_model_dir(model_path: Path) -> None:
    """Verifica los archivos minimos antes de cargar Transformers."""
    if not model_path.exists():
        sys.exit(f"[error] No existe la carpeta del modelo: {model_path}")

    files = {path.name for path in model_path.iterdir() if path.is_file()}
    if not files:
        sys.exit(
            f"[error] La carpeta del modelo esta vacia: {model_path}\n"
            "        Copia ahi config.json, pesos del modelo y archivos del tokenizer."
        )

    required = {"config.json"}
    missing = sorted(required - files)
    if missing:
        sys.exit(
            f"[error] Faltan archivos del modelo en {model_path}: {missing}"
        )

    has_weights = bool(
        {"model.safetensors", "pytorch_model.bin", "tf_model.h5"} & files
    )
    if not has_weights:
        sys.exit(
            f"[error] No se encontraron pesos del modelo en {model_path}. "
            "Esperaba model.safetensors o pytorch_model.bin."
        )

    has_tokenizer = bool(
        {"tokenizer.json", "tokenizer.model", "spiece.model", "vocab.txt", "vocab.json"}
        & files
    )
    if not has_tokenizer:
        sys.exit(
            f"[error] No se encontraron archivos de tokenizer en {model_path}. "
            "Esperaba tokenizer.json, tokenizer.model, spiece.model, vocab.txt o vocab.json."
        )

def _normalize(text: str) -> str:
    """minúsculas, sin tildes, sin espacios extra — para comparar nombres de clase."""
    text = unicodedata.normalize("NFKD", str(text))
    text = "".join(c for c in text if not unicodedata.combining(c))
    return text.strip().lower()


def resolve_label_names(config, num_labels: int) -> list[str]:
    """
    Devuelve la lista de nombres de clase indexada por id (0..num_labels-1),
    normalizada a {baja, media, alta} cuando es posible.

    Prioridad:
      1. id2label del config.json del modelo (lo más confiable).
      2. FALLBACK_ID2LABEL si los labels del config son genéricos (LABEL_0, ...).
    """
    id2label = getattr(config, "id2label", None) or {}
    # Las claves de id2label pueden venir como str ("0") o int (0).
    raw = []
    for i in range(num_labels):
        label = id2label.get(i, id2label.get(str(i)))
        raw.append(label)

    normalized = [_normalize(l) if l is not None else None for l in raw]
    known = set(PRIORITY_ORDER)

    if all(n in known for n in normalized):
        print(f"[info] Clases leídas del config.json del modelo: {raw}")
        return normalized

    print(
        "[aviso] El config.json del modelo no tiene nombres de clase reconocibles "
        f"(id2label={raw}). Usando FALLBACK_ID2LABEL={FALLBACK_ID2LABEL}.\n"
        "        >>> Verificá que ese orden coincida con cómo entrenaste el modelo. <<<"
    )
    if num_labels != len(FALLBACK_ID2LABEL):
        sys.exit(
            f"[error] El modelo tiene {num_labels} clases pero FALLBACK_ID2LABEL "
            f"define {len(FALLBACK_ID2LABEL)}. Ajustá FALLBACK_ID2LABEL."
        )
    return [_normalize(FALLBACK_ID2LABEL[i]) for i in range(num_labels)]


def build_texts(df: pd.DataFrame, columns: list[str]) -> list[str]:
    """Concatena las columnas indicadas en un solo string por fila."""
    present = [c for c in columns if c in df.columns]
    missing = [c for c in columns if c not in df.columns]
    if missing:
        print(f"[aviso] Columnas no encontradas en el CSV (se ignoran): {missing}")
    if not present:
        sys.exit(
            "[error] Ninguna de las columnas de texto existe en el CSV. "
            f"Esperaba alguna de: {columns}"
        )

    texts = df[present[0]].fillna("").astype(str)
    for col in present[1:]:
        texts = texts + " " + df[col].fillna("").astype(str)
    # Colapsa espacios múltiples que aparecen cuando hay celdas vacías.
    return texts.str.replace(r"\s+", " ", regex=True).str.strip().tolist()


@torch.no_grad()
def predict(texts, model, tokenizer, device, max_length, batch_size):
    """Devuelve un tensor (n_filas, n_clases) con probabilidades softmax."""
    all_probs = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        enc = tokenizer(
            batch,
            padding=True,
            truncation=True,
            max_length=max_length,
            return_tensors="pt",
        ).to(device)
        logits = model(**enc).logits
        probs = torch.softmax(logits, dim=-1)
        all_probs.append(probs.cpu())
        print(f"\r[info] Procesadas {min(start + batch_size, len(texts))}/{len(texts)} filas", end="")
    print()
    return torch.cat(all_probs, dim=0)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(
        description="Prediccion de prioridad de interconsultas con RigoBERTa."
    )
    p.add_argument(
        "--model-path",
        default=str(MODEL_PATH),
        help="Carpeta del modelo fine-tuneado (default: ./models).",
    )
    p.add_argument(
        "--input-path",
        default=str(INPUT_PATH),
        help="CSV de entrada a priorizar.",
    )
    p.add_argument(
        "--output-path",
        default=str(OUTPUT_PATH),
        help="CSV de salida con predicciones.",
    )
    p.add_argument(
        "--text-columns",
        nargs="+",
        default=TEXT_COLUMNS,
        help="Columnas a concatenar como texto.",
    )
    p.add_argument(
        "--max-length",
        type=int,
        default=512,
        help="Longitud maxima de tokens (default 512).",
    )
    p.add_argument(
        "--batch-size",
        type=int,
        default=16,
        help="Tamano de batch (default 16).",
    )
    p.add_argument("--sep", default=",", help="Separador del CSV de entrada.")
    return p.parse_args()


def main():
    args = parse_args()
    model_path = Path(args.model_path)
    input_path = Path(args.input_path)
    output_path = Path(args.output_path)

    validate_model_dir(model_path)
    if not input_path.exists():
        sys.exit(f"[error] No existe el CSV de entrada: {input_path}")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[info] Dispositivo: {device}")

    print(f"[info] Cargando modelo desde: {model_path}")
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    model = AutoModelForSequenceClassification.from_pretrained(model_path)
    model.to(device).eval()

    label_names = resolve_label_names(model.config, model.config.num_labels)

    print(f"[info] Leyendo CSV: {input_path}")
    df = pd.read_csv(input_path, sep=args.sep)
    print(f"[info] {len(df)} filas, {len(df.columns)} columnas.")

    texts = build_texts(df, args.text_columns)
    probs = predict(texts, model, tokenizer, device, args.max_length, args.batch_size)

    # CSV de salida: todas las columnas originales + 'texto' (la concatenación) +
    # las probabilidades + la predicción.
    out = df.copy()
    out["texto"] = texts
    name_to_idx = {name: i for i, name in enumerate(label_names)}
    for clase in PRIORITY_ORDER:
        if clase in name_to_idx:
            col_idx = name_to_idx[clase]
            out[f"prob_{clase}_%"] = (probs[:, col_idx] * 100).numpy().round(2)

    # Clase predicha (argmax sobre las clases del modelo).
    pred_idx = probs.argmax(dim=-1).numpy()
    out["prediccion"] = [label_names[i] for i in pred_idx]

    out.to_csv(output_path, index=False, encoding="utf-8-sig")
    print(f"[ok] Predicciones escritas en: {output_path}")
    print(out[["prediccion"] + [f"prob_{c}_%" for c in PRIORITY_ORDER if c in name_to_idx]].head().to_string())


if __name__ == "__main__":
    main()
