"""Doble de prueba del servicio de modelos para el ambiente QA.

Implementa el mismo contrato HTTP que el servicio real (ver
backend/app/services/cliente_modelos.py), pero decide la prioridad con reglas
fijas sobre el texto en vez de cargar los 2,7 GB de pesos. Asi las pruebas E2E
y de carga son reproducibles y no dependen de una GPU ni de Google Cloud.

No reemplaza la evaluacion del modelo (Spike-1): solo da al resto del sistema
una respuesta con la forma correcta.

Solo usa la biblioteca estandar para que la imagen no instale nada.
"""

from __future__ import annotations

import json
import os
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

API_KEY = os.getenv("MODEL_SERVICE_API_KEY", "")

PALABRAS_ALTA = ("urgente", "subito", "intenso", "progresivo", "sangrado")
PALABRAS_BAJA = ("control", "rutina", "estable", "seguimiento", "cronico")

PROBABILIDADES = {
    "alta": {"baja": 0.05, "media": 0.13, "alta": 0.82},
    "media": {"baja": 0.18, "media": 0.67, "alta": 0.15},
    "baja": {"baja": 0.74, "media": 0.2, "alta": 0.06},
}

# Entidades que el NER falso reconoce: (clase traducida, clase del modelo).
ENTIDADES = {
    "hipertension": ("Enfermedad", "Disease"),
    "diabetes": ("Enfermedad", "Disease"),
    "asma": ("Enfermedad", "Disease"),
    "losartan": ("Farmaco", "Medication"),
    "metformina": ("Farmaco", "Medication"),
    "ecg": ("Sigla", "Abbreviation"),
}


def _normalizar(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFD", texto)
    return "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn").lower()


def priorizar(interconsulta: dict[str, Any]) -> dict[str, Any]:
    texto = _normalizar(
        " ".join(
            str(interconsulta.get(campo) or "")
            for campo in (
                "historia_clinica",
                "fundamentos_diagnostico",
                "examenes_complementarios",
                "motivo_interconsulta",
            )
        )
    )
    if any(palabra in texto for palabra in PALABRAS_ALTA):
        prioridad = "alta"
    elif any(palabra in texto for palabra in PALABRAS_BAJA):
        prioridad = "baja"
    else:
        prioridad = "media"
    probabilidades = PROBABILIDADES[prioridad]
    return {
        "id": interconsulta["id"],
        "prioridad": prioridad,
        "confianza": round(probabilidades[prioridad] * 100, 2),
        "probabilidades": probabilidades,
    }


def extraer(campos: dict[str, str], umbral: float) -> dict[str, list[dict[str, Any]]]:
    resultado: dict[str, list[dict[str, Any]]] = {}
    for campo, texto in campos.items():
        normalizado = _normalizar(texto or "")
        encontradas = []
        for termino, (clase, clase_original) in ENTIDADES.items():
            inicio = normalizado.find(termino)
            if inicio >= 0 and umbral <= 0.9:
                encontradas.append(
                    {
                        "clase": clase,
                        "clase_original": clase_original,
                        "texto": texto[inicio : inicio + len(termino)],
                        "inicio": inicio,
                        "fin": inicio + len(termino),
                        "score": 0.9,
                    }
                )
        if encontradas:
            resultado[campo] = sorted(encontradas, key=lambda e: e["inicio"])
    return resultado


class Manejador(BaseHTTPRequestHandler):
    def _responder(self, estado: int, cuerpo: dict[str, Any]) -> None:
        datos = json.dumps(cuerpo).encode()
        self.send_response(estado)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def do_GET(self) -> None:  # noqa: N802 (nombre impuesto por http.server)
        if self.path == "/health":
            self._responder(200, {"status": "ok", "modelo": "falso"})
        else:
            self._responder(404, {"detail": "No encontrado"})

    def do_POST(self) -> None:  # noqa: N802
        if API_KEY and self.headers.get("X-API-Key") != API_KEY:
            self._responder(401, {"detail": "Clave invalida"})
            return
        largo = int(self.headers.get("Content-Length") or 0)
        payload = json.loads(self.rfile.read(largo) or b"{}")

        if self.path == "/priorizar":
            resultados = [priorizar(ic) for ic in payload.get("interconsultas", [])]
            self._responder(200, {"total": len(resultados), "resultados": resultados})
        elif self.path == "/extraer-entidades":
            umbral = float(payload.get("umbral", 0.5))
            resultados = [
                {"id": doc["id"], "entidades": extraer(doc.get("campos", {}), umbral)}
                for doc in payload.get("documentos", [])
            ]
            self._responder(200, {"resultados": resultados})
        else:
            self._responder(404, {"detail": "No encontrado"})

    def log_message(self, formato: str, *args: Any) -> None:
        # Una linea por peticion en el log del contenedor, sin el cuerpo.
        print(f"modelos-falsos: {self.command} {self.path} -> {args[1]}", flush=True)


if __name__ == "__main__":
    puerto = int(os.getenv("PORT", "8080"))
    print(f"Servicio de modelos falso escuchando en :{puerto}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", puerto), Manejador).serve_forever()
