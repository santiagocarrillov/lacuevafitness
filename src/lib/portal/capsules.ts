/**
 * 52 cápsulas educativas SRXFit — una por semana del año.
 * Contenido sintetizado del Manual Metodológico v2 (2026).
 * Rotación: capsule N = capsules[(isoWeekNumber - 1) % 52].
 */

export type Capsule = {
  number: number;
  title: string;
  readMinutes: number;
  paragraphs: string[];
};

export const CAPSULES: Capsule[] = [
  {
    number: 1,
    title: "¿Qué significa SRXFit?",
    readMinutes: 2,
    paragraphs: [
      "SRXFit = Scientifically Prescribed Fitness. Cada letra es deliberada.",
      "S — Scientifically: todo lo que programamos está respaldado por evidencia, no por tendencias. R — Prescribed: el entrenamiento se receta como un medicamento, con dosis y seguimiento. X — la intersección entre fuerza y resistencia, potencia y movilidad, rendimiento y longevidad. Fit — aptitud física real para tu vida, no solo para el gym.",
      "La meta final: que seas genuinamente apto para vivir más años con calidad.",
    ],
  },
  {
    number: 2,
    title: "Físicamente fuerte, mentalmente indestructible",
    readMinutes: 2,
    paragraphs: [
      "Indestructible no es el que aguanta más. Es el que sabe modular.",
      "El entrenamiento no solo construye músculo: construye la capacidad mental de enfrentar incomodidad, sostener esfuerzo y reconocer cuándo bajar el ritmo. Esas son habilidades que se transfieren a la vida real y a la longevidad.",
    ],
  },
  {
    number: 3,
    title: "Más difícil ≠ mejor resultado",
    readMinutes: 2,
    paragraphs: [
      "La dificultad sin propósito es solo fatiga. Quedar exhausto no es señal de progreso.",
      "El estímulo correcto, dosificado correctamente, produce la adaptación. No el agotamiento máximo. En SRXFit cada sesión tiene un objetivo fisiológico claro — y por eso a veces toca trabajar suave, aunque te quedes con ganas de más.",
    ],
  },
  {
    number: 4,
    title: "Sobrecarga progresiva: la regla #1",
    readMinutes: 2,
    paragraphs: [
      "Para que tu cuerpo cambie, el estímulo tiene que crecer poco a poco. Mismo peso, mismas reps, mismo tiempo todas las semanas = cero adaptación.",
      "La sobrecarga puede ser más peso, más reps, menos descanso, mejor técnica o mayor rango. SRXFit la lleva contabilizada a través del ciclo de 9 semanas para que el cambio sea sostenido, no errático.",
    ],
  },
  {
    number: 5,
    title: "Principio de especificidad (SAID)",
    readMinutes: 2,
    paragraphs: [
      "Specific Adaptations to Imposed Demands: el cuerpo se adapta exactamente al estímulo que recibe.",
      "Si quieres ser fuerte en sentadilla, tienes que cargar sentadilla. Si quieres correr más, tienes que correr. Las máquinas y los movimientos genéricos no transfieren a la vida real tan bien como los patrones humanos básicos.",
    ],
  },
  {
    number: 6,
    title: "Recuperación es entrenamiento",
    readMinutes: 2,
    paragraphs: [
      "Tu cuerpo no se hace fuerte mientras entrenas — se hace fuerte mientras se recupera. Sin recuperación adecuada, el estímulo se acumula como daño en vez de progreso.",
      "Sueño de calidad, proteína suficiente, días livianos y semanas de descarga (cada semana 4 del bloque) no son opcionales. Son parte de la prescripción.",
    ],
  },
  {
    number: 7,
    title: "Zona 2: ¿por qué empezamos así?",
    readMinutes: 3,
    paragraphs: [
      "Zona 2 es 60-70% de tu frecuencia cardíaca máxima — un esfuerzo donde aún puedes mantener una conversación.",
      "Parece poco, pero es donde construimos la base aeróbica: más mitocondrias, mejor uso de grasa como combustible, y un VO2 max más alto a largo plazo. Peter Attia lo llama \"el medicamento más potente que existe\".",
      "Si en el calentamiento te pedimos quedarte conversacional, no es porque seas principiante. Es la dosis correcta para esa parte de la sesión.",
    ],
  },
  {
    number: 8,
    title: "Zona 3: el umbral, donde vive la mayoría del acondicionamiento",
    readMinutes: 2,
    paragraphs: [
      "Zona 3 (70-85% FCmax) es el default del bloque de acondicionamiento. Incómodo pero sostenible 7-14 minutos.",
      "Aquí pasa lo bueno: adaptaciones cardiovasculares y metabólicas grandes, con menos riesgo de sobreentrenarte que la Zona 4. Si lograste terminar el bloque hablando entrecortado pero sin parar, lo hiciste bien.",
    ],
  },
  {
    number: 9,
    title: "Zona 4: alta intensidad, dosificada",
    readMinutes: 2,
    paragraphs: [
      "Zona 4 (85-95% FCmax) es donde no puedes mantener la conversación. Produce ganancias importantes de potencia y capacidad anaeróbica.",
      "Pero requiere más recuperación. Por eso no la usamos como default — se programa puntualmente en ciertas semanas y se respeta el descanso posterior. Más Zona 4 no es \"más entrenamiento\", es más fatiga.",
    ],
  },
  {
    number: 10,
    title: "RPE: cómo medir tu esfuerzo real",
    readMinutes: 2,
    paragraphs: [
      "RPE (Rate of Perceived Exertion) es una escala 1-10 que mide cuánto te costó un set. RPE 7 = podrías haber hecho 3 reps más. RPE 9 = solo 1 más. RPE 10 = fallo técnico.",
      "La mayoría de sets de fuerza en SRXFit se programan en RPE 7-8. Esto evita el daño acumulado del fallo constante y permite progresar semana a semana sin estancarte.",
    ],
  },
  {
    number: 11,
    title: "Los 7 patrones fundamentales del movimiento humano",
    readMinutes: 3,
    paragraphs: [
      "Empujar, jalar, sentadilla, bisagra de cadera, unilateral, rotación y cargar/transportar.",
      "Todos los movimientos de la vida real son combinaciones de estos siete. Por eso la semana de SRXFit los cubre todos: cada día tiene su patrón estrella, y el sábado integra. Si entrenas todos los patrones, tu cuerpo se vuelve apto para casi cualquier demanda física que la vida te ponga.",
    ],
  },
  {
    number: 12,
    title: "Estabilidad proximal, movilidad distal",
    readMinutes: 2,
    paragraphs: [
      "El core (zona media) tiene que ser estable. Caderas y hombros tienen que ser móviles. Si inviertes esta regla — core flojo y articulaciones rígidas — empiezan las lesiones.",
      "Por eso cada sesión tiene activación específica del core y movilidad dirigida de cadera/hombro. No es relleno: es la base de un cuerpo que dura décadas.",
    ],
  },
  {
    number: 13,
    title: "Por qué medimos cintura, no solo peso",
    readMinutes: 2,
    paragraphs: [
      "La cintura mide grasa visceral — la que rodea órganos. Esa grasa es metabólicamente activa y aumenta riesgo cardiovascular incluso si tu peso es \"normal\".",
      "El ratio cintura/altura es un predictor más robusto que el IMC. Meta saludable: <0.5 (mujeres y hombres). Si está sobre 0.5, hay margen para reducir grasa visceral con entrenamiento y alimentación, aunque el peso en kg no se mueva mucho.",
    ],
  },
  {
    number: 14,
    title: "El IMC tiene límites importantes",
    readMinutes: 2,
    paragraphs: [
      "El IMC (peso/altura²) fue diseñado en el siglo XIX para poblaciones, no para deportistas. No distingue músculo de grasa.",
      "Un atleta musculoso puede salir \"con sobrepeso\" según IMC y estar metabólicamente impecable. Por eso siempre lo leemos junto con % grasa y cintura — los tres juntos dan una foto real de tu composición.",
    ],
  },
  {
    number: 15,
    title: "La fuerza muscular predice cuánto vives",
    readMinutes: 3,
    paragraphs: [
      "Estudios de más de 8.000 personas muestran que la fuerza de agarre y la fuerza de tren inferior predicen mortalidad mejor que el IMC, la presión arterial o el colesterol.",
      "Cada caída de un decil en fuerza muscular aumenta el riesgo de morir prematuramente entre 14% y 27%. No estamos exagerando cuando insistimos en levantar pesado de forma segura: te estás comprando años de vida funcional.",
    ],
  },
  {
    number: 16,
    title: "La sarcopenia: el enemigo silencioso después de los 35",
    readMinutes: 2,
    paragraphs: [
      "Sin entrenamiento de fuerza, pierdes entre 0.5% y 1% de masa muscular por año después de los 35. A los 60, eso es 15-25% menos músculo. Resultado: fragilidad, caídas, dependencia.",
      "La única intervención que revierte este proceso es el entrenamiento de fuerza con sobrecarga progresiva. Caminar y hacer cardio no alcanza. Hay que cargar peso.",
    ],
  },
  {
    number: 17,
    title: "VO2 max: el medicamento más potente",
    readMinutes: 3,
    paragraphs: [
      "VO2 max mide cuánto oxígeno puedes usar por minuto. Es uno de los mejores predictores de longevidad que existen.",
      "Pasar del percentil 25 al 75 de VO2 max reduce el riesgo cardiovascular más del 40%. Para mejorarlo: mucha Zona 2 constante + intervalos de alta intensidad bien dosificados. SRXFit combina las dos cosas a lo largo del ciclo.",
    ],
  },
  {
    number: 18,
    title: "Caídas: la primera causa de muerte accidental en mayores de 65",
    readMinutes: 2,
    paragraphs: [
      "La capacidad de levantarte del suelo sin apoyo predice mortalidad con precisión comparable a marcadores cardiovasculares.",
      "Por eso entrenamos movilidad funcional como componente permanente: rotación de cadera, equilibrio unilateral, control en el suelo. No es \"yoga light\". Es seguro de vida.",
    ],
  },
  {
    number: 19,
    title: "HRV: tu sistema nervioso te avisa cuándo bajar el ritmo",
    readMinutes: 3,
    paragraphs: [
      "HRV (variabilidad de la frecuencia cardíaca) refleja qué tan recuperado está tu sistema nervioso. HRV alta = recuperado. HRV baja varios días seguidos = sobreentrenamiento o estrés acumulado.",
      "Si tu HRV está deprimida una mañana, esa es una señal real de que el cuerpo necesita un día más liviano. SRXFit programa semanas de descarga (semana 4 de cada bloque) precisamente para que tu HRV se recupere y vuelvas más fuerte al siguiente bloque.",
    ],
  },
  {
    number: 20,
    title: "Los 4 bloques de cada sesión",
    readMinutes: 2,
    paragraphs: [
      "Cada clase tiene cuatro bloques no negociables: Activación (calentamiento + Zona 2), Fuerza (patrón principal del día), Acondicionamiento (metabólico, casi siempre Zona 3) y Regulación (movilidad + respiración para volver al equilibrio).",
      "Saltarte el bloque 4 es el error más común — y el que más cuesta a largo plazo. La regulación es lo que permite que el siguiente entrenamiento sea productivo.",
    ],
  },
  {
    number: 21,
    title: "Respiración como herramienta de entrenamiento",
    readMinutes: 2,
    paragraphs: [
      "La respiración no es solo \"meter aire\". Es la herramienta más potente para regular el sistema nervioso autónomo.",
      "En el bloque de regulación trabajamos respiración nasal lenta para activar el parasimpático (relajación, recuperación). Si lo haces 3-5 minutos al final de cada clase, tu HRV mejora medible en pocas semanas.",
    ],
  },
  {
    number: 22,
    title: "Densidad: progresar sin agregar carga",
    readMinutes: 2,
    paragraphs: [
      "Densidad = los mismos sets en menos tiempo. Es una forma de sobrecarga que no requiere agregar kilos.",
      "Cuando bajamos los descansos en una estación de 4 a 3 minutos, tu cuerpo recibe un estímulo mayor con la misma carga. SRXFit usa este principio especialmente cuando trabajas cerca de tus PRs y agregar peso ya sería contraproducente.",
    ],
  },
  {
    number: 23,
    title: "El bloque de 4 semanas",
    readMinutes: 2,
    paragraphs: [
      "Cada mes en SRXFit es un bloque: semanas 1-3 acumulan carga progresiva, semana 4 es descarga (volumen e intensidad reducidos).",
      "La descarga no es un castigo, es donde ocurre la adaptación. Si no hubiera semana 4, tu cuerpo se rompería antes de adaptarse. Apenas la sientes \"floja\" — pero al volver a la semana 1 del próximo bloque estarás más fuerte.",
    ],
  },
  {
    number: 24,
    title: "El ciclo de 9 semanas",
    readMinutes: 2,
    paragraphs: [
      "Tu programa se reorganiza cada 9 semanas con base en una nueva evaluación. ¿Por qué 9? Porque es el tiempo mínimo en que se ven cambios fisiológicos sostenidos sin entrar en territorio de sobreentrenamiento.",
      "Si en 9 semanas un test no mejoró, no es \"falta de esfuerzo\" — es señal de que hay que cambiar el estímulo. Esa es la razón de la reevaluación periódica.",
    ],
  },
  {
    number: 25,
    title: "Por qué evaluamos al inicio",
    readMinutes: 2,
    paragraphs: [
      "Sin evaluación de base, todo lo que sigue es adivinanza. Necesitamos saber dónde estás para prescribir bien.",
      "La batería SRXFit cubre fuerza (sentadilla, peso muerto, press), capacidad anaeróbica (Christine), aeróbica (Cooper), fuerza isométrica (dead hang, plancha) y, opcionalmente, composición corporal. Con esos números podemos diseñar tu progreso de forma realista.",
    ],
  },
  {
    number: 26,
    title: "PRs (Personal Records): tu marcador real",
    readMinutes: 2,
    paragraphs: [
      "Un PR es cuando rompes tu mejor marca anterior en cualquier test: más kilos, más metros, más segundos sosteniendo.",
      "No comparamos contra el récord del coach ni del compañero. Solo contra ti mismo. Eso es lo único que importa para saber si el entrenamiento está funcionando.",
    ],
  },
  {
    number: 27,
    title: "Proteína: el macronutriente innegociable",
    readMinutes: 3,
    paragraphs: [
      "Sin suficiente proteína, no hay reparación ni síntesis muscular. Para adultos activos, la recomendación basada en evidencia es 1.6-2.2 g de proteína por kg de peso corporal por día.",
      "Distribuirla en 3-4 comidas (≥25-30g por comida) es más efectivo que concentrarla en una sola. El desayuno proteico es especialmente importante: arranca la síntesis muscular después del ayuno nocturno.",
    ],
  },
  {
    number: 28,
    title: "Sueño: la variable más subestimada",
    readMinutes: 3,
    paragraphs: [
      "Dormir menos de 6 horas por 1 semana reduce la fuerza, deprime la testosterona, eleva el cortisol y aumenta el hambre. Es como entrenar con resaca.",
      "Apuntar a 7-9 horas de sueño consistente es la intervención no-entrenamiento de mayor retorno. Si tienes que elegir entre 1 hora más de gym o 1 hora más de sueño, casi siempre gana el sueño.",
    ],
  },
  {
    number: 29,
    title: "7,000 pasos al día fuera del gym",
    readMinutes: 2,
    paragraphs: [
      "El entrenamiento de fuerza 3-4 días por semana no compensa estar sentado las otras 23 horas del día.",
      "Apuntar a 7,000-10,000 pasos diarios reduce mortalidad por todas las causas, ayuda a controlar peso y mejora salud cardiovascular. Cuenta caminata al supermercado, subir escaleras, jugar con tu hijo. No tiene que ser ejercicio formal.",
    ],
  },
  {
    number: 30,
    title: "Ayuno nocturno e inflamación",
    readMinutes: 2,
    paragraphs: [
      "Dar al cuerpo 12-14 horas seguidas sin alimentos (incluyendo el sueño) baja la inflamación crónica y mejora marcadores metabólicos.",
      "No tiene que ser ayuno extremo: si cenas a las 8 PM y desayunas a las 8 AM, ya estás haciendo ayuno nocturno de 12 horas. Es de las intervenciones más simples y de mayor evidencia.",
    ],
  },
  {
    number: 31,
    title: "Hidratación: 30-35 ml/kg/día",
    readMinutes: 2,
    paragraphs: [
      "La regla práctica: tu peso en kg × 30-35 ml = mililitros de agua al día. Para 70 kg, eso es 2.1-2.4 litros.",
      "En días de entrenamiento intenso o calor, sumar 500-750 ml extra. La sed es un mal indicador (cuando llega, ya estás 1-2% deshidratado, y eso reduce rendimiento medible).",
    ],
  },
  {
    number: 32,
    title: "Glucosa en ayunas: ventana al metabolismo",
    readMinutes: 3,
    paragraphs: [
      "Glucosa en ayunas <100 mg/dL es ideal. 100-125 es pre-diabetes. >126 sostenido es diabetes tipo 2.",
      "El ejercicio de fuerza y el de Zona 2 mejoran la sensibilidad a la insulina — significa que tu cuerpo maneja mejor la glucosa con menos esfuerzo del páncreas. Si tu glucosa está en zona amarilla, los siguientes 9 meses de SRXFit pueden moverla a verde sin medicamentos en muchos casos.",
    ],
  },
  {
    number: 33,
    title: "Trig/HDL: el mejor marcador lipídico",
    readMinutes: 3,
    paragraphs: [
      "Más útil que el colesterol total: el cociente triglicéridos/HDL.",
      "<2 = riesgo bajo, ideal metabólico. 2-3.5 = zona amarilla. >3.5 = alto riesgo cardiovascular y resistencia a insulina. Mejora con: bajar carbohidratos refinados, aumentar Omega-3, perder grasa visceral y entrenamiento aeróbico consistente.",
    ],
  },
  {
    number: 34,
    title: "PCR ultrasensible: la inflamación silenciosa",
    readMinutes: 2,
    paragraphs: [
      "La PCR-us mide inflamación crónica de bajo grado, asociada a riesgo cardiovascular y metabólico.",
      "<1 mg/L = bajo riesgo. 1-3 = moderado. >3 = alto. Lo bajan: pérdida de grasa visceral, sueño suficiente, dieta antiinflamatoria (Omega-3, vegetales, menos ultraprocesados) y ejercicio regular.",
    ],
  },
  {
    number: 35,
    title: "Testosterona libre y entrenamiento",
    readMinutes: 2,
    paragraphs: [
      "En hombres, testosterona libre baja se asocia a fatiga, bajo deseo, pérdida de masa muscular y peor recuperación.",
      "Mejora con: entrenamiento de fuerza con cargas pesadas, sueño suficiente, suficiente grasa saludable en la dieta, manejo del estrés. El sobreentrenamiento crónico la deprime — otra razón para respetar las semanas de descarga.",
    ],
  },
  {
    number: 36,
    title: "Menopausia y entrenamiento",
    readMinutes: 3,
    paragraphs: [
      "La menopausia acelera la pérdida de masa ósea y muscular. El entrenamiento de fuerza es la intervención más efectiva para frenar esto.",
      "También ayuda con los sofocos, sueño y composición corporal. SRXFit ajusta cargas y volumen según fase (pre, peri, posmenopausia). Si entras a peri/posmenopausia, no hay razón para bajar la intensidad — al contrario.",
    ],
  },
  {
    number: 37,
    title: "Empujar y jalar: el balance que la mayoría descuida",
    readMinutes: 2,
    paragraphs: [
      "La mayoría hace mucho \"empuje\" (press banca, push ups) y poco \"jalón\" (remos, dominadas). Resultado: hombros adelantados, postura colapsada, lesiones de manguito rotador.",
      "SRXFit balancea: por cada día de empuje hay uno de jalón en la semana. Si llegas con dolor de cuello u hombro persistente, casi siempre es desbalance acumulado, no genética.",
    ],
  },
  {
    number: 38,
    title: "Bisagra de cadera: el patrón más subdesarrollado",
    readMinutes: 2,
    paragraphs: [
      "La bisagra de cadera (peso muerto, kettlebell swing) es el patrón más débil en personas que vienen del cardio o del trabajo de oficina.",
      "Es el patrón que más previene dolor lumbar a largo plazo cuando se entrena bien. La técnica importa: cadera atrás, espalda neutra, piernas algo flexionadas. No es sentadilla con peso al frente.",
    ],
  },
  {
    number: 39,
    title: "Unilateral: corrige asimetrías",
    readMinutes: 2,
    paragraphs: [
      "Trabajar una pierna o un brazo a la vez detecta y corrige asimetrías que el trabajo bilateral esconde.",
      "Si tu split squat derecho carga 30% más que el izquierdo, ese desbalance está apareciendo también en tu sentadilla, en tu caminata y eventualmente en una lesión. Por eso un día por semana es unilateral.",
    ],
  },
  {
    number: 40,
    title: "Rotación: el patrón olvidado",
    readMinutes: 2,
    paragraphs: [
      "Casi todos los movimientos del deporte real son rotacionales: lanzar, golpear, cambiar de dirección.",
      "Sin entrenamiento rotacional, perdés esa capacidad. Y el día que tengas que reaccionar al esquivar a alguien en la calle o jugar con tus hijos, tu cuerpo no estará listo. Por eso un día por semana es rotación.",
    ],
  },
  {
    number: 41,
    title: "Cargar y transportar: el rey de los patrones funcionales",
    readMinutes: 2,
    paragraphs: [
      "Caminata de granjero, carry de un lado, sandbag al hombro. Es el patrón más transferible a la vida real: cargar mercado, mudar muebles, levantar a un niño dormido.",
      "También es excelente para core (sin un solo crunch), fuerza de agarre (predictor de longevidad) y resistencia mental. Si te toca un día con carries pesados, ese día estás haciendo trabajo invisible muy valioso.",
    ],
  },
  {
    number: 42,
    title: "Fatiga central vs. periférica",
    readMinutes: 2,
    paragraphs: [
      "Hay dos tipos de fatiga: periférica (el músculo dejó de poder más) y central (el sistema nervioso pierde capacidad de reclutar fibras).",
      "Entrenar siempre a fatiga periférica (al fallo) acumula daño y deprime el sistema nervioso. Por eso programamos la mayoría de sets en RPE 7-8 — dejamos margen, el sistema nervioso se preserva, y puedes entrenar fuerte la siguiente sesión.",
    ],
  },
  {
    number: 43,
    title: "Aprendizaje motor: por qué la técnica se repite tanto",
    readMinutes: 3,
    paragraphs: [
      "Un patrón motor se automatiza después de 3,000-10,000 repeticiones bien hechas. Por eso un coach te corrige lo mismo varias veces — no por molestar, sino porque el sistema nervioso necesita la repetición.",
      "Practicar la técnica con poco peso al inicio de un ciclo es más valioso que apurarse a cargar pesado con mala forma. Lo segundo lesiona, lo primero construye base.",
    ],
  },
  {
    number: 44,
    title: "Variabilidad óptima ≠ aleatoriedad",
    readMinutes: 2,
    paragraphs: [
      "Cambiar la rutina cada día (lo que hacen muchas clases) no es \"variedad inteligente\" — es aleatoriedad que impide la sobrecarga progresiva.",
      "SRXFit varía dentro de estructura: los patrones se mantienen, las cargas progresan, los accesorios rotan. El cerebro recibe novedad suficiente para no aburrirse, y el cuerpo recibe consistencia suficiente para adaptarse.",
    ],
  },
  {
    number: 45,
    title: "Movilidad funcional vs. estiramientos pasivos",
    readMinutes: 2,
    paragraphs: [
      "Movilidad ≠ flexibilidad. Movilidad es rango de movimiento útil con control. Flexibilidad es solo rango pasivo.",
      "La movilidad que importa para entrenar y prevenir lesiones: cadera profunda, hombros sobre la cabeza, columna torácica, tobillos en dorsiflexión. Por eso las activaciones de cada día atacan articulaciones específicas con drills, no con \"estirar y aguantar\".",
    ],
  },
  {
    number: 46,
    title: "Carbohidratos: amigos del entrenamiento",
    readMinutes: 2,
    paragraphs: [
      "Los carbohidratos son el combustible principal para esfuerzos de alta intensidad. En días de entrenamiento intenso necesitas más que en días de descanso.",
      "Mejor fuente: vegetales, frutas, tubérculos, granos integrales. Los ultraprocesados (galletas, pan blanco, gaseosas) suben glucosa rápido y caen rápido — energía inestable. Sincronizar carbos con sesiones intensas funciona mejor que cortarlos en seco.",
    ],
  },
  {
    number: 47,
    title: "Cafeína: ayuda real, dentro de límites",
    readMinutes: 2,
    paragraphs: [
      "Cafeína 3-6 mg/kg, 30-60 minutos antes de entrenar, mejora rendimiento de forma medible (fuerza, potencia, resistencia).",
      "Pero después de las 2 PM corta el sueño profundo aunque te duermas igual. Si te entrenas en la noche, evita cafeína. Si te entrenas temprano, aprovéchala — es legal, barata y eficaz.",
    ],
  },
  {
    number: 48,
    title: "Estrés crónico: el ladrón silencioso de adaptaciones",
    readMinutes: 3,
    paragraphs: [
      "El estrés laboral o emocional crónico eleva cortisol, deprime hormonas anabólicas, reduce sueño y aumenta inflamación. Resultado: por más que entrenes, no progresas.",
      "Si estás en una semana de mucho estrés, bajar el volumen de entrenamiento (no aumentarlo) es lo correcto. El cuerpo trata todo estrés igual — laboral, emocional o físico. La suma total tiene que ser sostenible.",
    ],
  },
  {
    number: 49,
    title: "Por qué cada 9 semanas pesamos diferentes cosas",
    readMinutes: 2,
    paragraphs: [
      "La reevaluación cada 9 semanas no es solo \"medir lo mismo otra vez\". Es ajustar la prescripción.",
      "Si tu sentadilla subió 15% pero tu Cooper bajó, hay que rebalancear hacia aeróbico. Si tu cintura no cedió, hay que revisar nutrición. La evaluación es la base de decisiones, no un trámite.",
    ],
  },
  {
    number: 50,
    title: "Estética como consecuencia, no como objetivo",
    readMinutes: 3,
    paragraphs: [
      "Entrenar para verte bien funciona corto plazo, pero falla cuando no ves resultados rápidos o cuando envejeces.",
      "Entrenar para ser fuerte, capaz y sano construye un cuerpo que se ve bien como consecuencia — y dura décadas. La estética llega de pasada. La capacidad se queda.",
    ],
  },
  {
    number: 51,
    title: "Constancia >> intensidad",
    readMinutes: 2,
    paragraphs: [
      "3 entrenamientos por semana durante 5 años transforma tu cuerpo más que 6 entrenamientos durante 6 meses con burnout y abandono.",
      "La adherencia es la variable que más correlaciona con resultados a largo plazo. Por eso preferimos sesiones que termines bien a sesiones que te destrocen y te hagan faltar 3 días.",
    ],
  },
  {
    number: 52,
    title: "Envejecer es inevitable. Envejecer mal es opcional.",
    readMinutes: 2,
    paragraphs: [
      "Los rangos de salud y composición se ajustan por edad porque el cuerpo cambia. Pero estar en zona verde a los 55+ es estar en el top 10% de tu grupo etario.",
      "Cada decisión hoy — el entrenamiento, las horas de sueño, lo que comes — es un voto a favor de quién serás en 10, 20, 30 años. No estamos entrenando para esta semana. Estamos entrenando para décadas.",
    ],
  },
];

/**
 * Returns the capsule for the current ISO week, rotating through all 52.
 */
export function capsuleForWeek(date: Date = new Date()): Capsule {
  const week = isoWeekNumber(date);
  const idx = (week - 1) % CAPSULES.length;
  return CAPSULES[idx];
}

function isoWeekNumber(d: Date): number {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.getTime();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.getTime()) / (7 * 86400000));
}
