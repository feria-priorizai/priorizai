"""Dataset sintetico de interconsultas priorizadas para probar el reentrenamiento.

A diferencia de interconsultas_sinteticas_10k.xlsx, la prioridad no se puede
leer de una frase fija:
- Cada diagnostico aparece en las tres prioridades; lo que decide es la
  gravedad del cuadro (signos de alarma, evolucion, examenes, funcionalidad).
- Las frases de cierre ("favor evaluar", "a la brevedad"...) se eligen casi
  sin mirar la prioridad, como escriben los medicos de verdad.
- Un 12 % de los casos mezcla un hallazgo de la prioridad vecina (casos
  limitrofes), y entre un 3 % (alta) y un 10 % (media) tiene la prioridad
  corrida un nivel (criterios distintos entre priorizadores).
- Tres estilos de redaccion (formal, telegrafico de APS, narrativo), con
  abreviaturas y algun error de tipeo.

Uso: python scripts/generar_interconsultas_reentrenamiento.py salida.xlsx [n] [semilla]
Los archivos de data/ se generaron asi:
  ... data/interconsultas_reentrenamiento_1000.xlsx 1000 2026
  ... data/interconsultas_reentrenamiento_300.xlsx 300 777
"""

import random
import sys

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter


def V(hallazgos, evol, examenes, peso=1.0):
    return {"hallazgos": hallazgos, "evol": evol, "examenes": examenes, "peso": peso}


def C(destino, dx, edad, alta, media, baja, sexo=None, sintoma=None):
    return {
        "destino": destino,
        "dx": dx,
        "edad": edad,
        "sexo": sexo,
        "sintoma": sintoma,
        "variantes": {"alta": alta, "media": media, "baja": baja},
    }


SEM = ["10 días", "2 semanas", "3 semanas", "1 mes", "5 semanas"]
MES = ["2 meses", "3 meses", "4 meses", "6 meses"]
ANO = ["6 meses", "8 meses", "1 año", "2 años", "varios años"]

