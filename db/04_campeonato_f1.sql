-- Segunda tabla: campeonato con la escala de puntos de la F1.
--
-- No es un ranking derivado del acumulado: es un campeonato distinto.
-- En cada ronda se ordena a todo el mundo por el puntaje de ese fin de
-- semana y se reparte 25-18-15-12-10-8-6-4-2-1 según la posición. Ganar
-- una ronda por un punto vale lo mismo que ganarla por cuarenta, así que
-- premia la regularidad en el podio y no el volumen bruto de aciertos.
--
-- Los empates usan ranking de competición: dos empatados en el 7º puesto
-- cobran los dos 6 puntos y el siguiente pasa a ser 9º.

create or replace view campeonato_f1 as
select
  p.nombre as participante,
  p.tipo,
  coalesce(sum(pg.puntos_f1), 0) as puntos,
  count(*) filter (where pg.posicion = 1) as victorias,
  count(*) filter (where pg.posicion <= 3) as podios,
  count(*) filter (where pg.puntos_f1 > 0) as rondas_en_puntos,
  max(pg.puntos_f1) as mejor_ronda
from participantes p
left join posiciones_gp pg on pg.participante = p.nombre
where p.activo
group by p.nombre, p.tipo
order by puntos desc, victorias desc, podios desc;
