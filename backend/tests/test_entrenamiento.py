"""Proceso de reentrenamiento (`app/entrenamiento`), con un BERT diminuto.

Entrena de verdad, pero un modelo de una capa con un vocabulario de pocas
palabras: segundos en CPU, sin descargar nada. La ultima prueba lanza el
proceso real desde la API, de punta a punta.
"""

import json
import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
import torch
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker
from tokenizers import Tokenizer, models, pre_tokenizers, processors
from transformers import (
    AutoConfig,
    BertConfig,
    BertForSequenceClassification,
    PreTrainedTokenizerFast,
)

from app.core.config import settings
from app.entrenamiento import entrenar
from app.entrenamiento.metricas import calcular_metricas
from app.models.interconsulta import Interconsulta
from app.services import reentrenamiento as servicio
from app.services.priorizador import construir_texto
from app.services.reentrenamiento import Reentrenador, get_reentrenador

ESPECIALES = ["[PAD]", "[UNK]", "[CLS]", "[SEP]"]
FRASES = {
    "alta": "dolor toracico opresivo urgente",
    "media": "disnea de esfuerzo progresiva",
    "baja": "control anual de rutina",
}


# ------------------------------------------------------------- metricas --
def test_metricas_con_un_caso_conocido() -> None:
    reales = ["alta", "alta", "media", "baja", "baja", "baja"]
    predichas = ["alta", "media", "media", "baja", "baja", "alta"]

    metricas = calcular_metricas(reales, predichas)

    assert metricas["n"] == 6
    assert metricas["exactitud"] == pytest.approx(4 / 6, abs=1e-4)
    assert metricas["sensibilidad_alta"] == 0.5
    assert metricas["f1_por_clase"] == {"baja": 0.8, "media": 0.6667, "alta": 0.5}
    assert metricas["f1_macro"] == pytest.approx((0.8 + 2 / 3 + 0.5) / 3, abs=1e-4)
    # Filas: real; columnas: predicha. Orden baja, media, alta.
    assert metricas["matriz_confusion"] == [[2, 0, 1], [0, 1, 0], [0, 1, 1]]


def test_metricas_promedian_solo_las_clases_presentes() -> None:
    metricas = calcular_metricas(["baja", "alta"], ["baja", "alta"])

    assert metricas["f1_macro"] == 1.0
    assert metricas["f1_por_clase"]["media"] == 0.0


def test_metricas_sin_aciertos_no_dividen_por_cero() -> None:
    metricas = calcular_metricas(["alta", "alta"], ["baja", "baja"])

    assert metricas["exactitud"] == 0.0
    assert metricas["sensibilidad_alta"] == 0.0
    assert metricas["f1_macro"] == 0.0


def test_metricas_rechazan_listas_invalidas() -> None:
    with pytest.raises(ValueError, match="mismo largo"):
        calcular_metricas(["alta"], [])
    with pytest.raises(ValueError, match="No hay ejemplos"):
        calcular_metricas([], [])


# ------------------------------------------------------- modelo diminuto --
def _ejemplos(por_clase: int = 8) -> list[dict[str, str]]:
    return [
        {"texto": f"paciente {i} {frase}", "etiqueta": clase}
        for clase, frase in FRASES.items()
        for i in range(por_clase)
    ]


def _tokenizador(textos: list[str]) -> PreTrainedTokenizerFast:
    palabras = sorted({t for texto in textos for t in re.findall(r"\w+", texto)})
    vocab = {token: i for i, token in enumerate(ESPECIALES + palabras)}
    tokenizer = Tokenizer(models.WordLevel(vocab, unk_token="[UNK]"))
    tokenizer.pre_tokenizer = pre_tokenizers.Whitespace()
    tokenizer.post_processor = processors.TemplateProcessing(
        single="[CLS] $A [SEP]",
        special_tokens=[("[CLS]", vocab["[CLS]"]), ("[SEP]", vocab["[SEP]"])],
    )
    return PreTrainedTokenizerFast(
        tokenizer_object=tokenizer,
        pad_token="[PAD]",
        unk_token="[UNK]",
        cls_token="[CLS]",
        sep_token="[SEP]",
    )


def guardar_modelo_diminuto(
    carpeta: Path,
    textos: list[str],
    id2label: dict[int, str] | None = None,
) -> Path:
    tokenizer = _tokenizador(textos)
    torch.manual_seed(0)
    config = BertConfig(
        vocab_size=len(tokenizer.get_vocab()),
        hidden_size=16,
        num_hidden_layers=1,
        num_attention_heads=2,
        intermediate_size=32,
        max_position_embeddings=64,
        num_labels=3,
    )
    if id2label is not None:
        config.id2label = id2label
        config.label2id = {v: k for k, v in id2label.items()}
    BertForSequenceClassification(config).save_pretrained(carpeta)
    tokenizer.save_pretrained(carpeta)
    return carpeta


