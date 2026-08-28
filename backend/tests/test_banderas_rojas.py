from app.services.banderas_rojas import (
    aplicar_deteccion,
    detectar_banderas,
    detectar_banderas_multicampo,
    hay_bandera_afirmada,
    terminos_afirmados,
)


def test_termino_afirmado_dispara_bandera() -> None:
    detecciones = detectar_banderas(
        "Paciente presenta dolor toracico intenso de inicio subito"
    )

    assert len(detecciones) == 1
    assert detecciones[0].termino_id == "dolor_toracico"
    assert detecciones[0].asercion == "afirmado"
    assert hay_bandera_afirmada(detecciones)
    assert terminos_afirmados(detecciones) == ["dolor_toracico"]


def test_negacion_previa_no_dispara_bandera() -> None:
    detecciones = detectar_banderas(
        "Paciente sin dolor toracico al momento del ingreso"
    )

    assert len(detecciones) == 1
    assert detecciones[0].asercion == "negado"
    assert not hay_bandera_afirmada(detecciones)


def test_negacion_posterior_no_dispara_bandera() -> None:
    detecciones = detectar_banderas(
        "Se evaluo dolor toracico, descartado tras electrocardiograma normal"
    )

    assert len(detecciones) == 1
    assert detecciones[0].asercion == "negado"
    assert not hay_bandera_afirmada(detecciones)


def test_termino_historico_no_dispara_bandera() -> None:
    detecciones = detectar_banderas(
        "Antecedente de sepsis resuelta en 2019, actualmente estable"
    )

    assert len(detecciones) == 1
    assert detecciones[0].termino_id == "sepsis"
    assert detecciones[0].asercion == "historico"
    assert not hay_bandera_afirmada(detecciones)


def test_termino_hipotetico_no_dispara_bandera() -> None:
    detecciones = detectar_banderas(
        "Se deriva para descartar hemorragia digestiva ante anemia de estudio"
    )

    assert len(detecciones) == 1
    assert detecciones[0].asercion == "hipotetico"
    assert not hay_bandera_afirmada(detecciones)


def test_pseudo_negacion_si_dispara_bandera() -> None:
    detecciones = detectar_banderas(
        "No se puede descartar sepsis en este cuadro clinico"
    )

    assert len(detecciones) == 1
    assert detecciones[0].termino_id == "sepsis"
    assert detecciones[0].asercion == "afirmado"
    assert hay_bandera_afirmada(detecciones)


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
    assert not hay_bandera_afirmada(detecciones)


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


def test_aplicar_deteccion_fuerza_prioridad_sin_modificacion_previa() -> None:
    resultado = aplicar_deteccion(
        "Paciente con dolor toracico de inicio subito",
        ya_modificada_por_medico=False,
    )

    assert resultado.bandera_roja is True
    assert resultado.terminos == ["dolor_toracico"]
    assert resultado.forzar_prioridad_alta is True


def test_aplicar_deteccion_no_pisa_decision_medica_previa() -> None:
    resultado = aplicar_deteccion(
        "Paciente con dolor toracico de inicio subito",
        ya_modificada_por_medico=True,
    )

    assert resultado.bandera_roja is True
    assert resultado.forzar_prioridad_alta is False


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


def test_aplicar_deteccion_sin_bandera_no_fuerza_nada() -> None:
    resultado = aplicar_deteccion(
        "Paciente control sano, sin hallazgos",
        ya_modificada_por_medico=False,
    )

    assert resultado.bandera_roja is False
    assert resultado.terminos == []
    assert resultado.forzar_prioridad_alta is False
