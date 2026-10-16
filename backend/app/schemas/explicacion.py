"""Contrato de la explicacion de una prediccion: SHAP por campo y el peso de
cada palabra.

Cuanto suma o resta cada campo de la interconsulta a la probabilidad de la clase
que sugiere el modelo, y dentro de cada campo, cuanto cambia esa probabilidad si
se borra cada palabra. Las probabilidades y los aportes van en puntos
porcentuales (0-100), igual que `prob_alta`, `prob_media` y `prob_baja` de la
interconsulta, para que el frontend no mezcle escalas.
"""

from typing import Literal

from pydantic import BaseModel

# Se guarda en cada explicacion. Si el formato cambia, se sube: las viejas se
# descartan al leerlas y se recalculan, en vez de romper la vista de detalle
# con un formato que el frontend ya no entiende.
#   v2: SHAP excluye lo que el modelo no leyo por el limite de tokens.
#   v3: SHAP e Integrated Gradients se guardan por separado.
#   v4: solo SHAP, guardado directo en la columna.
#   v5: agrega el peso de cada palabra.
VERSION_EXPLICACION = 5


class AporteCampo(BaseModel):
    campo: str
    # Puntos porcentuales que el campo suma (+) o resta (-) a la probabilidad de
    # la clase explicada. Los aportes de todos los campos suman exactamente
    # final - base.
    aporte: float
    vacio: bool
    # Tenia texto, pero quedo entero despues del limite de tokens: el modelo no
    # lo leyo al predecir, asi que su aporte es cero por construccion.
    no_leido: bool


class PalabraAtribuida(BaseModel):
    texto: str
    # Offsets sobre el texto ORIGINAL del campo: texto[inicio:fin] la
    # reconstruye, igual que en las entidades del NER.
    inicio: int
    fin: int
    # Puntos que cambia la probabilidad de la clase si se borra solo esta
    # palabra (+ = empuja hacia la clase). Los campos que son un valor
    # (especialidades, edad, sexo) y los de una sola palabra van enteros, con el
    # aporte exacto del campo.
    aporte: float


class ExplicacionShap(BaseModel):
    version: int
    # Clase que se explica: la sugerida por el modelo al momento de calcular.
    clase: str
    probabilidades: dict[str, float]
    generada_en: str
    segundos: float
    # Probabilidad de la clase con todos los campos vacios: el punto de partida.
    base: float
    # Probabilidad con la interconsulta completa: la prediccion real, la misma
    # confianza que guarda la interconsulta.
    final: float
    coaliciones: int
    # Textos distintos que hubo que predecir. Menos que las coaliciones cuando
    # hay campos vacios o no leidos, que se ven igual presentes que ausentes.
    evaluadas: int
    campos: list[AporteCampo]
    # Campo -> sus palabras leidas, en orden.
    palabras: dict[str, list[PalabraAtribuida]]
    # Campo -> offset desde el cual el modelo ya no leyo el texto, por el limite
    # de tokens. Solo aparecen los campos afectados.
    no_leido: dict[str, int]


EstadoTrabajo = Literal["sin_explicacion", "en_cola", "calculando", "lista", "error"]


class ProgresoExplicacion(BaseModel):
    fase: Literal["preparando", "calculando", "palabras"]
    hechos: int
    total: int


class EstadoExplicacion(BaseModel):
    """En que va la explicacion de una interconsulta.

    El calculo corre en segundo plano porque tarda minutos: mas que lo que
    aguanta un proxy (Next corta a los 10, Cloudflare a los 100 segundos). El
    frontend lo lanza y despues pregunta por este estado hasta que este listo.
    """

    estado: EstadoTrabajo
    progreso: ProgresoExplicacion | None = None
    # Explicaciones que esperan antes que esta. Solo con estado en_cola.
    delante: int | None = None
    error: str | None = None
    resultado: ExplicacionShap | None = None
