# PriorizAI

PriorizAI es una aplicación web con backend en FastAPI, frontend en Next.js y
base de datos PostgreSQL.

## Requisitos

Para ejecutar todo el proyecto con la configuración recomendada:

- [Git](https://git-scm.com/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

Para trabajar sin contenedores también se requiere:

- Python 3.13
- Node.js 22 y npm

## Inicio rápido con Docker

Desde la raíz del repositorio:

1. Crear su propio archivo `.env` local a partir de `.env.example`. Este archivo
   no se versiona y cada integrante del equipo debe crearlo después de clonar el
   repositorio:

   PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

   Bash:

   ```bash
   cp .env.example .env
   ```

2. Construir e iniciar frontend, backend y PostgreSQL:

   ```bash
   docker compose up --build
   ```

3. Verificar que los servicios estén disponibles:

| Servicio | URL |
| --- | --- |
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |
| Health check | http://localhost:8000/health |
| PostgreSQL | `localhost:5432` |

Para ejecutar los contenedores en segundo plano:

```bash
docker compose up --build -d
```

Para detenerlos:

```bash
docker compose down
```

Para detenerlos y eliminar los datos locales de PostgreSQL:

```bash
docker compose down -v
```

## Desarrollo local

Se puede ejecutar PostgreSQL con Docker y desarrollar frontend y backend
localmente con recarga automática.

Si se utiliza Docker Compose para ejecutar todo el proyecto, no es necesario
crear un entorno virtual de Python. El entorno virtual solo se requiere para
ejecutar o validar el backend directamente desde la máquina local.

### Base de datos

Desde la raíz del repositorio:

```bash
docker compose up -d postgres
```

La configuración por defecto coincide con `.env.example`:

```text
Host: localhost
Puerto: 5432
Base de datos: priorizai_db
Usuario: priorizai_user
Contraseña: priorizai_password
```

### Backend

Desde `backend`, crear el entorno virtual:

```bash
python -m venv .venv
```

Activarlo en PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

Activarlo en Bash:

```bash
source .venv/Scripts/activate
```

En Linux o macOS, usar:

```bash
source .venv/bin/activate
```

Instalar las dependencias e iniciar FastAPI:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

Desde `frontend`, instalar las dependencias e iniciar Next.js:

```bash
npm ci
npm run dev
```

## Validaciones

Antes de subir cambios del backend, ejecutar desde `backend` con el entorno
virtual activado:

```bash
ruff check .
black --check .
mypy .
pytest
```

Si la validación de Black falla, aplicar el formato automáticamente y volver a
ejecutar las validaciones:

```bash
black .
```

Para validar el frontend, ejecutar desde `frontend`:

```bash
npm run lint
npm run build
```

El workflow `.github/workflows/ci.yml` ejecuta estas validaciones mediante
Docker para cada `push` y pull request dirigido a la rama `develop`.

## Jenkins local

El repositorio también incluye un pipeline de Jenkins que construye las
imágenes y valida ambos componentes. Para iniciarlo:

```bash
docker compose -f docker-compose.jenkins.yml up --build -d
```

Abrir http://localhost:8080 y obtener la contraseña inicial:

```bash
docker exec priorizai_jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Para detener Jenkins:

```bash
docker compose -f docker-compose.jenkins.yml down
```

## Estructura

```text
.
|-- backend/                  # API FastAPI, configuración y pruebas
|-- frontend/                 # Aplicación Next.js
|-- docker/jenkins/           # Imagen local de Jenkins con Docker CLI
|-- docs/                     # Documentación adicional
|-- .github/workflows/ci.yml  # Integración continua con GitHub Actions
|-- docker-compose.yml        # Frontend, backend y PostgreSQL
`-- Jenkinsfile               # Pipeline de Jenkins
```
