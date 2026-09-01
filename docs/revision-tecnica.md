# Revisión técnica — testing y limpieza

**Fecha:** 2026-08-30 · **Rama:** `develop` · **Commit base:** `41c18da`

Estado del repositorio en el momento de la revisión, con foco en testing/coverage
y en código o dependencias que sobran. Cada punto está anotado con `archivo:línea`
para poder ir directo.

---

## 0. Cómo reproducir la medición

El coverage se midió con un entorno virtual aparte (fuera del repo), porque hoy
los tests no corren sin Postgres (ver [2.b](#b-importar-appmain-exige-un-postgres-vivo)).

```bash
python -m venv .venv-cov
.venv-cov/Scripts/pip install fastapi sqlalchemy pytest pytest-cov httpx \
    openpyxl PyYAML python-multipart psycopg2-binary
```

Con Docker levantado, la forma directa es:

```bash
docker compose exec backend pytest --cov=app --cov-report=term-missing
```

(requiere agregar `pytest-cov` a `backend/requirements.txt`, ver [2.c](#c-no-hay-pytest-cov-ni-umbral-de-cobertura))

---

## 1. Coverage actual

`47 tests pasan`, **85 % global** en el backend.

| Módulo | Stmts | Miss | Cover |
| --- | ---: | ---: | ---: |
| `app/services/priorizador.py` | 93 | 55 | **41 %** |
| `app/core/database.py` | 12 | 4 | **67 %** |
| `app/main.py` | 188 | 32 | **83 %** |
| `app/api/interconsultas.py` | 123 | 12 | **90 %** |
| `app/services/banderas_rojas.py` | 124 | 2 | 98 % |
| `app/schemas/interconsulta.py` | 51 | 0 | 100 % |
| `app/models/interconsulta.py` | 34 | 0 | 100 % |
| `app/core/config.py` | 17 | 0 | 100 % |
| `app/models/modificacion_prioridad.py` | 17 | 0 | 100 % |
| `app/schemas/priorizacion.py` | 15 | 0 | 100 % |
| resto (`__init__.py`) | 11 | 0 | 100 % |
| **TOTAL** | **685** | **105** | **85 %** |

**Frontend: 0 %.** No hay tests ni framework instalado. `frontend/package.json` no
tiene `jest`, `vitest` ni `playwright`, y no existe script `test`. La CI solo corre
`npm run lint` y `npm run build`.

---

## 2. Problemas de testing

### a) La suite depende del orden alfabético de los archivos

**Gravedad: alta.**

- `tests/test_priorizacion.py:56-57` registra `app.dependency_overrides` a nivel de
  módulo y nunca los limpia.
- `tests/test_upload_csv.py:91-92` hace `app.dependency_overrides = {}` en su
  `setup_function`, borrando los del archivo anterior.

Hoy pasa de casualidad, porque `test_priorizacion` va antes que `test_upload_csv`
alfabéticamente. Invirtiendo el orden:

```bash
pytest tests/test_upload_csv.py tests/test_priorizacion.py
# → 11 failed, 10 passed
```

Rompe con `pytest-randomly`, con un `-k`, o simplemente renombrando un archivo.

- [x] Mover los overrides a fixtures con `yield` + `app.dependency_overrides.clear()`

### b) Importar `app.main` exige un Postgres vivo

**Gravedad: alta.**

- `app/core/database.py:11` crea el engine al importar el módulo.
- `app/main.py:42` (`Base.metadata.create_all`) y `app/main.py:396`
  (`_asegurar_columnas_interconsultas()`) **abren conexión** al importar.

Consecuencias:

1. `.github/workflows/ci.yml:8-24` levanta un servicio Postgres completo solo para
   poder importar el módulo. **Ningún test usa Postgres**: usan SQLite en memoria
   (`test_priorizacion.py:36`, `test_upload_csv_banderas_rojas.py:16`) o un
   `DummySession` (`test_upload_csv.py:20`).
2. No se pueden correr los tests localmente sin Docker: falla en colección con
   `ModuleNotFoundError: psycopg2` antes de ejecutar nada.
3. `app/core/config.py` no acepta un `DATABASE_URL` completo, solo las piezas de
   Postgres (`database_url` es una `@property` armada a mano en la línea 23), así que
   no hay forma de apuntar la app a SQLite por variable de entorno.

- [ ] Mover `create_all` y `_asegurar_columnas_interconsultas()` a un `lifespan` de FastAPI
- [ ] Agregar soporte de `DATABASE_URL` en `Settings`

### c) No hay `pytest-cov` ni umbral de cobertura

**Gravedad: media.**

No está en `backend/requirements.txt`, no hay `--cov` en `addopts`
(`backend/pyproject.toml:26`), y ni `.github/workflows/ci.yml` ni el `Jenkinsfile`
reportan cobertura. Si baja, nadie se entera.

- [x] Agregar `pytest-cov` a `requirements.txt`
- [x] `addopts = "-ra --cov=app --cov-report=term-missing --cov-fail-under=82"`
      (82 y no 85: se activo `branch = true`, una metrica mas estricta. Sin
      branch el numero sigue siendo 85 %.)
- [x] Publicar el reporte en la CI

### d) El núcleo del producto (el modelo) nunca se ejecuta en tests

**Gravedad: media.**

`PriorizadorRigoBerta` está siempre reemplazado por un doble. Sin cobertura:

- `_resolver_labels` (`app/services/priorizador.py:108-128`) — el mapeo
  `LABEL_0/1/2 → baja/media/alta`. El propio `README.md:114-117` lo marca como el
  punto más riesgoso del sistema: si el orden no coincide con el `LabelEncoder` del
  entrenamiento, todas las probabilidades quedan mal asignadas.
- `construir_texto` (`:55-66`) — el orden y formato del prompt que ve el modelo.
- `_predecir_textos` (`:130-152`) — el batching.
- `_crear_resultado` (`:154-180`) — el argmax y el redondeo.

`_resolver_labels`, `construir_texto` y `_crear_resultado` son funciones puras: se
pueden testear con un config falso, sin GPU y sin descargar el modelo.

- [x] Tests de `_resolver_labels` (config con labels buenos / genéricos / cantidad incorrecta)
- [x] Tests de `construir_texto` (campos `None`, espacios múltiples)
- [x] Tests de `_crear_resultado` (argmax, redondeo a 2 decimales)

### e) Endpoints y ramas de error sin cubrir

**Gravedad: media.**

En `app/api/interconsultas.py`:

- [x] `GET /api/interconsultas/{id}` (`:78-93`) — **sin ningún test**, y es el endpoint
      del que depende la página de detalle del frontend
- [x] 404 en `PATCH /prioridad` (`:122`)
- [x] 404 en `PATCH /estado` (`:165`)
- [x] 422 por prioridad inválida (`:274`)
- [x] 422 por estado inválido (`:284`)
- [x] 422 por `medico_responsable` vacío (`:113`) — el motivo vacío sí se testea, el médico no
- [x] 503 cuando el modelo se cae, `_predecir_o_503` (`:337-338`)

En `app/main.py`:

- [x] CSV no codificado en UTF-8 (`:91-92`)
- [x] CSV corrupto / `csv.Error` (`:104-105`)
- [x] CSV sin filas (`:111`) y fila totalmente vacía que se saltea (`:118`)
- [x] XLSX ilegible (`:135-136`), sin filas (`:144`), con columnas extra (`:154`)
- [x] Archivo sin filas de datos (`:164`) y encabezados obligatorios faltantes (`:172`)
- [x] EDAD no numérica (`:195-196`)
- [x] Error de BD con rollback (`:267-272`)
- [x] `prioritization_status == "partial"` (`:354`) — solo se testean `completed` y `skipped`
- [x] **`_parsear_fecha_emision` completo (`:376-381`)** — los tres formatos y el caso
      no reconocido. `FECHA_EMISION` es lo que ordena el listado en HU3-c1.
- [x] Normalización de float entero en `_normalizar_valor` (`:392`)

### f) Duplicación dentro de los tests

**Gravedad: baja, pero es lo que hace caros los cambios.**

- Tres dobles del priorizador que hacen casi lo mismo: `DummyPriorizador`
  (`test_upload_csv.py:71`), `PriorizadorFake` (`test_priorizacion.py:16`),
  `PriorizadorNoDisponible` (`test_upload_csv_banderas_rojas.py:24`).
- El bloque `create_engine("sqlite://") + TestingSessionLocal + override_get_db`
  está copiado literal en `test_priorizacion.py:36-49` y
  `test_upload_csv_banderas_rojas.py:16-34`.
- `test_priorizacion.py` construye a mano un `Interconsulta` de ~10 campos en 12
  tests distintos. Son 594 líneas de las cuales más de la mitad es setup repetido.
- `monkeypatch.setattr(main_module, "SessionLocal", ...)` +
  `monkeypatch.setattr(main_module, "get_priorizador", ...)` se repite en los 4
  tests de `test_upload_csv_banderas_rojas.py`.

- [x] `tests/conftest.py` con: `engine` (scope session), `db`, `client`,
      `priorizador_fake` / `priorizador_caido`, y una factory `interconsulta(**kwargs)`

### g) Sin tests en el frontend

**Gravedad: media.** · **APLAZADO** (decision del 2026-08-31: queda fuera del
alcance actual). El diagnostico sigue vigente, no se cierra por resuelto.

> Al aplazarlo crecio: HDU-13 (PR #26) sumo ~630 lineas mas de logica sin tests
> (`utils/exportUtils.ts`, `hooks/useConfiguracionCampos.ts`,
> `context/ConfiguracionContext.tsx`), incluida la regla de bloquear la descarga
> de interconsultas no revisadas.

`frontend/services/interconsultas.ts` tiene ~150 líneas de lógica pura y crítica sin
ninguna cobertura:

- `mapearInterconsulta` (`:290-357`) — incluye el fallback de HU2-c5: sin prioridad
  disponible **no** se debe defaultear a `"baja"` (`:301-305`). Es una regla de
  seguridad clínica y hoy nada la protege.
- `normalizarPrioridad` (`:368-380`) — normalización NFD de tildes
- `normalizarEstado` (`:404`), `normalizarSexo` (`:382`)
- `obtenerMensajeError` (`:408-419`) — detail como string vs. objeto
- `tieneInformacionClinica` (`:359-366`)

- [ ] Instalar Vitest + Testing Library, agregar script `test` a `package.json`
- [ ] Tests unitarios de `services/interconsultas.ts`
- [ ] Agregar el paso de tests a `.github/workflows/ci.yml` y al `Jenkinsfile`

---

## 3. Código muerto y cosas que sobran

### Backend

- [x] **`pandas==2.3.3`** en `backend/requirements.txt` — el backend nunca importa
      pandas. Solo lo usa `scripts/predict_interconsultas.py`, que corre fuera del
      contenedor. Se instala en cada build de imagen y en cada corrida de CI.
- [x] **Dependencias transitivas fijadas** en `backend/requirements.txt`: `colorama`,
      `pytokens`, `librt`, `annotated-doc`, `ast_serialize`, `iniconfig`, `pluggy`,
      `h11`, `httpcore`, `idna`, `pathspec`, `platformdirs`, `Pygments`,
      `mypy_extensions`, `typing-inspection`, `packaging`, `greenlet`… Es un
      `pip freeze` volcado: fija versiones que nadie eligió y complica los updates.
      Conviene dejar solo las directas (o separar `requirements-dev.txt`).
- [ ] **`torch` + `transformers` en la imagen de CI** — `backend/Dockerfile` instala
      ~2-3 GB en cada corrida para ejecutar lint + 47 tests que jamás tocan torch.
      Se puede separar en una imagen/stage de test.
- [x] **`_tiene_informacion_clinica` duplicada** — `app/main.py:339-346` y
      `app/api/interconsultas.py:312-319` son idénticas.
- [x] **`utc_now` duplicada** — `app/models/interconsulta.py:10` y
      `app/models/modificacion_prioridad.py:10`, idénticas.
- [x] **Re-exports muertos** — `app/api/__init__.py`, `app/schemas/__init__.py` y
      `app/services/__init__.py` no los importa nadie (todo importa el módulo
      concreto). Además `schemas/__init__.py` está desactualizado: le faltan
      `ModificarEstadoRequest` y `ReevaluarBanderasResponse`.
- [ ] **`scripts/predict_interconsultas.py`** (288 líneas) — duplica casi entero
      `app/services/priorizador.py`: `PRIORITY_ORDER`, `FALLBACK_ID2LABEL`,
      `_normalize` ≡ `normalizar_clase`, `resolve_label_names` ≡ `_resolver_labels`,
      `predict` ≡ `_predecir_textos`, `build_texts` ≡ `construir_texto`. Son dos
      copias que pueden divergir justo en el mapeo de clases, que es el punto
      riesgoso. Además apunta a un `INPUT_PATH` hardcodeado que no existe en el repo
      (`ic_historicas_new.xlsx - Sheet 1.csv`, línea 40).
      **Decidir:** borrarlo, o reescribirlo como un CLI fino sobre `priorizador.py`.
- [ ] **Migración a mano** — `app/main.py:280-305`, `_asegurar_columnas_interconsultas()`
      es un mini-Alembic casero que corre `ALTER TABLE` al importar. Ya se agregaron
      6 columnas así. Evaluar introducir Alembic.

### Frontend

- [x] **`interconsultasMock`** — `frontend/data/mock.ts:31-263`, ~230 líneas
      **totalmente sin uso**. Cero referencias en todo el repo. (Ojo: `usuarioActual`
      y `resumenesClinicosMock`, del mismo archivo, **sí** se usan.)
- [x] **`priorizarInterconsultasPendientes`** — `frontend/services/interconsultas.ts:126`,
      exportada y nunca llamada. El endpoint existe en el backend pero la UI no lo usa.
- [x] **SVGs de boilerplate** — `frontend/public/{file,globe,next,vercel,window}.svg`,
      0 referencias, son los de `create-next-app`.
- [x] **`frontend/README.md`** — íntegro el de `create-next-app`, sin adaptar.
- [x] **`RolUsuario`** — `frontend/types/usuario.ts:7`, exportado y nunca referenciado
      fuera de su propio archivo.
- [x] ~~**`frontend/.gitignore`** — redundante~~ **Premisa incorrecta.** El
      `.gitignore` raiz NO cubre `node_modules`, `.next`, `next-env.d.ts`,
      `.vercel` ni `*.tsbuildinfo`. Borrarlo haria que se trackee
      `node_modules`. Se deja como esta.

### Repositorio

- [x] **`landing/.DS_Store` está commiteado** y `.gitignore` no tiene la regla
      `.DS_Store` (revisadas las 225 líneas, no aparece).
- [~] **`.gitignore` raíz** — hecho a medias: se elimino el `.env` duplicado y se
      agrego la regla `.DS_Store`. Queda pendiente podar las 225 líneas de
      plantilla genérica de Python (Poetry, PDM,
      Pyre, Cython, Sphinx, Scrapy…) con `.env` duplicado en las líneas 150 y 220.
- [ ] **`docs/arquitectura.md`** — 9 líneas con decisiones de mayo, sin actualizar
      desde entonces.
- [ ] **`Jenkinsfile` y `.github/workflows/ci.yml` son el mismo pipeline duplicado**
      en dos sistemas. Dos lugares que mantener en sincronía; ya divergirán.
- [ ] **`landing/assets/img/`** — ~1,6 MB de imágenes commiteadas
      (`app-dashboard.png` 480 KB, `app-detalle.png` 370 KB,
      `logo-priorizai.png` 299 KB para un logo, `logo-priorizai-mark.png` 141 KB
      para un favicon). Comprimir u optimizar.

---

## 4. Orden sugerido para mañana

1. **`tests/conftest.py` con fixtures** — engine SQLite (scope session), `db`,
   `client` con `dependency_overrides` limpiados en el teardown, dobles del
   priorizador, y una factory de `Interconsulta`. Arregla [2.a](#a-la-suite-depende-del-orden-alfabético-de-los-archivos)
   y borra ~200 líneas duplicadas de [2.f](#f-duplicación-dentro-de-los-tests).
   *Verificación: `pytest tests/test_upload_csv.py tests/test_priorizacion.py` debe pasar.*
2. **Sacar el I/O de BD del import de `app.main`** (`lifespan`) y soportar
   `DATABASE_URL` en `Settings`. Los tests corren sin Postgres y la CI se ahorra el
   servicio entero. → [2.b](#b-importar-appmain-exige-un-postgres-vivo)
3. **`pytest-cov` + `--cov-fail-under`** en `pyproject.toml` y en ambos pipelines.
   → [2.c](#c-no-hay-pytest-cov-ni-umbral-de-cobertura)
4. **Tests de los huecos de [2.e](#e-endpoints-y-ramas-de-error-sin-cubrir)**, empezando por
   `GET /api/interconsultas/{id}` y `_parsear_fecha_emision`.
5. **Tests puros de `priorizador.py`** (`_resolver_labels` sobre todo). → [2.d](#d-el-núcleo-del-producto-el-modelo-nunca-se-ejecuta-en-tests)
6. ~~**Vitest en el frontend**~~ — **aplazado**, ver [2.g](#g-sin-tests-en-el-frontend)
7. **Limpieza** de la sección 3 — es todo borrado, se puede hacer en un PR aparte y
   rápido: `interconsultasMock`, SVGs, `.DS_Store`, `pandas`, re-exports muertos.
