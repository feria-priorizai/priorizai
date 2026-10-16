"""Cola de explicaciones en segundo plano.

Una explicacion tarda minutos, mas de lo que aguanta cualquier proxy entre el
navegador y el backend. Por eso no se calcula dentro de la peticion: el endpoint
la encola y responde al tiro, y el frontend pregunta por el estado.

Corren de a uno, en un solo hilo: cada calculo ocupa toda la CPU, asi que dos en
paralelo no terminan antes que uno tras otro.

El estado vive en memoria. Funciona con un solo proceso de uvicorn, que es como
corre el backend; con varios, cada proceso tendria su propia cola. Si el backend
se reinicia a mitad de un calculo, ese calculo se pierde y hay que volver a
pedirlo; los ya terminados estan en la base y no se pierden.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from app.services import explicabilidad

logger = logging.getLogger(__name__)

Guardar = Callable[[dict[str, Any]], None]


@dataclass
class Trabajo:
    interconsulta_id: str
    valores: dict[str, str | None]
    priorizador: Any
    guardar: Guardar
    estado: str = "en_cola"
    progreso: dict[str, Any] | None = None
    error: str | None = None


class ColaExplicaciones:
    def __init__(self) -> None:
        self._cambio = threading.Condition()
        self._trabajos: dict[str, Trabajo] = {}
        self._pendientes: deque[str] = deque()
        self._hilo: threading.Thread | None = None

    # ----------------------------------------------------------------- API --
    def encolar(
        self,
        interconsulta_id: str,
        valores: dict[str, str | None],
        priorizador: Any,
        guardar: Guardar,
    ) -> dict[str, Any]:
        """Encola el calculo, salvo que ya este en curso: pedirlo dos veces
        (dos pestañas, un doble clic) no lo calcula dos veces."""
        with self._cambio:
            actual = self._trabajos.get(interconsulta_id)
            if actual is not None and actual.estado in {"en_cola", "calculando"}:
                return self._describir(actual)

            trabajo = Trabajo(interconsulta_id, valores, priorizador, guardar)
            self._trabajos[interconsulta_id] = trabajo
            self._pendientes.append(interconsulta_id)
            if self._hilo is None:
                self._hilo = threading.Thread(
                    target=self._trabajar,
                    name="explicaciones",
                    # Daemon: un calculo de minutos no debe impedir que el
                    # backend se detenga o se recargue.
                    daemon=True,
                )
                self._hilo.start()
            return self._describir(trabajo)

    def estado(self, interconsulta_id: str) -> dict[str, Any] | None:
        """El estado del trabajo, o None si no hay ninguno: en ese caso la
        respuesta sale de lo que haya guardado en la base."""
        with self._cambio:
            trabajo = self._trabajos.get(interconsulta_id)
            return None if trabajo is None else self._describir(trabajo)

    def esperar(self, timeout: float) -> bool:
        """Espera a que no quede nada pendiente. Para los tests."""
        with self._cambio:
            return self._cambio.wait_for(lambda: self._hilo is None, timeout=timeout)

    # ------------------------------------------------------------- interno --
    def _describir(self, trabajo: Trabajo) -> dict[str, Any]:
        delante = None
        if trabajo.estado == "en_cola":
            delante = list(self._pendientes).index(trabajo.interconsulta_id)
            if any(t.estado == "calculando" for t in self._trabajos.values()):
                delante += 1
        return {
            "estado": trabajo.estado,
            "progreso": trabajo.progreso,
            "delante": delante,
            "error": trabajo.error,
        }

    def _siguiente(self) -> Trabajo | None:
        with self._cambio:
            if not self._pendientes:
                self._hilo = None
                self._cambio.notify_all()
                return None
            trabajo = self._trabajos[self._pendientes.popleft()]
            trabajo.estado = "calculando"
            trabajo.progreso = {"fase": "preparando", "hechos": 0, "total": 1}
            return trabajo

    def _trabajar(self) -> None:
        while (trabajo := self._siguiente()) is not None:
            self._ejecutar(trabajo)

    def _ejecutar(self, trabajo: Trabajo) -> None:
        def avance(fase: str, hechos: int, total: int) -> None:
            with self._cambio:
                trabajo.progreso = {"fase": fase, "hechos": hechos, "total": total}

        inicio = time.monotonic()
        try:
            resultado = explicabilidad.explicar(
                trabajo.priorizador,
                trabajo.valores,
                avance=avance,
            )
            trabajo.guardar(resultado)
        except Exception as exc:
            logger.exception("Fallo la explicacion de %s", trabajo.interconsulta_id)
            with self._cambio:
                trabajo.estado = "error"
                trabajo.progreso = None
                trabajo.error = f"No se pudo calcular la explicación: {exc}"
            return

        logger.info(
            "Explicacion de %s lista en %.0f s",
            trabajo.interconsulta_id,
            time.monotonic() - inicio,
        )
        # Guardado en la base: desde ahora el estado sale de ahi.
        with self._cambio:
            if self._trabajos.get(trabajo.interconsulta_id) is trabajo:
                del self._trabajos[trabajo.interconsulta_id]


_cola = ColaExplicaciones()


def get_cola() -> ColaExplicaciones:
    return _cola
