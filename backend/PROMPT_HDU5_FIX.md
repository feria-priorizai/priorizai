# Prompt: Arreglar y expandir el filtrado por especialidad (HDU-5)

> Derivado de revisión de PR. La rama `feat/perfilamiento-interconsultas`
> implementa `_filtrar_por_especialidad_si_medico` pero tiene defectos
> operacionales probados en SQLite contra el dataset real.

## Problema 1: Coincidencia por substring cruza especialidades

- **Síntoma**: `LIKE '%UROLOGIA%'` también calza con `NEUROLOGIA ADULTO`.
  Un médico de Urología ve interconsultas de Neurología.
- **Causa**: la comparación actual usa subcadena sin anclar al inicio.
- **Solución**: que el destino (`espec_destino`) sea **igual** a la
  especialidad o **empiece** por la especialidad seguida de un espacio
  (`"CARDIOLOGIA ADULTO"` sí; `"NEUROLOGIA ADULTO"` no).
  Evitar `LIKE '%...%'` libre; prefiero emparejamiento de palabra completa
  al comienzo.

## Problema 2: Equivalencias entre catálogo y dataset

- El catálogo (`ESPECIALIDADES` en `app/services/auth.py`) no se alinea con
  los valores reales de `espec_destino` que vienen en los CSV.
- **Ejemplos observados**:

  | Especialidad (catálogo)  | Valores reales en el CSV |
  |--------------------------|--------------------------|
  | Broncopulmonar           | `RESPIRATORIO ADULTO`    |
  | Ginecología y Obstetricia| `GINECOLOGIA`            |
  | Cirugía General          | `CIRUGIA DIGESTIVA`      |

- **Solución**: una tabla de equivalencias
  (`DESTINOS_POR_ESPECIALIDAD`) que mapee cada especialidad a uno o más
  `espec_destino` aceptables, con el nombre de la especialidad como
  valor por defecto.
- Revisar la lista **completa** de `ESPECIALIDADES` contra los
  `ESPEC_DESTINO` reales del dataset antes de codificar.

## Problema 3: Tests para ambos casos

- **Test A**: un médico de Urología **no** debe ver `NEUROLOGIA ADULTO`.
- **Test B**: un médico de Ginecología y Obstetricia **sí** debe ver
  `GINECOLOGIA`.
- Coberturar: coincidencia exacta, prefijo-con-espacio, y caso que no
  debe coincidir (Neurología vs Urología).

## Tareas menores

1. Mover `_filtrar_por_especialidad_si_medico` desde `api/auth.py` a un
   servicio (`services/especialidades.py`) y quitarle el guion bajo; sigue
   usándose desde `api/interconsultas.py`.
2. Aplicar el filtro a `POST /api/interconsultas/priorizar` (recibe ids):
   un médico no debe repriorizar interconsultas de otra especialidad.
3. La rama incluye #44 y #42 arriba; esta mejora se apila sobre ellas.

## Criterio de aceptación

- Un médico ve únicamente las interconsultas de su especialidad, incluyendo
  variantes con sufijos como `" ADULTO"` / `" INFANTIL"`.
- Un médico **no** ve interconsultas de otra especialidad que comparta
  subcadena (Neurología vs Urología).
- Tests pasan con `--tb=short`.
