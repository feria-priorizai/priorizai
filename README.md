# PriorizAI

PriorizAI ordena la lista de espera de interconsultas por prioridad clínica.
Un modelo de lenguaje entrenado sobre interconsultas ya priorizadas por
especialistas sugiere un nivel para cada derivación, un catálogo de términos de
alarma marca los casos que no admiten espera, y el médico revisa, corrige y deja
registrado el motivo de cada cambio.

El sistema está diseñado para ejecutarse dentro de la red del establecimiento.

## Estructura del repositorio

| Carpeta | Contenido |
| --- | --- |
| `backend/` | API REST en FastAPI, modelos de datos y servicios de priorización, NER y banderas rojas |
| `frontend/` | Aplicación web en Next.js (App Router) que consume la API |
| `landing/` | Sitio estático de presentación del producto |
| `scripts/` | Priorización por lotes fuera de la aplicación |
| `docker/` | Imagen de Jenkins |
| `docs/` | Documentación técnica y revisiones |

## Requisitos

- Git
- Docker Desktop

## Configuración

Después de clonar el repositorio, crear el archivo local `.env` a partir de la
plantilla incluida:

```bash
cp .env.example .env
```

| Variable | Valor por defecto | Descripción |
| --- | --- | --- |
| `POSTGRES_USER` | `priorizai_user` | Usuario de PostgreSQL |
| `POSTGRES_PASSWORD` | `priorizai_password` | Contraseña de PostgreSQL |
| `POSTGRES_DB` | `priorizai_db` | Nombre de la base de datos |
| `POSTGRES_PORT` | `5432` | Puerto publicado de PostgreSQL |
| `BACKEND_PORT` | `8000` | Puerto publicado del backend |
| `CORS_ORIGINS` | `http://localhost:3000` | Orígenes autorizados, separados por coma |
| `MODEL_SERVICE_URL` | *(vacía)* | URL del servicio de modelos externo. Vacía, los modelos corren dentro del backend |
| `MODEL_SERVICE_TIMEOUT` | `300` | Segundos de espera por respuesta del servicio |
| `MODEL_SERVICE_API_KEY` | *(vacía)* | Clave que exige el servicio. Es un secreto: solo en el `.env` local |

El backend acepta además `MODEL_PATH`, `NER_MODEL_PATH` y `MODEL_LABELS`, que
`docker-compose.yml` ya define apuntando a la carpeta `models/`. Solo se usan
cuando `MODEL_SERVICE_URL` está vacía.

## Modelos

Hay dos formas de ejecutarlos, y se eligen con una sola variable:
`MODEL_SERVICE_URL`.

### Modelos dentro del backend (por defecto)

Con `MODEL_SERVICE_URL` vacía, el backend carga los modelos en su propio
proceso. Esta es la ruta que necesita la carpeta `models/`, que no está
versionada. Se espera esta disposición:

```
models/
├── priorizacion/     # modelo y tokenizer del priorizador
└── NER/modelo/       # modelo y tokenizer de extracción de entidades
```

Sin esos artefactos la aplicación levanta igual: la ingesta guarda las
interconsultas y registra en `motivo_sin_prioridad` que el modelo no se pudo
ejecutar. La interfaz las muestra como pendientes de priorizar, sin asignarles
un nivel.

### Servicio de modelos externo

Poniendo una URL en `MODEL_SERVICE_URL`, el backend pide las predicciones por
HTTP a un servicio aparte que tiene los pesos. Así no hace falta descargar
`models/` ni tener torch en la máquina, y una sola copia de los modelos sirve a
todos los backends.

El servicio expone `POST /priorizar` y `POST /extraer-entidades`, vive fuera de
este repositorio y se despliega en Cloud Run escalando a cero. Por eso la
primera petición después de un rato inactivo tiene que esperar a que arranque
una instancia y cargue 2,7 GB de pesos, y eso son minutos: `MODEL_SERVICE_TIMEOUT`
está en 300 segundos por esa razón, y las siguientes responden de inmediato.

Si el servicio no contesta, la ingesta no se pierde: guarda las interconsultas y
deja el motivo en `motivo_sin_prioridad`, igual que cuando falta el modelo local.

