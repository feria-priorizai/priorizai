from app.models.interconsulta import Interconsulta
from app.services.banderas_rojas import (
    aplicar_banderas_a_interconsulta,
    detectar_banderas,
    detectar_banderas_multicampo,
    nombres_de_terminos,
    terminos_afirmados,
)


def test_termino_afirmado_dispara_bandera() -> None:
    detecciones = detectar_banderas(
        "Paciente presenta dolor toracico intenso de inicio subito"
    )

    assert len(detecciones) == 1
    assert detecciones[0].termino_id == "dolor_toracico"
    assert detecciones[0].asercion == "afirmado"
    assert terminos_afirmados(detecciones) == ["dolor_toracico"]


def test_negacion_previa_no_dispara_bandera() -> None:
    detecciones = detectar_banderas(
        "Paciente sin dolor toracico al momento del ingreso"
    )

    assert len(detecciones) == 1
    assert detecciones[0].asercion == "negado"
    assert terminos_afirmados(detecciones) == []


def test_negacion_posterior_no_dispara_bandera() -> None:
    detecciones = detectar_banderas(
        "Se evaluo dolor toracico, descartado tras electrocardiograma normal"
    )

    assert len(detecciones) == 1
    assert detecciones[0].asercion == "negado"
    assert terminos_afirmados(detecciones) == []


def test_termino_historico_no_dispara_bandera() -> None:
    detecciones = detectar_banderas(
        "Antecedente de sepsis resuelta en 2019, actualmente estable"
    )

    assert len(detecciones) == 1
    assert detecciones[0].termino_id == "sepsis"
    assert detecciones[0].asercion == "historico"
    assert terminos_afirmados(detecciones) == []


def test_termino_hipotetico_no_dispara_bandera() -> None:
    detecciones = detectar_banderas(
        "Se deriva para descartar hemorragia digestiva ante anemia de estudio"
    )

    assert len(detecciones) == 1
    assert detecciones[0].asercion == "hipotetico"
    assert terminos_afirmados(detecciones) == []


def test_pseudo_negacion_si_dispara_bandera() -> None:
    detecciones = detectar_banderas(
        "No se puede descartar sepsis en este cuadro clinico"
    )

    assert len(detecciones) == 1
    assert detecciones[0].termino_id == "sepsis"
    assert detecciones[0].asercion == "afirmado"
    assert terminos_afirmados(detecciones) == ["sepsis"]


def test_terminador_corta_el_alcance_de_la_negacion() -> None:
    texto = "Sin dolor toracico pero con signos de shock evidentes"
    detecciones = detectar_banderas(texto)

    por_termino = {d.termino_id: d.asercion for d in detecciones}
    assert por_termino["dolor_toracico"] == "negado"
    assert por_termino["signos_de_shock"] == "afirmado"
    assert terminos_afirmados(detecciones) == ["signos_de_shock"]


def test_texto_sin_terminos_de_alarma_no_genera_detecciones() -> None:
    detecciones = detectar_banderas(
        "Paciente control sano, sin hallazgos relevantes al examen"
    )

    assert detecciones == []
    assert terminos_afirmados(detecciones) == []


def test_texto_vacio_no_genera_detecciones() -> None:
    assert detectar_banderas("") == []
    assert detectar_banderas("   ") == []


def test_multiples_terminos_afirmados_se_reportan_todos() -> None:
    texto = "Paciente con dolor toracico y ademas convulsiones activas"
    detecciones = detectar_banderas(texto)

    assert set(terminos_afirmados(detecciones)) == {"dolor_toracico", "convulsiones"}


def test_sinonimo_del_catalogo_tambien_dispara_deteccion() -> None:
    detecciones = detectar_banderas(
        "Cuadro compatible con angina de reciente aparicion"
    )

    assert len(detecciones) == 1
    assert detecciones[0].termino_id == "dolor_toracico"
    assert detecciones[0].asercion == "afirmado"


def _interconsulta(historia: str) -> Interconsulta:
    return Interconsulta(
        id="ic-test",
        espec_origen="Medicina General",
        edad=54,
        sexo="M",
        espec_destino="Cardiologia",
        historia_clinica=historia,
        fundamentos_diagnostico="",
        examenes_complementarios="",
        motivo_interconsulta="",
    )


def test_aplicar_banderas_fuerza_prioridad_sin_modificacion_previa() -> None:
    interconsulta = _interconsulta("Paciente con dolor toracico de inicio subito")

    resultado = aplicar_banderas_a_interconsulta(
        interconsulta, ya_modificada_por_medico=False
    )

    assert resultado.bandera_roja is True
    assert resultado.terminos == ["dolor_toracico"]
    assert resultado.forzar_prioridad_alta is True
    assert interconsulta.prioridad_actual == "alta"
    assert interconsulta.prioridad_forzada_por_regla is True
    assert interconsulta.terminos_bandera_roja == "dolor_toracico"


def test_aplicar_banderas_no_pisa_decision_medica_previa() -> None:
    interconsulta = _interconsulta("Paciente con dolor toracico de inicio subito")
    interconsulta.prioridad_actual = "media"

    resultado = aplicar_banderas_a_interconsulta(
        interconsulta, ya_modificada_por_medico=True
    )

    assert resultado.bandera_roja is True
    assert resultado.forzar_prioridad_alta is False
    # La bandera queda visible, pero la prioridad del medico no se toca (D5).
    assert interconsulta.bandera_roja is True
    assert interconsulta.prioridad_actual == "media"
    assert interconsulta.prioridad_forzada_por_regla is not True


def test_multicampo_no_deja_que_un_marcador_cruce_de_campo() -> None:
    # Regresion: un marcador hipotetico en fundamentos_diagnostico ("sospecha de
    # sindrome coronario") no debe negar/calificar un termino afirmado en
    # historia_clinica ("dolor toracico"), aunque queden adyacentes al concatenar.
    campos = [
        "Paciente con dolor toracico de inicio subito",
        "Sospecha de sindrome coronario agudo",
    ]

    detecciones = detectar_banderas_multicampo(campos)

    assert len(detecciones) == 1
    assert detecciones[0].termino_id == "dolor_toracico"
    assert detecciones[0].asercion == "afirmado"
    assert terminos_afirmados(detecciones) == ["dolor_toracico"]


def test_aplicar_banderas_sin_bandera_no_fuerza_nada() -> None:
    interconsulta = _interconsulta("Paciente control sano, sin hallazgos")

    resultado = aplicar_banderas_a_interconsulta(
        interconsulta, ya_modificada_por_medico=False
    )

    assert resultado.bandera_roja is False
    assert resultado.terminos == []
    assert resultado.forzar_prioridad_alta is False
    assert interconsulta.terminos_bandera_roja is None


def test_nombres_de_terminos_traduce_ids_al_nombre_clinico() -> None:
    # El id se persiste por estable, pero la interfaz muestra el termino bien
    # escrito, con tildes (HU5-c3).
    assert nombres_de_terminos("dolor_toracico") == ["dolor torácico"]
    assert nombres_de_terminos("dolor_toracico,sepsis") == ["dolor torácico", "sepsis"]


def test_nombres_de_terminos_tolera_vacios_e_ids_desconocidos() -> None:
    assert nombres_de_terminos(None) == []
    assert nombres_de_terminos("") == []
    # Un id que ya no esta en el catalogo se devuelve tal cual, para no perder el
    # motivo de una bandera guardada antes de editar el catalogo.
    assert nombres_de_terminos("termino_eliminado") == ["termino_eliminado"]
