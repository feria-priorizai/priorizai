"""Autenticacion de usuarios (HDU-15).

Contrasenas con Argon2 y sesiones guardadas en la base. El token de sesion viaja
solo en una cookie httpOnly; aca se guarda su hash.
"""

import hashlib
import logging
import re
import secrets
from datetime import UTC, datetime, timedelta
from functools import cache

from pwdlib import PasswordHash
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.usuario import IntentoLogin, Sesion, Usuario

logger = logging.getLogger(__name__)

ROL_MEDICO = "medico"
ROL_ADMINISTRADOR = "administrador"

ROLES = frozenset({ROL_MEDICO, ROL_ADMINISTRADOR})

# Las que el medico elige al crear su cuenta. Deben coincidir con ESPECIALIDADES
# del frontend (types/usuario.ts).
ESPECIALIDADES = (
    "Broncopulmonar",
    "Cardiología",
    "Cirugía General",
    "Dermatología",
    "Endocrinología",
    "Gastroenterología",
    "Geriatría",
    "Ginecología y Obstetricia",
    "Hematología",
    "Infectología",
    "Medicina General",
    "Medicina Interna",
    "Nefrología",
    "Neurocirugía",
    "Neurología",
    "Oftalmología",
    "Oncología",
    "Otorrinolaringología",
    "Pediatría",
    "Psiquiatría",
    "Reumatología",
    "Traumatología",
    "Urología",
)

ALIAS_VALIDO = re.compile(r"^[a-z0-9._-]{3,64}$")
CORREO_VALIDO = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

PASSWORD_MINIMA = 8
PASSWORD_MAXIMA = 128

_PRECISION_ULTIMO_USO = timedelta(minutes=1)

_hasher = PasswordHash.recommended()


class CredencialesInvalidasError(Exception):
    """Alias inexistente, cuenta inactiva o contrasena incorrecta. Los tres casos
    se informan igual para no revelar que alias existen."""


class AliasEnUsoError(ValueError):
    pass


class CorreoEnUsoError(ValueError):
    pass


class OperacionNoPermitidaError(Exception):
    """Accion de administracion que dejaria al sistema en un estado invalido,
    como un administrador bloqueandose o eliminandose a si mismo."""


class UsuarioBloqueadoError(Exception):
    """Demasiados fallos seguidos sobre un alias, exista o no."""

    def __init__(self, minutos_restantes: int) -> None:
        super().__init__(f"Alias bloqueado por {minutos_restantes} minutos")
        self.minutos_restantes = minutos_restantes


def _ahora() -> datetime:
    """UTC sin zona: es lo que devuelven las columnas DateTime tanto en
    Postgres como en SQLite, asi las comparaciones no mezclan naive y aware."""
    return datetime.now(UTC).replace(tzinfo=None)


@cache
def _hash_senuelo() -> str:
    return _hasher.hash(secrets.token_urlsafe(16))


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def normalizar_alias(alias: str) -> str:
    return alias.strip().lower()


def normalizar_correo(correo: str) -> str:
    return correo.strip().lower()


def validar_alias(alias: str) -> None:
    """El alias se escribe en el login: sin espacios ni caracteres que se
    confundan al tipearlo."""
    if not ALIAS_VALIDO.match(alias):
        raise ValueError(
            "El alias debe tener entre 3 y 64 caracteres y usar solo letras "
            "minúsculas, números, punto, guion o guion bajo"
        )


def _validar_datos(
    db: Session,
    *,
    nombre: str,
    correo: str | None,
    rol: str,
    especialidad: str | None,
    excluir_id: str | None = None,
) -> str | None:
    """Valida los datos editables de una cuenta y devuelve el correo
    normalizado. `excluir_id` es la propia cuenta al editarla, para que su
    correo actual no cuente como repetido."""
    if not nombre.strip():
        raise ValueError("El nombre es obligatorio")
    if rol not in ROLES:
        raise ValueError(
            f"Rol desconocido: {rol}. Opciones: {', '.join(sorted(ROLES))}"
        )
    if rol == ROL_MEDICO and especialidad not in ESPECIALIDADES:
        raise ValueError("Selecciona la especialidad del médico")
    if correo is None:
        return None
    correo_normalizado = normalizar_correo(correo)
    if len(correo_normalizado) > 255 or not CORREO_VALIDO.match(correo_normalizado):
        raise ValueError("El correo no es válido")
    existente = db.scalar(select(Usuario).where(Usuario.correo == correo_normalizado))
    if existente is not None and existente.id != excluir_id:
        raise CorreoEnUsoError(
            f"Ya existe un usuario con el correo {correo_normalizado}"
        )
    return correo_normalizado


