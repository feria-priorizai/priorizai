"""HDU-15: inicio de sesion con alias y contrasena.

A diferencia del resto de la suite, aca la sesion NO se da por iniciada: el
cliente pasa por el login de verdad y lleva la cookie como un navegador.
"""

import logging
from collections.abc import Callable, Iterator
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from sqlalchemy import Engine, select, update
from sqlalchemy.orm import Session, sessionmaker

import app.main as main_module
import app.services.auth as auth_service
from app.api.auth import COOKIE_SESION
from app.core.config import settings
from app.core.database import get_db
from app.main import app
from app.models.interconsulta import Interconsulta
from app.models.modificacion_prioridad import ModificacionPrioridad
from app.models.usuario import IntentoLogin, Sesion, Usuario
from app.services.auth import (
    asegurar_admin_inicial,
    crear_usuario,
    hashear_password,
)

PASSWORD = "clave-segura-1"
MENSAJE_CREDENCIALES = "No se pudo iniciar sesión: alias o contraseña incorrectos"


@pytest.fixture
def cliente(
    _sin_overrides: None,
    session_factory: sessionmaker[Session],
) -> Iterator[TestClient]:
    def override_get_db() -> Iterator[Session]:
        sesion = session_factory()
        try:
            yield sesion
        finally:
            sesion.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)


def _cuenta_en_uso(db: Session, **datos: str) -> Usuario:
    """Una cuenta que ya cambio la contrasena inicial."""
    cuenta = crear_usuario(db, password=PASSWORD, **datos)
    cuenta.debe_cambiar_password = False
    db.commit()
    return cuenta


@pytest.fixture
def usuario(db: Session) -> Usuario:
    return _cuenta_en_uso(
        db,
        alias="jperez",
        nombre="Dr. Juan Pérez",
        correo="juan@hospital.cl",
        rol="medico",
        especialidad="Cardiología",
    )


def _login(cliente: TestClient, alias: str = "jperez", password: str = PASSWORD):
    return cliente.post("/api/auth/login", json={"alias": alias, "password": password})


def test_login_valido_devuelve_el_usuario_y_abre_sesion(
    cliente: TestClient, usuario: Usuario
) -> None:
    response = _login(cliente)

    assert response.status_code == 200
    assert response.json() == {
        "id": usuario.id,
        "alias": "jperez",
        "nombre": "Dr. Juan Pérez",
        "correo": "juan@hospital.cl",
        "rol": "medico",
        "especialidad": "Cardiología",
        "activo": True,
        "debe_cambiar_password": False,
        "bloqueado_por_intentos": False,
    }
    me = cliente.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["alias"] == "jperez"


def test_la_cookie_de_sesion_no_es_accesible_desde_javascript(
    cliente: TestClient, usuario: Usuario
) -> None:
    cookie = _login(cliente).headers["set-cookie"]

    assert cookie.startswith(f"{COOKIE_SESION}=")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Secure" not in cookie


def test_la_cookie_es_secure_cuando_se_configura(
    cliente: TestClient, usuario: Usuario, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "cookie_secure", True)

    assert "Secure" in _login(cliente).headers["set-cookie"]


def test_el_alias_no_distingue_mayusculas_ni_espacios(
    cliente: TestClient, usuario: Usuario
) -> None:
    assert _login(cliente, alias="  JPerez ").status_code == 200


def test_la_base_no_guarda_ni_la_contrasena_ni_el_token(
    cliente: TestClient, usuario: Usuario, db: Session
) -> None:
    _login(cliente)
    token = cliente.cookies[COOKIE_SESION]

    db.rollback()
    guardado = db.get(Usuario, usuario.id)
    assert guardado is not None
    assert PASSWORD not in guardado.password_hash
    assert guardado.password_hash.startswith("$argon2")
    sesion = db.scalar(select(Sesion))
    assert sesion is not None
    assert sesion.token_hash != token


def test_contrasena_incorrecta_devuelve_401(
    cliente: TestClient, usuario: Usuario
) -> None:
    response = _login(cliente, password="otra-clave")

    assert response.status_code == 401
    assert response.json()["detail"] == MENSAJE_CREDENCIALES
    assert COOKIE_SESION not in cliente.cookies


def test_alias_inexistente_responde_igual_que_contrasena_incorrecta(
    cliente: TestClient, usuario: Usuario
) -> None:
    """Si los mensajes difirieran, el login serviria para averiguar que alias
    existen."""
    inexistente = _login(cliente, alias="nadie")
    incorrecta = _login(cliente, password="otra-clave")

    assert inexistente.status_code == incorrecta.status_code == 401
    assert inexistente.json() == incorrecta.json()


def test_usuario_inactivo_no_puede_entrar(
    cliente: TestClient, usuario: Usuario, db: Session
) -> None:
    usuario.activo = False
    db.commit()

    response = _login(cliente)

    assert response.status_code == 401
    assert response.json()["detail"] == MENSAJE_CREDENCIALES


@pytest.mark.parametrize(
    ("metodo", "ruta"),
    [
        ("get", "/api/auth/me"),
        ("get", "/api/interconsultas"),
        ("get", "/api/interconsultas/ic-001"),
        ("patch", "/api/interconsultas/ic-001/prioridad"),
        ("patch", "/api/interconsultas/ic-001/estado"),
        ("post", "/api/interconsultas/priorizar"),
        ("post", "/api/interconsultas/priorizar-pendientes"),
        ("post", "/api/interconsultas/reevaluar-banderas"),
        ("post", "/upload-csv"),
    ],
)
def test_sin_sesion_la_api_responde_401(
    cliente: TestClient, metodo: str, ruta: str
) -> None:
    response = getattr(cliente, metodo)(ruta)

    assert response.status_code == 401
    assert response.json()["detail"] == "Debes iniciar sesión"


