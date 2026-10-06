"""Specialty filtering utilities for interconsultas."""

from __future__ import annotations

import unicodedata

from sqlalchemy import false, func, or_
from sqlalchemy.sql import Select

from app.models.interconsulta import Interconsulta
from app.models.usuario import Usuario
from app.services.auth import (
    ESPECIALIDADES,
    ROL_MEDICO,
)

# Mapping from catalog specialty to possible "espec_destino" values in the dataset.
# Extend this mapping as new mismatches are discovered.
DESTINOS_POR_ESPECIALIDAD: dict[str, set[str]] = {
    "Broncopulmonar": {"RESPIRATORIO ADULTO", "BRONCOPULMONAR"},
    "Ginecología y Obstetricia": {"GINECOLOGIA"},
    "Cirugía General": {"CIRUGIA DIGESTIVA"},
}


def _quitar_tildes(texto: str) -> str:
    """Remove diacritic marks from a string using Unicode NFKD normalization."""
    return "".join(
        c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c)
    )


def _variantes_especialidad(especialidad: str) -> set[str]:
    """Generate case‑, accent‑ and ASCII‑insensitive variants for a specialty.

    Includes the raw value, the version without tildes, and any catalog entry
    that matches after removing tildes (case‑insensitive).
    """
    base = especialidad.strip()
    sin_tilde = _quitar_tildes(base)
    formas = {base, sin_tilde}
    for esp in ESPECIALIDADES:
        if _quitar_tildes(esp).strip().lower() == sin_tilde.strip().lower():
            formas.add(esp.strip())
            formas.add(_quitar_tildes(esp).strip())
    variantes: set[str] = set()
    for f in formas:
        for variante in (f.lower(), f.upper(), f.capitalize()):
            variantes.add(variante)
            # SQLite LOWER() only lowercases ASCII characters.
            variantes.add("".join(c.lower() if c.isascii() else c for c in variante))
    return variantes


def _destinos_equivalentes(especialidad: str) -> set[str]:
    """Return additional destination strings that map to the given specialty.

    Looks up ``DESTINOS_POR_ESPECIALIDAD`` and expands each destination with its
    variants (case/tilde insensitive).
    """
    destinos = set()
    for alias, equivalentes in DESTINOS_POR_ESPECIALIDAD.items():
        if alias == especialidad:
            for d in equivalentes:
                destinos.update(_variantes_especialidad(d))
    return destinos


def filtrar_por_especialidad_si_medico(query: Select, usuario: Usuario) -> Select:
    """Apply specialty filtering to a SQLAlchemy ``Select`` when the user is a doctor.

    Admins see all rows. Doctors see rows where ``espec_destino`` matches their
    specialty exactly, starts with the specialty followed by a space, or matches
    any of the mapped destination values defined in ``DESTINOS_POR_ESPECIALIDAD``.
    The comparison is case‑ and accent‑insensitive.
    """
    if usuario.rol == ROL_MEDICO:
        if not usuario.especialidad:
            return query.where(false())
        # Build the set of accepted destination strings (exact matches).
        variantes = _variantes_especialidad(usuario.especialidad)
        variantes.update(_destinos_equivalentes(usuario.especialidad))
        # Normalize specialty for LIKE patterns (case and accent insensitive).
        # Normalize specialty for LIKE patterns (accent‑free lower case)
        spec_clean = _quitar_tildes(usuario.especialidad).strip().lower()
        # Build unaccented expression for the destination column
        dest_expr = _unaccent_sql(func.lower(func.trim(Interconsulta.espec_destino)))
        condiciones = [func.trim(Interconsulta.espec_destino).in_(variantes)]
        # Prefix match: "specialty ..."
        condiciones.append(dest_expr.like(f"{spec_clean} %", escape="\\"))
        # Suffix match: "... specialty"
        condiciones.append(dest_expr.like(f"% {spec_clean}", escape="\\"))
        # Whole word match: "... specialty ..."
        condiciones.append(dest_expr.like(f"% {spec_clean} %", escape="\\"))
        return query.where(or_(*condiciones))
    # Non‑doctor (admin) – no filtering.
    return query


# Helper to remove common accent characters in SQL expressions (SQLite lacks built‑in unaccent).
def _unaccent_sql(expr):
    """Return a SQL expression with accented characters replaced by their non‑accented equivalents.
    This is a simple chain of REPLACE calls covering the characters used in the dataset.
    """
    replacements = [
        ("á", "a"),
        ("é", "e"),
        ("í", "i"),
        ("ó", "o"),
        ("ú", "u"),
        ("Á", "a"),
        ("É", "e"),
        ("Í", "i"),
        ("Ó", "o"),
        ("Ú", "u"),
        ("ñ", "n"),
        ("Ñ", "n"),
    ]
    for acc, plain in replacements:
        expr = func.replace(expr, acc, plain)
    return expr
