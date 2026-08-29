/**
 * Datos simulados para el MVP de PriorizAI.
 * Representan interconsultas, pacientes e historiales clínicos realistas
 * para el contexto de salud pública chilena.
 *
 * NOTA: Estos datos deben reemplazarse por llamadas al backend (FastAPI)
 * cuando esté disponible. Los servicios en /services/ ya están preparados
 * para esa transición.
 */

import type { Interconsulta } from "@/types/interconsulta";
import type { ResumenClinicoPaciente } from "@/types/paciente";
import type { Usuario } from "@/types/usuario";

// ─────────────────────────────────────────────
// Usuario simulado (sesión actual)
// ─────────────────────────────────────────────

export const usuarioActual: Usuario = {
  id: "usr-001",
  nombre: "Dra. María González",
  rol: "medico_especialista",
  especialidad: "Cardiología",
  centroSalud: "Hospital San Juan de Dios",
};

// ─────────────────────────────────────────────
// Interconsultas simuladas
// ─────────────────────────────────────────────

export const interconsultasMock: Interconsulta[] = [
  {
    id: "ic-001",
    pacienteId: "pac-001",
    pacienteNombre: "Juan Pérez Soto",
    pacienteRut: "12.345.678-9",
    pacienteEdad: 67,
    especialidad: "Cardiología",
    centroOrigen: "CESFAM La Granja",
    diagnostico: "Insuficiencia cardíaca descompensada",
    motivoInterconsulta:
      "Paciente con disnea progresiva de 2 semanas de evolución, edema de extremidades inferiores bilateral. Ecocardiograma previo muestra FEVI 35%. Se solicita evaluación por especialista para ajuste terapéutico.",
    estado: "pendiente",
    prioridadActual: "alta",
    priorizacionIA: {
      nivelSugerido: "alta",
      confianza: 92,
      justificacion:
        "FEVI reducida (35%) con síntomas de descompensación activa. Edad avanzada con factores de riesgo cardiovascular múltiples. Requiere evaluación urgente para prevenir hospitalización.",
    },
    banderaRoja: false,
    terminosBanderaRoja: [],
    prioridadForzadaPorRegla: false,
    fechaEmision: null,
    historialModificaciones: [],
    fechaIngreso: "2026-06-05T09:30:00",
    fechaActualizacion: "2026-06-05T09:30:00",
  },
  {
    id: "ic-002",
    pacienteId: "pac-002",
    pacienteNombre: "Ana María López Díaz",
    pacienteRut: "15.678.901-2",
    pacienteEdad: 45,
    especialidad: "Cardiología",
    centroOrigen: "CESFAM San Ramón",
    diagnostico: "Hipertensión arterial resistente",
    motivoInterconsulta:
      "Paciente con HTA de difícil manejo, en tratamiento con 3 antihipertensivos a dosis máxima sin lograr control. PA promedio 160/100 mmHg. Sin daño de órgano blanco evidente.",
    estado: "revisada",
    prioridadActual: "media",
    priorizacionIA: {
      nivelSugerido: "media",
      confianza: 85,
      justificacion:
        "Hipertensión resistente sin emergencia hipertensiva actual. Sin signos de daño de órgano blanco. Requiere evaluación especializada pero no urgente.",
    },
    banderaRoja: false,
    terminosBanderaRoja: [],
    prioridadForzadaPorRegla: false,
    fechaEmision: null,
    historialModificaciones: [],
    fechaIngreso: "2026-06-04T14:15:00",
    fechaActualizacion: "2026-06-05T10:00:00",
  },
  {
    id: "ic-003",
    pacienteId: "pac-003",
    pacienteNombre: "Carlos Muñoz Vera",
    pacienteRut: "18.234.567-K",
    pacienteEdad: 32,
    especialidad: "Cardiología",
    centroOrigen: "CESFAM La Pintana",
    diagnostico: "Soplo cardíaco en estudio",
    motivoInterconsulta:
      "Paciente joven, hallazgo incidental de soplo sistólico grado II/VI en control preventivo. Asintomático, sin antecedentes cardiovasculares familiares relevantes.",
    estado: "pendiente",
    prioridadActual: "baja",
    priorizacionIA: {
      nivelSugerido: "baja",
      confianza: 78,
      justificacion:
        "Paciente joven asintomático con soplo funcional probable. Sin factores de riesgo adicionales. Evaluación electiva recomendada.",
    },
    banderaRoja: false,
    terminosBanderaRoja: [],
    prioridadForzadaPorRegla: false,
    fechaEmision: null,
    historialModificaciones: [],
    fechaIngreso: "2026-06-03T11:00:00",
    fechaActualizacion: "2026-06-03T11:00:00",
  },
  {
    id: "ic-004",
    pacienteId: "pac-004",
    pacienteNombre: "Rosa Martínez Gallardo",
    pacienteRut: "9.876.543-1",
    pacienteEdad: 72,
    especialidad: "Cardiología",
    centroOrigen: "CESFAM El Bosque",
    diagnostico: "Fibrilación auricular de reciente diagnóstico",
    motivoInterconsulta:
      "Paciente con palpitaciones y mareos frecuentes de 1 mes. ECG en APS muestra FA con respuesta ventricular rápida (FC 120 lpm). Diabética tipo 2 e hipertensa. CHA2DS2-VASc: 5 puntos.",
    estado: "pendiente",
    prioridadActual: "alta",
    priorizacionIA: {
      nivelSugerido: "alta",
      confianza: 96,
      justificacion:
        "FA con respuesta ventricular rápida en paciente con alto riesgo tromboembólico (CHA2DS2-VASc 5). Requiere anticoagulación urgente y control de frecuencia. Riesgo de ACV elevado.",
    },
    banderaRoja: false,
    terminosBanderaRoja: [],
    prioridadForzadaPorRegla: false,
    fechaEmision: null,
    historialModificaciones: [],
    fechaIngreso: "2026-06-05T08:00:00",
    fechaActualizacion: "2026-06-05T08:00:00",
  },
  {
    id: "ic-005",
    pacienteId: "pac-005",
    pacienteNombre: "Diego Fernández Rojas",
    pacienteRut: "16.543.210-5",
    pacienteEdad: 55,
    especialidad: "Cardiología",
    centroOrigen: "CESFAM La Florida",
    diagnostico: "Dolor torácico atípico",
    motivoInterconsulta:
      "Paciente con episodios de dolor torácico no relacionado con esfuerzo, duración variable. Troponinas negativas x2. ECG sin cambios isquémicos. Fumador activo, dislipidémico.",
    estado: "revisada",
    prioridadActual: "media",
    priorizacionIA: {
      nivelSugerido: "baja",
      confianza: 65,
      justificacion:
        "Dolor torácico atípico con biomarcadores negativos. Bajo riesgo de síndrome coronario agudo. Evaluación ambulatoria recomendada.",
    },
    banderaRoja: false,
    terminosBanderaRoja: [],
    prioridadForzadaPorRegla: false,
    fechaEmision: null,
    historialModificaciones: [
      {
        id: "mod-001",
        prioridadAnterior: "baja",
        prioridadNueva: "media",
        motivo:
          "Paciente fumador activo con dislipidemia. A pesar de troponinas negativas, factores de riesgo cardiovascular ameritan evaluación con mayor prioridad.",
        medicoResponsable: "Dra. María González",
        fecha: "2026-06-04T16:30:00",
      },
    ],
    fechaIngreso: "2026-06-02T10:45:00",
    fechaActualizacion: "2026-06-04T16:30:00",
  },
  {
    id: "ic-006",
    pacienteId: "pac-006",
    pacienteNombre: "Patricia Herrera Muñoz",
    pacienteRut: "14.321.654-3",
    pacienteEdad: 61,
    especialidad: "Cardiología",
    centroOrigen: "CESFAM Puente Alto",
    diagnostico: "Control post infarto agudo al miocardio",
    motivoInterconsulta:
      "Paciente con IAM hace 3 meses, tratada con angioplastía + stent. Actualmente estable con tratamiento óptimo. Requiere control cardiológico de seguimiento.",
    estado: "revisada",
    prioridadActual: "media",
    priorizacionIA: {
      nivelSugerido: "media",
      confianza: 88,
      justificacion:
        "Post IAM estable con revascularización exitosa. Control de seguimiento necesario pero sin urgencia. Adherencia al tratamiento adecuada.",
    },
    banderaRoja: false,
    terminosBanderaRoja: [],
    prioridadForzadaPorRegla: false,
    fechaEmision: null,
    historialModificaciones: [],
    fechaIngreso: "2026-06-01T09:00:00",
    fechaActualizacion: "2026-06-03T14:00:00",
  },
  {
    id: "ic-007",
    pacienteId: "pac-007",
    pacienteNombre: "Manuel Ortega Silva",
    pacienteRut: "11.222.333-4",
    pacienteEdad: 78,
    especialidad: "Cardiología",
    centroOrigen: "CESFAM San Joaquín",
    diagnostico: "Estenosis aórtica severa sintomática",
    motivoInterconsulta:
      "Paciente con disnea de esfuerzo progresiva, síncope reciente. Ecocardiograma muestra estenosis aórtica severa (área valvular 0.7 cm², gradiente medio 48 mmHg). Se solicita evaluación para eventual reemplazo valvular.",
    estado: "pendiente",
    prioridadActual: "alta",
    priorizacionIA: {
      nivelSugerido: "alta",
      confianza: 98,
      justificacion:
        "Estenosis aórtica severa con síntomas (síncope + disnea). Mortalidad elevada sin intervención. Requiere evaluación quirúrgica urgente.",
    },
    banderaRoja: false,
    terminosBanderaRoja: [],
    prioridadForzadaPorRegla: false,
    fechaEmision: null,
    historialModificaciones: [],
    fechaIngreso: "2026-06-06T07:45:00",
    fechaActualizacion: "2026-06-06T07:45:00",
  },
  {
    id: "ic-008",
    pacienteId: "pac-008",
    pacienteNombre: "Francisca Reyes Aravena",
    pacienteRut: "19.876.543-2",
    pacienteEdad: 28,
    especialidad: "Cardiología",
    centroOrigen: "CESFAM Macul",
    diagnostico: "Taquicardia supraventricular paroxística",
    motivoInterconsulta:
      "Paciente joven con episodios recurrentes de taquicardia de inicio y término súbito, FC hasta 180 lpm. Sin cardiopatía estructural en ecocardiograma previo. Holter muestra TSVP.",
    estado: "pendiente",
    prioridadActual: "media",
    priorizacionIA: {
      nivelSugerido: "media",
      confianza: 82,
      justificacion:
        "TSVP recurrente en corazón estructuralmente sano. Candidata a estudio electrofisiológico electivo. Sin riesgo vital inmediato.",
    },
    banderaRoja: false,
    terminosBanderaRoja: [],
    prioridadForzadaPorRegla: false,
    fechaEmision: null,
    historialModificaciones: [],
    fechaIngreso: "2026-06-05T15:20:00",
    fechaActualizacion: "2026-06-05T15:20:00",
  },
];