@pytest.fixture
def base_diminuta(tmp_path: Path) -> Path:
    textos = [e["texto"] for e in _ejemplos()] + list(_textos_de_interconsultas())
    return guardar_modelo_diminuto(tmp_path / "base", textos)


def _textos_de_interconsultas() -> Iterator[str]:
    for clase, frase in FRASES.items():
        yield construir_texto(_interconsulta_de(clase, frase, 0))


def _interconsulta_de(clase: str, frase: str, i: int) -> Interconsulta:
    return Interconsulta(
        id=f"ic-{clase}-{i:02d}",
        espec_origen="Medicina General",
        edad=50,
        sexo="F",
        espec_destino="Cardiologia",
        historia_clinica=frase,
        fundamentos_diagnostico="Fundamentos",
        examenes_complementarios="",
        motivo_interconsulta="Control",
        prioridad_actual=clase,
        estado="revisada",
    )


def _trabajo(
    carpeta: Path,
    base: Path,
    configuraciones: list[dict[str, Any]],
    modelo_actual: dict[str, Any] | None = None,
    dispositivo: str = "cpu",
) -> dict[str, Any]:
    ejemplos = _ejemplos()
    carpeta.mkdir(parents=True, exist_ok=True)
    rutas = {}
    for nombre, conjunto in (
        ("entrenamiento", ejemplos),
        ("validacion", ejemplos[::4]),
        ("evaluacion", ejemplos[1::3]),
    ):
        ruta = carpeta / f"{nombre}.jsonl"
        ruta.write_text(
            "".join(json.dumps(e) + "\n" for e in conjunto), encoding="utf-8"
        )
        rutas[nombre] = str(ruta)
    return {
        "modelo_base": str(base),
        "dispositivo": dispositivo,
        **rutas,
        "modelo_actual": modelo_actual,
        "configuraciones": [
            {**c, "salida": str(carpeta / f"configuracion_{i + 1}")}
            for i, c in enumerate(configuraciones)
        ],
    }


CONFIG_RAPIDA = {
    "epocas": 2,
    "learning_rate": 5e-3,
    "batch_size": 8,
    "max_length": 32,
    "paciencia": 2,
}


class Eventos:
    def __init__(self) -> None:
        self.lista: list[dict[str, Any]] = []

    def __call__(self, evento: dict[str, Any]) -> None:
        self.lista.append(evento)

    def de_tipo(self, tipo: str) -> list[dict[str, Any]]:
        return [e for e in self.lista if e["tipo"] == tipo]


# ---------------------------------------------------------------- proceso --
def test_ejecutar_entrena_cada_configuracion_y_evalua_el_modelo_en_uso(
    tmp_path: Path, base_diminuta: Path
) -> None:
    trabajo = _trabajo(
        tmp_path / "trabajo",
        base_diminuta,
        [CONFIG_RAPIDA, {**CONFIG_RAPIDA, "epocas": 1}],
        modelo_actual={
            "ruta": str(base_diminuta),
            "labels": ["baja", "media", "alta"],
            "max_length": 32,
        },
    )
    eventos = Eventos()

    entrenar.ejecutar(trabajo, eventos)

    actual = eventos.de_tipo("modelo_actual")
    assert len(actual) == 1
    assert set(actual[0]["metricas"]) >= {"exactitud", "f1_macro", "sensibilidad_alta"}

    resultados = eventos.de_tipo("resultado")
    assert [r["indice"] for r in resultados] == [0, 1]
    assert resultados[1]["epocas_corridas"] == 1
    for resultado in resultados:
        assert resultado["metricas"]["n"] == len(_ejemplos()[1::3])
        assert 1 <= resultado["mejor_epoca"] <= resultado["epocas_corridas"]

    for config in trabajo["configuraciones"]:
        salida = Path(config["salida"])
        assert (salida / "model.safetensors").is_file()
        # El formato que carga la app, con las clases declaradas por nombre.
        guardado = AutoConfig.from_pretrained(salida)
        assert guardado.id2label == {0: "baja", 1: "media", 2: "alta"}

    progreso = eventos.de_tipo("progreso")
    assert progreso[0]["etapa"] == "Evaluando el modelo en uso"
    assert progreso[-1]["etapa"] == "Terminado"
    assert progreso[-1]["porcentaje"] == 100.0