La URL del despliegue no está en el repositorio, pero eso no es lo que lo
protege: una URL es una dirección, no una credencial. El control es
`MODEL_SERVICE_API_KEY`, una clave compartida que el servicio exige en la
cabecera `X-API-Key`. Si el servicio está abierto, dejarla vacía.

Una clave compartida no distingue quién llama y hay que rotarla en los dos lados
si se filtra. Alcanza para que un tercero no gaste el servicio ni le mande
textos, pero antes de recibir datos de pacientes reales corresponde
autenticación de verdad.

### Orden de las clases

El modelo de priorización se distribuye con etiquetas genéricas
(`LABEL_0`, `LABEL_1`, `LABEL_2`). El backend resuelve el orden real con la
variable `MODEL_LABELS`; si no está definida, usa un orden por defecto y deja
una advertencia en el log. Ese orden debe verificarse contra el `LabelEncoder`
del entrenamiento: si no coincide, las probabilidades quedan asignadas a la
clase equivocada sin ningún síntoma visible.

## Ejecutar con Docker

```bash
docker compose up --build -d
```

Esto inicia frontend, backend y PostgreSQL. Los cambios en `frontend/` y
`backend/` se recargan automáticamente mientras los contenedores están
levantados.

| Servicio | URL |
| --- | --- |
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8000 |
| Swagger | http://localhost:8000/docs |
| Health check | http://localhost:8000/health |

Por defecto el backend corre en CPU. En una máquina con GPU NVIDIA y el runtime
`nvidia-container-toolkit` instalado, se habilita la GPU agregando el archivo de
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

## Flujo de trabajo

1. **Carga.** Se sube un archivo CSV o XLSX desde el panel lateral de la
   aplicación.
2. **Validación por fila.** Las filas a las que les falta un campo obligatorio
   se descartan sin detener el resto del archivo, y se listan en un aviso con el
   número de fila y los campos que faltaban.
3. **Extracción de entidades.** Sobre los cuatro campos clínicos se ejecuta el
   NER, que reconoce enfermedades, síntomas, fármacos y siglas. Las entidades
   quedan resaltadas sobre el texto en el detalle de cada interconsulta.
4. **Priorización.** El modelo asigna un nivel (alta, media o baja) con su
   probabilidad por clase.
5. **Banderas rojas.** Un catálogo de términos de alarma revisa el texto. Un
   término afirmado fuerza la prioridad alta y la interfaz lo indica como regla
   clínica en lugar de mostrar una certeza del modelo.
6. **Revisión médica.** El médico confirma o corrige la prioridad. Toda
   corrección exige un motivo y queda en el historial de la interconsulta.
7. **Exportación.** Las interconsultas revisadas se descargan en JSON, CSV o
   XLSX, con los campos que defina la configuración.

