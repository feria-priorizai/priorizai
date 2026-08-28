from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Literal

import yaml

if TYPE_CHECKING:
    from app.models.interconsulta import Interconsulta

Asercion = Literal["afirmado", "negado", "historico", "hipotetico"]

# Campos de texto libre de la interconsulta. Se evaluan por separado (no concatenados
# como en priorizador.construir_texto) porque un marcador en un campo no debe alterar
# la asercion de un termino en otro: "dolor toracico" + "sospecha de sindrome coronario"
# son dos campos distintos, y "sospecha de" no debe filtrarse a "dolor toracico".
CAMPOS_CLINICOS = (
    "historia_clinica",
    "fundamentos_diagnostico",
    "examenes_complementarios",
    "motivo_interconsulta",
)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
CATALOGO_PATH = DATA_DIR / "banderas_rojas.yml"
MARCADORES_PATH = DATA_DIR / "marcadores_asercion.yml"

VENTANA_CONTEXTO = 6

FAMILIAS_MARCADORES = (
    "negacion_previa",
    "negacion_posterior",
    "historico",
    "hipotetico",
    "pseudo_negacion",
    "terminadores",
)


@dataclass(frozen=True)
class TerminoCatalogo:
    id: str
    canonico: str
    variantes: tuple[tuple[str, ...], ...]


@dataclass(frozen=True)
class Deteccion:
    termino_id: str
    canonico: str
    posicion: int
    asercion: Asercion