def test_ejecutar_se_detiene_al_agotar_la_paciencia(
    tmp_path: Path, base_diminuta: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """La validacion empeora despues de la primera epoca: con paciencia 1 se
    corta en la segunda y se queda con la primera."""
    f1_por_llamada = iter([0.6, 0.5, 0.4, 0.3, 0.2])

    def metricas_que_empeoran(
        reales: list[str], predichas: list[str]
    ) -> dict[str, Any]:
        return {
            **calcular_metricas(reales, predichas),
            "f1_macro": next(f1_por_llamada),
        }

    monkeypatch.setattr(entrenar, "calcular_metricas", metricas_que_empeoran)
    trabajo = _trabajo(
        tmp_path / "trabajo",
        base_diminuta,
        [{**CONFIG_RAPIDA, "epocas": 5, "paciencia": 1}],
    )
    eventos = Eventos()

    entrenar.ejecutar(trabajo, eventos)

    (resultado,) = eventos.de_tipo("resultado")
    assert resultado["epocas_corridas"] == 2
    assert resultado["mejor_epoca"] == 1
    assert eventos.de_tipo("modelo_actual") == []


def test_avance_no_se_informa_mas_de_una_vez_por_segundo() -> None:
    eventos = Eventos()
    avance = entrenar.Avance(1, eventos)

    avance.informar("Entrenando", 0.5, forzar=True)
    avance.informar("Entrenando", 0.6)

    assert len(eventos.lista) == 1
    assert eventos.lista[0]["segundos_restantes"] is not None


def test_pedir_gpu_sin_gpu_falla_con_un_mensaje_claro(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)

    with pytest.raises(RuntimeError, match="no tiene una GPU"):
        entrenar.elegir_dispositivo("gpu")


def test_elegir_gpu_cuando_hay(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(torch.cuda, "is_available", lambda: True)

    assert entrenar.elegir_dispositivo("gpu").type == "cuda"


def test_main_informa_el_error_como_evento_y_sale_con_1(
    tmp_path: Path,
    base_diminuta: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)
    ruta = tmp_path / "trabajo.json"
    ruta.write_text(
        json.dumps(
            _trabajo(tmp_path / "t", base_diminuta, [CONFIG_RAPIDA], dispositivo="gpu")
        ),
        encoding="utf-8",
    )

    assert entrenar.main([str(ruta)]) == 1

    ultima = capsys.readouterr().out.strip().splitlines()[-1]
    assert ultima.startswith(entrenar.PREFIJO_EVENTO)
    evento = json.loads(ultima[len(entrenar.PREFIJO_EVENTO) :])
    assert evento["tipo"] == "error"
    assert "GPU" in evento["mensaje"]


def test_main_termina_con_0_cuando_todo_sale_bien(
    tmp_path: Path, base_diminuta: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    ruta = tmp_path / "trabajo.json"
    trabajo = _trabajo(tmp_path / "t", base_diminuta, [{**CONFIG_RAPIDA, "epocas": 1}])
    ruta.write_text(json.dumps(trabajo), encoding="utf-8")

    assert entrenar.main([str(ruta)]) == 0
    assert '"tipo": "resultado"' in capsys.readouterr().out


# ---------------------------------------------------------- punta a punta --
@pytest.fixture
def reentrenador_real(
    session_factory: sessionmaker[Session],
) -> Reentrenador:
    return Reentrenador(fabrica_sesiones=session_factory)


@pytest.fixture
def api_con_proceso_real(
    client_admin: TestClient,
    reentrenador_real: Reentrenador,
    base_diminuta: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> TestClient:
    from app.main import app

    monkeypatch.setattr(settings, "modelos_versiones_dir", str(tmp_path / "versiones"))
    monkeypatch.setattr(settings, "reentrenamiento_modelo_base", str(base_diminuta))
    monkeypatch.setattr(settings, "reentrenamiento_minimo", 15)
    monkeypatch.setattr(settings, "model_path", str(base_diminuta))
    monkeypatch.setattr(settings, "model_labels", ("baja", "media", "alta"))
    monkeypatch.setattr(settings, "model_max_length", 32)
    app.dependency_overrides[get_reentrenador] = lambda: reentrenador_real
    return client_admin


def test_reentrenamiento_de_punta_a_punta_con_el_proceso_real(
    api_con_proceso_real: TestClient,
    reentrenador_real: Reentrenador,
    db: Session,
) -> None:
    servicio.asegurar_version_inicial(db)
    for clase, frase in FRASES.items():
        for i in range(8):
            db.add(_interconsulta_de(clase, frase, i))
    db.commit()

    respuesta = api_con_proceso_real.post(
        "/api/reentrenamiento/trabajos",
        json={
            "dispositivo": "cpu",
            "configuraciones": [{**CONFIG_RAPIDA, "epocas": 1, "learning_rate": 1e-3}],
        },
    )
    assert respuesta.status_code == 202, respuesta.text
    reentrenador_real.esperar(timeout=240)

    detalle = api_con_proceso_real.get(
        f"/api/reentrenamiento/trabajos/{respuesta.json()['id']}"
    ).json()
    assert detalle["estado"] == "terminado", detalle["log"] + (detalle["error"] or "")
    assert detalle["resultados"]["modelo_actual"]["n"] == detalle["n_evaluacion"]
    (config,) = detalle["resultados"]["configuraciones"]
    assert "época 1/1" in detalle["log"]

    versiones = api_con_proceso_real.get("/api/reentrenamiento/versiones").json()
    nueva = next(v for v in versiones if v["id"] == config["version_id"])
    assert nueva["activa"] is False
    assert nueva["disponible"] is True
    assert (Path(nueva["ruta"]) / "model.safetensors").is_file()
