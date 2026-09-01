const TIME_ZONE_CHILE = "America/Santiago";
const FORMATO_FECHA_HORA_CORTO = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE_CHILE,
});

const FORMATO_FECHA_HORA_LARGO = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE_CHILE,
});

export function formatearFechaHoraChile(fechaISO: string): string {
  return FORMATO_FECHA_HORA_CORTO.format(parsearFechaApi(fechaISO));
}

export function formatearFechaHoraChileLarga(fechaISO: string): string {
  return FORMATO_FECHA_HORA_LARGO.format(parsearFechaApi(fechaISO));
}

function parsearFechaApi(fechaISO: string): Date {
  const tieneZonaHoraria = /(?:Z|[+-]\d{2}:\d{2})$/i.test(fechaISO);
  return new Date(tieneZonaHoraria ? fechaISO : `${fechaISO}Z`);
}

// FECHA_EMISION es una fecha de calendario, no un instante: el backend la guarda
// como medianoche sin zona. Convertirla a horario de Chile la corria al dia
// anterior (01/09 se mostraba como 31/08), asi que se formatea en UTC sobre la
// medianoche UTC de esa misma fecha: el dia que dice el archivo es el que se ve.
const FORMATO_FECHA_CORTO = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

const FORMATO_FECHA_LARGO = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function parsearFechaCalendario(fechaISO: string): Date {
  return new Date(`${fechaISO.slice(0, 10)}T00:00:00Z`);
}

export function formatearFechaCalendario(fechaISO: string): string {
  return FORMATO_FECHA_CORTO.format(parsearFechaCalendario(fechaISO));
}

export function formatearFechaCalendarioLarga(fechaISO: string): string {
  return FORMATO_FECHA_LARGO.format(parsearFechaCalendario(fechaISO));
}
