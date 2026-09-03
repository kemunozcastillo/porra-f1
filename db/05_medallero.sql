-- Tercera tabla: el medallero, con criterio olímpico.
--
-- No se suman los puntos de nada: se cuentan medallas de ronda y se
-- ordena por cantidad de oros. Un solo oro vale más que cualquier
-- cantidad de platas, y una plata más que cualquier cantidad de bronces.
-- Es el criterio contrario al del acumulado: premia ganar rondas, no
-- puntuar alto de forma constante.
--
-- El desempate baja escalón por escalón: oros, luego platas, luego
-- bronces y, si tres o más siguen igualados ahí, cuántas veces quedaron
-- cuartos. `posicion` usa ranking de competición, así que un cuarto
-- puesto puede no existir si hubo un triple empate arriba; en ese caso
-- cuenta cero, que es lo correcto: nadie ocupó ese lugar.

create or replace view medallero as
select
  p.nombre as participante,
  p.tipo,
  count(*) filter (where pg.medalla = 3) as oros,
  count(*) filter (where pg.medalla = 2) as platas,
  count(*) filter (where pg.medalla = 1) as bronces,
  count(*) filter (where pg.posicion = 4) as cuartos,
  count(*) filter (where pg.medalla > 0) as podios,
  count(pg.gp_id)                        as rondas
from participantes p
left join posiciones_gp pg on pg.participante = p.nombre
where p.activo
group by p.nombre, p.tipo
order by oros desc, platas desc, bronces desc, cuartos desc, p.nombre;
