"""Proceso de reentrenamiento: `python -m app.entrenamiento.entrenar trabajo.json`.

Corre en un proceso aparte del backend, que lo lanza y lee su salida
(services/reentrenamiento.py). Asi el entrenamiento no compite con las
peticiones por el GIL, y al terminar (o al cancelarlo) toda la memoria que uso
vuelve al sistema.

Habla con el backend por stdout:
- una linea que empieza con `@@` es un evento en JSON (avance, resultados);
- cualquier otra linea es log y se muestra tal cual en la pantalla.

Cada configuracion es RoBERTa con su capa de clasificacion: el mismo formato
(AutoModelForSequenceClassification) que la app ya carga, asi que un modelo
nuevo entra en uso sin tocar el priorizador ni la explicabilidad.
"""

from __future__ import annotations

import json
import math
import random
import sys
import time
import traceback
from collections.abc import Callable
from pathlib import Path
from typing import Any

from app.entrenamiento.metricas import CLASES, calcular_metricas

PREFIJO_EVENTO = "@@"
SEMILLA = 13
# El avance se informa como mucho una vez por segundo: con lotes chicos en GPU
# serian cientos de lineas por segundo que nadie alcanza a leer.
INTERVALO_AVANCE_S = 1.0

Emitir = Callable[[dict[str, Any]], None]


def emitir_stdout(evento: dict[str, Any]) -> None:
    print(PREFIJO_EVENTO + json.dumps(evento, ensure_ascii=False), flush=True)


def log(mensaje: str) -> None:
    print(mensaje, flush=True)


def leer_jsonl(ruta: str) -> list[dict[str, str]]:
    with open(ruta, encoding="utf-8") as archivo:
        return [json.loads(linea) for linea in archivo if linea.strip()]


class Avance:
    """Lleva la cuenta del avance total y estima el tiempo restante."""

    def __init__(self, configuraciones: int, emitir: Emitir) -> None:
        self.configuraciones = configuraciones
        self.emitir = emitir
        self.inicio = time.monotonic()
        self._ultimo = 0.0

    def informar(
        self, etapa: str, fraccion: float, forzar: bool = False, **datos: Any
    ) -> None:
        ahora = time.monotonic()
        if not forzar and ahora - self._ultimo < INTERVALO_AVANCE_S:
            return
        self._ultimo = ahora
        transcurrido = ahora - self.inicio
        restante = (
            round(transcurrido / fraccion * (1 - fraccion)) if fraccion > 0.01 else None
        )
        self.emitir(
            {
                "tipo": "progreso",
                "etapa": etapa,
                "porcentaje": round(100 * fraccion, 1),
                "segundos_transcurridos": round(transcurrido),
                "segundos_restantes": restante,
                "configuraciones": self.configuraciones,
                **datos,
            }
        )


def elegir_dispositivo(nombre: str) -> Any:
    import torch

    if nombre == "gpu":
        if not torch.cuda.is_available():
            raise RuntimeError(
                "Se pidió GPU, pero este servidor no tiene una GPU disponible para PyTorch."
            )
        return torch.device("cuda")
    return torch.device("cpu")


def _autocast(device: Any) -> Any:
    """bf16 en GPU si la tarjeta lo soporta: casi la mitad del tiempo y de
    memoria, sin la perdida de precision de fp16. En CPU no se toca."""
    import contextlib

    import torch

    if device.type == "cuda" and torch.cuda.is_bf16_supported():
        return torch.autocast(device_type="cuda", dtype=torch.bfloat16)
    return contextlib.nullcontext()


def predecir_clases(
    model: Any,
    tokenizer: Any,
    textos: list[str],
    labels: list[str],
    device: Any,
    max_length: int,
    batch_size: int,
) -> list[str]:
    import torch

    model.eval()
    predichas: list[str] = []
    for inicio in range(0, len(textos), batch_size):
        lote = tokenizer(
            textos[inicio : inicio + batch_size],
            padding=True,
            truncation=True,
            max_length=max_length,
            return_tensors="pt",
        ).to(device)
        with torch.no_grad(), _autocast(device):
            logits = model(**lote).logits
        predichas.extend(labels[i] for i in logits.argmax(dim=-1).tolist())
    return predichas


