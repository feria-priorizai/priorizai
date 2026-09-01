## Requisitos

- Git
- Docker Desktop

## Ejecutar con Docker

Después de clonar el repositorio, crear el archivo local `.env` copiando la
plantilla incluida:

```bash
cp .env.example .env
```

Levantar la aplicación:

```bash
docker compose up --build -d
```

Esto inicia frontend, backend y PostgreSQL. Los cambios en `frontend/` y
`backend/` se actualizan automáticamente mientras los contenedores están
levantados.

| Servicio | URL |
| --- | --- |
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8000 |
| Swagger | http://localhost:8000/docs |
| Health check | http://localhost:8000/health |

Por defecto el backend corre en CPU. En una máquina con GPU NVIDIA y el runtime
`nvidia-container-toolkit` instalado, se puede habilitar la GPU agregando el archivo de
override:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build -d
```

Detener la aplicación:

```bash
docker compose down
```

Para eliminar también los datos locales de PostgreSQL:

```bash
docker compose down -v
```

## Validaciones

Con los contenedores levantados, validar el backend:

```bash
docker compose exec backend ruff check .
docker compose exec backend black --check .
docker compose exec backend mypy .
docker compose exec backend pytest
```

Si falla Black, aplicar el formato con:

```bash
docker compose exec backend black .
```

`pytest` mide cobertura en cada corrida y falla si baja del 82 %. Para una corrida
parcial (un archivo, o un `-k`) hay que desactivar el umbral, porque si no la
cobertura del subconjunto lo hace fallar aunque los tests pasen:

```bash
docker compose exec backend pytest tests/test_priorizador.py --cov-fail-under=0
```

Si el stack venia levantado de antes de que se agregara `pytest-cov`, `pytest`
corta con `unrecognized arguments: --cov`. Se arregla reconstruyendo la imagen:

```bash
docker compose up --build -d backend
```

Validar el frontend:

```bash
docker compose exec frontend npm run lint
docker compose exec frontend npm run build
```

## Jenkins

Jenkins se ejecuta por separado. `docker compose up` no lo inicia.

Levantar Jenkins:

```bash
docker compose -f docker-compose.jenkins.yml up --build -d
```

Abrir http://localhost:8080 y obtener la contraseña inicial:

```bash
docker exec priorizai_jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Detener Jenkins:

```bash
docker compose -f docker-compose.jenkins.yml down
```

## Priorización de interconsultas (modelo RigoBERTa)

El script [`scripts/predict_interconsultas.py`](scripts/predict_interconsultas.py)
predice la prioridad (alta / media / baja) de cada interconsulta con el modelo
RigoBERTa fine-tuneado.

Requiere `pandas`, `torch` y `transformers` (entorno conda `HealthPytorch`) y la
carpeta `models/` con el modelo y el tokenizer. Configurá las rutas en las
variables del inicio del script (`MODEL_PATH`, `INPUT_PATH`, `OUTPUT_PATH`) y
ejecutá:

```bash
python scripts/predict_interconsultas.py
```

El CSV de salida agrega `texto` (las columnas concatenadas), `prob_baja_%`,
`prob_media_%`, `prob_alta_%` y `prediccion`.

> **Nota:** el modelo trae labels genéricos (`LABEL_0/1/2`); el script los nombra
> con `FALLBACK_ID2LABEL`. Verificá que ese orden coincida con el `LabelEncoder`
> del entrenamiento, sino las probabilidades quedan mal asignadas.