## API

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/health` | Estado del servicio |
| `POST` | `/upload-csv` | Ingesta de un archivo CSV o XLSX |
| `GET` | `/api/interconsultas` | Listado paginado (`limit` de 1 a 500, `offset`); el total va en la cabecera `X-Total-Count` |
| `GET` | `/api/interconsultas/{id}` | Detalle de una interconsulta |
| `PATCH` | `/api/interconsultas/{id}/prioridad` | Cambio manual de prioridad con motivo y responsable |
| `PATCH` | `/api/interconsultas/{id}/estado` | Marca la interconsulta como revisada o pendiente |
| `POST` | `/api/interconsultas/priorizar` | Ejecuta el modelo sobre los identificadores indicados |
| `POST` | `/api/interconsultas/priorizar-pendientes` | Ejecuta el modelo sobre las que aún no tienen prioridad |
| `POST` | `/api/interconsultas/reevaluar-banderas` | Vuelve a aplicar el catálogo de términos de alarma |

La documentación interactiva completa está en http://localhost:8000/docs.

## Frontend

Next.js 16 con App Router, React 19, Bootstrap 5 y Tailwind CSS 4.

| Ruta | Vista |
| --- | --- |
| `/dashboard` | Resumen de la lista de espera y cola agrupada por prioridad |
| `/interconsultas` | Lista de espera completa, con filtros y descarga múltiple |
| `/interconsultas/[id]` | Detalle: columna de decisión fija y sustento clínico al lado |
| `/configuracion` | Campos exigidos al importar y campos incluidos al exportar |

El sistema visual vive en `frontend/app/globals.css` bajo el prefijo `pz-`.
Comparte la paleta de marca con la landing. El color codifica una sola cosa: la
prioridad clínica en la lista de espera, y el tipo de acción en los botones
(verde confirma, azul navega, morado ejecuta el modelo, rojo es urgente).

El logo del establecimiento se lee desde
`frontend/public/img/hospital-san-juan-de-dios.png`. Mientras el archivo no
exista, el encabezado muestra un emblema junto al nombre del centro.

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

`pytest` mide cobertura en cada corrida y falla si baja del 82 %. Para una
corrida parcial (un archivo, o un `-k`) hay que desactivar el umbral, porque si
no la cobertura del subconjunto lo hace fallar aunque los tests pasen:

```bash
docker compose exec backend pytest tests/test_priorizador.py --cov-fail-under=0
```

Si el stack venía levantado de antes de que se agregara `pytest-cov`, `pytest`
corta con `unrecognized arguments: --cov`. Se resuelve reconstruyendo la imagen:

```bash
docker compose up --build -d backend
```

Validar el frontend:

```bash
docker compose exec frontend npm run lint
docker compose exec frontend npm run build
```

## Integración continua

GitHub Actions ejecuta el pipeline en cada push y pull request contra `develop`
(`.github/workflows/ci.yml`): Ruff, Black, Mypy y Pytest con reporte de
cobertura en el backend, y lint y build en el frontend.

Jenkins ejecuta el mismo pipeline (`Jenkinsfile`) y corre por separado:
`docker compose up` no lo inicia.

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

## Priorización por lotes

`scripts/predict_interconsultas.py` predice la prioridad de cada interconsulta
de un archivo, fuera de la aplicación. Requiere `pandas`, `torch` y
`transformers`, y la carpeta `models/` con el modelo y el tokenizer. Las rutas se
configuran en las variables del inicio del script (`MODEL_PATH`, `INPUT_PATH`,
`OUTPUT_PATH`):

```bash
python scripts/predict_interconsultas.py
```

El CSV de salida agrega `texto` (las columnas concatenadas), `prob_baja_%`,
`prob_media_%`, `prob_alta_%` y `prediccion`.

Este script duplica la lógica de `backend/app/services/priorizador.py`,
incluida la resolución del orden de clases. Ambas copias deben mantenerse
alineadas.

## Limitaciones conocidas

- **No hay autenticación.** Todos los endpoints son públicos para quien tenga
  acceso de red al backend, y el médico responsable que queda registrado en el
  historial de modificaciones sale de una constante en
  `frontend/data/sesion.ts`. Mientras esto siga así, el sistema no debe operar
  sobre datos de pacientes reales.
- **La ingesta es síncrona.** La carga de un archivo ejecuta el NER y el
  priorizador dentro de la misma petición HTTP, sin cola de trabajo ni endpoint
  de estado. Con archivos grandes la petición puede exceder el tiempo de espera
  de un proxy intermedio.
- **El esquema se actualiza con `ALTER TABLE` al importar la aplicación.** No hay
  herramienta de migraciones, historial de versiones ni rollback.
- **El frontend no tiene pruebas automatizadas.** La CI solo corre lint y build.

El detalle de estas y otras observaciones está en
[`docs/revision-tecnica-completa.md`](docs/revision-tecnica-completa.md).

## Documentación

| Archivo | Contenido |
| --- | --- |
| [`docs/arquitectura.md`](docs/arquitectura.md) | Decisiones de stack |
| [`docs/revision-tecnica.md`](docs/revision-tecnica.md) | Primera revisión técnica |
| [`docs/revision-tecnica-completa.md`](docs/revision-tecnica-completa.md) | Revisión completa del repositorio, con estado de cada hallazgo |
| [`frontend/README.md`](frontend/README.md) | Detalle del frontend |
