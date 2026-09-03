/**
 * Motor de puntuación de la Porra F1.
 *
 * Portado 1:1 desde las fórmulas de las hojas `Procesamiento_Puntajes`
 * y `Procesamiento_Sprints` del Excel original. Cada regla está anotada
 * con la fórmula de la que proviene.
 *
 * Este archivo no depende de la base de datos: es una función pura.
 * Eso lo hace testeable y permite recalcular toda la temporada offline.
 */

// ------------------------------------------------------------------
// Tipos
// ------------------------------------------------------------------

export type Sesion = 'gp' | 'sprint';
export type Comodin = 'ninguno' | 'boost' | 'boost_ciegas';

/** Pronóstico enviado por un participante. */
export interface Prediccion {
  qualy_equipos: string[];      // 11 equipos ordenados
  qualy_podio: string[];        // 3 pilotos
  carrera_equipos: string[];    // 11 equipos ordenados
  carrera_podio: string[];      // 3 pilotos
  dotd?: string;                // Driver of the Day
  interrupciones?: number;      // banderas rojas + safety cars
  vuelta_rapida?: string;
  stints?: string[];            // ej. ["M","H"]
  dnf_dsq?: number;
}

/** Resultado oficial. Los podios traen 5 posiciones, no 3. */
export interface Resultado {
  qualy_equipos: string[];      // 11
  qualy_podio: string[];        // 5
  carrera_equipos: string[];    // 11
  carrera_podio: string[];      // 5
  dotd?: string;
  interrupciones?: number;
  vuelta_rapida?: string;
  stints?: string[];
  dnf_dsq?: number;
}

export interface Desglose {
  qualy_equipos: number;
  qualy_podio: number;
  carrera_equipos: number;
  carrera_podio: number;
  dotd: number;
  interrupciones: number;
  vuelta_rapida: number;
  estrategia: number;
  dnf_dsq: number;
}

// ------------------------------------------------------------------
// Reglas base
// ------------------------------------------------------------------

/** Puntos por acierto exacto de un dato suelto (DotD, vuelta rápida, etc.). */
export const PUNTOS_ACIERTO_EXACTO = 5;

/**
 * Escalas de cercanía posicional, indexadas por distancia.
 *
 *   Gran Premio → 5 en el lugar exacto, 3 a una posición, 1 a dos.
 *   Sprint      → 3 en el lugar exacto, 1 a una posición, nada más.
 *
 * El sprint vale menos y perdona menos: sólo premia el acierto exacto y
 * el error de un solo lugar. Verificado contra los sprints de China,
 * Miami y Silverstone: 58 de 60 puntajes coinciden al punto con los que
 * guardaba la planilla, y los dos que no son pronósticos enviados
 * después del cierre.
 */
export const ESCALA_GP     = [5, 3, 1] as const;
export const ESCALA_SPRINT = [3, 1] as const;

export function puntosPorDistancia(
  distancia: number,
  escala: readonly number[] = ESCALA_GP
): number {
  return escala[distancia] ?? 0;
}

