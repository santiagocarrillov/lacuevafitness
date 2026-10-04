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

## Panel de evaluación y avance ponderado (oct 2026)

- **Panel en la misma pantalla:** el nombre del socio o «Iniciar / Ver» abre `?socio=<id>` sobre Evaluaciones:
  composición corporal | fuerza | acondicionamiento + olímpicos (opcionales) + observaciones + historial.
  Cada dato se guarda solo al salir del campo (`saveEvalTest`, `saveEvalBodyField`, `saveEvalSummary` en
  `src/lib/actions/srxfit.ts`); no hay botón «Guardar evaluación». Esc cierra; ← → pasan al socio anterior/siguiente
  en el orden de la tabla. `/dashboard/srxfit/evaluaciones/[memberId]` redirige al panel.
- **Qué evaluación edita:** la última que empezó dentro del período o en los últimos 21 días
  (`src/lib/srxfit/eval-panel.ts`). Si no hay, el primer dato la crea (inicial si nunca tuvo, si no re-evaluación).
- **Avance ponderado** (`src/lib/srxfit/eval-score.ts`, prueba `npm run test:eval-score`): peso 10, % grasa 10,
  sentadilla 10, peso muerto 10, press banca 5, push press 5, dominadas o ring row 10, plancha 5, dead hang 5,
  Christine 15, Cooper 15. **≥ 60 % = evaluado.** Los olímpicos no suman. Al cruzar el 60 % se marca `completedAt`
  (y se quita si baja), así el portal y el resumen del hub siguen funcionando.
- Medidores, conteos y tabla salen de la misma lista (`getMembersEvalStatus`), así que siempre coinciden.