def test_con_sesion_se_accede_a_las_interconsultas(
    cliente: TestClient, usuario: Usuario
) -> None:
    _login(cliente)

    assert cliente.get("/api/interconsultas").status_code == 200


def test_un_token_inventado_no_abre_sesion(cliente: TestClient) -> None:
    cliente.cookies.set(COOKIE_SESION, "token-inventado")

    assert cliente.get("/api/auth/me").status_code == 401


def test_la_sesion_vencida_ya_no_sirve(
    cliente: TestClient, usuario: Usuario, db: Session
) -> None:
    _login(cliente)
    db.execute(
        update(Sesion).values(expira_en=auth_service._ahora() - timedelta(minutes=1))
    )
    db.commit()

    assert cliente.get("/api/auth/me").status_code == 401


def test_desactivar_al_usuario_corta_su_sesion_abierta(
    cliente: TestClient, usuario: Usuario, db: Session
) -> None:
    _login(cliente)
    usuario.activo = False
    db.commit()

    assert cliente.get("/api/auth/me").status_code == 401


def test_el_login_limpia_las_sesiones_vencidas(
    cliente: TestClient, usuario: Usuario, db: Session
) -> None:
    _login(cliente)
    db.execute(
        update(Sesion).values(expira_en=auth_service._ahora() - timedelta(minutes=1))
    )
    db.commit()

    _login(cliente)

    db.rollback()
    assert len(db.scalars(select(Sesion)).all()) == 1


def test_logout_invalida_la_sesion_en_el_servidor(
    cliente: TestClient, usuario: Usuario
) -> None:
    """Borrar la cookie no basta en un equipo compartido: si alguien copio el
    token, tiene que dejar de servir."""
    _login(cliente)
    token = cliente.cookies[COOKIE_SESION]

    response = cliente.post("/api/auth/logout")

    assert response.status_code == 204
    assert f"{COOKIE_SESION}=" in response.headers["set-cookie"]
    cliente.cookies.set(COOKIE_SESION, token)
    assert cliente.get("/api/auth/me").status_code == 401


def test_logout_sin_sesion_no_falla(cliente: TestClient) -> None:
    assert cliente.post("/api/auth/logout").status_code == 204


def test_tras_varios_fallos_el_alias_queda_bloqueado(
    cliente: TestClient, usuario: Usuario, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "login_max_intentos", 3)

    for _ in range(3):
        assert _login(cliente, password="mala-clave").status_code == 401

    response = _login(cliente)
    assert response.status_code == 429
    assert "15 minutos" in response.json()["detail"]


def test_el_mensaje_de_bloqueo_usa_singular_con_un_minuto(
    cliente: TestClient, usuario: Usuario, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "login_max_intentos", 1)
    monkeypatch.setattr(settings, "login_bloqueo_minutos", 1)
    _login(cliente, password="mala-clave")

    assert "en 1 minuto." in _login(cliente).json()["detail"]


def test_el_bloqueo_vence_y_se_puede_volver_a_entrar(
    cliente: TestClient,
    usuario: Usuario,
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "login_max_intentos", 1)
    _login(cliente, password="mala-clave")
    db.execute(
        update(IntentoLogin).values(
            bloqueado_hasta=auth_service._ahora() - timedelta(seconds=1)
        )
    )
    db.commit()

    assert _login(cliente).status_code == 200
    db.rollback()
    assert db.get(IntentoLogin, "jperez") is None


