/**
 * Plantilla y validación del pronóstico en JSON.
 *
 * Sirve para cargar los pronósticos de las IAs: se les entrega una
 * plantilla con los valores admitidos, ellas la devuelven rellenada y
 * un admin la pega en el panel. Este archivo es puro, sin base de
 * datos, igual que `puntaje.ts`.
 *
 * El criterio con los nombres es deliberadamente tolerante. Una IA
 * escribe «McLaren» donde el catálogo dice «Mclaren», o «Max
 * Verstappen» donde dice «Verstappen». Rechazar eso sería obligar al
 * admin a corregir a mano lo que la máquina puede resolver: se
 * normaliza (sin acentos, sin mayúsculas, sin puntuación) y, si aun
 * así no hay coincidencia, se acepta que el nombre del catálogo esté
 * contenido en lo que mandó la IA. Lo que no se hace nunca es adivinar
 * entre dos candidatos: si la normalización da más de uno, es error.
 */

export interface Catalogos {
  equipos: string[];
  pilotos: string[];
  compuestos: string[];
}

export interface ResultadoValidacion {
  ok: boolean;
  errores: string[];
  avisos: string[];
  /** Sólo cuando `ok`. Nombres ya canonizados contra el catálogo. */
  prediccion?: Record<string, unknown>;
}

/** minúsculas, sin acentos y sin nada que no sea letra o número. */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Lleva un nombre suelto al valor exacto del catálogo.
 * Devuelve null si no hay coincidencia, o si hay más de una.
 */
export function canonizar(valor: string, catalogo: string[]): string | null {
  const n = normalizar(valor);
  if (!n) return null;

  const exactos = catalogo.filter((c) => normalizar(c) === n);
  if (exactos.length === 1) return exactos[0];
  if (exactos.length > 1) return null;

  // «Max Verstappen» contra un catálogo que guarda «Verstappen».
  const contenidos = catalogo.filter((c) => n.includes(normalizar(c)));
  return contenidos.length === 1 ? contenidos[0] : null;
}

/** Plantilla vacía, con los valores admitidos incrustados como ayuda. */
export function plantillaPrediccion(gp: string, cat: Catalogos) {
  return {
    gp,
    qualy_equipos: Array.from({ length: 11 }, () => ''),
    qualy_podio: ['', '', ''],
    carrera_equipos: Array.from({ length: 11 }, () => ''),
    carrera_podio: ['', '', ''],
    dotd: '',
    vuelta_rapida: '',
    interrupciones: 0,
    dnf_dsq: 0,
    stints: ['', ''],
    _equipos_admitidos: cat.equipos,
    _pilotos_admitidos: cat.pilotos,
    _compuestos_admitidos: cat.compuestos,
  };
}

interface CampoOrdenado {
  clave: 'qualy_equipos' | 'qualy_podio' | 'carrera_equipos' | 'carrera_podio';
  etiqueta: string;
  largo: number;
  catalogo: keyof Catalogos;
}

const ORDENADOS: CampoOrdenado[] = [
  { clave: 'qualy_equipos',   etiqueta: 'Parrilla de clasificación', largo: 11, catalogo: 'equipos' },
  { clave: 'qualy_podio',     etiqueta: 'Podio de clasificación',    largo: 3,  catalogo: 'pilotos' },
  { clave: 'carrera_equipos', etiqueta: 'Orden de carrera',          largo: 11, catalogo: 'equipos' },
  { clave: 'carrera_podio',   etiqueta: 'Podio de carrera',          largo: 3,  catalogo: 'pilotos' },
];

export function validarPrediccion(bruto: unknown, cat: Catalogos): ResultadoValidacion {
  const errores: string[] = [];
  const avisos: string[] = [];

  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) {
    return { ok: false, errores: ['El JSON debe ser un objeto.'], avisos };
  }
  const d = bruto as Record<string, unknown>;
  const salida: Record<string, unknown> = {};

  for (const campo of ORDENADOS) {
    const v = d[campo.clave];
    if (!Array.isArray(v)) {
      errores.push(`${campo.etiqueta}: falta «${campo.clave}» o no es una lista.`);
      continue;
    }
    if (v.length !== campo.largo) {
      errores.push(`${campo.etiqueta}: se esperaban ${campo.largo} valores y llegaron ${v.length}.`);
      continue;
    }
    const catalogo = cat[campo.catalogo];
    const canon: string[] = [];
    for (let i = 0; i < v.length; i++) {
      const crudo = String(v[i] ?? '').trim();
      if (!crudo) { errores.push(`${campo.etiqueta}: la posición ${i + 1} está vacía.`); continue; }
      const c = canonizar(crudo, catalogo);
      if (!c) { errores.push(`${campo.etiqueta} P${i + 1}: «${crudo}» no está en el catálogo.`); continue; }
      if (c !== crudo) avisos.push(`${campo.etiqueta} P${i + 1}: «${crudo}» → «${c}».`);
      canon.push(c);
    }
    const repes = canon.filter((x, i) => canon.indexOf(x) !== i);
    if (repes.length) errores.push(`${campo.etiqueta}: repetidos → ${[...new Set(repes)].join(', ')}.`);
    if (canon.length === campo.largo) salida[campo.clave] = canon;
  }

  for (const clave of ['dotd', 'vuelta_rapida'] as const) {
    const crudo = String(d[clave] ?? '').trim();
    if (!crudo) { avisos.push(`«${clave}» viene vacío: no puntúa.`); continue; }
    const c = canonizar(crudo, cat.pilotos);
    if (!c) { errores.push(`${clave}: «${crudo}» no es un piloto del catálogo.`); continue; }
    if (c !== crudo) avisos.push(`${clave}: «${crudo}» → «${c}».`);
    salida[clave] = c;
  }

  for (const clave of ['interrupciones', 'dnf_dsq'] as const) {
    const v = d[clave];
    if (v === undefined || v === null || v === '') { avisos.push(`«${clave}» viene vacío: no puntúa.`); continue; }
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) { errores.push(`${clave}: «${String(v)}» no es un entero de cero para arriba.`); continue; }
    salida[clave] = n;
  }

  const st = d.stints;
  if (Array.isArray(st)) {
    const canon: string[] = [];
    for (const s of st) {
      const crudo = String(s ?? '').trim();
      if (!crudo) continue;
      const c = canonizar(crudo, cat.compuestos);
      if (!c) { errores.push(`stints: «${crudo}» no es un compuesto del catálogo.`); continue; }
      canon.push(c);
    }
    if (canon.length) salida.stints = canon;
    else avisos.push('«stints» viene vacío: la estrategia no puntúa.');
  } else if (st !== undefined) {
    errores.push('«stints» tiene que ser una lista.');
  } else {
    avisos.push('Falta «stints»: la estrategia no puntúa.');
  }

  return errores.length
    ? { ok: false, errores, avisos }
    : { ok: true, errores, avisos, prediccion: salida };
}