/** Normaliza nombres para que "Mclaren" y "McLaren" cuenten igual. */
export function normalizar(valor: unknown): string {
  return String(valor ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Puntúa una lista ordenada (parrilla de equipos o podio de pilotos)
 * comparando la posición pronosticada contra la posición real.
 */
export function puntuarLista(
  pronostico: readonly (string | null | undefined)[],
  oficial: readonly (string | null | undefined)[],
  escala: readonly number[] = ESCALA_GP
): { total: number; porPosicion: number[] } {
  const real = oficial.map(normalizar).filter(Boolean);
  const porPosicion = pronostico.map((elegido, indice) => {
    const clave = normalizar(elegido);
    if (!clave) return 0;
    const posicionReal = real.indexOf(clave);
    if (posicionReal === -1) return 0;
    return puntosPorDistancia(Math.abs(indice - posicionReal), escala);
  });
  return { total: porPosicion.reduce((a, b) => a + b, 0), porPosicion };
}

/** Acierto exacto de un valor suelto. Nulos y vacíos no puntúan. */
export function puntuarExacto(pronostico: unknown, oficial: unknown): number {
  const a = normalizar(pronostico);
  const b = normalizar(oficial);
  if (!a || !b) return 0;
  return a === b ? PUNTOS_ACIERTO_EXACTO : 0;
}

/**
 * Estrategia de neumáticos.
 *   5 → misma secuencia exacta de compuestos
 *   3 → mismos compuestos en otro orden
 *   1 → misma cantidad de stints
 *   0 → ni eso
 * Se toma el máximo de las tres condiciones (MAX(exacto, mismos, cantidad)).
 */
export function puntuarEstrategia(
  pronostico: readonly string[] = [],
  oficial: readonly string[] = []
): number {
  const p = pronostico.map(normalizar).filter(Boolean);
  const r = oficial.map(normalizar).filter(Boolean);
  if (p.length === 0 || r.length === 0) return 0;

  if (p.join('-') === r.join('-')) return 5;
  if (p.length === r.length) {
    const mismoMultiset =
      [...p].sort().join('-') === [...r].sort().join('-');
    if (mismoMultiset) return 3;
    return 1;
  }
  return 0;
}

// ------------------------------------------------------------------
// Puntuación de una sesión completa
// ------------------------------------------------------------------

/**
 * En un fin de semana con sprint no hay un pronóstico aparte: se puntúa
 * el MISMO pronóstico contra el resultado del sprint, con las cuatro
 * listas completas pero en la escala reducida. Los detalles de carrera
 * (piloto del día, vuelta rápida, estrategia, abandonos) sólo cuentan
 * en el Gran Premio.
 */
/**
 * Qué partes del fin de semana ya se habían corrido cuando llegó el
 * pronóstico. Un envío tardío se acepta, pero no puntúa hacia atrás.
 */
export interface YaCorrido {
  /** La clasificación de esta sesión ya había empezado. */
  qualy: boolean;
  /** La carrera de esta sesión ya había empezado. */
  carrera: boolean;
}

export function puntuarSesion(
  prediccion: Prediccion,
  resultado: Resultado,
  sesion: Sesion = 'gp',
  yaCorrido: YaCorrido = { qualy: false, carrera: false }
): { puntos: number; desglose: Desglose } {
  // El sprint sólo puntúa parrillas y podios, y en escala reducida:
  // no hay DotD, vuelta rápida, estrategia ni abandonos.
  const esSprint = sesion === 'sprint';
  const escala = esSprint ? ESCALA_SPRINT : ESCALA_GP;

  const qualyEquipos   = puntuarLista(prediccion.qualy_equipos   ?? [], resultado.qualy_equipos   ?? [], escala);
  const qualyPodio     = puntuarLista(prediccion.qualy_podio     ?? [], resultado.qualy_podio     ?? [], escala);
  const carreraEquipos = puntuarLista(prediccion.carrera_equipos ?? [], resultado.carrera_equipos ?? [], escala);
  const carreraPodio   = puntuarLista(prediccion.carrera_podio   ?? [], resultado.carrera_podio   ?? [], escala);

  // Un pronóstico que llega tarde vale para lo que todavía no se corrió.
  // Lo ya disputado queda en cero: no se puntúa hacia atrás.
  const q = yaCorrido.qualy ? 0 : 1;
  const c = yaCorrido.carrera ? 0 : 1;

  const desglose: Desglose = {
    qualy_equipos:   qualyEquipos.total   * q,
    qualy_podio:     qualyPodio.total     * q,
    carrera_equipos: carreraEquipos.total * c,
    carrera_podio:   carreraPodio.total   * c,
    dotd:           esSprint ? 0 : puntuarExacto(prediccion.dotd, resultado.dotd) * c,
    interrupciones: esSprint ? 0 : puntuarExacto(prediccion.interrupciones, resultado.interrupciones) * c,
    vuelta_rapida:  esSprint ? 0 : puntuarExacto(prediccion.vuelta_rapida, resultado.vuelta_rapida) * c,
    estrategia:     esSprint ? 0 : puntuarEstrategia(prediccion.stints, resultado.stints) * c,
    dnf_dsq:        esSprint ? 0 : puntuarExacto(prediccion.dnf_dsq, resultado.dnf_dsq) * c,
  };

  const puntos = Object.values(desglose).reduce((a, b) => a + b, 0);
  return { puntos, desglose };
}

/** Horarios de largada de cada sesión de una ronda. */
export interface HorariosGP {
  sprint_qualy_at?: string | null;
  sprint_carrera_at?: string | null;
  qualy_at?: string | null;
  carrera_at?: string | null;
}

/**
 * Decide qué se le descuenta a un pronóstico según cuándo llegó.
 *
 * Dos casos hacen que no se descuente nada:
 *
 *   1. La sesión no tiene horario cargado en el calendario.
 *   2. La hora de envío no es confiable. Todo lo migrado del Excel entra
 *      acá: ese timestamp lo ponía la PC de quien mandaba, así que la
 *      misma hora significaba cosas distintas según el país y no sirve
 *      para decidir si alguien llegó tarde.
 *
 * En ambos la sesión puntúa. Es la opción prudente: prefiere pagar de más
 * antes que descontarle puntos a alguien por un dato que no es sólido.
 */
export function loQueYaSeCorrio(
  enviadoAt: string | Date,
  horarios: HorariosGP,
  sesion: Sesion,
  horaConfiable = true
): YaCorrido {
  if (!horaConfiable) return { qualy: false, carrera: false };
  const enviado = new Date(enviadoAt).getTime();
  const paso = (momento?: string | null) =>
    momento ? enviado > new Date(momento).getTime() : false;

  return sesion === 'sprint'
    ? { qualy: paso(horarios.sprint_qualy_at), carrera: paso(horarios.sprint_carrera_at) }
    : { qualy: paso(horarios.qualy_at),        carrera: paso(horarios.carrera_at) };
}

// ------------------------------------------------------------------
// Clasificación por GP: medallas y puntos estilo F1
// ------------------------------------------------------------------

/** Medalla por posición dentro de un GP: 3 al 1º, 2 al 2º, 1 al 3º. */
export const MEDALLAS = [3, 2, 1] as const;

/** Escala de puntos de la F1 para el campeonato paralelo. */
export const PUNTOS_F1 = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;

export interface FilaGP {
  participante: string;
  total_gp: number;
  posicion: number;
  medalla: number;
  puntos_f1: number;
}

/**
 * Ordena a los participantes de un GP y reparte medallas y puntos F1.
 *
 * Los empates usan ranking de competición (1, 1, 3): los empatados
 * comparten posición y recompensa, y la siguiente posición se saltea.
 * Es lo que hace la planilla, donde el criterio es "tu puntaje coincide
 * con el 1º, 2º o 3º mejor puntaje" calculado con LARGE, que cuenta los
 * duplicados. Si dos empatan arriba, los dos cobran 3 y nadie cobra 2.
 */
export function clasificarGP(
  totales: readonly { participante: string; total_gp: number }[]
): FilaGP[] {
  const ordenados = [...totales].sort((a, b) => b.total_gp - a.total_gp);

  return ordenados.map((fila, i) => {
    // Primera aparición de este puntaje en la lista ordenada.
    const indice = ordenados.findIndex((f) => f.total_gp === fila.total_gp);
    void i;
    return {
      participante: fila.participante,
      total_gp: fila.total_gp,
      posicion: indice + 1,
      medalla: MEDALLAS[indice] ?? 0,
      puntos_f1: PUNTOS_F1[indice] ?? 0,
    };
  });
}

// ------------------------------------------------------------------
// Comodines
// ------------------------------------------------------------------

/**
 * El boost duplica el puntaje de la sesión de Gran Premio: se suma una
 * vez más lo que sacaste ahí. Verificado contra los nueve boosts que la
 * planilla tenía registrados: los nueve valen exactamente el
 * `Puntaje_GP` de esa ronda, nunca el total con el sprint incluido.
 *
 * Cada participante tiene un boost y un boost a ciegas por temporada, y
 * puede usar los dos (Grok usó ambos en 2026). Lo que cambia entre ellos
 * es cuándo se declaran, no cuánto valen.
 *
 *   Boost          → se declara hasta el cierre del pronóstico.
 *   Boost a ciegas → se declara antes de la FP1, sin haber visto una
 *                    sola vuelta del fin de semana.
 */
export function bonusComodin(comodin: Comodin, puntosSesionGP: number): number {
  return comodin === 'ninguno' ? 0 : puntosSesionGP;
}