CASOS = [
    # ------------------------------------------------------------ Cardiología
    C("Cardiología", ["Angina de pecho", "Dolor torácico en estudio", "Sospecha de cardiopatía coronaria"], (42, 84),
      V(["dolor torácico opresivo con esfuerzos mínimos", "episodios de dolor en reposo de 10 a 15 minutos", "dolor irradiado a brazo izquierdo con sudoración", "aumento de la frecuencia de los episodios en las últimas semanas"],
        SEM, ["ECG: infradesnivel ST de 1 mm en V4-V6", "ECG: T negativas en cara lateral", "Troponina en SAPU: negativa"]),
      V(["dolor opresivo al subir dos pisos que cede con reposo", "episodios de menos de 5 minutos", "patrón estable, sin cambios en los últimos meses"],
        MES, ["ECG: ritmo sinusal sin alteraciones agudas", "Perfil lipídico: LDL 168 mg/dL", "Test de esfuerzo: no disponible en APS"]),
      V(["molestia torácica punzante que aumenta con la palpación", "dolor sin relación con el esfuerzo", "molestias asociadas a periodos de estrés"],
        ANO, ["ECG: normal", "Rx de tórax: normal"]), sintoma="dolor torácico"),
    C("Cardiología", ["Insuficiencia cardíaca", "Insuficiencia cardíaca descompensada"], (55, 90),
      V(["disnea de reposo", "ortopnea de tres almohadas", "edema hasta las rodillas pese a furosemida", "aumento de 5 kg de peso en dos semanas"],
        SEM, ["Rx de tórax: cardiomegalia y derrame pleural bilateral", "NT-proBNP: 4.800 pg/mL", "Creatinina: 1,8 mg/dL"]),
      V(["disnea con esfuerzos moderados", "edema maleolar vespertino", "capacidad funcional II, estable con tratamiento"],
        MES, ["Ecocardiograma 2023: FE 40%", "Rx de tórax: cardiomegalia leve"]),
      V(["asintomático, insuficiencia cardíaca compensada", "solicita ajuste de tratamiento crónico"],
        ANO, ["Ecocardiograma: FE 55%", "ECG: ritmo sinusal"]), sintoma="disnea"),
    C("Cardiología", ["Fibrilación auricular", "Palpitaciones en estudio", "Arritmia en estudio"], (35, 88),
      V(["fibrilación auricular con respuesta ventricular rápida", "episodio de síncope la semana pasada", "palpitaciones con presíncope"],
        SEM, ["ECG: FA con FC 138 lpm", "Holter: pausas de hasta 4 segundos"]),
      V(["fibrilación auricular de reciente diagnóstico con frecuencia controlada", "palpitaciones frecuentes sin síntomas asociados"],
        MES, ["ECG: FA con FC 84 lpm", "TSH: 1,9"]),
      V(["palpitaciones ocasionales relacionadas con consumo de café", "sensación de latido saltado aislado"],
        ANO, ["ECG: normal", "Holter: extrasístoles supraventriculares aisladas"]), sintoma="palpitaciones"),
    C("Cardiología", ["Soplo cardíaco en estudio", "Estenosis aórtica", "Valvulopatía"], (50, 89),
      V(["soplo sistólico eyectivo con angina y síncope de esfuerzo", "disnea progresiva con soplo intenso"],
        SEM, ["Ecocardiograma: estenosis aórtica severa, área valvular 0,7 cm2"]),
      V(["soplo sistólico III/VI con disnea de esfuerzos moderados"],
        MES, ["Ecocardiograma: pendiente", "ECG: hipertrofia ventricular izquierda"]),
      V(["soplo sistólico II/VI asintomático, hallazgo en control de salud"],
        ANO, ["ECG: normal"]), sintoma="soplo cardíaco"),
    C("Cardiología", ["Hipertensión arterial de difícil manejo", "HTA refractaria"], (35, 85),
      V(["presiones de 210/120 reiteradas con cefalea y visión borrosa", "HTA severa con dolor torácico atípico"],
        SEM, ["Creatinina: 1,6 mg/dL", "Fondo de ojo: hemorragias en llama"]),
      V(["HTA no controlada con tres fármacos a dosis máximas", "presiones habituales de 160/100 pese a adherencia"],
        MES, ["Creatinina: 1,2 mg/dL", "Potasio: 3,3 mEq/L"]),
      V(["HTA controlada, solicita evaluación de rutina", "presiones en metas con un fármaco"],
        ANO, ["MAPA: promedio 132/84"]), sintoma="presión alta"),
    # ------------------------------------------------------------- Neurología
    C("Neurología", ["Cefalea en estudio", "Cefalea secundaria a descartar", "Migraña"], (18, 80),
      V(["cefalea de inicio reciente y progresiva que la despierta en la noche", "cefalea con vómitos matinales", "cefalea con paresia braquial derecha", "edema de papila al fondo de ojo"],
        SEM, ["TAC de cerebro: lesión expansiva frontal izquierda", "TAC de cerebro: pendiente"]),
      V(["migraña con aura, 6 a 8 crisis al mes", "cefalea refractaria a profilaxis con propranolol", "ausentismo laboral por crisis frecuentes"],
        MES, ["TAC de cerebro: normal"]),
      V(["cefalea tensional crónica con examen neurológico normal", "cefalea opresiva vespertina que cede con paracetamol"],
        ANO, ["Sin exámenes"]), sintoma="cefalea"),
    C("Neurología", ["Síndrome convulsivo", "Epilepsia"], (16, 80),
      V(["primera crisis convulsiva generalizada en adulto", "tres crisis en la última semana pese a tratamiento", "crisis con traumatismo craneal"],
        SEM, ["TAC de cerebro: pendiente", "Glicemia y ELP: normales"]),
      V(["crisis ocasionales con mala adherencia a tratamiento", "epilepsia con crisis mensuales"],
        MES, ["Niveles de ácido valproico: subterapéuticos"]),
      V(["sin crisis hace tres años, consulta por retiro de fármaco", "epilepsia controlada con monoterapia"],
        ANO, ["EEG 2022: normal"]), sintoma="convulsiones"),
    C("Neurología", ["Accidente isquémico transitorio", "Secuela de ACV", "Enfermedad cerebrovascular"], (50, 88),
      V(["episodio de afasia y paresia facial de 30 minutos hace 5 días", "amaurosis fugax del ojo izquierdo reciente", "dos episodios de debilidad de mano derecha esta semana"],
        ["5 días", "1 semana", "10 días"], ["Doppler carotídeo: estenosis de 75% de carótida interna izquierda", "TAC de cerebro: sin lesiones agudas"]),
      V(["secuela de ACV de hace un año, requiere control y ajuste de tratamiento", "espasticidad de extremidad superior post ACV"],
        ANO, ["TAC de cerebro: infarto lacunar antiguo"]),
      V(["mareos inespecíficos sin focalidad neurológica", "inestabilidad al levantarse rápido"],
        MES, ["Examen neurológico: normal"]), sintoma="déficit neurológico transitorio"),
    C("Neurología", ["Temblor en estudio", "Enfermedad de Parkinson"], (50, 88),
      V(["rigidez progresiva con caídas a repetición y disfagia", "parkinsonismo de evolución rápida con alteración cognitiva"],
        MES, ["TAC de cerebro: atrofia cortical"], peso=0.4),
      V(["temblor de reposo unilateral con bradicinesia progresiva", "lentitud de la marcha y micrografía"],
        ANO, ["TAC de cerebro: sin hallazgos"]),
      V(["temblor postural bilateral leve que mejora con alcohol", "temblor de manos con antecedente familiar"],
        ANO, ["TSH: normal"]), sintoma="temblor"),
    C("Neurología", ["Deterioro cognitivo", "Demencia en estudio"], (60, 92),
      V(["deterioro cognitivo rápidamente progresivo en dos meses con alteración de la marcha", "desorientación y alucinaciones de inicio reciente"],
        SEM, ["TAC de cerebro: pendiente", "VDRL y B12: pendientes"]),
      V(["olvidos progresivos de un año con dificultad en actividades instrumentales", "MMSE 21/30"],
        ANO, ["B12, TSH y VDRL: normales"]),
      V(["quejas subjetivas de memoria, independiente", "MMSE 29/30"],
        ANO, ["Sin exámenes"]), sintoma="olvidos"),
    # ------------------------------------------------------ Gastroenterología
    C("Gastroenterología", ["Disfagia en estudio", "Sospecha de neoplasia esofágica"], (40, 85),
      V(["disfagia progresiva a sólidos y luego a líquidos", "baja de peso de 8 kg en tres meses", "odinofagia y regurgitación de alimentos"],
        SEM + MES[:1], ["Endoscopía digestiva alta: no disponible en APS", "Hemograma: Hb 11,2 g/dL"]),
      V(["disfagia intermitente a sólidos de larga data sin baja de peso", "sensación de alimento detenido en episodios aislados"],
        ANO, ["Rx EED: sin alteraciones estructurales"]),
      V(["sensación de globo faríngeo sin disfagia real", "molestia faríngea asociada a ansiedad"],
        ANO, ["Sin exámenes"]), sintoma="dificultad para tragar"),
    C("Gastroenterología", ["Anemia ferropénica en estudio", "Hemorragia digestiva oculta"], (35, 88),
      V(["anemia con melena ocasional", "anemia severa con baja de peso en adulto mayor", "astenia marcada y disnea de esfuerzo por anemia"],
        SEM, ["Hemograma: Hb 7,8 g/dL", "Ferritina: 4 ng/mL", "Test de hemorragia oculta: positivo"]),
      V(["anemia ferropénica leve que no responde a fierro oral", "ferropenia persistente sin causa aparente"],
        MES, ["Hemograma: Hb 10,9 g/dL", "Ferritina: 9 ng/mL"]),
      V(["ferritina baja con hemoglobina normal", "control de anemia ya corregida"],
        ANO, ["Hemograma: Hb 12,8 g/dL"]), sintoma="anemia"),
    C("Gastroenterología", ["Dispepsia", "Dispepsia con signos de alarma", "Infección por H. pylori"], (20, 85),
      V(["dispepsia de inicio reciente en mayor de 60 años con vómitos persistentes", "epigastralgia con baja de peso y saciedad precoz"],
        SEM + MES[:1], ["Hemograma: Hb 10,1 g/dL", "Endoscopía: pendiente"]),
      V(["dispepsia refractaria a omeprazol por 8 semanas", "H. pylori tratado con síntomas persistentes"],
        MES, ["Test de ureasa: positivo"]),
      V(["pirosis ocasional que responde a omeprazol", "molestias epigástricas leves postprandiales"],
        ANO, ["Sin exámenes"]), sintoma="dolor epigástrico"),
    C("Gastroenterología", ["Daño hepático crónico", "Alteración de pruebas hepáticas", "Síndrome ictérico"], (30, 85),
      V(["ictericia progresiva indolora con coluria y acolia", "ascitis a tensión", "ictericia con prurito y baja de peso"],
        SEM, ["Bilirrubina total: 9,2 mg/dL", "Ecografía: dilatación de vía biliar y masa en cabeza de páncreas"]),
      V(["transaminasas tres veces sobre lo normal por seis meses", "hepatopatía crónica compensada sin control"],
        MES, ["Ecografía: hígado graso", "GPT: 128 U/L"]),
      V(["esteatosis hepática leve en ecografía con transaminasas normales"],
        ANO, ["Ecografía: esteatosis leve", "Pruebas hepáticas: normales"]), sintoma="alteración hepática"),
    C("Gastroenterología", ["Rectorragia en estudio", "Sospecha de cáncer colorrectal", "Enfermedad hemorroidal"], (25, 88),
      V(["rectorragia con cambio del hábito intestinal en mayor de 50 años", "rectorragia y baja de peso no intencionada", "pujo y tenesmo con sangre en deposiciones"],
        SEM + MES[:2], ["Test de hemorragia oculta: positivo", "CEA: 12 ng/mL", "Hemograma: Hb 9,8 g/dL"]),
      V(["rectorragia escasa intermitente persistente pese a tratamiento", "hemorroides internas con sangrado frecuente"],
        MES, ["Hemograma: normal"]),
      V(["sangrado escaso con la defecación en paciente joven", "fisura anal al examen"],
        MES, ["Sin exámenes"]), sintoma="sangrado rectal"),
    # -------------------------------------------------------- Cirugía General
    C("Cirugía General", ["Colelitiasis", "Coledocolitiasis", "Colecistitis crónica"], (20, 85),
      V(["cólicos biliares a repetición con episodio de ictericia", "colecistitis tratada médicamente hace un mes", "pancreatitis biliar leve reciente"],
        SEM + MES[:1], ["Ecografía: coledocolitiasis, vía biliar de 9 mm", "Bilirrubina total: 3,1 mg/dL"]),
      V(["cólicos biliares dos a tres veces al mes", "intolerancia a comidas grasas con dolor en hipocondrio derecho"],
        MES, ["Ecografía: colelitiasis múltiple, vía biliar no dilatada"]),
      V(["colelitiasis asintomática, hallazgo ecográfico"],
        ANO, ["Ecografía: cálculo único de 8 mm"]), sintoma="dolor abdominal"),
    C("Cirugía General", ["Hernia inguinal", "Hernia umbilical", "Eventración"], (25, 85),
      V(["hernia inguinal con episodios de atascamiento que reducen con dificultad", "eventración con dolor y episodios de suboclusión"],
        SEM, ["Ecografía de pared: hernia con contenido intestinal"]),
      V(["hernia inguinal sintomática que limita su trabajo", "hernia de crecimiento progresivo con dolor"],
        MES, ["Ecografía de pared: hernia inguinal indirecta"]),
      V(["hernia umbilical pequeña reductible asintomática"],
        ANO, ["Sin exámenes"]), sintoma="aumento de volumen abdominal"),
    C("Cirugía General", ["Nódulo mamario", "Lesión mamaria sospechosa"], (30, 80),
      V(["nódulo mamario duro y adherido de 2,5 cm", "retracción del pezón con nódulo palpable", "adenopatía axilar con nódulo mamario"],
        SEM + MES[:1], ["Mamografía: BI-RADS 5", "Mamografía: BI-RADS 4C"]),
      V(["nódulo mamario de 1,5 cm móvil", "nódulo palpable de reciente aparición"],
        MES, ["Mamografía: BI-RADS 4A", "Ecografía mamaria: nódulo sólido de bordes regulares"]),
      V(["quiste mamario simple en control", "mastalgia cíclica sin nódulos"],
        ANO, ["Mamografía: BI-RADS 3", "Ecografía mamaria: quiste simple"]), sexo="F", sintoma="nódulo mamario"),
    C("Cirugía General", ["Tumor de partes blandas", "Lipoma", "Quiste sebáceo"], (20, 80),
      V(["masa de partes blandas de crecimiento rápido de 8 cm, profunda", "tumor de muslo duro y fijo"],
        SEM + MES[:1], ["Ecografía: masa sólida heterogénea de 8 cm"]),
      V(["lipoma de 5 cm molesto en región dorsal", "lipoma que crece lentamente y molesta al vestirse"],
        ANO, ["Ecografía: lesión compatible con lipoma"]),
      V(["quiste sebáceo pequeño sin signos inflamatorios"],
        ANO, ["Sin exámenes"]), sintoma="masa subcutánea"),
    # -------------------------------------------------------------- Urología
    C("Urología", ["Hematuria en estudio", "Sospecha de tumor vesical"], (20, 88),
      V(["hematuria macroscópica indolora en paciente tabáquico", "hematuria con coágulos", "hematuria macroscópica recurrente con baja de peso"],
        SEM, ["Ecografía: lesión vesical de 3 cm", "Urocultivo: negativo"]),
      V(["hematuria microscópica persistente en tres exámenes", "hematuria microscópica con proteinuria leve"],
        MES, ["Ecografía renal: normal", "Sedimento: 15 GR por campo"]),
      V(["hematuria microscópica aislada asociada a infección urinaria tratada"],
        MES, ["Urocultivo de control: negativo"]), sintoma="sangre en la orina"),
    C("Urología", ["PSA elevado", "Hiperplasia prostática benigna", "Sospecha de cáncer de próstata"], (45, 90),
      V(["PSA de 25 ng/mL con tacto rectal pétreo", "retención urinaria con sonda permanente", "dolor óseo con PSA elevado"],
        SEM, ["PSA: 25 ng/mL", "Creatinina: 1,9 mg/dL"]),
      V(["PSA de 6,2 en dos mediciones con tacto rectal sin nódulos", "síntomas obstructivos moderados, IPSS 18"],
        MES, ["PSA: 6,2 ng/mL", "Ecografía: próstata de 55 cc"]),
      V(["síntomas urinarios leves, IPSS 7", "nicturia ocasional con PSA normal"],
        ANO, ["PSA: 2,1 ng/mL"]), sexo="M", sintoma="síntomas urinarios"),
    C("Urología", ["Litiasis renal", "Litiasis ureteral"], (20, 80),
      V(["litiasis ureteral con hidronefrosis moderada y cólicos persistentes", "cálculo obstructivo en paciente monorreno", "cólicos con fiebre por litiasis"],
        SEM, ["Ecografía: hidronefrosis moderada derecha", "Pielo TAC: cálculo ureteral de 8 mm"]),
      V(["cálculo renal de 12 mm con cólicos ocasionales", "litiasis renal recurrente"],
        MES, ["Pielo TAC: cálculo piélico de 12 mm sin hidronefrosis"]),
      V(["microlitiasis renal asintomática"],
        ANO, ["Ecografía: microlitiasis bilateral"]), sintoma="dolor lumbar"),
    C("Urología", ["Aumento de volumen testicular", "Varicocele", "Hidrocele"], (16, 70),
      V(["aumento de volumen testicular duro e indoloro", "masa testicular palpable"],
        SEM + MES[:1], ["Ecografía testicular: masa sólida intratesticular"]),
      V(["varicocele grado III con dolor", "hidrocele a tensión que molesta para caminar"],
        MES, ["Ecografía testicular: varicocele"]),
      V(["hidrocele pequeño asintomático"],
        ANO, ["Sin exámenes"]), sexo="M", sintoma="aumento de volumen escrotal"),
    # ----------------------------------------------------------- Ginecología
    C("Ginecología", ["Metrorragia postmenopáusica", "Sangrado uterino anormal", "Mioma uterino"], (15, 80),
      V(["metrorragia postmenopáusica", "sangrado genital con dolor pélvico en postmenopáusica"],
        SEM + MES[:1], ["Ecografía TV: endometrio de 14 mm"]),
      V(["sangrado uterino abundante con anemia leve", "mioma de crecimiento progresivo con menstruaciones prolongadas"],
        MES, ["Ecografía TV: mioma de 6 cm", "Hemograma: Hb 10,4 g/dL"]),
      V(["ciclos irregulares sin anemia", "spotting intermenstrual ocasional"],
        ANO, ["Ecografía TV: normal"]), sexo="F", sintoma="sangrado genital"),
    C("Ginecología", ["PAP alterado", "Lesión cervical"], (20, 70),
      V(["PAP con lesión intraepitelial de alto grado", "lesión cervical friable al especuloscopio"],
        SEM + MES[:1], ["PAP: H-SIL"]),
      V(["PAP con lesión de bajo grado persistente", "ASC-US con VPH de alto riesgo positivo"],
        MES, ["PAP: L-SIL", "Test VPH: positivo"]),
      V(["PAP con cambios inflamatorios"],
        ANO, ["PAP: inflamatorio"]), sexo="F", sintoma="PAP alterado"),
    C("Ginecología", ["Tumor anexial", "Quiste ovárico"], (18, 80),
      V(["masa anexial compleja de 9 cm con ascitis", "aumento de volumen abdominal con masa pélvica"],
        SEM, ["Ecografía TV: masa anexial sólido-quística de 9 cm", "CA-125: 380 U/mL"]),
      V(["quiste ovárico de 6 cm persistente en dos ecografías"],
        MES, ["Ecografía TV: quiste ovárico de 6 cm"]),
      V(["quiste folicular de 3 cm en mujer en edad fértil"],
        MES, ["Ecografía TV: quiste simple de 3 cm"]), sexo="F", sintoma="dolor pélvico"),
    C("Ginecología", ["Prolapso genital", "Incontinencia urinaria"], (40, 88),
      V(["prolapso genital grado IV ulcerado con retención urinaria"],
        MES, ["Ecografía renal: hidroureteronefrosis leve"], peso=0.5),
      V(["prolapso genital grado III con dificultad miccional", "incontinencia de esfuerzo que limita actividades"],
        ANO, ["Urocultivo: negativo"]),
      V(["prolapso grado I asintomático", "incontinencia leve ocasional"],
        ANO, ["Sin exámenes"]), sexo="F", sintoma="sensación de bulto genital"),
    # ---------------------------------------------------------- Oftalmología
    C("Oftalmología", ["Catarata"], (55, 90),
      V(["catarata con visión de movimiento de manos en único ojo útil", "catarata madura con glaucoma secundario"],
        MES, ["AV: movimiento de manos"], peso=0.6),
      V(["disminución de agudeza visual progresiva bilateral", "dificultad para leer y cocinar por mala visión"],
        ANO, ["AV OD 0,2 / OI 0,3"]),
      V(["catarata incipiente con buena visión", "molestias leves con luz intensa"],
        ANO, ["AV OD 0,7 / OI 0,8"]), sintoma="visión borrosa"),
    C("Oftalmología", ["Disminución de agudeza visual", "Desprendimiento de retina", "Retinopatía diabética"], (25, 85),
      V(["pérdida de visión súbita del ojo derecho hace tres días", "visión de cortina y fotopsias", "miodesopsias de aparición brusca con pérdida de campo visual"],
        ["3 días", "5 días", "1 semana"], ["Fondo de ojo: no evaluable en APS"]),
      V(["retinopatía diabética sin control oftalmológico hace tres años", "diabético con disminución de visión gradual"],
        ANO, ["Fondo de ojo: retinopatía diabética no proliferativa moderada"]),
      V(["visión borrosa de cerca", "requiere cambio de lentes"],
        ANO, ["AV: 0,8 ambos ojos"]), sintoma="pérdida de visión"),
    C("Oftalmología", ["Sospecha de glaucoma", "Glaucoma"], (35, 85),
      V(["presión intraocular de 42 mmHg con dolor ocular y ojo rojo", "glaucoma con progresión del daño de campo visual"],
        SEM, ["PIO: 42 mmHg"]),
      V(["presión intraocular de 26 mmHg y excavación papilar de 0,7"],
        MES, ["PIO: 26 mmHg"]),
      V(["antecedente familiar de glaucoma, presión normal", "control preventivo"],
        ANO, ["PIO: 16 mmHg"]), sintoma="alteración ocular"),
    C("Oftalmología", ["Pterigion", "Chalazión"], (20, 75),
      V(["pterigion que invade eje visual con disminución de visión"],
        MES, ["AV: 0,4"], peso=0.3),
      V(["pterigion que avanza sobre la córnea con irritación crónica", "chalazión recurrente que no responde a calor local"],
        ANO, ["Sin exámenes"]),
      V(["pterigion pequeño con molestias leves", "chalazión pequeño de dos semanas"],
        MES, ["Sin exámenes"]), sintoma="lesión ocular"),
    # ------------------------------------------------- Otorrinolaringología
    C("Otorrinolaringología", ["Hipoacusia", "Hipoacusia súbita"], (18, 88),
      V(["hipoacusia súbita unilateral de cuatro días de evolución", "hipoacusia súbita con tinnitus y vértigo"],
        ["4 días", "1 semana", "10 días"], ["Otoscopía: normal"]),
      V(["hipoacusia progresiva bilateral que afecta la comunicación", "hipoacusia con necesidad de audífono"],
        ANO, ["Audiometría: hipoacusia sensorioneural moderada bilateral"]),
      V(["tapón de cerumen recurrente", "sensación de oído tapado ocasional"],
        MES, ["Otoscopía: cerumen"]), sintoma="pérdida de audición"),
    C("Otorrinolaringología", ["Masa cervical en estudio", "Adenopatía cervical"], (18, 85),
      V(["adenopatía cervical dura de 3 cm en paciente fumador con disfonía", "masa cervical fija de crecimiento progresivo"],
        SEM + MES[:1], ["Ecografía cervical: adenopatía de 3 cm sin hilio graso"]),
      V(["adenopatía cervical de 1,5 cm persistente por dos meses", "nódulo cervical blando sin otros síntomas"],
        MES, ["Ecografía cervical: adenopatía de 1,5 cm"]),
      V(["adenopatía cervical pequeña y móvil posterior a cuadro viral"],
        MES, ["Hemograma: normal"]), sintoma="bulto en el cuello"),
    C("Otorrinolaringología", ["Disfonía", "Sospecha de lesión laríngea"], (20, 85),
      V(["disfonía persistente de dos meses en tabáquico con disfagia", "disfonía progresiva con estridor ocasional"],
        SEM + MES[:1], ["Sin exámenes"]),
      V(["disfonía intermitente en profesora", "disfonía crónica por sobreuso vocal"],
        MES, ["Sin exámenes"]),
      V(["disfonía leve posterior a resfrío en mejoría"],
        ["3 semanas", "1 mes"], ["Sin exámenes"]), sintoma="ronquera"),
    C("Otorrinolaringología", ["Hipertrofia amigdalina", "Amigdalitis recurrente", "Rinosinusitis crónica"], (5, 60),
      V(["dos abscesos periamigdalinos en el último año", "apneas de sueño observadas con hipertrofia amigdalina grado IV"],
        MES, ["Sin exámenes"]),
      V(["siete amigdalitis en el último año", "rinosinusitis crónica refractaria a corticoide nasal"],
        ANO, ["TAC de cavidades paranasales: engrosamiento mucoso"]),
      V(["rinitis alérgica con obstrucción nasal leve", "amigdalitis aisladas"],
        ANO, ["Sin exámenes"]), sintoma="dolor de garganta"),
    # --------------------------------------------------------- Traumatología
    C("Traumatología", ["Gonartrosis", "Coxartrosis"], (45, 88),
      V(["artrosis con incapacidad total para caminar y dolor nocturno intenso"],
        MES, ["Rx: artrosis grado IV con colapso articular"], peso=0.4),
      V(["artrosis avanzada con dolor que limita la marcha a una cuadra", "dolor de cadera que impide subir escaleras"],
        ANO, ["Rx: artrosis grado III-IV"]),
      V(["dolor mecánico leve de rodilla", "rigidez matinal breve de rodillas"],
        ANO, ["Rx: artrosis grado I"]), sintoma="dolor articular"),
    C("Traumatología", ["Lumbago", "Lumbociática", "Hernia del núcleo pulposo"], (20, 80),
      V(["lumbociática con debilidad progresiva de dorsiflexión del pie", "alteración esfinteriana y anestesia en silla de montar", "lumbago con fiebre y baja de peso"],
        SEM, ["RM: hernia L5-S1 con compresión radicular severa", "RM: pendiente"]),
      V(["lumbociática refractaria a tratamiento médico y kinesiología", "dolor irradiado a pierna que limita trabajo"],
        MES, ["RM: hernia L5-S1"]),
      V(["lumbago mecánico crónico sin irradiación", "dolor lumbar que mejora con actividad"],
        ANO, ["Rx columna lumbar: espondiloartrosis leve"]), sintoma="dolor lumbar"),
    C("Traumatología", ["Síndrome de manguito rotador", "Hombro doloroso"], (30, 80),
      V(["imposibilidad de elevar el brazo tras caída reciente"],
        SEM, ["Ecografía: rotura completa de supraespinoso"], peso=0.5),
      V(["rotura de manguito con debilidad progresiva", "hombro doloroso que impide dormir pese a tratamiento"],
        MES, ["Ecografía: rotura parcial de supraespinoso"]),
      V(["tendinopatía leve del supraespinoso"],
        MES, ["Ecografía: tendinopatía del supraespinoso"]), sintoma="dolor de hombro"),
    C("Traumatología", ["Lesión ósea en estudio", "Fractura mal consolidada", "Hallux valgus"], (15, 85),
      V(["lesión lítica en fémur con dolor nocturno", "fractura patológica de húmero", "dolor óseo progresivo con masa palpable"],
        SEM + MES[:1], ["Rx: lesión lítica en fémur proximal"]),
      V(["fractura de radio distal consolidada en mala posición con limitación", "deformidad progresiva del pie que dificulta usar calzado"],
        MES, ["Rx: consolidación viciosa"]),
      V(["hallux valgus leve", "juanete con molestias ocasionales"],
        ANO, ["Rx: hallux valgus leve"]), sintoma="dolor óseo"),
    C("Traumatología", ["Síndrome de túnel carpiano"], (30, 75),
      V(["túnel carpiano con atrofia tenar y pérdida de fuerza marcada"],
        MES, ["Electromiografía: compromiso severo del mediano"], peso=0.4),
      V(["parestesias diarias con pérdida de fuerza de la mano", "síntomas que despiertan en la noche pese a férula"],
        MES, ["Electromiografía: compromiso moderado"]),
      V(["parestesias nocturnas leves ocasionales"],
        MES, ["Sin exámenes"]), sintoma="hormigueo de manos"),
    # ----------------------------------------------------------- Dermatología
    C("Dermatología", ["Lesión pigmentada en estudio", "Sospecha de melanoma", "Nevo atípico"], (20, 85),
      V(["lesión pigmentada asimétrica de bordes irregulares de 9 mm", "lunar con crecimiento en tres meses y sangrado", "lesión con varios colores y cambio reciente"],
        SEM + MES[:1], ["Dermatoscopía: no disponible"]),
      V(["nevos atípicos múltiples con antecedente familiar de melanoma"],
        ANO, ["Sin exámenes"]),
      V(["nevos simétricos sin cambios, control preventivo"],
        ANO, ["Sin exámenes"]), sintoma="lunar"),
    C("Dermatología", ["Sospecha de carcinoma basocelular", "Sospecha de carcinoma espinocelular", "Queratosis seborreica"], (40, 90),
      V(["lesión ulcerada de crecimiento rápido en labio inferior", "úlcera que no cicatriza en dorso de mano con crecimiento rápido"],
        SEM + MES[:1], ["Sin exámenes"]),
      V(["pápula perlada de 6 mm en mejilla de lento crecimiento", "lesión costrosa recurrente en nariz"],
        ANO, ["Sin exámenes"]),
      V(["queratosis seborreicas múltiples en tronco"],
        ANO, ["Sin exámenes"]), sintoma="lesión en la piel"),
    C("Dermatología", ["Psoriasis", "Dermatitis atópica"], (10, 80),
      V(["eritrodermia con compromiso de más del 80% de la superficie corporal"],
        SEM, ["Hemograma: leucocitosis leve"], peso=0.4),
      V(["psoriasis extensa refractaria a tópicos", "dermatitis atópica severa con sobreinfección recurrente"],
        MES, ["Sin exámenes"]),
      V(["psoriasis en placas localizada en codos", "dermatitis leve que responde a emolientes"],
        ANO, ["Sin exámenes"]), sintoma="lesiones descamativas"),
    C("Dermatología", ["Acné", "Rosácea"], (14, 45),
      V(["acné conglobata con fiebre y artralgias"],
        SEM, ["Sin exámenes"], peso=0.2),
      V(["acné nódulo-quístico con cicatrices", "acné que no responde a doxiciclina"],
        MES, ["Sin exámenes"]),
      V(["acné comedoniano leve", "rosácea leve"],
        ANO, ["Sin exámenes"]), sintoma="acné"),
    # --------------------------------------------------------- Endocrinología
    C("Endocrinología", ["Nódulo tiroideo", "Bocio multinodular"], (20, 80),
      V(["nódulo tiroideo de crecimiento rápido con disfonía", "nódulo duro con adenopatía cervical"],
        SEM + MES[:1], ["PAAF: Bethesda VI", "Ecografía tiroidea: nódulo TIRADS 5 de 3 cm"]),
      V(["nódulo tiroideo de 2 cm TIRADS 4", "bocio multinodular con compresión leve"],
        MES, ["PAAF: Bethesda III", "Ecografía tiroidea: TIRADS 4"]),
      V(["nódulo tiroideo de 8 mm TIRADS 2"],
        ANO, ["Ecografía tiroidea: nódulo TIRADS 2", "TSH: normal"]), sintoma="nódulo tiroideo"),
    C("Endocrinología", ["Diabetes mellitus tipo 2 descompensada", "Diabetes mellitus tipo 2"], (25, 85),
      V(["glicemias sobre 400 con poliuria y baja de peso pese a insulina", "cetosis en diabético tipo 2"],
        SEM, ["Glicemia: 438 mg/dL", "Cetonemia: positiva"]),
      V(["HbA1c de 10,5% con insulina NPH y metformina", "mal control metabólico con hipoglicemias frecuentes"],
        MES, ["HbA1c: 10,5%"]),
      V(["diabetes con HbA1c de 7,1%, consulta por manejo", "solicita evaluación de nuevos fármacos"],
        ANO, ["HbA1c: 7,1%"]), sintoma="mal control metabólico"),
    C("Endocrinología", ["Hipertiroidismo", "Enfermedad de Graves", "Hipotiroidismo"], (18, 80),
      V(["hipertiroidismo con fibrilación auricular y baja de peso de 10 kg", "tormenta tiroidea reciente compensada en urgencia"],
        SEM, ["TSH: <0,01", "T4 libre: 4,9 ng/dL"]),
      V(["enfermedad de Graves en tratamiento con tiamazol sin control", "hipertiroidismo con oftalmopatía leve"],
        MES, ["TSH: <0,01", "T4 libre: 2,8 ng/dL"]),
      V(["hipotiroidismo subclínico", "hipotiroidismo estable con levotiroxina"],
        ANO, ["TSH: 6,1"]), sintoma="alteración tiroidea"),
    C("Endocrinología", ["Hipercalcemia", "Hiperparatiroidismo primario", "Incidentaloma suprarrenal"], (35, 85),
      V(["calcio de 13,8 con compromiso de conciencia leve", "hipercalcemia con insuficiencia renal aguda"],
        SEM, ["Calcio: 13,8 mg/dL", "Creatinina: 2,1 mg/dL"]),
      V(["calcio de 11,2 con PTH elevada", "incidentaloma suprarrenal de 4 cm"],
        MES, ["PTH: 145 pg/mL", "TAC: lesión suprarrenal de 4 cm"]),
      V(["incidentaloma suprarrenal de 1,5 cm no funcionante"],
        ANO, ["TAC: adenoma suprarrenal de 1,5 cm"]), sintoma="alteración de laboratorio"),
    # ------------------------------------------------------------ Nefrología
    C("Nefrología", ["Enfermedad renal crónica", "Deterioro de función renal"], (40, 90),
      V(["caída de la filtración glomerular de 45 a 18 en tres meses", "hiperkalemia de 6,4 en control"],
        SEM, ["Creatinina: 3,4 mg/dL", "Potasio: 6,4 mEq/L"]),
      V(["ERC etapa 3b con proteinuria de 1,5 g en 24 horas", "progresión lenta de enfermedad renal en diabético"],
        MES, ["VFG: 38 mL/min", "Proteinuria 24 h: 1,5 g"]),
      V(["ERC etapa 2 estable", "control de función renal en hipertenso"],
        ANO, ["VFG: 72 mL/min"]), sintoma="alteración renal"),
    C("Nefrología", ["Síndrome nefrótico", "Proteinuria en estudio"], (15, 80),
      V(["edema generalizado con proteinuria de 8 g en 24 horas", "anasarca con hipoalbuminemia severa"],
        SEM, ["Proteinuria 24 h: 8 g", "Albúmina: 1,9 g/dL"]),
      V(["proteinuria de 600 mg en 24 horas en diabético", "proteinuria persistente con hematuria microscópica"],
        MES, ["Proteinuria 24 h: 0,6 g"]),
      V(["microalbuminuria leve controlada"],
        ANO, ["RAC: 45 mg/g"]), sintoma="edema"),
    # ------------------------------------------------------------ Neumología
    C("Neumología", ["Nódulo pulmonar", "Sospecha de neoplasia pulmonar"], (35, 85),
      V(["nódulo espiculado de 2,2 cm en fumador de 40 paquetes-año", "hemoptisis con nódulo pulmonar", "masa pulmonar con baja de peso"],
        SEM + MES[:1], ["TAC de tórax: nódulo espiculado de 2,2 cm en lóbulo superior derecho"]),
      V(["nódulo sólido de 9 mm en seguimiento", "nódulo pulmonar que creció 2 mm en un año"],
        MES, ["TAC de tórax: nódulo de 9 mm"]),
      V(["nódulo calcificado de 4 mm compatible con granuloma"],
        ANO, ["TAC de tórax: granuloma calcificado"]), sintoma="hallazgo pulmonar"),
    C("Neumología", ["EPOC", "Asma bronquial"], (15, 85),
      V(["EPOC con tres hospitalizaciones en seis meses", "saturación basal de 86% con disnea de reposo"],
        SEM + MES[:1], ["Espirometría: VEF1 32%", "Saturación: 86%"]),
      V(["asma no controlada pese a corticoide inhalado en dosis media", "EPOC con exacerbaciones frecuentes"],
        MES, ["Espirometría: obstrucción moderada con respuesta a broncodilatador"]),
      V(["asma intermitente bien controlada", "EPOC leve estable"],
        ANO, ["Espirometría: obstrucción leve"]), sintoma="disnea"),
    C("Neumología", ["Derrame pleural", "Tos crónica"], (20, 88),
      V(["derrame pleural unilateral con baja de peso", "tos con expectoración hemoptoica y fiebre vespertina"],
        SEM, ["Rx de tórax: derrame pleural derecho moderado"]),
      V(["tos crónica de tres meses con radiografía normal en no fumador"],
        MES, ["Rx de tórax: normal"]),
      V(["tos residual posterior a cuadro viral de cuatro semanas"],
        ["4 semanas", "1 mes"], ["Rx de tórax: normal"]), sintoma="tos"),
    # ----------------------------------------------------------- Hematología
    C("Hematología", ["Pancitopenia", "Anemia en estudio", "Sospecha de leucemia"], (15, 88),
      V(["pancitopenia con blastos en frotis", "leucocitosis de 85.000 con astenia", "petequias y equimosis espontáneas con plaquetas bajas"],
        SEM, ["Hemograma: leucocitos 85.000, blastos 30%", "Plaquetas: 18.000"]),
      V(["anemia macrocítica con B12 baja que no responde a tratamiento", "anemia leve persistente sin causa clara"],
        MES, ["Hemograma: Hb 10,2 g/dL, VCM 108", "B12: 150 pg/mL"]),
      V(["talasemia menor conocida", "anemia leve estable de larga data"],
        ANO, ["Hemograma: Hb 11,8 g/dL"]), sintoma="alteración del hemograma"),
    C("Hematología", ["Adenopatías en estudio", "Linfocitosis", "Trombocitosis"], (20, 88),
      V(["adenopatías generalizadas con fiebre, sudoración nocturna y baja de peso", "esplenomegalia con adenopatías"],
        SEM + MES[:1], ["Ecografía abdominal: esplenomegalia", "LDH: 890 U/L"]),
      V(["linfocitosis persistente de 7.500 en adulto mayor asintomático"],
        MES, ["Hemograma: linfocitos 7.500"]),
      V(["trombocitosis leve reactiva"],
        MES, ["Plaquetas: 480.000"]), sintoma="adenopatías"),
    # ---------------------------------------------------------- Reumatología
    C("Reumatología", ["Artritis en estudio", "Artritis reumatoide", "Sospecha de arteritis de células gigantes"], (18, 85),
      V(["cefalea temporal con claudicación mandibular y VHS elevada", "poliartritis aguda con fiebre"],
        SEM, ["VHS: 95 mm/h", "PCR: 12 mg/dL"]),
      V(["poliartritis simétrica de manos con rigidez matinal de más de una hora", "sinovitis persistente pese a AINE"],
        MES, ["Factor reumatoideo: positivo", "Anti-CCP: positivo"]),
      V(["artralgias difusas sin sinovitis", "dolor articular inespecífico con exámenes normales"],
        ANO, ["Factor reumatoideo: negativo"]), sintoma="dolor articular"),
    C("Reumatología", ["Lupus eritematoso sistémico", "ANA positivo en estudio"], (15, 70),
      V(["lupus con proteinuria nueva y edema", "lupus con fiebre y serositis"],
        SEM, ["Proteinuria 24 h: 2,1 g", "Complemento: bajo"]),
      V(["artralgias y fotosensibilidad con ANA de 1/640 sin compromiso orgánico"],
        MES, ["ANA: 1/640 moteado"]),
      V(["ANA de 1/80 aislado en mujer asintomática"],
        ANO, ["ANA: 1/80"]), sexo="F", sintoma="ANA positivo"),
    C("Reumatología", ["Gota", "Hiperuricemia"], (30, 85),
      V(["crisis gotosa poliarticular con fiebre e insuficiencia renal"],
        SEM, ["Ácido úrico: 11,2 mg/dL", "Creatinina: 2,0 mg/dL"], peso=0.3),
      V(["gota tofácea con crisis frecuentes", "crisis de gota mensuales pese a alopurinol"],
        MES, ["Ácido úrico: 9,8 mg/dL"]),
      V(["hiperuricemia asintomática"],
        ANO, ["Ácido úrico: 8,1 mg/dL"]), sintoma="dolor articular"),
    # ------------------------------------------------------------ Psiquiatría
    C("Psiquiatría", ["Episodio depresivo", "Trastorno depresivo mayor"], (15, 80),
      V(["ideación suicida con plan estructurado", "intento suicida reciente", "depresión severa con abandono de la alimentación"],
        SEM, ["Sin exámenes"]),
      V(["depresión moderada sin respuesta a dos antidepresivos", "síntomas depresivos persistentes que impiden trabajar"],
        MES, ["TSH: normal"]),
      V(["síntomas ansiosos leves en contexto laboral", "ánimo bajo reactivo a duelo reciente"],
        MES, ["Sin exámenes"]), sintoma="ánimo bajo"),
    C("Psiquiatría", ["Primer episodio psicótico", "Esquizofrenia", "Trastorno del sueño"], (16, 70),
      V(["alucinaciones auditivas e ideas delirantes de daño", "agitación psicomotora con conducta desorganizada"],
        SEM, ["Sin exámenes"]),
      V(["esquizofrenia estable que requiere ajuste de antipsicótico", "efectos adversos de antipsicótico"],
        MES, ["Sin exámenes"]),
      V(["insomnio de conciliación", "dificultad para dormir por preocupaciones"],
        MES, ["Sin exámenes"]), sintoma="alteración conductual"),
]

