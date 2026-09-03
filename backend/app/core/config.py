import os

CREDENCIALES_POR_DEFECTO = {
    "database_user": "priorizai_user",
    "database_password": "priorizai_password",
}


class Settings:
    app_name: str = os.getenv("APP_NAME", "PriorizAI")
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"
    cors_origins: list[str] = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
        if origin.strip()
    ]

    # URL completa. Tiene prioridad sobre las piezas de abajo: sin esto no habia
    # forma de apuntar la app a otra base (SQLite en los tests, un servicio
    # gestionado en produccion) sin tocar codigo.
    database_url_completa: str = os.getenv("DATABASE_URL", "")
    database_host: str = os.getenv("DATABASE_HOST", "localhost")
    database_port: int = int(os.getenv("DATABASE_PORT", "5432"))
    database_name: str = os.getenv("DATABASE_NAME", "priorizai_db")
    database_user: str = os.getenv(
        "DATABASE_USER", CREDENCIALES_POR_DEFECTO["database_user"]
    )
    database_password: str = os.getenv(
        "DATABASE_PASSWORD", CREDENCIALES_POR_DEFECTO["database_password"]
    )

    # Edad maxima aceptada al importar. Por encima de esto la fila se rechaza:
    # casi siempre es un error de formato, no un paciente.
    edad_maxima: int = int(os.getenv("EDAD_MAXIMA", "130"))

    model_path: str = os.getenv("MODEL_PATH", "/models")
    # Orden de las clases del modelo, indice a indice (LABEL_0,LABEL_1,...).
    # El config.json del modelo trae labels genericos, asi que sin esto se usa
    # FALLBACK_ID2LABEL, que es una suposicion escrita a mano: si no coincide
    # con el LabelEncoder del entrenamiento, el sistema prioriza al reves sin
    # ningun sintoma. Setear MODEL_LABELS fija el orden real sin tocar codigo.
    model_labels: tuple[str, ...] = tuple(
        etiqueta.strip()
        for etiqueta in os.getenv("MODEL_LABELS", "").split(",")
        if etiqueta.strip()
    )
    model_max_length: int = int(os.getenv("MODEL_MAX_LENGTH", "512"))
    model_batch_size: int = int(os.getenv("MODEL_BATCH_SIZE", "16"))

    # Servicio de modelos externo. Vacio = cargar los modelos en este mismo
    # proceso, como hasta ahora. Con URL, el backend deja de necesitar torch.
    model_service_url: str = os.getenv("MODEL_SERVICE_URL", "").strip()
    # Mayor que el arranque en frio del servicio: cargar los pesos puede
    # tardar minutos y la primera carga tras un rato inactivo lo paga.
    model_service_timeout: float = float(os.getenv("MODEL_SERVICE_TIMEOUT", "300"))
    # Clave compartida que el servicio exige en la cabecera X-API-Key. Vacia =
    # no se manda, para servicios abiertos o levantados en local.
    model_service_api_key: str = os.getenv("MODEL_SERVICE_API_KEY", "").strip()

    # NER de entidades clinicas. Symptom queda fuera por defecto: su F1 es
    # 0.51 contra 0.73-0.88 de las demas clases sobre interconsultas reales.
    ner_model_path: str = os.getenv("NER_MODEL_PATH", "/models/NER/modelo")
    ner_umbral: float = float(os.getenv("NER_UMBRAL", "0.5"))
    ner_max_length: int = int(os.getenv("NER_MAX_LENGTH", "256"))
    ner_clases: tuple[str, ...] = tuple(
        clase.strip()
        for clase in os.getenv("NER_CLASES", "Disease,Medication,Abbreviation").split(
            ","
        )
        if clase.strip()
    )

    @property
    def database_url(self) -> str:
        if self.database_url_completa:
            return self.database_url_completa
        return (
            f"postgresql://{self.database_user}:"
            f"{self.database_password}@"
            f"{self.database_host}:"
            f"{self.database_port}/"
            f"{self.database_name}"
        )

    def credenciales_por_defecto(self) -> list[str]:
        """Credenciales que quedaron en el valor de fabrica."""
        if self.database_url_completa:
            return []
        return [
            nombre
            for nombre, valor in CREDENCIALES_POR_DEFECTO.items()
            if getattr(self, nombre) == valor
        ]

    def verificar_credenciales(self) -> None:
        """Falla al arrancar si la base usa las credenciales de ejemplo.

        Antes los valores de fabrica estaban como default en el codigo, asi que
        un despliegue con el `.env` incompleto levantaba igual y nadie se
        enteraba. En desarrollo (DEBUG=true) se permiten.
        """
        if self.debug:
            return

        pendientes = self.credenciales_por_defecto()
        if pendientes:
            raise RuntimeError(
                "Las credenciales de base de datos siguen en el valor de ejemplo: "
                f"{', '.join(sorted(pendientes))}. Definilas en el entorno "
                "(o DATABASE_URL), o levanta con DEBUG=true para desarrollo."
            )


settings = Settings()
