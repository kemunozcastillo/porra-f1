export const metadata = { title: 'Reglas · Porra F1' };

export default function Reglas() {
  return (
    <>
      <h1 className="titulo">Cómo se<br />puntúa</h1>
      <p className="subtitulo">
        Mismas reglas que la planilla de siempre. Nada cambió, sólo dónde vive.
      </p>

      <div className="tarjeta">
        <label className="suelto">Posiciones · parrilla y podios</label>
        <p style={{ margin: '0 0 10px' }}>
          Cada casillero se compara con dónde terminó realmente lo que elegiste.
        </p>
        <div className="desglose">
          <div><span>En la posición exacta</span><span className="puntos">5</span></div>
          <div><span>A una posición</span><span className="puntos">3</span></div>
          <div><span>A dos posiciones</span><span className="puntos">1</span></div>
          <div><span>Más lejos, o fuera del top 5 del podio</span><span className="puntos" data-cero="si">0</span></div>
        </div>
        <p style={{ color: 'var(--tenue)', fontSize: 14, marginBottom: 0 }}>
          Los podios se miden contra las cinco primeras posiciones reales, así que un piloto
          que quedó cuarto o quinto todavía te puede dar puntos.
        </p>
      </div>

      <div className="tarjeta">
        <label className="suelto">Sprint · escala reducida</label>
        <p style={{ margin: '0 0 10px' }}>
          No hay pronóstico de sprint: se puntúa el mismo, contra el resultado del sprint
          y sólo las parrillas y los podios. Pero vale menos y perdona menos.
        </p>
        <div className="desglose">
          <div><span>En la posición exacta</span><span className="puntos">3</span></div>
          <div><span>A una posición</span><span className="puntos">1</span></div>
          <div><span>A dos o más</span><span className="puntos" data-cero="si">0</span></div>
        </div>
      </div>

      <div className="tarjeta">
        <label className="suelto">Detalles de carrera</label>
        <div className="desglose">
          <div><span>Piloto del día exacto</span><span className="puntos">5</span></div>
          <div><span>Vuelta rápida exacta</span><span className="puntos">5</span></div>
          <div><span>Interrupciones exactas</span><span className="puntos">5</span></div>
          <div><span>Abandonos y descalificaciones exactos</span><span className="puntos">5</span></div>
        </div>
      </div>

      <div className="tarjeta">
        <label className="suelto">Estrategia del ganador</label>
        <div className="desglose">
          <div><span>Misma secuencia exacta de compuestos</span><span className="puntos">5</span></div>
          <div><span>Mismos compuestos, otro orden</span><span className="puntos">3</span></div>
          <div><span>Misma cantidad de stints</span><span className="puntos">1</span></div>
        </div>
      </div>

      <div className="tarjeta">
        <label className="suelto">Bonus de ronda</label>
        <div className="desglose">
          <div><span>Mejor puntaje de la ronda</span><span className="puntos">+3</span></div>
          <div><span>Segundo</span><span className="puntos">+2</span></div>
          <div><span>Tercero</span><span className="puntos">+1</span></div>
        </div>
        <p style={{ color: 'var(--tenue)', fontSize: 14, marginBottom: 0 }}>
          En paralelo corre un campeonato con la escala de puntos de la F1
          (25-18-15-12-10-8-6-4-2-1) según tu posición en cada ronda.
        </p>
      </div>

      <div className="tarjeta">
        <label className="suelto">Llegar tarde</label>
        <p style={{ margin: 0 }}>
          Se puede mandar después del cierre. Lo que no se puede es puntuar hacia atrás:
          las sesiones que ya se corrieron cuando llegó tu pronóstico valen cero, y el
          resto del fin de semana cuenta normal. Mandar tarde en un fin de semana con
          sprint, por ejemplo, te deja sin la clasificación sprint pero con todo lo demás.
        </p>
      </div>

      <div className="tarjeta">
        <label className="suelto">Comodines</label>
        <p style={{ margin: 0 }}>
          Tenés un <strong>boost</strong> y un <strong>boost a ciegas</strong> por temporada.
          Cualquiera de los dos duplica el puntaje de esa ronda. Una vez que lo quemás, no vuelve.
        </p>
      </div>

    </>
  );
}
