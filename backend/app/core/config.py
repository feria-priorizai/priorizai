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
