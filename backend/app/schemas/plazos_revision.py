from pydantic import BaseModel, StrictInt


class PlazosRevision(BaseModel):
    """Dias maximos de revision por prioridad (HDU-22).

    `StrictInt` porque el plazo es un entero de dias: en modo laxo Pydantic
    aceptaba "5" y 5.0 y guardaba un valor que el administrador no escribio
    asi. El rango y el orden entre prioridades los valida el servicio, con
    mensajes en castellano.
    """

    alta: StrictInt
    media: StrictInt
    baja: StrictInt