# Diagnostico segun la gravedad del cuadro: una tos post viral no se deriva
# como "derrame pleural". Llave: el primer diagnostico del caso. Varios se
# repiten entre prioridades a proposito ("Dolor torácico en estudio").
DX = {
    "Angina de pecho": {"alta": ["Angina inestable", "Sospecha de cardiopatía coronaria", "Dolor torácico en estudio"], "media": ["Angina de pecho estable", "Sospecha de cardiopatía coronaria", "Dolor torácico en estudio"], "baja": ["Dolor torácico atípico", "Dolor torácico en estudio", "Costocondritis"]},
    "Insuficiencia cardíaca": {"alta": ["Insuficiencia cardíaca descompensada", "Insuficiencia cardíaca"], "media": ["Insuficiencia cardíaca"], "baja": ["Insuficiencia cardíaca", "Insuficiencia cardíaca compensada"]},
    "Fibrilación auricular": {"alta": ["Fibrilación auricular", "Síncope en estudio", "Arritmia en estudio"], "media": ["Fibrilación auricular", "Palpitaciones en estudio"], "baja": ["Palpitaciones en estudio", "Extrasistolía"]},
    "Soplo cardíaco en estudio": {"alta": ["Estenosis aórtica", "Valvulopatía"], "media": ["Soplo cardíaco en estudio", "Valvulopatía"], "baja": ["Soplo cardíaco en estudio"]},
    "Hipertensión arterial de difícil manejo": {"alta": ["Crisis hipertensivas a repetición", "Hipertensión arterial de difícil manejo"], "media": ["Hipertensión arterial de difícil manejo", "HTA refractaria"], "baja": ["Hipertensión arterial"]},
    "Cefalea en estudio": {"alta": ["Cefalea secundaria a descartar", "Cefalea en estudio", "Sospecha de tumor cerebral"], "media": ["Migraña", "Cefalea en estudio"], "baja": ["Cefalea tensional", "Cefalea en estudio"]},
    "Accidente isquémico transitorio": {"alta": ["Accidente isquémico transitorio", "Estenosis carotídea"], "media": ["Secuela de ACV", "Enfermedad cerebrovascular"], "baja": ["Síndrome vertiginoso", "Mareos en estudio"]},
    "Temblor en estudio": {"alta": ["Parkinsonismo atípico", "Enfermedad de Parkinson"], "media": ["Enfermedad de Parkinson", "Temblor en estudio"], "baja": ["Temblor esencial", "Temblor en estudio"]},
    "Deterioro cognitivo": {"alta": ["Deterioro cognitivo rápidamente progresivo", "Demencia en estudio"], "media": ["Deterioro cognitivo", "Demencia en estudio"], "baja": ["Deterioro cognitivo leve", "Quejas de memoria"]},
    "Disfagia en estudio": {"alta": ["Sospecha de neoplasia esofágica", "Disfagia en estudio"], "media": ["Disfagia en estudio"], "baja": ["Disfagia en estudio", "Globo faríngeo"]},
    "Anemia ferropénica en estudio": {"alta": ["Hemorragia digestiva oculta", "Anemia ferropénica en estudio"], "media": ["Anemia ferropénica en estudio"], "baja": ["Ferropenia", "Anemia ferropénica en estudio"]},
    "Dispepsia": {"alta": ["Dispepsia con signos de alarma", "Dispepsia"], "media": ["Dispepsia", "Infección por H. pylori"], "baja": ["Dispepsia", "Reflujo gastroesofágico"]},
    "Daño hepático crónico": {"alta": ["Síndrome ictérico", "Daño hepático crónico descompensado"], "media": ["Alteración de pruebas hepáticas", "Daño hepático crónico"], "baja": ["Esteatosis hepática", "Alteración de pruebas hepáticas"]},
    "Rectorragia en estudio": {"alta": ["Sospecha de cáncer colorrectal", "Rectorragia en estudio"], "media": ["Enfermedad hemorroidal", "Rectorragia en estudio"], "baja": ["Fisura anal", "Rectorragia en estudio", "Enfermedad hemorroidal"]},
    "Colelitiasis": {"alta": ["Coledocolitiasis", "Colelitiasis"], "media": ["Colelitiasis", "Colecistitis crónica"], "baja": ["Colelitiasis"]},
    "Hernia inguinal": {"alta": ["Hernia inguinal", "Eventración"], "media": ["Hernia inguinal"], "baja": ["Hernia umbilical"]},
    "Nódulo mamario": {"alta": ["Lesión mamaria sospechosa", "Nódulo mamario"], "media": ["Nódulo mamario"], "baja": ["Quiste mamario", "Mastalgia"]},
    "Tumor de partes blandas": {"alta": ["Tumor de partes blandas"], "media": ["Lipoma", "Tumor de partes blandas"], "baja": ["Quiste sebáceo"]},
    "Hematuria en estudio": {"alta": ["Sospecha de tumor vesical", "Hematuria en estudio"], "media": ["Hematuria en estudio"], "baja": ["Hematuria en estudio"]},
    "PSA elevado": {"alta": ["Sospecha de cáncer de próstata", "Retención urinaria"], "media": ["PSA elevado", "Hiperplasia prostática benigna"], "baja": ["Hiperplasia prostática benigna"]},
    "Aumento de volumen testicular": {"alta": ["Aumento de volumen testicular", "Sospecha de tumor testicular"], "media": ["Varicocele", "Hidrocele"], "baja": ["Hidrocele"]},
    "Metrorragia postmenopáusica": {"alta": ["Metrorragia postmenopáusica"], "media": ["Mioma uterino", "Sangrado uterino anormal"], "baja": ["Sangrado uterino anormal", "Ciclos irregulares"]},
    "Tumor anexial": {"alta": ["Tumor anexial"], "media": ["Quiste ovárico", "Tumor anexial"], "baja": ["Quiste ovárico"]},
    "Disminución de agudeza visual": {"alta": ["Sospecha de desprendimiento de retina", "Disminución de agudeza visual"], "media": ["Retinopatía diabética"], "baja": ["Presbicia", "Vicio de refracción"]},
    "Sospecha de glaucoma": {"alta": ["Glaucoma agudo", "Glaucoma"], "media": ["Sospecha de glaucoma"], "baja": ["Sospecha de glaucoma"]},
    "Hipoacusia": {"alta": ["Hipoacusia súbita"], "media": ["Hipoacusia"], "baja": ["Tapón de cerumen", "Hipoacusia"]},
    "Disfonía": {"alta": ["Sospecha de lesión laríngea", "Disfonía"], "media": ["Disfonía"], "baja": ["Disfonía"]},
    "Hipertrofia amigdalina": {"alta": ["Absceso periamigdalino recurrente", "Hipertrofia amigdalina"], "media": ["Amigdalitis recurrente", "Rinosinusitis crónica"], "baja": ["Rinitis alérgica", "Amigdalitis recurrente"]},
    "Lumbago": {"alta": ["Síndrome de cauda equina", "Lumbociática", "Hernia del núcleo pulposo"], "media": ["Lumbociática", "Hernia del núcleo pulposo"], "baja": ["Lumbago"]},
    "Lesión ósea en estudio": {"alta": ["Lesión ósea en estudio", "Fractura patológica"], "media": ["Fractura mal consolidada", "Deformidad del pie"], "baja": ["Hallux valgus"]},
    "Lesión pigmentada en estudio": {"alta": ["Sospecha de melanoma", "Lesión pigmentada en estudio"], "media": ["Nevo atípico"], "baja": ["Nevos benignos", "Lesión pigmentada en estudio"]},
    "Sospecha de carcinoma basocelular": {"alta": ["Sospecha de carcinoma espinocelular"], "media": ["Sospecha de carcinoma basocelular"], "baja": ["Queratosis seborreica"]},
    "Nódulo tiroideo": {"alta": ["Sospecha de cáncer de tiroides", "Nódulo tiroideo"], "media": ["Nódulo tiroideo", "Bocio multinodular"], "baja": ["Nódulo tiroideo"]},
    "Diabetes mellitus tipo 2 descompensada": {"alta": ["Diabetes mellitus tipo 2 descompensada"], "media": ["Diabetes mellitus tipo 2 descompensada", "Diabetes mellitus tipo 2"], "baja": ["Diabetes mellitus tipo 2"]},
    "Hipertiroidismo": {"alta": ["Hipertiroidismo"], "media": ["Enfermedad de Graves", "Hipertiroidismo"], "baja": ["Hipotiroidismo", "Hipotiroidismo subclínico"]},
    "Hipercalcemia": {"alta": ["Hipercalcemia"], "media": ["Hiperparatiroidismo primario", "Incidentaloma suprarrenal"], "baja": ["Incidentaloma suprarrenal"]},
    "Síndrome nefrótico": {"alta": ["Síndrome nefrótico"], "media": ["Proteinuria en estudio"], "baja": ["Proteinuria en estudio"]},
    "Nódulo pulmonar": {"alta": ["Sospecha de neoplasia pulmonar", "Nódulo pulmonar"], "media": ["Nódulo pulmonar"], "baja": ["Nódulo pulmonar"]},
    "Derrame pleural": {"alta": ["Derrame pleural", "Sospecha de tuberculosis pulmonar"], "media": ["Tos crónica"], "baja": ["Tos crónica"]},
    "Pancitopenia": {"alta": ["Sospecha de leucemia", "Pancitopenia"], "media": ["Anemia en estudio", "Anemia megaloblástica"], "baja": ["Talasemia menor", "Anemia en estudio"]},
    "Adenopatías en estudio": {"alta": ["Adenopatías en estudio", "Sospecha de linfoma"], "media": ["Linfocitosis"], "baja": ["Trombocitosis"]},
    "Artritis en estudio": {"alta": ["Sospecha de arteritis de células gigantes", "Poliartritis aguda"], "media": ["Artritis reumatoide", "Artritis en estudio"], "baja": ["Artralgias en estudio"]},
    "Lupus eritematoso sistémico": {"alta": ["Lupus eritematoso sistémico"], "media": ["Lupus eritematoso sistémico", "ANA positivo en estudio"], "baja": ["ANA positivo en estudio"]},
    "Gota": {"alta": ["Gota"], "media": ["Gota"], "baja": ["Hiperuricemia"]},
    "Episodio depresivo": {"alta": ["Trastorno depresivo mayor con riesgo suicida", "Episodio depresivo"], "media": ["Trastorno depresivo mayor"], "baja": ["Trastorno adaptativo", "Episodio depresivo"]},
    "Primer episodio psicótico": {"alta": ["Primer episodio psicótico"], "media": ["Esquizofrenia"], "baja": ["Trastorno del sueño", "Insomnio"]},
}
RUIDO = {"alta": 0.03, "media": 0.10, "baja": 0.08}

