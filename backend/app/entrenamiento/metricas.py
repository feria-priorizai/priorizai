"""Metricas con las que se compara un modelo nuevo con el que esta en uso.

Python puro, sin sklearn: son pocas cuentas y asi el backend no carga otra
dependencia solo para esto.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

CLASES = ("baja", "media", "alta")
CLASE_MAS_URGENTE = "alta"


def calcular_metricas(
    reales: Sequence[str],
    predichas: Sequence[str],
) -> dict[str, Any]:
    """Exactitud, F1 macro y sensibilidad de la prioridad alta.

    La sensibilidad de "alta" va aparte porque es el error caro: una
    interconsulta urgente que el modelo manda abajo de la lista.
    """
    if len(reales) != len(predichas):
        raise ValueError("reales y predichas deben tener el mismo largo")
    if not reales:
        raise ValueError("No hay ejemplos para evaluar")

    matriz = [[0 for _ in CLASES] for _ in CLASES]
    for real, predicha in zip(reales, predichas, strict=True):
        matriz[CLASES.index(real)][CLASES.index(predicha)] += 1

    f1_por_clase: dict[str, float] = {}
    sensibilidad: dict[str, float] = {}
    for i, clase in enumerate(CLASES):
        verdaderos = matriz[i][i]
        reales_clase = sum(matriz[i])
        predichas_clase = sum(fila[i] for fila in matriz)
        precision = verdaderos / predichas_clase if predichas_clase else 0.0
        recall = verdaderos / reales_clase if reales_clase else 0.0
        sensibilidad[clase] = recall
        f1_por_clase[clase] = (
            2 * precision * recall / (precision + recall) if precision + recall else 0.0
        )

    # El promedio va sobre las clases presentes en la evaluacion: una clase sin
    # ejemplos no tiene F1 que aportar y lo bajaria por nada.
    presentes = [c for i, c in enumerate(CLASES) if sum(matriz[i])]
    aciertos = sum(matriz[i][i] for i in range(len(CLASES)))
    return {
        "n": len(reales),
        "exactitud": round(aciertos / len(reales), 4),
        "f1_macro": round(sum(f1_por_clase[c] for c in presentes) / len(presentes), 4),
        "sensibilidad_alta": round(sensibilidad[CLASE_MAS_URGENTE], 4),
        "f1_por_clase": {c: round(v, 4) for c, v in f1_por_clase.items()},
        "matriz_confusion": matriz,
    }