def evaluar_modelo_actual(
    actual: dict[str, Any],
    evaluacion: list[dict[str, str]],
    device: Any,
) -> dict[str, Any]:
    """Mide el modelo en uso sobre el mismo conjunto que los nuevos: es lo que
    hace comparables las metricas."""
    import gc

    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(actual["ruta"])
    model = AutoModelForSequenceClassification.from_pretrained(actual["ruta"]).to(
        device
    )
    predichas = predecir_clases(
        model,
        tokenizer,
        [ejemplo["texto"] for ejemplo in evaluacion],
        actual["labels"],
        device,
        actual["max_length"],
        actual.get("batch_size", 16),
    )
    # El modelo en uso puede ser grande (RigoBERTa): se suelta antes de entrenar.
    del model
    gc.collect()
    return calcular_metricas([e["etiqueta"] for e in evaluacion], predichas)


def entrenar_configuracion(
    indice: int,
    config: dict[str, Any],
    trabajo: dict[str, Any],
    datos: dict[str, list[dict[str, str]]],
    device: Any,
    avance: Avance,
) -> dict[str, Any]:
    import torch
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        get_linear_schedule_with_warmup,
    )

    numero = indice + 1
    total = avance.configuraciones
    salida = Path(config["salida"])
    salida.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(SEMILLA + indice)

    log(f"Configuración {numero}/{total}: cargando {trabajo['modelo_base']}")
    tokenizer = AutoTokenizer.from_pretrained(trabajo["modelo_base"])
    model = AutoModelForSequenceClassification.from_pretrained(
        trabajo["modelo_base"],
        num_labels=len(CLASES),
        id2label=dict(enumerate(CLASES)),
        label2id={clase: i for i, clase in enumerate(CLASES)},
        # Si la base ya trae una capa de clasificacion de otro tamano, se
        # reemplaza en vez de fallar.
        ignore_mismatched_sizes=True,
    ).to(device)

    entrenamiento = datos["entrenamiento"]
    epocas = int(config["epocas"])
    batch_size = int(config["batch_size"])
    max_length = int(config["max_length"])
    pasos_por_epoca = math.ceil(len(entrenamiento) / batch_size)
    pasos_totales = pasos_por_epoca * epocas

    optimizador = torch.optim.AdamW(
        model.parameters(), lr=float(config["learning_rate"]), weight_decay=0.01
    )
    planificador = get_linear_schedule_with_warmup(
        optimizador,
        num_warmup_steps=int(0.1 * pasos_totales),
        num_training_steps=pasos_totales,
    )

    mejor_f1 = -1.0
    mejor_epoca = 0
    sin_mejora = 0
    epocas_corridas = 0
    textos_val = [e["texto"] for e in datos["validacion"]]
    reales_val = [e["etiqueta"] for e in datos["validacion"]]
    azar = random.Random(SEMILLA + indice)
    etapa = f"Entrenando configuración {numero} de {total}"

    for epoca in range(1, epocas + 1):
        model.train()
        orden = list(range(len(entrenamiento)))
        azar.shuffle(orden)
        perdida_total = 0.0
        for paso in range(pasos_por_epoca):
            indices = orden[paso * batch_size : (paso + 1) * batch_size]
            lote = tokenizer(
                [entrenamiento[i]["texto"] for i in indices],
                padding=True,
                truncation=True,
                max_length=max_length,
                return_tensors="pt",
            ).to(device)
            etiquetas = torch.tensor(
                [CLASES.index(entrenamiento[i]["etiqueta"]) for i in indices],
                device=device,
            )
            with _autocast(device):
                perdida = model(**lote, labels=etiquetas).loss
            perdida.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizador.step()
            planificador.step()
            optimizador.zero_grad()
            perdida_total += float(perdida.detach())

            hechos = (epoca - 1) * pasos_por_epoca + paso + 1
            avance.informar(
                etapa,
                (indice + hechos / pasos_totales) / total,
                configuracion=numero,
                epoca=epoca,
                epocas=epocas,
                paso=paso + 1,
                pasos=pasos_por_epoca,
            )

        epocas_corridas = epoca
        predichas = predecir_clases(
            model, tokenizer, textos_val, list(CLASES), device, max_length, batch_size
        )
        f1 = calcular_metricas(reales_val, predichas)["f1_macro"]
        mejora = f1 > mejor_f1
        log(
            f"Configuración {numero} · época {epoca}/{epocas}: "
            f"pérdida {perdida_total / pasos_por_epoca:.4f}, "
            f"F1 macro en validación {f1:.4f}{' (mejor hasta ahora)' if mejora else ''}"
        )
        if mejora:
            mejor_f1, mejor_epoca, sin_mejora = f1, epoca, 0
            model.save_pretrained(salida)
            tokenizer.save_pretrained(salida)
        else:
            sin_mejora += 1
            if sin_mejora >= int(config["paciencia"]):
                log(
                    f"Configuración {numero}: {sin_mejora} épocas sin mejorar, "
                    "se detiene antes (paciencia)."
                )
                break

    avance.informar(
        f"Evaluando configuración {numero} de {total}",
        (indice + 1) / total,
        forzar=True,
        configuracion=numero,
    )
    # Se evalua la mejor epoca guardada, no la ultima.
    del model
    mejor = AutoModelForSequenceClassification.from_pretrained(salida).to(device)
    predichas = predecir_clases(
        mejor,
        tokenizer,
        [e["texto"] for e in datos["evaluacion"]],
        list(CLASES),
        device,
        max_length,
        batch_size,
    )
    metricas = calcular_metricas(
        [e["etiqueta"] for e in datos["evaluacion"]], predichas
    )
    del mejor
    log(
        f"Configuración {numero}: exactitud {metricas['exactitud']:.4f}, "
        f"F1 macro {metricas['f1_macro']:.4f}, "
        f"sensibilidad alta {metricas['sensibilidad_alta']:.4f}"
    )
    return {
        "metricas": metricas,
        "mejor_epoca": mejor_epoca,
        "epocas_corridas": epocas_corridas,
        "f1_validacion": mejor_f1,
    }


