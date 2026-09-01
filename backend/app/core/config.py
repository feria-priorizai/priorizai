import os


class Settings:
    app_name: str = os.getenv("APP_NAME", "PriorizAI")
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"
    cors_origins: list[str] = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
        if origin.strip()
    ]

    database_host: str = os.getenv("DATABASE_HOST", "localhost")
    database_port: int = int(os.getenv("DATABASE_PORT", "5432"))
    database_name: str = os.getenv("DATABASE_NAME", "priorizai_db")
    database_user: str = os.getenv("DATABASE_USER", "priorizai_user")
    database_password: str = os.getenv("DATABASE_PASSWORD", "priorizai_password")
    model_path: str = os.getenv("MODEL_PATH", "/models")
    model_max_length: int = int(os.getenv("MODEL_MAX_LENGTH", "512"))
    model_batch_size: int = int(os.getenv("MODEL_BATCH_SIZE", "16"))

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
        return (
            f"postgresql://{self.database_user}:"
            f"{self.database_password}@"
            f"{self.database_host}:"
            f"{self.database_port}/"
            f"{self.database_name}"
        )


settings = Settings()