// ─────────────────────────────────────────────
// Resúmenes clínicos simulados (HdU03)
// ─────────────────────────────────────────────

export const resumenesClinicosMock: Record<string, ResumenClinicoPaciente> = {
  "pac-001": {
    pacienteId: "pac-001",
    nombre: "Juan Pérez Soto",
    rut: "12.345.678-9",
    edad: 67,
    sexo: "M",
    prevision: "Fonasa B",
    diagnosticosPrevios: [
      {
        codigo: "I50.0",
        nombre: "Insuficiencia cardíaca congestiva",
        fecha: "2024-03-15",
        activo: true,
      },
      {
        codigo: "I10",
        nombre: "Hipertensión arterial esencial",
        fecha: "2018-07-20",
        activo: true,
      },
      {
        codigo: "E11.9",
        nombre: "Diabetes mellitus tipo 2",
        fecha: "2019-01-10",
        activo: true,
      },
      {
        codigo: "E78.0",
        nombre: "Hipercolesterolemia pura",
        fecha: "2020-05-22",
        activo: true,
      },
    ],
    tratamientos: [
      {
        nombre: "Enalapril",
        dosis: "10 mg",
        frecuencia: "Cada 12 horas",
        fechaInicio: "2024-03-20",
        fechaTermino: null,
        activo: true,
      },
      {
        nombre: "Furosemida",
        dosis: "40 mg",
        frecuencia: "Cada mañana",
        fechaInicio: "2024-03-20",
        fechaTermino: null,
        activo: true,
      },
      {
        nombre: "Carvedilol",
        dosis: "6.25 mg",
        frecuencia: "Cada 12 horas",
        fechaInicio: "2024-04-01",
        fechaTermino: null,
        activo: true,
      },
      {
        nombre: "Metformina",
        dosis: "850 mg",
        frecuencia: "Cada 12 horas",
        fechaInicio: "2019-02-01",
        fechaTermino: null,
        activo: true,
      },
      {
        nombre: "Atorvastatina",
        dosis: "20 mg",
        frecuencia: "Cada noche",
        fechaInicio: "2020-06-01",
        fechaTermino: null,
        activo: true,
      },
    ],
    alergias: [
      {
        sustancia: "Penicilina",
        severidad: "moderada",
        reaccion: "Rash cutáneo generalizado",
      },
    ],
    atencionesRecientes: [
      {
        tipo: "Consulta",
        especialidad: "Medicina interna",
        fecha: "2026-05-20",
        resumen:
          "Control de IC. Paciente refiere aumento de disnea. Se ajusta dosis de furosemida.",
      },
      {
        tipo: "Urgencia",
        especialidad: "Urgencia general",
        fecha: "2026-04-10",
        resumen:
          "Consulta por edema EEII bilateral. Se descarta TVP. Alta con indicación de control.",
      },
      {
        tipo: "Examen",
        especialidad: "Cardiología",
        fecha: "2026-03-15",
        resumen: "Ecocardiograma: FEVI 35%, dilatación VI leve, IM leve.",
      },
    ],
    factoresRiesgo: [
      "FEVI reducida (35%)",
      "Diabetes mellitus tipo 2",
      "Hipertensión arterial",
      "Dislipidemia",
      "Edad > 65 años",
      "Alergia a penicilina",
    ],
    informacionSuficiente: true,
  },
  "pac-004": {
    pacienteId: "pac-004",
    nombre: "Rosa Martínez Gallardo",
    rut: "9.876.543-1",
    edad: 72,
    sexo: "F",
    prevision: "Fonasa A",
    diagnosticosPrevios: [
      {
        codigo: "I48.0",
        nombre: "Fibrilación auricular paroxística",
        fecha: "2026-05-10",
        activo: true,
      },
      {
        codigo: "E11.9",
        nombre: "Diabetes mellitus tipo 2",
        fecha: "2015-03-20",
        activo: true,
      },
      {
        codigo: "I10",
        nombre: "Hipertensión arterial",
        fecha: "2012-08-15",
        activo: true,
      },
      {
        codigo: "N18.3",
        nombre: "Enfermedad renal crónica etapa 3a",
        fecha: "2023-11-05",
        activo: true,
      },
    ],
    tratamientos: [
      {
        nombre: "Losartán",
        dosis: "50 mg",
        frecuencia: "Cada 12 horas",
        fechaInicio: "2012-09-01",
        fechaTermino: null,
        activo: true,
      },
      {
        nombre: "Metformina",
        dosis: "500 mg",
        frecuencia: "Cada 12 horas",
        fechaInicio: "2015-04-01",
        fechaTermino: null,
        activo: true,
      },
      {
        nombre: "Amlodipino",
        dosis: "5 mg",
        frecuencia: "Cada mañana",
        fechaInicio: "2020-01-15",
        fechaTermino: null,
        activo: true,
      },
    ],
    alergias: [],
    atencionesRecientes: [
      {
        tipo: "Urgencia",
        especialidad: "Urgencia general",
        fecha: "2026-05-10",
        resumen:
          "Consulta por palpitaciones y mareos. ECG: FA con RVR (FC 120 lpm). Se inicia metoprolol.",
      },
      {
        tipo: "Consulta",
        especialidad: "Medicina general",
        fecha: "2026-04-15",
        resumen:
          "Control crónico. HbA1c 7.8%. Función renal estable (TFG 52 ml/min).",
      },
    ],
    factoresRiesgo: [
      "Fibrilación auricular con RVR",
      "CHA2DS2-VASc: 5 puntos (alto riesgo tromboembólico)",
      "Diabetes mellitus tipo 2",
      "Hipertensión arterial",
      "ERC etapa 3a",
      "Edad > 70 años",
    ],
    informacionSuficiente: true,
  },
  "pac-007": {
    pacienteId: "pac-007",
    nombre: "Manuel Ortega Silva",
    rut: "11.222.333-4",
    edad: 78,
    sexo: "M",
    prevision: "Fonasa B",
    diagnosticosPrevios: [
      {
        codigo: "I35.0",
        nombre: "Estenosis aórtica no reumática",
        fecha: "2025-06-10",
        activo: true,
      },
      {
        codigo: "I10",
        nombre: "Hipertensión arterial",
        fecha: "2010-03-01",
        activo: true,
      },
      {
        codigo: "J44.1",
        nombre: "EPOC con exacerbación aguda",
        fecha: "2022-12-20",
        activo: true,
      },
    ],
    tratamientos: [
      {
        nombre: "Enalapril",
        dosis: "5 mg",
        frecuencia: "Cada 12 horas",
        fechaInicio: "2010-04-01",
        fechaTermino: null,
        activo: true,
      },
      {
        nombre: "Salbutamol inhalador",
        dosis: "200 mcg",
        frecuencia: "SOS",
        fechaInicio: "2022-12-25",
        fechaTermino: null,
        activo: true,
      },
    ],
    alergias: [
      {
        sustancia: "AINEs",
        severidad: "severa",
        reaccion: "Broncoespasmo severo",
      },
    ],
    atencionesRecientes: [
      {
        tipo: "Examen",
        especialidad: "Cardiología",
        fecha: "2026-05-28",
        resumen:
          "Ecocardiograma: Estenosis aórtica severa, área valvular 0.7 cm², gradiente medio 48 mmHg. FEVI conservada 55%.",
      },
      {
        tipo: "Urgencia",
        especialidad: "Urgencia general",
        fecha: "2026-05-25",
        resumen:
          "Síncope presenciado en domicilio. Sin trauma. ECG sin arritmias. Se sospecha etiología valvular.",
      },
    ],
    factoresRiesgo: [
      "Estenosis aórtica severa sintomática",
      "Síncope reciente",
      "EPOC",
      "Edad > 75 años",
      "Alergia severa a AINEs",
    ],
    informacionSuficiente: true,
  },
  /* Paciente con información insuficiente para demostrar caso HdU03 */
  "pac-003": {
    pacienteId: "pac-003",
    nombre: "Carlos Muñoz Vera",
    rut: "18.234.567-K",
    edad: 32,
    sexo: "M",
    prevision: "Fonasa C",
    diagnosticosPrevios: [],
    tratamientos: [],
    alergias: [],
    atencionesRecientes: [],
    factoresRiesgo: [],
    informacionSuficiente: false,
  },
};
