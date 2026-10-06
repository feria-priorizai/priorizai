from pydantic import BaseModel, Field

_LARGO_MAXIMO_ENTRADA = 256


class LoginRequest(BaseModel):
    # El largo de la columna de intentos_login. Un alias mas largo no puede
    # existir (ALIAS_VALIDO), asi que limitarlo no revela nada; sin el limite,
    # Postgres rechaza el registro del fallo y el login responde 500.
    alias: str = Field(max_length=64)
    password: str = Field(max_length=_LARGO_MAXIMO_ENTRADA)


class CambiarPasswordRequest(BaseModel):
    password_actual: str = Field(max_length=_LARGO_MAXIMO_ENTRADA)
    password_nueva: str = Field(max_length=_LARGO_MAXIMO_ENTRADA)


class UsuarioResponse(BaseModel):
    id: str
    alias: str
    nombre: str
    correo: str | None
    rol: str
    especialidad: str | None
    activo: bool
    debe_cambiar_password: bool
    bloqueado_por_intentos: bool = False

    model_config = {"from_attributes": True}


class CrearUsuarioRequest(BaseModel):
    alias: str = Field(max_length=64)
    nombre: str = Field(max_length=255)
    correo: str = Field(max_length=_LARGO_MAXIMO_ENTRADA)
    rol: str = Field(max_length=40)
    password: str = Field(max_length=_LARGO_MAXIMO_ENTRADA)
    especialidad: str | None = Field(default=None, max_length=255)


class EditarUsuarioRequest(BaseModel):
    nombre: str = Field(max_length=255)
    correo: str = Field(max_length=_LARGO_MAXIMO_ENTRADA)
    rol: str = Field(max_length=40)
    especialidad: str | None = Field(default=None, max_length=255)
    password_temporal: str | None = Field(
        default=None, max_length=_LARGO_MAXIMO_ENTRADA
    )


class EstadoUsuarioRequest(BaseModel):
    activo: bool