def test_un_alias_inexistente_se_bloquea_igual_que_uno_real(
    cliente: TestClient, usuario: Usuario, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Si solo se bloquearan los alias reales, recibir un 429 confirmaria que el
    alias existe."""
    monkeypatch.setattr(settings, "login_max_intentos", 2)

    respuestas = {}
    for alias in ("jperez", "nadie"):
        for _ in range(2):
            _login(cliente, alias=alias, password="mala-clave")
        respuestas[alias] = _login(cliente, alias=alias, password="mala-clave")

    assert respuestas["jperez"].status_code == 429
    assert respuestas["nadie"].status_code == 429
    assert respuestas["jperez"].json() == respuestas["nadie"].json()


def test_los_fallos_viejos_no_se_acumulan(
    cliente: TestClient,
    usuario: Usuario,
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pasada la ventana sin fallar, el contador vuelve a cero. Tambien es lo
    que impide que probar alias al azar llene la tabla."""
    monkeypatch.setattr(settings, "login_max_intentos", 2)
    _login(cliente, alias="nadie", password="mala-clave")
    db.execute(
        update(IntentoLogin).values(
            ultimo_fallo=auth_service._ahora() - timedelta(minutes=16)
        )
    )
    db.commit()

    assert _login(cliente, alias="nadie", password="mala-clave").status_code == 401
    db.rollback()
    intento = db.get(IntentoLogin, "nadie")
    assert intento is not None
    assert intento.fallos == 1


def test_un_login_correcto_reinicia_el_contador_de_fallos(
    cliente: TestClient,
    usuario: Usuario,
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Los fallos cuentan seguidos: equivocarse una vez por dia no debe terminar
    bloqueando la cuenta."""
    monkeypatch.setattr(settings, "login_max_intentos", 2)
    _login(cliente, password="mala-clave")
    _login(cliente)
    _login(cliente, password="mala-clave")

    assert _login(cliente).status_code == 200


@pytest.mark.parametrize(
    ("campos", "mensaje"),
    [
        ({"alias": "  "}, "entre 3 y 64 caracteres"),
        ({"alias": "el tester"}, "entre 3 y 64 caracteres"),
        ({"alias": "ab"}, "entre 3 y 64 caracteres"),
        ({"alias": "josé"}, "entre 3 y 64 caracteres"),
        ({"correo": "sin-arroba"}, "El correo no es válido"),
        ({"correo": "JUAN@hospital.cl"}, "Ya existe un usuario con el correo"),
        ({"nombre": " "}, "El nombre es obligatorio"),
        ({"rol": "director"}, "Rol desconocido"),
        ({"rol": "medico_especialista"}, "Rol desconocido"),
        ({"rol": "medico"}, "Selecciona la especialidad"),
        ({"rol": "medico", "especialidad": "Astrología"}, "Selecciona la especialidad"),
        ({"password": "corta"}, "al menos 8 caracteres"),
        ({"alias": "JPEREZ"}, "Ya existe un usuario con el alias jperez"),
    ],
)
def test_crear_usuario_valida_los_datos(
    db: Session,
    usuario: Usuario,
    campos: dict[str, str],
    mensaje: str,
) -> None:
    datos = {
        "alias": "otro",
        "nombre": "Otra persona",
        "rol": "administrador",
        "password": PASSWORD,
    }
    datos.update(campos)

    with pytest.raises(ValueError, match=mensaje):
        crear_usuario(db, **datos)


def test_un_hash_con_parametros_viejos_se_rehace_al_entrar(
    cliente: TestClient, usuario: Usuario, db: Session
) -> None:
    viejo = PasswordHash((Argon2Hasher(time_cost=1, memory_cost=8192),))
    usuario.password_hash = viejo.hash(PASSWORD)
    db.commit()
    hash_viejo = usuario.password_hash

    assert _login(cliente).status_code == 200

    db.rollback()
    actualizado = db.get(Usuario, usuario.id)
    assert actualizado is not None
    assert actualizado.password_hash != hash_viejo


def test_hashear_password_no_devuelve_el_texto_plano() -> None:
    assert hashear_password(PASSWORD) != PASSWORD


@pytest.fixture
def admin_configurado(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "admin_alias", "Admin")
    monkeypatch.setattr(settings, "admin_password", "admin-clave-123")
    monkeypatch.setattr(settings, "admin_nombre", "Jefatura TI")


def test_con_la_base_vacia_se_crea_el_admin_del_env(
    cliente: TestClient, db: Session, admin_configurado: None
) -> None:
    assert asegurar_admin_inicial(db) is True

    response = _login(cliente, alias="admin", password="admin-clave-123")
    assert response.status_code == 200
    assert response.json()["rol"] == "administrador"
    assert response.json()["nombre"] == "Jefatura TI"
    assert response.json()["correo"] is None


def test_el_admin_inicial_toma_el_correo_del_env(
    cliente: TestClient,
    db: Session,
    admin_configurado: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "admin_correo", "TI@Hospital.cl")

    asegurar_admin_inicial(db)

    login = _login(cliente, alias="admin", password="admin-clave-123")
    assert login.json()["correo"] == "ti@hospital.cl"


def test_el_admin_inicial_no_se_crea_si_ya_hay_usuarios(
    db: Session, usuario: Usuario, admin_configurado: None
) -> None:
    """Cambiar el .env despues no debe pisar la contrasena que el
    administrador tenga en uso."""
    assert asegurar_admin_inicial(db) is False
    assert db.scalar(select(Usuario).where(Usuario.alias == "admin")) is None


def test_sin_variables_de_admin_no_se_crea_nada(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "admin_alias", "admin")
    monkeypatch.setattr(settings, "admin_password", "")

    assert asegurar_admin_inicial(db) is False
    assert db.scalar(select(Usuario)) is None


def test_el_arranque_crea_el_admin_inicial(
    db: Session,
    session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
    admin_configurado: None,
) -> None:
    monkeypatch.setattr(main_module, "SessionLocal", session_factory)

    main_module._crear_admin_inicial()

    creado = db.scalar(select(Usuario))
    assert creado is not None
    assert creado.alias == "admin"


@pytest.fixture
def admin(db: Session) -> Usuario:
    return _cuenta_en_uso(
        db, alias="admin", nombre="Administrador", rol="administrador"
    )


NUEVA_CUENTA = {
    "alias": "mrojas",
    "nombre": "Dra. Marta Rojas",
    "correo": "marta.rojas@hospital.cl",
    "rol": "medico",
    "especialidad": "Neurología",
    "password": "clave-inicial-1",
}


def test_un_admin_crea_una_cuenta_que_luego_puede_entrar(
    cliente: TestClient, admin: Usuario
) -> None:
    _login(cliente, alias="admin")

    response = cliente.post("/api/usuarios", json=NUEVA_CUENTA)

    assert response.status_code == 201
    assert response.json()["alias"] == "mrojas"
    assert "password" not in response.json()
    cliente.post("/api/auth/logout")
    assert (
        _login(cliente, alias="mrojas", password="clave-inicial-1").status_code == 200
    )


def test_un_admin_lista_las_cuentas(
    cliente: TestClient, admin: Usuario, usuario: Usuario
) -> None:
    _login(cliente, alias="admin")

    response = cliente.get("/api/usuarios")

    assert response.status_code == 200
    assert [u["alias"] for u in response.json()] == ["admin", "jperez"]


@pytest.mark.parametrize(("metodo", "cuerpo"), [("get", None), ("post", NUEVA_CUENTA)])
def test_quien_no_es_admin_no_gestiona_cuentas(
    cliente: TestClient,
    usuario: Usuario,
    metodo: str,
    cuerpo: dict[str, str] | None,
) -> None:
    _login(cliente)

    kwargs = {"json": cuerpo} if cuerpo else {}
    response = getattr(cliente, metodo)("/api/usuarios", **kwargs)

    assert response.status_code == 403


def test_sin_sesion_no_se_gestionan_cuentas(cliente: TestClient) -> None:
    assert cliente.post("/api/usuarios", json=NUEVA_CUENTA).status_code == 401


def test_alias_repetido_devuelve_409(
    cliente: TestClient, admin: Usuario, usuario: Usuario
) -> None:
    _login(cliente, alias="admin")

    response = cliente.post("/api/usuarios", json={**NUEVA_CUENTA, "alias": "jperez"})

    assert response.status_code == 409


def test_datos_invalidos_devuelven_422_con_el_motivo(
    cliente: TestClient, admin: Usuario
) -> None:
    _login(cliente, alias="admin")

    response = cliente.post("/api/usuarios", json={**NUEVA_CUENTA, "password": "corta"})

    assert response.status_code == 422
    assert "al menos 8 caracteres" in response.json()["detail"]


def _ultimo_uso_hace(db: Session, minutos: float) -> None:
    db.execute(
        update(Sesion).values(
            ultimo_uso=auth_service._ahora() - timedelta(minutes=minutos)
        )
    )
    db.commit()


def test_la_sesion_se_cierra_tras_la_inactividad(
    cliente: TestClient, usuario: Usuario, db: Session
) -> None:
    """Un equipo compartido que alguien dejo abierto no debe seguir entrando
    con su cuenta por el resto del turno."""
    _login(cliente)
    _ultimo_uso_hace(db, 31)

    assert cliente.get("/api/auth/me").status_code == 401
    db.rollback()
    assert db.scalar(select(Sesion)) is None


def test_usar_la_app_mantiene_viva_la_sesion(
    cliente: TestClient, usuario: Usuario, db: Session
) -> None:
    _login(cliente)
    _ultimo_uso_hace(db, 20)

    assert cliente.get("/api/auth/me").status_code == 200
    db.rollback()
    sesion = db.scalar(select(Sesion))
    assert sesion is not None
    assert auth_service._ahora() - sesion.ultimo_uso < timedelta(minutes=1)


def test_el_uso_reciente_no_reescribe_la_sesion(
    cliente: TestClient, usuario: Usuario, db: Session
) -> None:
    """Escribir en la base en cada request no aporta: basta con un minuto de
    precision."""
    _login(cliente)
    db.rollback()
    sesion = db.scalar(select(Sesion))
    assert sesion is not None
    antes = sesion.ultimo_uso

    cliente.get("/api/auth/me")

    db.rollback()
    despues = db.scalar(select(Sesion))
    assert despues is not None
    assert despues.ultimo_uso == antes


def test_no_se_aceptan_contrasenas_de_mas_de_128_caracteres(db: Session) -> None:
    with pytest.raises(ValueError, match="más de 128"):
        crear_usuario(
            db, alias="largo", nombre="Largo", rol="administrador", password="x" * 129
        )


def test_el_login_rechaza_entradas_enormes_sin_hashearlas(
    cliente: TestClient, usuario: Usuario
) -> None:
    assert _login(cliente, password="x" * 10_000).status_code == 422


@pytest.fixture
def cuenta_nueva(db: Session) -> Usuario:
    """Como la deja el admin: con una contrasena que el tambien conoce."""
    return crear_usuario(
        db,
        alias="mrojas",
        nombre="Dra. Marta Rojas",
        rol="administrador",
        password=PASSWORD,
    )


def _cambiar(cliente: TestClient, actual: str, nueva: str):
    return cliente.post(
        "/api/auth/cambiar-password",
        json={"password_actual": actual, "password_nueva": nueva},
    )


def test_una_cuenta_nueva_solo_puede_cambiar_su_contrasena(
    cliente: TestClient, cuenta_nueva: Usuario
) -> None:
    login = _login(cliente, alias="mrojas")
    assert login.status_code == 200
    assert login.json()["debe_cambiar_password"] is True

    assert cliente.get("/api/auth/me").status_code == 200
    bloqueada = cliente.get("/api/interconsultas")
    assert bloqueada.status_code == 403
    assert (
        bloqueada.json()["detail"] == "Debes cambiar tu contraseña antes de continuar"
    )

    cambio = _cambiar(cliente, PASSWORD, "nueva-clave-segura")
    assert cambio.status_code == 200
    assert cambio.json()["debe_cambiar_password"] is False
    assert cliente.get("/api/interconsultas").status_code == 200


def test_tras_el_cambio_solo_sirve_la_nueva_contrasena(
    cliente: TestClient, cuenta_nueva: Usuario
) -> None:
    _login(cliente, alias="mrojas")
    _cambiar(cliente, PASSWORD, "nueva-clave-segura")
    cliente.post("/api/auth/logout")

    assert _login(cliente, alias="mrojas").status_code == 401
    assert (
        _login(cliente, alias="mrojas", password="nueva-clave-segura").status_code
        == 200
    )


def test_cambiar_la_contrasena_cierra_las_demas_sesiones(
    cliente: TestClient, usuario: Usuario
) -> None:
    """Si alguien mas tenia una sesion abierta con la clave vieja, la pierde."""
    otro_equipo = TestClient(app)
    _login(otro_equipo)
    _login(cliente)

    assert _cambiar(cliente, PASSWORD, "nueva-clave-segura").status_code == 200

    assert cliente.get("/api/auth/me").status_code == 200
    assert otro_equipo.get("/api/auth/me").status_code == 401


def test_sin_la_contrasena_actual_no_se_cambia(
    cliente: TestClient, usuario: Usuario
) -> None:
    """Quien encuentre una sesion abierta no debe poder quedarse con la cuenta."""
    _login(cliente)

    response = _cambiar(cliente, "otra-cosa", "nueva-clave-segura")

    assert response.status_code == 400
    assert response.json()["detail"] == "La contraseña actual no es correcta"


def test_adivinar_la_actual_cuenta_para_el_bloqueo(
    cliente: TestClient, usuario: Usuario, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "login_max_intentos", 2)
    _login(cliente)
    _cambiar(cliente, "mala-1", "nueva-clave-segura")
    _cambiar(cliente, "mala-2", "nueva-clave-segura")

    assert _cambiar(cliente, PASSWORD, "nueva-clave-segura").status_code == 429
    assert _login(TestClient(app)).status_code == 429


@pytest.mark.parametrize(
    ("nueva", "mensaje"),
    [
        (PASSWORD, "distinta de la actual"),
        ("corta", "al menos 8"),
        ("x" * 129, "más de 128"),
    ],
)
def test_la_nueva_contrasena_se_valida(
    cliente: TestClient, usuario: Usuario, nueva: str, mensaje: str
) -> None:
    _login(cliente)

    response = _cambiar(cliente, PASSWORD, nueva)

    assert response.status_code == 422
    assert mensaje in response.json()["detail"]


def test_el_cambio_de_contrasena_exige_sesion(cliente: TestClient) -> None:
    assert _cambiar(cliente, PASSWORD, "nueva-clave-segura").status_code == 401


def test_el_admin_inicial_tambien_debe_cambiar_la_del_env(
    cliente: TestClient, db: Session, admin_configurado: None
) -> None:
    """La del .env la conoce cualquiera con acceso al servidor."""
    asegurar_admin_inicial(db)

    login = _login(cliente, alias="admin", password="admin-clave-123")

    assert login.json()["debe_cambiar_password"] is True


@pytest.mark.parametrize("sitio", ["cross-site", "same-site"])
def test_una_peticion_de_otro_sitio_que_modifica_se_rechaza(
    cliente: TestClient, usuario: Usuario, sitio: str
) -> None:
    """Un formulario en otra pagina no debe poder actuar con la sesion del
    usuario, aunque el navegador le adjunte la cookie."""
    response = cliente.post(
        "/api/auth/login",
        json={"alias": "jperez", "password": PASSWORD},
        headers={"Sec-Fetch-Site": sitio},
    )

    assert response.status_code == 403
    assert COOKIE_SESION not in cliente.cookies


@pytest.mark.parametrize("sitio", ["same-origin", "none"])
def test_una_peticion_de_la_propia_app_pasa(
    cliente: TestClient, usuario: Usuario, sitio: str
) -> None:
    response = cliente.post(
        "/api/auth/login",
        json={"alias": "jperez", "password": PASSWORD},
        headers={"Sec-Fetch-Site": sitio},
    )

    assert response.status_code == 200


def test_las_lecturas_de_otro_sitio_no_se_filtran_por_origen(
    cliente: TestClient,
) -> None:
    """Un GET no modifica nada; lo que lo protege es CORS y la sesion."""
    response = cliente.get("/health", headers={"Sec-Fetch-Site": "cross-site"})

    assert response.status_code == 200


def test_las_respuestas_llevan_cabeceras_de_seguridad(cliente: TestClient) -> None:
    response = cliente.get("/health")

    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Referrer-Policy"] == "same-origin"
    assert "no-store" not in response.headers.get("Cache-Control", "")


def test_la_api_no_se_guarda_en_caches(cliente: TestClient) -> None:
    response = cliente.get("/api/auth/me")

    assert response.headers["Cache-Control"] == "no-store"


def _eventos(caplog: pytest.LogCaptureFixture) -> list[str]:
    return [r.getMessage() for r in caplog.records if r.name == "priorizai.auditoria"]


def test_se_registran_los_eventos_de_acceso(
    cliente: TestClient,
    usuario: Usuario,
    admin: Usuario,
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "login_max_intentos", 1)
    caplog.set_level(logging.INFO, logger="priorizai.auditoria")

    _login(cliente, alias="nadie", password="mala-clave")
    _login(cliente, alias="nadie", password="mala-clave")
    _login(cliente, alias="admin")
    cliente.post("/api/usuarios", json=NUEVA_CUENTA)
    _cambiar(cliente, "mala-clave", "nueva-clave-segura")
    _login(cliente)
    _cambiar(cliente, PASSWORD, "nueva-clave-segura")
    cliente.post("/api/auth/logout")

    eventos = _eventos(caplog)
    assert [e.split()[0] for e in eventos] == [
        "login_fallido",
        "login_bloqueado",
        "login_exitoso",
        "cuenta_creada",
        "cambio_password_fallido",
        "login_exitoso",
        "password_cambiada",
        "logout",
    ]
    assert "por='admin'" in eventos[3]
    registro = "\n".join(eventos)
    for secreto in (PASSWORD, "mala-clave", "nueva-clave-segura", "clave-inicial-1"):
        assert secreto not in registro


def test_un_cambio_de_password_bloqueado_queda_registrado(
    cliente: TestClient,
    usuario: Usuario,
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "login_max_intentos", 1)
    caplog.set_level(logging.INFO, logger="priorizai.auditoria")
    _login(cliente)
    _cambiar(cliente, "mala-clave", "nueva-clave-segura")

    _cambiar(cliente, "mala-clave", "nueva-clave-segura")

    assert _eventos(caplog)[-1].startswith("cambio_password_bloqueado")


@pytest.mark.parametrize(
    ("cabeceras", "ip"),
    [
        ({"CF-Connecting-IP": "200.1.1.1", "X-Forwarded-For": "10.0.0.1"}, "200.1.1.1"),
        ({"X-Forwarded-For": "190.2.2.2, 10.0.0.1"}, "190.2.2.2"),
        ({}, "testclient"),
    ],
)
def test_la_ip_registrada_es_la_del_cliente_real(
    cliente: TestClient,
    usuario: Usuario,
    caplog: pytest.LogCaptureFixture,
    cabeceras: dict[str, str],
    ip: str,
) -> None:
    """Detras de Cloudflare y del proxy de Next, la conexion llega desde el
    proxy: la IP real viene en las cabeceras."""
    caplog.set_level(logging.INFO, logger="priorizai.auditoria")

    cliente.post(
        "/api/auth/login",
        json={"alias": "jperez", "password": PASSWORD},
        headers=cabeceras,
    )

    assert f"ip={ip} " in _eventos(caplog)[-1]


def test_sin_cliente_conocido_la_ip_queda_como_desconocida() -> None:
    from starlette.requests import Request

    from app.core.auditoria import ip_cliente

    request = Request({"type": "http", "headers": [], "client": None})

    assert ip_cliente(request) == "desconocida"


def test_un_cambio_correcto_limpia_los_fallos_previos(
    cliente: TestClient, usuario: Usuario, db: Session
) -> None:
    _login(cliente)
    _cambiar(cliente, "mala-clave", "nueva-clave-segura")

    assert _cambiar(cliente, PASSWORD, "nueva-clave-segura").status_code == 200
    db.rollback()
    assert db.get(IntentoLogin, "jperez") is None


def test_un_fallo_se_suma_al_registro_que_otra_peticion_acaba_de_crear(
    db: Session, session_factory: sessionmaker[Session]
) -> None:
    """Otra peticion inserto la fila despues de que esta la leyera vacia. El
    fallo se suma releyendo la fila, en vez de pisarla o perderse."""
    ahora = auth_service._ahora()
    assert db.get(IntentoLogin, "nadie") is None
    with session_factory() as otra:
        otra.add(IntentoLogin(alias="nadie", fallos=1, ultimo_fallo=ahora))
        otra.commit()

    auth_service._registrar_fallo(db, "nadie", ahora)

    intento = db.get(IntentoLogin, "nadie", populate_existing=True)
    assert intento is not None
    assert intento.fallos == 2


def test_el_login_rechaza_alias_mas_largos_que_la_columna(
    cliente: TestClient,
) -> None:
    """Sin el limite, Postgres no puede guardar el fallo y responde 500."""
    assert _login(cliente, alias="a" * 65).status_code == 422


def test_el_correo_es_obligatorio_al_crear_desde_la_app(
    cliente: TestClient, admin: Usuario
) -> None:
    _login(cliente, alias="admin")
    sin_correo = {k: v for k, v in NUEVA_CUENTA.items() if k != "correo"}

    assert cliente.post("/api/usuarios", json=sin_correo).status_code == 422


def test_el_correo_se_guarda_en_minusculas(cliente: TestClient, admin: Usuario) -> None:
    _login(cliente, alias="admin")

    response = cliente.post(
        "/api/usuarios", json={**NUEVA_CUENTA, "correo": " Marta.Rojas@Hospital.CL "}
    )

    assert response.json()["correo"] == "marta.rojas@hospital.cl"


def test_un_correo_repetido_devuelve_409(
    cliente: TestClient, admin: Usuario, usuario: Usuario
) -> None:
    _login(cliente, alias="admin")

    response = cliente.post(
        "/api/usuarios", json={**NUEVA_CUENTA, "correo": "Juan@Hospital.cl"}
    )

    assert response.status_code == 409


EDICION = {
    "nombre": "Dr. Juan Pérez Soto",
    "correo": "jperez@hospital.cl",
    "rol": "medico",
    "especialidad": "Medicina Interna",
}


def _como_admin(cliente: TestClient) -> TestClient:
    _login(cliente, alias="admin")
    return cliente


def test_el_admin_edita_los_datos_de_una_cuenta(
    cliente: TestClient, admin: Usuario, usuario: Usuario
) -> None:
    response = _como_admin(cliente).patch(f"/api/usuarios/{usuario.id}", json=EDICION)

    assert response.status_code == 200
    assert response.json() == {
        "id": usuario.id,
        "alias": "jperez",
        "nombre": "Dr. Juan Pérez Soto",
        "correo": "jperez@hospital.cl",
        "rol": "medico",
        "especialidad": "Medicina Interna",
        "activo": True,
        "debe_cambiar_password": False,
        "bloqueado_por_intentos": False,
    }


def test_editar_sin_cambiar_el_correo_no_lo_cuenta_como_repetido(
    cliente: TestClient, admin: Usuario, usuario: Usuario
) -> None:
    response = _como_admin(cliente).patch(
        f"/api/usuarios/{usuario.id}", json={**EDICION, "correo": "juan@hospital.cl"}
    )

    assert response.status_code == 200


def test_editar_con_el_correo_de_otra_cuenta_devuelve_409(
    cliente: TestClient, admin: Usuario, usuario: Usuario, db: Session
) -> None:
    admin.correo = "admin@hospital.cl"
    db.commit()

    response = _como_admin(cliente).patch(
        f"/api/usuarios/{usuario.id}", json={**EDICION, "correo": "admin@hospital.cl"}
    )

    assert response.status_code == 409


def test_editar_con_datos_invalidos_devuelve_422(
    cliente: TestClient, admin: Usuario, usuario: Usuario
) -> None:
    response = _como_admin(cliente).patch(
        f"/api/usuarios/{usuario.id}", json={**EDICION, "rol": "director"}
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("metodo", "ruta", "cuerpo"),
    [
        ("patch", "/api/usuarios/no-existe", EDICION),
        ("patch", "/api/usuarios/no-existe/estado", {"activo": False}),
        ("delete", "/api/usuarios/no-existe", None),
    ],
)
def test_una_cuenta_inexistente_devuelve_404(
    cliente: TestClient,
    admin: Usuario,
    metodo: str,
    ruta: str,
    cuerpo: dict[str, object] | None,
) -> None:
    kwargs = {"json": cuerpo} if cuerpo else {}

    response = getattr(_como_admin(cliente), metodo)(ruta, **kwargs)

    assert response.status_code == 404


def test_restablecer_la_contrasena_obliga_a_cambiarla_y_cierra_sesiones(
    cliente: TestClient, admin: Usuario, usuario: Usuario
) -> None:
    equipo_del_medico = TestClient(app)
    _login(equipo_del_medico)

    response = _como_admin(cliente).patch(
        f"/api/usuarios/{usuario.id}",
        json={**EDICION, "password_temporal": "temporal-123"},
    )

    assert response.status_code == 200
    assert response.json()["debe_cambiar_password"] is True
    assert equipo_del_medico.get("/api/auth/me").status_code == 401
    assert _login(equipo_del_medico).status_code == 401
    assert _login(equipo_del_medico, password="temporal-123").status_code == 200


def test_la_contrasena_temporal_se_valida(
    cliente: TestClient, admin: Usuario, usuario: Usuario
) -> None:
    response = _como_admin(cliente).patch(
        f"/api/usuarios/{usuario.id}", json={**EDICION, "password_temporal": "corta"}
    )

    assert response.status_code == 422


def test_bloquear_corta_las_sesiones_y_el_acceso(
    cliente: TestClient, admin: Usuario, usuario: Usuario
) -> None:
    equipo_del_medico = TestClient(app)
    _login(equipo_del_medico)

    response = _como_admin(cliente).patch(
        f"/api/usuarios/{usuario.id}/estado", json={"activo": False}
    )

    assert response.status_code == 200
    assert response.json()["activo"] is False
    assert equipo_del_medico.get("/api/auth/me").status_code == 401
    login = _login(equipo_del_medico)
    assert login.status_code == 401
    assert login.json()["detail"] == MENSAJE_CREDENCIALES


def test_un_administrador_no_guarda_especialidad(db: Session) -> None:
    cuenta = crear_usuario(
        db,
        alias="jefatura",
        nombre="Jefatura",
        rol="administrador",
        especialidad="Cardiología",
        password=PASSWORD,
    )

    assert cuenta.especialidad is None


def test_desbloquear_levanta_el_bloqueo_por_intentos_fallidos(
    cliente: TestClient,
    admin: Usuario,
    usuario: Usuario,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "login_max_intentos", 3)
    otro = TestClient(app)
    for _ in range(3):
        _login(otro, password="mala-clave")
    assert _login(otro).status_code == 429

    listado = _como_admin(cliente).get("/api/usuarios").json()
    assert {u["alias"]: u["bloqueado_por_intentos"] for u in listado} == {
        "admin": False,
        "jperez": True,
    }

    response = cliente.patch(
        f"/api/usuarios/{usuario.id}/estado", json={"activo": True}
    )

    assert response.status_code == 200
    assert _login(otro).status_code == 200


def test_desbloquear_devuelve_el_acceso(
    cliente: TestClient, admin: Usuario, usuario: Usuario
) -> None:
    _como_admin(cliente).patch(
        f"/api/usuarios/{usuario.id}/estado", json={"activo": False}
    )

    response = cliente.patch(
        f"/api/usuarios/{usuario.id}/estado", json={"activo": True}
    )

    assert response.json()["activo"] is True
    assert _login(TestClient(app)).status_code == 200


def test_eliminar_una_cuenta_conserva_su_historial(
    cliente: TestClient,
    admin: Usuario,
    usuario: Usuario,
    db: Session,
    guardar_interconsulta: Callable[..., Interconsulta],
) -> None:
    """El historial guarda el nombre del medico, no un vinculo a la cuenta: la
    auditoria clinica no depende de que la cuenta siga existiendo."""
    guardar_interconsulta(id="ic-historial", prioridad_actual="media")
    equipo_del_medico = TestClient(app)
    _login(equipo_del_medico)
    equipo_del_medico.patch(
        "/api/interconsultas/ic-historial/prioridad",
        json={"prioridad": "alta", "motivo": "Empeora el cuadro clinico"},
    )

    response = _como_admin(cliente).delete(f"/api/usuarios/{usuario.id}")

    assert response.status_code == 204
    assert equipo_del_medico.get("/api/auth/me").status_code == 401
    assert [u["alias"] for u in cliente.get("/api/usuarios").json()] == ["admin"]
    db.rollback()
    modificacion = db.scalar(select(ModificacionPrioridad))
    assert modificacion is not None
    assert modificacion.medico_responsable == "Dr. Juan Pérez"


@pytest.mark.parametrize(
    ("metodo", "sufijo", "cuerpo", "mensaje"),
    [
        ("patch", "", {**EDICION, "rol": "medico"}, "cambiar tu propio rol"),
        (
            "patch",
            "",
            {**EDICION, "rol": "administrador", "password_temporal": "temporal-123"},
            "restablecer tu propia contraseña",
        ),
        ("patch", "/estado", {"activo": False}, "bloquear tu propia cuenta"),
        ("delete", "", None, "eliminar tu propia cuenta"),
    ],
)
def test_el_admin_no_puede_quitarse_el_acceso_a_si_mismo(
    cliente: TestClient,
    admin: Usuario,
    metodo: str,
    sufijo: str,
    cuerpo: dict[str, object] | None,
    mensaje: str,
) -> None:
    """Como quien actua es siempre un admin activo, impedirlo sobre si mismo
    basta para que el sistema nunca se quede sin administradores."""
    kwargs = {"json": cuerpo} if cuerpo else {}

    response = getattr(_como_admin(cliente), metodo)(
        f"/api/usuarios/{admin.id}{sufijo}", **kwargs
    )

    assert response.status_code == 409
    assert mensaje in response.json()["detail"]


def test_el_admin_puede_editar_sus_propios_datos(
    cliente: TestClient, admin: Usuario
) -> None:
    response = _como_admin(cliente).patch(
        f"/api/usuarios/{admin.id}",
        json={**EDICION, "rol": "administrador", "nombre": "Jefatura TI"},
    )

    assert response.status_code == 200
    assert response.json()["nombre"] == "Jefatura TI"


@pytest.mark.parametrize(
    ("metodo", "sufijo", "cuerpo"),
    [
        ("patch", "", EDICION),
        ("patch", "/estado", {"activo": False}),
        ("delete", "", None),
    ],
)
def test_quien_no_es_admin_no_edita_ni_bloquea_ni_elimina(
    cliente: TestClient,
    admin: Usuario,
    usuario: Usuario,
    metodo: str,
    sufijo: str,
    cuerpo: dict[str, object] | None,
) -> None:
    _login(cliente)
    kwargs = {"json": cuerpo} if cuerpo else {}

    response = getattr(cliente, metodo)(f"/api/usuarios/{admin.id}{sufijo}", **kwargs)

    assert response.status_code == 403


def test_la_gestion_de_cuentas_queda_en_la_auditoria(
    cliente: TestClient,
    admin: Usuario,
    usuario: Usuario,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="priorizai.auditoria")
    _como_admin(cliente)
    ruta = f"/api/usuarios/{usuario.id}"

    cliente.patch(ruta, json={**EDICION, "password_temporal": "temporal-123"})
    cliente.patch(f"{ruta}/estado", json={"activo": False})
    cliente.patch(f"{ruta}/estado", json={"activo": True})
    cliente.delete(ruta)

    eventos = [e.split()[0] for e in _eventos(caplog)]
    assert eventos[-5:] == [
        "cuenta_editada",
        "password_restablecida",
        "cuenta_bloqueada",
        "cuenta_desbloqueada",
        "cuenta_eliminada",
    ]
    assert "temporal-123" not in "\n".join(_eventos(caplog))


def test_un_rol_no_clinico_no_cambia_prioridades(
    cliente: TestClient,
    usuario: Usuario,
    db: Session,
    guardar_interconsulta: Callable[..., Interconsulta],
) -> None:
    """Quien cambia una prioridad queda en el historial como medico
    responsable: un rol que no es clinico no puede hacerlo."""
    guardar_interconsulta(id="ic-rol", prioridad_actual="media")
    db.execute(update(Usuario).values(rol="secretaria"))
    db.commit()
    _login(cliente)

    response = cliente.patch(
        "/api/interconsultas/ic-rol/prioridad",
        json={"prioridad": "alta", "motivo": "Empeora el cuadro clinico"},
    )

    assert response.status_code == 403
    db.rollback()
    assert db.scalar(select(ModificacionPrioridad)) is None


def test_el_arranque_pasa_los_roles_antiguos_a_medico(
    db: Session,
    usuario: Usuario,
    admin: Usuario,
    engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db.execute(update(Usuario).where(Usuario.alias == "jperez").values(rol="tens"))
    db.commit()
    monkeypatch.setattr(main_module, "engine", engine)

    main_module._migrar_roles_antiguos()

    db.expire_all()
    assert {u.alias: u.rol for u in db.scalars(select(Usuario))} == {
        "admin": "administrador",
        "jperez": "medico",
    }