def ejecutar(trabajo: dict[str, Any], emitir: Emitir) -> None:
    import torch

    device = elegir_dispositivo(trabajo["dispositivo"])
    random.seed(SEMILLA)
    torch.manual_seed(SEMILLA)
    datos = {
        nombre: leer_jsonl(trabajo[nombre])
        for nombre in ("entrenamiento", "validacion", "evaluacion")
    }
    log(
        f"Dispositivo: {device}. Interconsultas: {len(datos['entrenamiento'])} para "
        f"entrenar, {len(datos['validacion'])} para validar y "
        f"{len(datos['evaluacion'])} para evaluar."
    )
    configuraciones = trabajo["configuraciones"]
    avance = Avance(len(configuraciones), emitir)

    actual = trabajo.get("modelo_actual")
    if actual:
        avance.informar("Evaluando el modelo en uso", 0.0, forzar=True)
        log("Evaluando el modelo en uso sobre el conjunto de evaluación")
        metricas = evaluar_modelo_actual(actual, datos["evaluacion"], device)
        log(
            f"Modelo en uso: exactitud {metricas['exactitud']:.4f}, "
            f"F1 macro {metricas['f1_macro']:.4f}, "
            f"sensibilidad alta {metricas['sensibilidad_alta']:.4f}"
        )
        emitir({"tipo": "modelo_actual", "metricas": metricas})

    for indice, config in enumerate(configuraciones):
        resultado = entrenar_configuracion(
            indice, config, trabajo, datos, device, avance
        )
        emitir({"tipo": "resultado", "indice": indice, **resultado})

    avance.informar("Terminado", 1.0, forzar=True)


def main(argv: list[str] | None = None) -> int:
    argumentos = sys.argv[1:] if argv is None else argv
    trabajo = json.loads(Path(argumentos[0]).read_text(encoding="utf-8"))
    try:
        ejecutar(trabajo, emitir_stdout)
    except Exception as error:
        traceback.print_exc(file=sys.stdout)
        emitir_stdout({"tipo": "error", "mensaje": str(error)})
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover - punto de entrada del proceso
    sys.exit(main())
