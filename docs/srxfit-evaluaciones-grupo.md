# SRXFIT › Evaluaciones — el grupo como un solo socio (5 oct 2026)

Arriba de `/dashboard/srxfit/evaluaciones` (`group-dashboard.tsx`, lógica en `src/lib/srxfit/group-stats.ts`).

- **Población:** socios ACTIVOS con membresía pagada vigente (no trial, no pase diario), sin personal.
  Solo datos oficiales (`OFFICIAL_ENTRY_WHERE`).
- **Tests:** por socio, primera medición vs. última (separadas ≥ 3 semanas). Mejoró / igual (±1%) /
  peor, con el signo de cada test (en Christine, remo y ring row bajar es mejorar). El número es la
  **mediana** ("cambio típico"): un dato mal escrito (minutos por segundos) no mueve al grupo.
- **Composición:** peso y % de grasa promedio, kg de grasa perdidos, y promedio del grupo por bloque
  SRXFIT de 9 semanas (% grasa, press banca, sentadilla).
- **En qué estamos fallando:** mensajes automáticos (nadie mejoró X, solo N% mejoró, no bajan grasa,
  poca cobertura, socios sin datos).
- **Sin datos en dos ciclos** (18 semanas): pagan y asisten (≥ 4 visitas en 30 días) sin datos.
  Cada mañana (cron de tareas, 5:00) se crea "Evaluar a X" en el pool de la sede (máx. 10 por sede
  por día, una por socio por bloque) y se avisa por push a los ADMIN de la sede.
- Primer corte real (5 oct 2026): 98 socios que pagan, 86 con datos en el ciclo, 3 sin datos en dos
  ciclos; solo 17% mejoró press banca, ring row nadie, grasa del grupo +0,1 puntos (70 socios).

Pruebas: `npm run test:evaluaciones-grupo` (incluye simulación de las tareas sin crearlas).
Pendiente: cuando el admin anota que no pudo evaluar, mandar la plantilla `socio_tests_pendientes`.
