/**
 * Tipos del resumen clínico que se muestra junto a una interconsulta.
 *
 * El backend no almacena datos de paciente: el resumen se arma con los cuatro
 * campos clínicos que trae la propia interconsulta. Por eso este tipo describe
 * solo eso, y no un expediente completo.
 */

export interface CamposInterconsultaClinica {
  historiaClinica: string;
  fundamentosDiagnostico: string;
  examenesComplementarios: string;
  motivoInterconsulta: string;
}

export interface ResumenClinicoPaciente {
  pacienteId: string;
  /** false cuando la interconsulta no trae ningún antecedente utilizable. */
  informacionSuficiente: boolean;
  camposInterconsulta?: CamposInterconsultaClinica;
}
