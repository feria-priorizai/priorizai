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