ORIGENES = [
    ("Medicina General (APS)", 0.45),
    ("Medicina Familiar", 0.15),
    ("Servicio de Urgencia", 0.12),
    ("SAPU", 0.08),
    ("Medicina Interna", 0.12),
    ("Policlínico de especialidades", 0.08),
]
ANTECEDENTES = [
    "hipertensión arterial", "diabetes mellitus tipo 2", "dislipidemia", "obesidad",
    "hipotiroidismo", "tabaquismo activo", "asma", "depresión", "artrosis",
    "enfermedad renal crónica", "cardiopatía coronaria", "insuficiencia venosa",
    "consumo de alcohol", "fibrilación auricular", "EPOC",
]
ABREV = [
    ("paciente", "pcte"), ("Paciente", "Pcte"), ("hipertensión arterial", "HTA"),
    ("diabetes mellitus tipo 2", "DM2"), ("dislipidemia", "DLP"),
    ("tabaquismo activo", "TBQ+"), ("fibrilación auricular", "FA"), (" con ", " c/ "),
    (" sin ", " s/ "), (" años", "a"), ("antecedentes", "antec"), ("evolución", "evol"),
    ("tratamiento", "tto"), ("semanas", "sem"), ("aproximadamente", "aprox"),
]
CIERRES = [
    "Se deriva para evaluación.", "Favor evaluar y manejo.", "Solicito evaluación por especialista.",
    "Derivo para estudio y tratamiento.", "Agradeceré evaluación.", "Para confirmación diagnóstica y manejo.",
    "Favor ver.", "Se envía para evaluación por especialidad.", "Derivo para manejo.",
    "Paciente consulta reiteradamente por el cuadro.", "Familia solicita evaluación.",
    "Sin respuesta a manejo en APS.", "Se agotó el manejo en atención primaria.",
]
# La urgencia en la redaccion depende poco de la prioridad: algunos medicos la
# ponen siempre y otros nunca.
CIERRES_URGENTES = ["Favor evaluar a la brevedad.", "Agradeceré evaluación pronta.", "Ojalá evaluación preferente."]
PROB_URGENTE = {"alta": 0.30, "media": 0.16, "baja": 0.10}
MOTIVOS = {
    "alta": [("CONFIRMACIÓN DIAGNÓSTICA", 4), ("TRATAMIENTO", 3), ("EVALUACIÓN POR ESPECIALIDAD", 3), ("SEGUIMIENTO", 1), ("OTRO", 1)],
    "media": [("CONFIRMACIÓN DIAGNÓSTICA", 3), ("TRATAMIENTO", 4), ("EVALUACIÓN POR ESPECIALIDAD", 3), ("SEGUIMIENTO", 2), ("OTRO", 1)],
    "baja": [("CONFIRMACIÓN DIAGNÓSTICA", 2), ("TRATAMIENTO", 3), ("EVALUACIÓN POR ESPECIALIDAD", 3), ("SEGUIMIENTO", 3), ("OTRO", 1)],
}
PESO_PRIORIDAD = {"alta": 0.22, "media": 0.45, "baja": 0.33}


