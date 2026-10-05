# Resumen de cambios - feat/perfilamiento-interconsultas

## Contexto
Implementación del filtrado de interconsultas por especialidad médica, con soporte para mayúsculas, minúsculas y variaciones de tildes. Los médicos solo verán interconsultas de su especialidad, mientras que los administradores ven todas.

## Cambios en `backend/app/api/auth.py`

### Nuevas funciones auxiliares

- **`_quitar_tildes(texto)`**: Normaliza un texto eliminando las tildes usando `unicodedata.normalize("NFKD")` y filtrando los caracteres combinantes.

- **`_variantes_especialidad(especialidad)`**: Genera un conjunto de variantes para una especialidad, incluyendo:
  - La forma original
  - Sin tildes
  - Formas en mayúsculas, minúsculas y con capitalización
  - Variantes ASCII-only para compatibilidad con `LOWER()` de SQLite

### Función `_filtrar_por_especialidad_si_medico` actualizada

- Ahora usa `_variantes_especialidad()` en lugar de comparación directa
- Soporta mayúsculas, minúsculas y presencia/ausencia de tildes
- Si el médico no tiene especialidad asignada, retorna `false()` (sin resultados)
- Los administradores siguen viendo todas las interconsultas sin cambios

### Importaciones agregadas

- `unicodedata` para normalización de tildes
- `ESPECIALIDADES` de `app.services.auth` para comparar contra el catálogo de especialidades

## Nuevos tests en `backend/tests/test_interconsultas_api.py`

### `test_listado_coincide_independiente_de_mayusculas_o_tildes`

Verifica que un médico de Cardiología pueda ver interconsultas registradas con `espec_destino="CARDIOLOGÍA"` búsquedas con variantes como "CARDIOLOGÍA" o "Cardiología".

### `test_medico_sin_especialidad_no_ve_interconsultas`

Verifica que un médico sin especialidad asignada no vea interconsultas ajenas (retorna lista vacía).

## Resumen técnico

El filtro `_filtrar_por_especialidad_si_medico` ahora es robusto ante variaciones de entrada:
- `"Cardiología"` ≈ `"CARDIOLoGíA"` ≈ `"cardiología"` ≈ `"cardiólOgIA"`
- Mantiene la misma semántica: médicos solo ven las suyas, administradores ven todas
- No requiere cambios en el frontend, el filtro se aplica en la consulta SQL mediante `func.lower(func.trim(...)).in_(variantes)`