def _especialidad_para(rol: str, especialidad: str | None) -> str | None:
    """Solo el medico tiene especialidad: la de un administrador se descarta."""
    if rol != ROL_MEDICO:
        return None
    return (especialidad or "").strip() or None


def hashear_password(password: str) -> str:
    return _hasher.hash(password)


def validar_password(password: str) -> None:
    if len(password) < PASSWORD_MINIMA:
        raise ValueError(
            f"La contraseña debe tener al menos {PASSWORD_MINIMA} caracteres"
        )
    if len(password) > PASSWORD_MAXIMA:
        raise ValueError(
            f"La contraseña no puede tener más de {PASSWORD_MAXIMA} caracteres"
        )


def crear_usuario(
    db: Session,
    *,
    alias: str,
    nombre: str,
    rol: str,
    password: str,
    correo: str | None = None,
    especialidad: str | None = None,
) -> Usuario:
    alias_normalizado = normalizar_alias(alias)
    validar_alias(alias_normalizado)
    especialidad = _especialidad_para(rol, especialidad)
    correo_normalizado = _validar_datos(
        db, nombre=nombre, correo=correo, rol=rol, especialidad=especialidad
    )
    validar_password(password)
    if db.scalar(select(Usuario).where(Usuario.alias == alias_normalizado)):
        raise AliasEnUsoError(f"Ya existe un usuario con el alias {alias_normalizado}")

    usuario = Usuario(
        alias=alias_normalizado,
        nombre=nombre.strip(),
        correo=correo_normalizado,
        rol=rol,
        especialidad=especialidad,
        password_hash=hashear_password(password),
    )
    db.add(usuario)
    db.commit()
    return usuario


def autenticar(db: Session, alias: str, password: str) -> Usuario:
    """Valida alias y contrasena.

    El bloqueo por intentos fallidos se lleva por alias, exista o no: si solo se
    bloquearan los alias reales, la respuesta de bloqueo delataria cuales
    existen. Un alias inventado acumula fallos y se bloquea igual.
    """
    alias_normalizado = normalizar_alias(alias)
    ahora = _ahora()
    _limpiar_intentos_vencidos(db, ahora)

    intento = _intento_vigente(db, alias_normalizado, ahora)

    usuario = db.scalar(select(Usuario).where(Usuario.alias == alias_normalizado))
    hash_actualizado: str | None = None
    if usuario is None or not usuario.activo:
        _hasher.verify(password, _hash_senuelo())
        valida = False
    else:
        valida, hash_actualizado = _hasher.verify_and_update(
            password, usuario.password_hash
        )

    if not valida or usuario is None:
        _registrar_fallo(db, alias_normalizado, ahora)
        raise CredencialesInvalidasError

    if hash_actualizado is not None:
        usuario.password_hash = hash_actualizado
    if intento is not None:
        db.delete(intento)
    db.commit()
    return usuario


