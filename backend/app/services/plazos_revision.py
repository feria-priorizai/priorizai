"""Plazos maximos de revision por prioridad e interconsultas atrasadas (HDU-22).

El atraso no se guarda en la interconsulta: se calcula al leerla, con los plazos
vigentes y la fecha de hoy. Asi un cambio de plazo alcanza a todas las
pendientes en la siguiente lectura, sin recorrer la tabla ni esperar una carga
nueva, y una interconsulta pasa a atrasada sola, con el paso de los dias.
"""

from datetime import UTC, date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.tiempo import ZONA_CHILE
from app.models.interconsulta import Interconsulta
from app.models.plazo_revision import PlazoRevision

# De la mas urgente a la menos urgente: el orden en que se validan los plazos.
PRIORIDADES = ("alta", "media", "baja")

PLAZOS_POR_DEFECTO = {"alta": 5, "media": 15, "baja": 30}

# Diez anios. Un plazo mayor no tiene sentido clinico y, sin tope, un numero
# enorme desborda la columna INTEGER de Postgres y la peticion responde 500.
PLAZO_MAXIMO = 3650


def validar_plazos(plazos: dict[str, int]) -> None:
    """Mayores que 0, y una prioridad mas alta nunca con mas dias que una
    mas baja: si no, una interconsulta alta podria esperar mas que una baja sin
    quedar atrasada."""
    for prioridad in PRIORIDADES:
        dias = plazos[prioridad]
        if dias < 1:
            raise ValueError(
                f"El plazo de prioridad {prioridad} es inválido: debe ser mayor "
                "que 0 días"
            )
        if dias > PLAZO_MAXIMO:
            raise ValueError(
                f"El plazo de prioridad {prioridad} no puede superar "
                f"{PLAZO_MAXIMO} días"
            )
    for mas_alta, mas_baja in zip(PRIORIDADES, PRIORIDADES[1:], strict=False):
        if plazos[mas_alta] > plazos[mas_baja]:
            raise ValueError(
                f"El plazo de prioridad {mas_alta} no puede ser mayor que el de "
                f"prioridad {mas_baja}"
            )


def obtener_plazos(db: Session) -> dict[str, int]:
    """Plazos vigentes. Mientras el administrador no los defina, rigen los de
    fabrica."""
    plazos = dict(PLAZOS_POR_DEFECTO)
    for fila in db.scalars(select(PlazoRevision)).all():
        if fila.prioridad in plazos:
            plazos[fila.prioridad] = fila.dias
    return plazos


def guardar_plazos(db: Session, plazos: dict[str, int], *, por: str) -> dict[str, int]:
    validar_plazos(plazos)
    for prioridad in PRIORIDADES:
        fila = db.get(PlazoRevision, prioridad)
        if fila is None:
            fila = PlazoRevision(prioridad=prioridad)
            db.add(fila)
        fila.dias = plazos[prioridad]
        fila.actualizado_por = por
    db.commit()
    return obtener_plazos(db)


def _prioridad_vigente(interconsulta: Interconsulta) -> str | None:
    """La misma que ordena la lista: la actual y, si no hay, la sugerida."""
    for valor in (
        interconsulta.prioridad_actual,
        interconsulta.prioridad_sugerida_modelo,
    ):
        prioridad = (valor or "").strip().lower()
        if prioridad:
            return prioridad
    return None


def _dia_de_inicio(interconsulta: Interconsulta) -> date | None:
    """Desde cuando se cuenta la espera: la fecha de emision y, si el archivo no
    la trajo, el dia en que la interconsulta entro al sistema.

    La fecha de emision es de calendario y se usa tal cual. `created_at` es un
    instante en UTC: se pasa a Chile para no adelantar un dia a las que
    entraron de noche.
    """
    if interconsulta.fecha_emision is not None:
        return interconsulta.fecha_emision.date()
    ingreso = interconsulta.created_at
    if ingreso is None:
        return None
    if ingreso.tzinfo is None:
        ingreso = ingreso.replace(tzinfo=UTC)
    return ingreso.astimezone(ZONA_CHILE).date()


def dias_de_atraso(
    interconsulta: Interconsulta, plazos: dict[str, int], hoy: date
) -> int | None:
    """Dias que la interconsulta lleva por sobre el plazo de su prioridad, o
    None si no esta atrasada.

    Solo cuentan las pendientes: revisarla (confirmarla o cambiarle la
    prioridad, que tambien la marca revisada) le quita el atraso. Las que no
    tienen prioridad no tienen plazo contra el cual medirse.
    """
    if interconsulta.estado != "pendiente":
        return None
    prioridad = _prioridad_vigente(interconsulta)
    if prioridad not in plazos:
        return None
    inicio = _dia_de_inicio(interconsulta)
    if inicio is None:
        return None
    atraso = (hoy - inicio).days - plazos[prioridad]
    return atraso if atraso > 0 else None