def elegir(r, pares):
    valores, pesos = zip(*pares)
    return r.choices(valores, weights=pesos)[0]


def vecina(r, prioridad):
    if prioridad == "media":
        return r.choice(["alta", "baja"])
    return "media"


def tipeo(r, texto):
    letras = list(texto)
    for _ in range(r.randint(1, 2)):
        i = r.randrange(5, max(6, len(letras) - 2))
        if letras[i].isalpha() and letras[i + 1].isalpha():
            letras[i], letras[i + 1] = letras[i + 1], letras[i]
    return "".join(letras)


def generar_fila(r):
    caso = r.choice(CASOS)
    pesos = {p: PESO_PRIORIDAD[p] * caso["variantes"][p]["peso"] for p in PESO_PRIORIDAD}
    prioridad = r.choices(list(pesos), weights=list(pesos.values()))[0]
    var = caso["variantes"][prioridad]

    sexo = caso["sexo"] or r.choice("FM")
    edad = r.randint(*caso["edad"])
    hallazgos = r.sample(var["hallazgos"], k=min(len(var["hallazgos"]), r.choice([1, 1, 2, 2, 3])))
    if r.random() < 0.12:
        otra = caso["variantes"][vecina(r, prioridad)]
        hallazgos.append(r.choice(otra["hallazgos"]))
    evol = r.choice(var["evol"])
    examenes = [] if r.random() < 0.15 else r.sample(var["examenes"], k=min(len(var["examenes"]), r.choice([1, 1, 2])))
    examenes = [e for e in examenes if e != "Sin exámenes"]
    antecedentes = r.sample(ANTECEDENTES, k=r.choice([0, 1, 1, 2, 2, 3]))
    dx = r.choice(DX.get(caso["dx"][0], {}).get(prioridad) or caso["dx"])

    palabra = {"F": r.choice(["paciente mujer", "mujer", "usuaria", "paciente"]), "M": r.choice(["paciente hombre", "hombre", "usuario", "paciente"])}[sexo]
    ant = f"con antecedentes de {', '.join(antecedentes)}" if antecedentes else r.choice(["sin antecedentes mórbidos", "sin antecedentes relevantes", ""])
    sintoma = caso["sintoma"] or dx.lower()
    cuerpo = "; ".join(hallazgos)
    resultados = ". ".join(examenes)
    cierre = r.choice(CIERRES_URGENTES) if r.random() < PROB_URGENTE[prioridad] else r.choice(CIERRES)
    tratamiento = r.choice(["", "", "En tratamiento sintomático en APS.", "Recibió tratamiento inicial sin mejoría completa.", "Ha consultado en varias ocasiones."])

    estilo = r.choices(["formal", "telegrafico", "narrativo"], weights=[0.45, 0.35, 0.20])[0]
    if estilo == "formal":
        partes = [
            f"{palabra.capitalize()} de {edad} años{', ' + ant if ant else ''}.",
            f"Consulta por {sintoma} de {evol} de evolución.",
            f"Destaca {cuerpo}.",
            f"Exámenes: {resultados}." if resultados else r.choice(["Sin exámenes disponibles.", "Exámenes pendientes.", ""]),
            tratamiento,
            cierre,
        ]
    elif estilo == "telegrafico":
        partes = [
            f"{'Pcte' if r.random() < 0.6 else sexo} {edad} años.",
            ant.replace("con antecedentes de ", "Antec: ").capitalize() + "." if ant else "",
            f"Cuadro de {evol} de {sintoma}: {cuerpo}.",
            resultados + "." if resultados else "",
            cierre,
        ]
    else:
        partes = [
            f"Se trata de {palabra} de {edad} años{' ' + ant if ant else ''}, que consulta por {sintoma}.",
            f"Refiere un cuadro de {evol} caracterizado por {cuerpo}.",
            f"Se solicitan exámenes que muestran: {resultados}." if resultados else "",
            tratamiento,
            cierre,
        ]
    historia = " ".join(p for p in partes if p).replace("..", ".")
    if estilo == "telegrafico":
        for largo, corto in ABREV:
            historia = historia.replace(largo, corto)
    if r.random() < 0.05:
        historia = tipeo(r, historia)

    fundamentos = dx
    if r.random() < 0.25:
        sospecha = dx if dx.startswith("Sospecha") else f"Sospecha de {dx[0].lower()}{dx[1:]}"
        fundamentos = r.choice([sospecha, f"{dx} a confirmar", f"{dx}. {hallazgos[0].capitalize()}"])
    # El motivo lo escribe quien deriva, antes de que alguien priorice.
    motivo = elegir(r, MOTIVOS[prioridad])

    # Criterio distinto entre priorizadores: casi nunca en un caso grave claro.
    if r.random() < RUIDO[prioridad]:
        prioridad = vecina(r, prioridad)

    return {
        "ESPEC_ORIGEN": elegir(r, ORIGENES),
        "EDAD": edad,
        "SEXO": "Femenino" if sexo == "F" else "Masculino",
        "ESPEC_DESTINO": caso["destino"],
        "HISTORIA_CLINICA": historia,
        "FUNDAMENTOS_DIAGNOSTICO": fundamentos,
        "EXAMENES_COMPLEMENTARIOS": "; ".join(e.split(":")[0] for e in examenes),
        "MOTIVO_INTERCONSULTA": motivo,
        "PRIORIDAD": prioridad.capitalize(),
    }