def _intento_vigente(db: Session, alias: str, ahora: datetime) -> IntentoLogin | None:
    """El registro de fallos del alias. Si esta bloqueado, lanza el error.

    La fila queda bloqueada (SELECT ... FOR UPDATE) hasta el commit: los intentos
    simultaneos sobre un mismo alias se atienden de a uno, asi que no pueden
    probar contrasenas en paralelo mientras el contador no alcanza el limite.
    SQLite ignora el FOR UPDATE, pero tampoco tiene escrituras concurrentes.

    Un FOR UPDATE no bloquea una fila que no existe: si el alias aun no tiene
    registro, una rafaga de intentos pasaria entera antes del primer fallo. Por
    eso la fila se crea vacia antes de bloquearla; un login correcto la borra."""
    if db.get(IntentoLogin, alias) is None:
        db.add(IntentoLogin(alias=alias, fallos=0, ultimo_fallo=ahora))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
    intento = db.get(IntentoLogin, alias, with_for_update=True, populate_existing=True)
    if (
        intento is not None
        and intento.bloqueado_hasta is not None
        and intento.bloqueado_hasta > ahora
    ):
        restante = intento.bloqueado_hasta - ahora
        raise UsuarioBloqueadoError(max(1, -(-int(restante.total_seconds()) // 60)))
    return intento


def cambiar_password(
    db: Session,
    usuario: Usuario,
    *,
    password_actual: str,
    password_nueva: str,
    token_sesion: str,
) -> Usuario:
    """Cambia la contrasena y cierra todas las demas sesiones del usuario.

    La actual se exige aunque haya sesion: si no, quien encuentre una sesion
    abierta se queda con la cuenta. Los fallos cuentan para el bloqueo del
    alias, igual que en el login, para que esto no sirva para adivinarla.
    """
    ahora = _ahora()
    _limpiar_intentos_vencidos(db, ahora)
    intento = _intento_vigente(db, usuario.alias, ahora)

    if not _hasher.verify(password_actual, usuario.password_hash):
        _registrar_fallo(db, usuario.alias, ahora)
        raise CredencialesInvalidasError

    validar_password(password_nueva)
    if password_nueva == password_actual:
        raise ValueError("La nueva contraseña debe ser distinta de la actual")

    usuario.password_hash = hashear_password(password_nueva)
    usuario.debe_cambiar_password = False
    if intento is not None:
        db.delete(intento)
    db.execute(
        delete(Sesion)
        .where(Sesion.usuario_id == usuario.id)
        .where(Sesion.token_hash != _hash_token(token_sesion))
    )
    db.commit()
    return usuario


def _registrar_fallo(db: Session, alias: str, ahora: datetime) -> None:
    """Suma un fallo al alias con la fila bloqueada, para que dos fallos
    simultaneos no lean el mismo valor y se pisen al escribir.

    Si dos peticiones crean el primer registro a la vez, una choca con la clave
    primaria; en vez de perder ese fallo, se reintenta sobre la fila que ya
    existe."""
    for _ in range(2):
        intento = db.get(
            IntentoLogin, alias, with_for_update=True, populate_existing=True
        )
        if intento is None:
            intento = IntentoLogin(alias=alias, fallos=0)
            db.add(intento)
        intento.fallos += 1
        intento.ultimo_fallo = ahora
        if intento.fallos >= settings.login_max_intentos:
            intento.bloqueado_hasta = ahora + timedelta(
                minutes=settings.login_bloqueo_minutos
            )
            intento.fallos = 0
        try:
            db.commit()
            return
        except IntegrityError:
            db.rollback()
    logger.warning("No se pudo registrar el fallo de inicio de sesion de %s", alias)


def _limpiar_intentos_vencidos(db: Session, ahora: datetime) -> None:
    """Los fallos cuentan dentro de una ventana: pasado el tiempo de bloqueo sin
    fallar de nuevo, el contador vuelve a cero. Tambien evita que probar alias
    al azar llene la tabla."""
    ventana = ahora - timedelta(minutes=settings.login_bloqueo_minutos)
    db.execute(
        delete(IntentoLogin)
        .where(IntentoLogin.ultimo_fallo <= ventana)
        .where(
            or_(
                IntentoLogin.bloqueado_hasta.is_(None),
                IntentoLogin.bloqueado_hasta <= ahora,
            )
        )
    )


def abrir_sesion(db: Session, usuario: Usuario) -> str:
    """Crea la sesion y devuelve el token para la cookie."""
    ahora = _ahora()
    db.execute(
        delete(Sesion).where(
            or_(
                Sesion.expira_en <= ahora,
                Sesion.ultimo_uso <= ahora - _inactividad_maxima(),
            )
        )
    )
    token = secrets.token_urlsafe(32)
    db.add(
        Sesion(
            token_hash=_hash_token(token),
            usuario_id=usuario.id,
            expira_en=ahora + timedelta(hours=settings.sesion_duracion_horas),
            ultimo_uso=ahora,
        )
    )
    db.commit()
    return token


def usuario_de_token(db: Session, token: str | None) -> Usuario | None:
    if not token:
        return None
    sesion = db.scalar(select(Sesion).where(Sesion.token_hash == _hash_token(token)))
    if sesion is None:
        return None
    ahora = _ahora()
    if sesion.expira_en <= ahora or sesion.ultimo_uso <= ahora - _inactividad_maxima():
        db.delete(sesion)
        db.commit()
        return None
    usuario: Usuario = sesion.usuario
    if not usuario.activo:
        return None
    if ahora - sesion.ultimo_uso >= _PRECISION_ULTIMO_USO:
        sesion.ultimo_uso = ahora
        db.commit()
    return usuario


def _inactividad_maxima() -> timedelta:
    return timedelta(minutes=settings.sesion_inactividad_minutos)


def cerrar_sesion(db: Session, token: str | None) -> None:
    if not token:
        return
    db.execute(delete(Sesion).where(Sesion.token_hash == _hash_token(token)))
    db.commit()


def _impedir_sobre_si_mismo(usuario: Usuario, por: Usuario, accion: str) -> None:
    """Un administrador no puede quitarse a si mismo el acceso: al ser quien
    actua, siempre queda al menos un administrador activo."""
    if usuario.id == por.id:
        raise OperacionNoPermitidaError(f"No puedes {accion}")


def _cerrar_sesiones_de(db: Session, usuario: Usuario) -> None:
    db.execute(delete(Sesion).where(Sesion.usuario_id == usuario.id))


def editar_usuario(
    db: Session,
    usuario: Usuario,
    *,
    por: Usuario,
    nombre: str,
    correo: str,
    rol: str,
    especialidad: str | None,
    password_temporal: str | None = None,
) -> Usuario:
    """Actualiza los datos de una cuenta. El alias no cambia: es con lo que la
    persona inicia sesion.

    Con `password_temporal`, la contrasena se restablece, se cierran las
    sesiones de la cuenta y se exige cambiarla en el siguiente ingreso.
    """
    especialidad = _especialidad_para(rol, especialidad)
    correo_normalizado = _validar_datos(
        db,
        nombre=nombre,
        correo=correo,
        rol=rol,
        especialidad=especialidad,
        excluir_id=usuario.id,
    )
    if rol != usuario.rol:
        _impedir_sobre_si_mismo(usuario, por, "cambiar tu propio rol")
    if password_temporal:
        _impedir_sobre_si_mismo(
            usuario, por, "restablecer tu propia contraseña: usa Mi cuenta"
        )
        validar_password(password_temporal)
        usuario.password_hash = hashear_password(password_temporal)
        usuario.debe_cambiar_password = True
        _cerrar_sesiones_de(db, usuario)

    usuario.nombre = nombre.strip()
    usuario.correo = correo_normalizado
    usuario.rol = rol
    usuario.especialidad = especialidad
    db.commit()
    return usuario


def cambiar_estado_usuario(
    db: Session, usuario: Usuario, *, por: Usuario, activo: bool
) -> Usuario:
    """Bloquea o desbloquea una cuenta. Al bloquearla se cierran sus sesiones
    en el acto, no al vencer.

    Desbloquear levanta tambien el bloqueo por intentos fallidos: para quien
    pidio ayuda al administrador, los dos bloqueos son lo mismo."""
    if not activo:
        _impedir_sobre_si_mismo(usuario, por, "bloquear tu propia cuenta")
        _cerrar_sesiones_de(db, usuario)
    else:
        db.execute(delete(IntentoLogin).where(IntentoLogin.alias == usuario.alias))
    usuario.activo = activo
    db.commit()
    return usuario


def aliases_bloqueados_por_intentos(db: Session) -> set[str]:
    """Alias con un bloqueo por intentos fallidos vigente, para que el
    administrador vea que cuentas necesitan desbloquearse."""
    return set(
        db.scalars(
            select(IntentoLogin.alias).where(IntentoLogin.bloqueado_hasta > _ahora())
        ).all()
    )


def eliminar_usuario(db: Session, usuario: Usuario, *, por: Usuario) -> None:
    """Elimina la cuenta y sus sesiones. El historial de cambios de prioridad
    guarda el nombre del medico, no la cuenta, asi que se conserva."""
    _impedir_sobre_si_mismo(usuario, por, "eliminar tu propia cuenta")
    _cerrar_sesiones_de(db, usuario)
    db.delete(usuario)
    db.commit()


def asegurar_admin_inicial(db: Session) -> bool:
    """Crea el administrador de ADMIN_ALIAS / ADMIN_PASSWORD si la base no tiene
    ningun usuario. Las demas cuentas las crea ese administrador desde la app.

    Si ya hay usuarios no hace nada: cambiar el .env despues no pisa la
    contrasena que el administrador tenga en uso.
    """
    if db.scalar(select(func.count()).select_from(Usuario)):
        return False
    if not (settings.admin_alias and settings.admin_password):
        logger.warning(
            "No hay usuarios y faltan ADMIN_ALIAS / ADMIN_PASSWORD: "
            "nadie podra iniciar sesion hasta definirlos."
        )
        return False

    crear_usuario(
        db,
        alias=settings.admin_alias,
        nombre=settings.admin_nombre,
        rol=ROL_ADMINISTRADOR,
        password=settings.admin_password,
        correo=settings.admin_correo or None,
    )
    logger.warning("Administrador inicial creado: %s", settings.admin_alias)
    return True