def normalizar_texto(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return texto.lower()


def tokenizar(texto: str) -> list[str]:
    return re.findall(r"\w+", normalizar_texto(texto))


def _tokenizar_frase(frase: str) -> tuple[str, ...]:
    return tuple(tokenizar(frase))


@lru_cache(maxsize=1)
def cargar_catalogo() -> list[TerminoCatalogo]:
    """El catalogo se lee una vez por proceso. Al ser un archivo versionado en el
    repositorio (D4), cambiarlo implica un despliegue, que reinicia el proceso y
    relee el archivo. Si mas adelante se agrega el CRUD de terminos, esta cache
    debe invalidarse al guardar (cargar_catalogo.cache_clear()), o el endpoint de
    reevaluacion seguira usando el catalogo viejo."""
    with CATALOGO_PATH.open(encoding="utf-8") as archivo:
        datos = yaml.safe_load(archivo)

    terminos = []
    for item in datos.get("terminos", []):
        variantes_texto = [item["canonico"], *item.get("sinonimos", [])]
        variantes = tuple(_tokenizar_frase(v) for v in variantes_texto)
        terminos.append(
            TerminoCatalogo(
                id=item["id"],
                canonico=item["canonico"],
                variantes=variantes,
            )
        )
    return terminos


@lru_cache(maxsize=1)
def cargar_marcadores() -> dict[str, list[tuple[str, ...]]]:
    with MARCADORES_PATH.open(encoding="utf-8") as archivo:
        datos = yaml.safe_load(archivo)

    return {
        familia: [_tokenizar_frase(frase) for frase in datos.get(familia, [])]
        for familia in FAMILIAS_MARCADORES
    }


def _buscar_todas(tokens: list[str], secuencia: tuple[str, ...]) -> list[int]:
    if not secuencia:
        return []
    largo = len(secuencia)
    return [
        i
        for i in range(len(tokens) - largo + 1)
        if tuple(tokens[i : i + largo]) == secuencia
    ]


def _contiene_alguna(tokens_ventana: list[str], frases: list[tuple[str, ...]]) -> bool:
    return any(_buscar_todas(tokens_ventana, frase) for frase in frases)


def _recortar_por_terminador(
    tokens_ventana: list[str],
    terminadores: list[tuple[str, ...]],
    *,
    desde_el_final: bool,
) -> list[str]:
    """Un terminador ("pero", "aunque") corta el alcance de un marcador de negacion
    anterior: solo los tokens entre el terminador y el termino de alarma cuentan."""
    posiciones = [
        i for frase in terminadores for i in _buscar_todas(tokens_ventana, frase)
    ]
    if not posiciones:
        return tokens_ventana

    if desde_el_final:
        return tokens_ventana[max(posiciones) + 1 :]
    return tokens_ventana[: min(posiciones)]


def _clasificar_asercion(
    tokens: list[str],
    inicio: int,
    fin: int,
    marcadores: dict[str, list[tuple[str, ...]]],
) -> Asercion:
    anterior = _recortar_por_terminador(
        tokens[max(0, inicio - VENTANA_CONTEXTO) : inicio],
        marcadores["terminadores"],
        desde_el_final=True,
    )
    posterior = _recortar_por_terminador(
        tokens[fin : fin + VENTANA_CONTEXTO],
        marcadores["terminadores"],
        desde_el_final=False,
    )
    ventana = anterior + posterior

    if _contiene_alguna(ventana, marcadores["pseudo_negacion"]):
        return "afirmado"
    if _contiene_alguna(anterior, marcadores["negacion_previa"]) or _contiene_alguna(
        posterior, marcadores["negacion_posterior"]
    ):
        return "negado"
    if _contiene_alguna(ventana, marcadores["hipotetico"]):
        return "hipotetico"
    if _contiene_alguna(ventana, marcadores["historico"]):
        return "historico"
    return "afirmado"


def detectar_banderas(texto: str) -> list[Deteccion]:
    if not texto or not texto.strip():
        return []

    tokens = tokenizar(texto)
    marcadores = cargar_marcadores()

    detecciones: list[Deteccion] = []
    for termino in cargar_catalogo():
        posiciones_vistas: set[int] = set()
        for variante in termino.variantes:
            for inicio in _buscar_todas(tokens, variante):
                if inicio in posiciones_vistas:
                    continue
                posiciones_vistas.add(inicio)
                fin = inicio + len(variante)
                detecciones.append(
                    Deteccion(
                        termino_id=termino.id,
                        canonico=termino.canonico,
                        posicion=inicio,
                        asercion=_clasificar_asercion(tokens, inicio, fin, marcadores),
                    )
                )
    return sorted(detecciones, key=lambda d: d.posicion)


@dataclass(frozen=True)
class ResultadoDeteccion:
    bandera_roja: bool
    terminos: list[str]
    forzar_prioridad_alta: bool


def _resultado_desde_detecciones(
    detecciones: list[Deteccion], *, ya_modificada_por_medico: bool
) -> ResultadoDeteccion:
    terminos = terminos_afirmados(detecciones)
    tiene_bandera = bool(terminos)
    return ResultadoDeteccion(
        bandera_roja=tiene_bandera,
        terminos=terminos,
        forzar_prioridad_alta=tiene_bandera and not ya_modificada_por_medico,
    )


def detectar_banderas_multicampo(campos: Iterable[str]) -> list[Deteccion]:
    """Evalua cada campo de forma independiente y junta las detecciones.

    Evita que un marcador de un campo (p. ej. "sospecha de" en fundamentos_diagnostico)
    altere la asercion de un termino detectado en otro campo (p. ej. historia_clinica).
    """
    return [deteccion for campo in campos for deteccion in detectar_banderas(campo)]


def aplicar_banderas_a_interconsulta(
    interconsulta: Interconsulta, *, ya_modificada_por_medico: bool
) -> ResultadoDeteccion:
    """Evalua la interconsulta y actualiza sus campos de bandera roja (RF7).

    Mutacion en el lugar: la llamante es responsable de hacer commit.
    """
    campos = [getattr(interconsulta, nombre) or "" for nombre in CAMPOS_CLINICOS]
    resultado = _resultado_desde_detecciones(
        detectar_banderas_multicampo(campos),
        ya_modificada_por_medico=ya_modificada_por_medico,
    )
    interconsulta.bandera_roja = resultado.bandera_roja
    interconsulta.terminos_bandera_roja = (
        ",".join(resultado.terminos) if resultado.terminos else None
    )
    if resultado.forzar_prioridad_alta:
        interconsulta.prioridad_actual = "alta"
        interconsulta.prioridad_forzada_por_regla = True
    return resultado


def terminos_afirmados(detecciones: list[Deteccion]) -> list[str]:
    vistos: list[str] = []
    for deteccion in detecciones:
        if deteccion.asercion == "afirmado" and deteccion.termino_id not in vistos:
            vistos.append(deteccion.termino_id)
    return vistos


def nombres_de_terminos(ids: str | None) -> list[str]:
    """Traduce los ids persistidos al nombre canonico del catalogo.

    Se persiste el id porque es la clave estable (D4), pero la interfaz debe
    mostrar el termino clinico bien escrito ("dolor toracico" con tilde), no el id
    con guiones bajos. Un id que ya no exista en el catalogo se devuelve tal cual,
    para no perder el motivo de una bandera guardada antes de editar el catalogo.
    """
    if not ids:
        return []
    por_id = {termino.id: termino.canonico for termino in cargar_catalogo()}
    return [
        por_id.get(termino_id, termino_id)
        for termino_id in (parte.strip() for parte in ids.split(","))
        if termino_id
    ]
