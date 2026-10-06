"""Registro de eventos de seguridad: inicios de sesion, fallos, bloqueos,
cambios de contrasena y altas de cuentas.

Va al log del backend con una etiqueta fija (AUDITORIA) para poder filtrarlo:
`docker compose logs backend | grep AUDITORIA`. Nunca incluye contrasenas ni
tokens.
"""

import logging

from fastapi import Request

logger = logging.getLogger("priorizai.auditoria")
logger.setLevel(logging.INFO)
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(asctime)s AUDITORIA %(message)s"))
    logger.addHandler(_handler)


def ip_cliente(request: Request) -> str:
    """IP de quien hace la peticion.

    Detras de Cloudflare la conexion llega desde el proxy, asi que se prefiere
    CF-Connecting-IP y luego X-Forwarded-For (que agrega el proxy de Next). Son
    cabeceras que un cliente puede falsificar si llega directo al backend: sirven
    para el registro, no para tomar decisiones de seguridad.
    """
    cloudflare = request.headers.get("cf-connecting-ip")
    if cloudflare:
        return cloudflare
    reenviada = request.headers.get("x-forwarded-for")
    if reenviada:
        return reenviada.split(",")[0].strip()
    return request.client.host if request.client else "desconocida"


def registrar(evento: str, request: Request, **datos: object) -> None:
    detalle = " ".join(f"{clave}={valor!r}" for clave, valor in datos.items())
    logger.info("%s ip=%s %s", evento, ip_cliente(request), detalle)