def main():
    salida = sys.argv[1]
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 1000
    r = random.Random(int(sys.argv[3]) if len(sys.argv) > 3 else 2026)
    filas, vistas = [], set()
    while len(filas) < n:
        fila = generar_fila(r)
        if fila["HISTORIA_CLINICA"] not in vistas:
            vistas.add(fila["HISTORIA_CLINICA"])
            filas.append(fila)

    libro = Workbook()
    hoja = libro.active
    hoja.title = "Interconsultas"
    columnas = list(filas[0])
    hoja.append(columnas)
    for fila in filas:
        hoja.append([fila[c] for c in columnas])
    for celda in hoja[1]:
        celda.font = Font(bold=True, color="FFFFFF")
        celda.fill = PatternFill("solid", fgColor="1F5F73")
    anchos = {"HISTORIA_CLINICA": 90, "FUNDAMENTOS_DIAGNOSTICO": 40, "EXAMENES_COMPLEMENTARIOS": 35}
    for i, columna in enumerate(columnas, start=1):
        hoja.column_dimensions[get_column_letter(i)].width = anchos.get(columna, 22)
    hoja.freeze_panes = "A2"
    libro.save(salida)

    from collections import Counter
    print(salida, len(filas), Counter(f["PRIORIDAD"] for f in filas))


if __name__ == "__main__":
    main()
