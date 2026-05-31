# PriorizAI
## Configuración del Backend

Crear entorno virtual:

```bash
python -m venv .venv
```

Activar:

```bash
.venv\Scripts\activate
```

Instalar dependencias:

```bash
pip install -r requirements.txt
```

## Ejecutar Localmente

```bash
uvicorn app.main:app --reload
```

Documentación Swagger:

```text
http://localhost:8000/docs
```

## Calidad

Ejecutar validaciones:

```bash
ruff check .
black --check .
mypy .
pytest
```

## Docker

Construir imagen:

```bash
docker build -t priorizai-backend .
```

Ejecutar contenedor:

```bash
docker run -p 8000:8000 priorizai-backend
```
## Docker Compose

Levantar backend y PostgreSQL:

```bash
docker compose up --build
```
## Detener servicios

```bash
docker compose down
```

## Eliminar servicios y volumen de base de datos

```bash
docker compose down -v
```

## URLs

Backend: http://localhost:8000 
Swagger: http://localhost:8000/docs 
PostgreSQL: localhost:5432