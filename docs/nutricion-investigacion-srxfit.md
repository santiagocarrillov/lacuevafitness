# Investigación: modelos de plan de nutrición compatibles con SRXFIT

*La Cueva Fitness Center · La Cueva Xtreme — Quito. Preparado el 27 sep 2026.*

**Regla de este documento:** cada cifra lleva su fuente. Cuando un número sale de una cuenta hecha aquí con datos citados (por ejemplo, sumar porciones), se marca como *cálculo propio*. Si algo es una propuesta de diseño y no evidencia, se dice.

---

## 0. Resumen ejecutivo

- **SRXFIT ya trae la estructura que necesita un buen programa de nutrición:** diagnóstico (bioimpedancia en la semana 1), dosis (prescripción) y re-medición cada 9 semanas. Lo que falta es aplicar a la comida la misma lógica de prescribir y medir.
- **La evidencia es bastante coherente.** Lo que más pesa en la composición corporal es la energía total y la proteína, junto con el entrenamiento de fuerza. La distribución y el horario de las comidas importan menos, y los suplementos todavía menos ([ISSN, Aragon 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5470183/)). Ninguna dieta de marca le gana a otra cuando se igualan calorías y proteína. Lo que predice el resultado es la adherencia ([DIETFITS](https://jamanetwork.com/journals/jama/fullarticle/2673150), [Dansinger 2005](https://pubmed.ncbi.nlm.nih.gov/15632335/)).
- **Propuesta:** un **sistema por niveles** con un solo lenguaje. La base es el **Plato SRXFIT con porciones de la mano**, y el diario detallado queda como opción para quien lo quiera. En medio van los **intercambios** y las **plantillas por kcal**, que la app ya soporta. La **periodización por días de carga** es un ajuste opcional encima de todo lo anterior.
- **Hallazgo concreto en la app:** la calculadora (`src/lib/nutrition/calc.ts`) fija la proteína por kg de **peso total** (2,0–2,2 g/kg en déficit). En socios con obesidad eso sobreestima mucho la necesidad. Conviene usar un peso de referencia con tope en IMC 30, o la masa libre de grasa de la bioimpedancia ([Weijs 2024](https://pubmed.ncbi.nlm.nih.gov/39514335/)). Ver §2.1.
- **El "detox" no tiene respaldo** ([Klein & Kiat 2015](https://onlinelibrary.wiley.com/doi/10.1111/jhn.12286)). Un ebook de batidos verdes se puede reposicionar honestamente como "30 días sumando verduras y fibra", sin prometer que desintoxica (§3).

---

## 1. Paso 1 — Qué dice SRXFIT que importa para nutrición

Fuentes: *SRXFit_Metodologia_v1 2026.docx* y *SRXFit_Onboarding_Evaluacion_v1.docx* (documentos internos).

1. **Primero el diagnóstico, después la prescripción.** "No se puede prescribir sin diagnóstico": la evaluación de ingreso combina composición corporal y capacidades físicas. La **consulta nutricional con bioimpedancia** (% grasa, masa muscular, agua, metabolismo basal, grasa visceral, edad metabólica) se agenda en la **semana 1**, en paralelo a las clases y sin ser requisito para empezar a entrenar.
2. **Medición cada 9 semanas.** El bloque dura 9 semanas: 2 mesociclos de 4 semanas más 1 de re-evaluación. La hoja de re-evaluación ya compara **% grasa, masa muscular y peso** junto a los tests de fuerza, Christine y Cooper. La entrega de resultados de la semana 9 se describe como "la oportunidad más poderosa de retención del ciclo". **La nutrición debería funcionar en el mismo ciclo de 9 semanas y reportar los mismos deltas.**
3. **La composición corporal es consecuencia, no el objetivo.** La composición corporal favorable "no se persigue directamente con restricción ni con volumen excesivo". En nutrición eso se traduce en **déficits moderados, proteína suficiente y nada de dietas extremas**.
4. **La recuperación es una variable de prescripción.** La semana 4 de cada mesociclo es "Recuperar". El sueño y la HRV aparecen como marcadores, y el sobreentrenamiento se trata como "error de dosificación". La nutrición tiene que **sostener la recuperación**, no competir con ella.
5. **Periodización por bloques y entrenamiento concurrente.** El mesociclo sigue Aprender → Desarrollar → Desafiar → Recuperar. La semana tipo va de A a E: A bisagra, B empuje, C sentadilla/potencia, D mixto/potencia (tipo Christine) y E Zona 2 larga. La carga cambia por día y por semana, y eso da pie a un **"combustible según el trabajo"**.
6. **Población de 30–60 años (núcleo 35–50) con objetivos mixtos.** El método reconoce diferencias hormonales y de recuperación entre décadas y pone la **pérdida de masa muscular desde los 35** como un riesgo central. Proteína adecuada y mejor repartida en el día es coherente con eso.
7. **Individualizar dentro del grupo ("scaling").** Todos siguen un sistema común y cada uno recibe su ajuste. En nutrición eso son **plantillas estándar con ajustes individuales**, no un plan artesanal para cada persona.
8. **Basado en evidencia y "coach-proof".** La calidad está codificada en el sistema, no en quien lo ejecuta ese día. Para nutrición, eso pide **reglas simples y plantillas** que no dependan de la memoria de la nutricionista.

---

## 2. Rangos concretos con cita (Paso 2b)

### 2.1 Proteína

| Situación | Rango | Fuente |
|---|---|---|
| Personas que entrenan, en general (ganar o mantener músculo) | **1,4–2,0 g/kg/día** | [ISSN — Jäger 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/) |
| Punto donde deja de sumar masa magra con entrenamiento de fuerza | **~1,6 g/kg/día** (IC95 hasta ~2,2) | [Morton 2018, BJSM](https://pubmed.ncbi.nlm.nih.gov/28698222/) |
| Déficit calórico en personas **entrenadas y magras** | **2,3–3,1 g/kg de masa libre de grasa** | [Helms 2014](https://www.researchgate.net/publication/257350851_A_Systematic_Review_of_Dietary_Protein_During_Caloric_Restriction_in_Resistance_Trained_Lean_Athletes_A_Case_for_Higher_Intakes); retomado por [ISSN 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/) |
| Déficit en atletas de físico | **1,8–2,7 g/kg** | [Roberts, Helms et al. 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7052702/) |
| Recomposición (bajar grasa y ganar músculo a la vez) | **1,6–2,4 g/kg**, con balance energético cerca del mantenimiento | [Barakat 2020](https://journals.lww.com/nsca-scj/Fulltext/2020/10000/Body_Recomposition__Can_Trained_Individuals_Build.3.aspx) |
| Superávit (ganar músculo) | **1,6–2,2 g/kg** | [Iraki 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6680710/) |
| **Personas con obesidad** | **≥1,2 g/kg**, calculado con un peso de referencia con **tope en IMC 30**, o expresado por kg de masa libre de grasa | [Weijs 2024](https://pubmed.ncbi.nlm.nih.gov/39514335/) |
| Mayores de 65 | **1,0–1,2 g/kg**; **25–30 g por comida** (~2,5–2,8 g de leucina) | [PROT-AGE, Bauer 2013](https://pubmed.ncbi.nlm.nih.gov/23867520/) |

**Cómo repartirla en el día**
- **0,25 g/kg o 20–40 g por toma, cada 3–4 h**, con 700–3000 mg de leucina por toma ([ISSN 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/); [Kerksick 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5596471/): 0,25–0,40 g/kg por toma).
- Para exprimir el efecto anabólico: **0,4 g/kg por comida en al menos 4 comidas**, lo que suma al menos 1,6 g/kg/día ([Schoenfeld & Aragon 2018](https://pubmed.ncbi.nlm.nih.gov/29497353/)).
- Opcional: **30–40 g de caseína antes de dormir** ([ISSN 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/)).

**Implicación para la app.** Hoy `calc.ts` usa 2,2 g/kg (bajar grasa rápido), 2,0 (bajar grasa o recomposición), 1,8 (ganar) y 1,6 (mantener), siempre sobre el **peso total**.
- Ejemplo, *cálculo propio*: una socia de 95 kg y 1,60 m (IMC ≈ 37) recibiría 2,2 × 95 = **209 g/día**.
- Con el criterio de Weijs, el peso de referencia se topa en IMC 30: 30 × 1,60² ≈ 76,8 kg. Con 1,6 g/kg salen **≈ 123 g/día**.
- **Recomendación:** si el IMC pasa de 30, calcular la proteína con el peso topado en IMC 30, o usar g/kg de masa libre de grasa cuando haya bioimpedancia. Esa es justamente la cifra que ya mide la nutricionista.

### 2.2 Déficit y velocidad de pérdida

- **Tamaño del déficit:**
  - Guía clínica AHA/ACC/TOS: **500–750 kcal/día**, o 1.200–1.500 kcal/día en mujeres y 1.500–1.800 en hombres ajustando por peso.
  - Una reducción de **500–1.000 kcal/día** produce en promedio **0,5–1,0 kg/semana** ([AHA/ACC/TOS 2013](https://www.ahajournals.org/doi/10.1161/01.cir.0000437739.71477.ee)).
- **Porcentaje de peso por semana:**
  - En atletas, bajar **0,7 %/semana** (con ~19 % menos energía) preservó mejor la masa magra y la fuerza que bajar 1,4 %/semana (con ~30 % menos) ([Garthe 2011](https://pubmed.ncbi.nlm.nih.gov/21558571/)).
  - La ISSN recoge **0,5–1,0 % del peso por semana**.
  - Además: **cuanto más grasa corporal de partida, más agresivo puede ser el déficit**, y cuanto más magra la persona, más lento conviene ir ([ISSN, Aragon 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5470183/)).
- **Coherencia con la app:** los déficits de la calculadora (20 % "rápido", 12 % "suave", 5 % recomposición) caen dentro de lo que respalda Garthe (~19 %). **Propuesta:** usar el 20 % solo cuando el % de grasa es alto, y el 12 % como punto de partida por defecto.
- **Superávit para ganar músculo:** **~10–20 % sobre el mantenimiento**, buscando **0,25–0,5 % del peso por semana** en novatos e intermedios. Los avanzados, más conservadores ([Iraki 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6680710/)). La app usa +10 %, que es coherente.
- **La fuerza protege el músculo en déficit:**
  - En adultos de mediana edad y mayores, el ejercicio ayuda a preservar masa libre de grasa durante la restricción ([Weinheimer 2010](https://pubmed.ncbi.nlm.nih.gov/20591106/)).
  - Un meta-análisis estimó que el entrenamiento de fuerza evitó el **93,5 %** de la masa magra que se pierde con la restricción calórica en adultos mayores con obesidad ([Sardeli 2018](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5946208/)).
  - Buen argumento para vender "nutrición + SRXFIT" frente a "dieta sola".

### 2.3 Carbohidratos y grasas

- **Referencia para rendimiento** ([ACSM / Academy of Nutrition and Dietetics / Dietitians of Canada, 2016](https://www.dietitians.ca/DietitiansOfCanada/media/Documents/Resources/noap-position-paper.pdf?ext=.pdf)):
  - Actividad ligera o técnica: **3–5 g/kg/día**.
  - Programa moderado (~1 h/día): **5–7 g/kg/día**.
  - Estos rangos están pensados para atletas. Para socios que buscan bajar grasa, el carbohidrato es **lo que queda del presupuesto** una vez fijadas la proteína y la grasa.
- **Estilo de dieta:** bajo en grasa, bajo en carbohidratos o cualquier punto intermedio da resultados parecidos en composición corporal. Con proteína y calorías igualadas, la dieta cetogénica no mostró ventaja de pérdida de grasa ([ISSN, Aragon 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5470183/); [DIETFITS, Gardner 2018](https://jamanetwork.com/journals/jama/fullarticle/2673150)).
- **Grasa en fase de definición (atletas de físico):** **10–25 % de las kcal**, con advertencia expresa contra quedarse en valores muy bajos por mucho tiempo ([Roberts 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7052702/)).
- **Grasa fuera de la definición:** **0,5–1,5 g/kg/día** ([Iraki 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6680710/)).
- La app asume 27 % de grasa por defecto, dentro de rangos razonables para población general.

### 2.4 Fibra, frutas y verduras, azúcar y sal

- **Fibra:** **25–29 g/día** es adecuado, y por encima de **30 g/día** hay beneficio adicional. Comparando a quienes más fibra comen con quienes menos, la mortalidad total y cardiovascular es **15–30 % menor** ([Reynolds 2019, The Lancet](https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(18)31809-9/fulltext)).
- **Frutas y verduras:** al menos **400 g/día (5 porciones)**.
- **Azúcares libres:** menos del **10 % de la energía**, e idealmente menos del 5 %.
- **Sal:** menos de **5 g/día** ([OMS, Alimentación sana](https://www.who.int/news-room/fact-sheets/detail/healthy-diet)).
- **Ultraprocesados:** en un ensayo con pacientes internados, una dieta ultraprocesada llevó a comer **~508 kcal/día más**, con **+0,9 kg en 2 semanas**. La dieta sin procesar produjo −0,9 kg ([Hall 2019](https://pubmed.ncbi.nlm.nih.gov/31105044/)). Coincide con el mensaje 6 de las GABA de Ecuador.

### 2.5 Hidratación

- **Ingesta total adecuada:** **2,0 L/día** en mujeres y **2,5 L/día** en hombres, sumando agua de bebidas y alimentos ([EFSA 2010](https://efsa.onlinelibrary.wiley.com/doi/10.2903/j.efsa.2010.1459)).
- **Mensaje país:** "Tomemos **8 vasos de agua segura** durante el día" ([GABA Ecuador, mensaje 5](https://www.fao.org/nutrition/education/dietary-guidelines/regions/ecuador/en/)).
- **Antes de entrenar:** **5–10 mL/kg entre 2 y 4 h antes**, buscando orina amarillo pálido.
- **Después de entrenar:** reponer **1,25–1,5 L por cada kg perdido**.
- **Límite de deshidratación:** evitar déficits de agua mayores al **2 % del peso** ([ACSM joint 2016](https://www.dietitians.ca/DietitiansOfCanada/media/Documents/Resources/noap-position-paper.pdf?ext=.pdf); [ACSM 2007](https://pubmed.ncbi.nlm.nih.gov/17277604/)).
- *Nota:* no encontré una fuente seria con cifras específicas de agua para alguien **aclimatado** a 2.800 m. No se incluye número. La regla práctica sigue siendo orina clara y beber según la sed.

### 2.6 Antes y después de entrenar

- **Lo principal es cubrir la proteína del día**, repartida más o menos cada 3 h ([Kerksick 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5596471/)).
- **Después de entrenar:** proteína de buena calidad **desde inmediatamente hasta 2 h después**. Cuánta proteína hace falta después depende del tamaño y el momento de la comida previa ([Kerksick 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5596471/)).
- **Antes de sesiones de más de 60 min:** **1–4 g/kg de carbohidrato entre 1 y 4 h antes**. Si la energía total del día está cubierta, el patrón puede guiarse por comodidad ([ACSM joint 2016](https://www.dietitians.ca/DietitiansOfCanada/media/Documents/Resources/noap-position-paper.pdf?ext=.pdf)). Una clase SRXFIT de ~60 min no exige estrategias especiales: basta una comida normal 2–3 h antes o un snack ligero.
- **Cafeína:** **3–6 mg/kg** mejora el rendimiento en muchos estudios, aunque no en todos ([ISSN, Guest 2021](https://doaj.org/article/a1068ad28ad547e6aa8a91845065b6f8)).

### 2.7 Creatina

- **Carga rápida:** ~**0,3 g/kg/día** (≈ 5 g cuatro veces al día) durante **5–7 días**, y después **3–5 g/día** de mantenimiento.
- **Sin carga:** **3–5 g/día** saturan el músculo en **3–4 semanas** ([ISSN, Kreider 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5469049/)).
- **Seguridad:** hasta **30 g/día durante 5 años** es seguro en personas sanas. El único efecto secundario consistente es **subir de peso** por retención de agua (~0,5–1,0 L al cargar; [Kreider 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5469049/)), típicamente **1–2 kg** ([Roberts 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7052702/)).
- **Implicación operativa:** avisar al socio que puede subir 1–2 kg en la balanza y que **la bioimpedancia puede leer más agua o masa magra**. Así no se interpreta como "engordé".

### 2.8 Ayuno intermitente

- En conjunto, la restricción calórica intermitente **no mostró ventaja** sobre la restricción diaria para la composición corporal. Se puede elegir por preferencia y tolerancia ([ISSN, Aragon 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5470183/)).
- **TREAT** (16:8, 12 semanas, n = 116): no fue más eficaz que 3 comidas estructuradas. El grupo que ayunó perdió más masa magra apendicular (−0,16 kg/m² frente al control) ([Lowe 2020](https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/2771095)).
- **TREATY** (12 meses, n = 139, ambos grupos con restricción calórica): −8,0 kg frente a −6,3 kg, **diferencia no significativa** ([Liu 2022, NEJM](https://www.nejm.org/doi/full/10.1056/NEJMoa2114833)).
- **Postura SRXFIT:** el ayuno es permitido como preferencia, **no se prescribe**. Si alguien ayuna, igual tiene que llegar a su proteína con al menos 3 tomas. Con menos comidas cuesta más alcanzar 4 × 0,4 g/kg.

### 2.9 Pausas de dieta y periodización del déficit

- **MATADOR:** hombres con obesidad alternando 2 semanas de déficit con 2 de balance energético. Perdieron **más peso y grasa** que con déficit continuo ([Byrne 2018](https://www.nature.com/articles/ijo2017206)).
- **ICECAP:** personas entrenadas. La dieta intermitente al 25 % **no mejoró** la composición corporal frente al déficit continuo ([Peos 2021](https://www.researchgate.net/publication/349347390_Continuous_versus_Intermittent_Dieting_for_Fat_Loss_and_Fat-Free_Mass_Retention_in_Resistance-trained_Adults_The_ICECAP_Trial)). Un análisis secundario encontró mejor resistencia muscular después de una pausa de 1 semana ([PLOS One 2021](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7906362/)).
- **Lectura:** las pausas no son mágicas, pero tampoco perjudican. Pueden servir para **adherencia y rendimiento**. Encajan de forma natural con la **semana 4 (Recuperar)** del mesociclo.

### 2.10 Dietas completas con evidencia de salud

- **Mediterránea:**
  - En PREDIMED, la versión suplementada con aceite de oliva extra virgen o frutos secos, sin restricción calórica, bajó **30 %** en términos relativos los eventos cardiovasculares mayores (**1,7–2,1** puntos porcentuales en absoluto) frente a una dieta baja en grasa ([Estruch 2018, NEJM](https://www.nejm.org/doi/full/10.1056/NEJMoa1800389)).
  - A 12 meses o más, hizo perder más peso que las dietas bajas en grasa, pero no más que otras dietas comparadas ([Mancini 2016](https://www.amjmed.com/article/S0002-9343(15)30027-9/fulltext)).
- **Patrón Harvard (Healthy Eating Plate):** ½ plato de verduras y frutas, ¼ de granos integrales y ¼ de proteína saludable, con aceites vegetales ([Harvard T.H. Chan](https://nutritionsource.hsph.harvard.edu/healthy-eating-plate/)).

### 2.11 Registrar lo que comes y flexibilidad

- **Registro:** en una revisión sistemática de 15 estudios, registrar la dieta se asoció de forma significativa con bajar de peso. Quienes registraban con más constancia perdieron más ([Burke 2011](https://www.jandonline.org/article/s0002-8223(10)01644-5/abstract)). Esto respalda el diario y el semáforo.
- **Flexibilidad:** en 188 mujeres sin obesidad, el **control rígido** de la alimentación se asoció con **más antojos**. El control flexible no mostró esa relación ([Stewart 2002](https://pubmed.ncbi.nlm.nih.gov/11883916/)).
- **Adherencia:** con cuatro dietas populares (Atkins, Ornish, Weight Watchers y Zone), la **adherencia sostenida**, no el tipo de dieta, fue el predictor fuerte ([Dansinger 2005](https://pubmed.ncbi.nlm.nih.gov/15632335/)).

---

## 3. Qué NO recomendar, o cómo reencuadrarlo (Paso 2c)

| Práctica | Qué dice la evidencia | Cómo lo decimos en SRXFIT |
|---|---|---|
| **"Detox" / "limpieza"** | Hay muy poca evidencia clínica. **No existen ensayos aleatorizados** de dietas detox comerciales en humanos, y los estudios que hay tienen fallas de método y muestras pequeñas ([Klein & Kiat 2015](https://onlinelibrary.wiley.com/doi/10.1111/jhn.12286)). El hígado y los riñones hacen ese trabajo. | No usamos la palabra "detox". Hablamos de **"más verduras, más fibra, menos ultraprocesados"**. |
| **Jugos colados en lugar de fruta entera** | El jugo de extractor tiene menos fibra ([Harvard Nutrition Source](https://nutritionsource.hsph.harvard.edu/common-questions-fruits-vegetables/)). En cohortes, ≥1 porción/día de jugo se asoció con **hasta +21 %** de riesgo de diabetes tipo 2, mientras que ciertas frutas enteras se asociaron con **hasta −23 %** ([Muraki 2013, BMJ](https://news.harvard.edu/gazette/story/2013/08/reduce-type-2-diabetes-risk/)). | Fruta **entera**. Si es batido, **licuado con la pulpa**, no colado. |
| **Batidos verdes en exceso** | Hay casos de **nefropatía por oxalato** tras "limpiezas" con jugos de espinaca y otras hojas, en personas con factores de riesgo (bypass gástrico, antibióticos prolongados) ([AJKD 2018](https://pubmed.ncbi.nlm.nih.gov/29203127/)). | Rotar las hojas, no hacer "megadosis" de espinaca, y **nada de batidos exclusivos**. Quien tenga enfermedad renal o cirugía bariátrica consulta primero con la nutricionista. |
| **Déficits agresivos o "retos" de pocas calorías** | Perder más rápido que ~1 %/semana en personas entrenadas sacrificó masa magra y fuerza ([Garthe 2011](https://pubmed.ncbi.nlm.nih.gov/21558571/)). | "Si tu fuerza cae en la semana 9, el déficit estaba mal dosificado." Es el mismo lenguaje SRXFIT. |
| **Prohibir grupos enteros de alimentos** (carbohidrato "malo") | Con calorías y proteína igualadas no hay ventaja real ([ISSN 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5470183/)). El control rígido se asocia con más antojos ([Stewart 2002](https://pubmed.ncbi.nlm.nih.gov/11883916/)). | "No hay alimentos prohibidos: hay **porciones y frecuencia**." |
| **Ayuno como "truco metabólico"** | No da ventaja sobre la restricción diaria. En TREAT hubo más pérdida de masa magra ([Lowe 2020](https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/2771095)). | Es opción de estilo de vida, no una prescripción. |

### Cómo reposicionar el ebook "30 días detox" de batidos verdes

- **Nuevo nombre (propuesta):** *"30 días de batidos verdes SRXFIT: +verduras, +fibra, +proteína"*.
- **Promesa honesta:** "Un hábito fácil para sumar 1–2 porciones de verdura y fruta al día y acercarte a la meta de 400 g de frutas y verduras de la OMS y a los 25–30 g de fibra" ([OMS](https://www.who.int/news-room/fact-sheets/detail/healthy-diet); [Reynolds 2019](https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(18)31809-9/fulltext)).
- **Qué quitar:** toda frase sobre "toxinas", "limpiar el hígado", "alcalinizar" o "bajar X kg en 30 días".
- **Qué cambiar en las recetas:**
  1. Añadir una **fuente de proteína** a cada batido: yogur natural o griego, leche, o proteína en polvo. Así funciona como desayuno o snack post-entreno y no como un vaso de azúcar.
  2. Usar **fruta entera licuada**, nunca colada.
  3. **Rotar las hojas** (espinaca, acelga, lechuga, apio, pepino) en lugar de espinaca todos los días.
  4. Declarar las kcal de cada receta para que encaje en la plantilla.
- **Descargo breve:** "Complementa tus comidas, no las reemplaza. Si tienes enfermedad renal o cirugía bariátrica, consulta a la nutricionista antes."
- **Dentro de la app:** cargarlo como **Recetas** con sus macros y como **NutritionTips** (cápsulas), no como un "plan" aparte.

---

## 4. Los modelos de plan (Paso 2a)

Contexto operativo: **1 nutricionista y ~130 socios**. *Cálculo propio:* re-medir a todos cada 9 semanas son ~130 bioimpedancias por bloque, **unas 14–15 por semana**. La nutricionista no puede escribir 130 planes a mano. Hace falta un sistema de plantillas y niveles.

### Modelo A — **Plato SRXFIT + porciones con la mano** (base para todos)

- **Qué es:** cada comida se arma con la mano del propio socio. Estas son las porciones y el aporte aproximado por porción, en versión mujer / hombre ([Precision Nutrition](https://www.precisionnutrition.com/hand-portion-math-to-track-macros)):

  | Porción | Grupo | Aporte aproximado (mujer / hombre) |
  |---|---|---|
  | Palma | Proteína | ~22 / 24 g de proteína, ~130 / 145 kcal |
  | Puño | Verduras | ~25 kcal |
  | Mano ahuecada | Almidón | ~110 / 120 kcal |
  | Pulgar | Grasa | ~90 / 100 kcal |

- **Porciones de partida por comida:** mujeres 1-1-1-1, hombres 2-2-2-2 ([Precision Nutrition](https://www.precisionnutrition.com/calorie-control-guide)).
- **Cuánto da eso al día (*cálculo propio*):** 4 comidas × 1-1-1-1 en mujer son **≈ 1.420 kcal y ≈ 114 g de proteína**. Es un punto de partida que se ajusta con los resultados. PN sugiere quitar o sumar 1 mano de almidón o 1 pulgar de grasa en algunas comidas.
- **Precisión:**
  - Estimar con la mano (método del ancho de dedos) dejó el **80 %** de los alimentos de forma geométrica dentro de ±25 % del peso real. Con medidas caseras fue el 29 % ([Gibson 2016](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4976119/)).
  - Es menos preciso con platos mixtos o cocidos.
  - Un estudio de 2025 en adultos en vida libre halló correlaciones moderadas a fuertes con lo que realmente comieron ([Appetite 2025](https://pubmed.ncbi.nlm.nih.gov/40669561/)).
- **Pros:**
  - No hay que pesar ni tener la app abierta. Funciona igual en un almuerzo ejecutivo o donde la abuela.
  - Encaja con el plato que ya enseñan las GABA ("menestras con cereal", verduras en cada comida).
  - Escala a 130 personas sin esfuerzo extra.
- **Contras:** es menos preciso para quien está cerca de su meta o busca un objetivo estético fino. Al principio subestima las grasas "escondidas" (fritura, manteca).
- **Para quién:** **la mayoría de socios**, sobre todo en su primer bloque de 9 semanas.

### Modelo B — **Intercambios por grupo** (sistema tipo SMAE)

- **Qué es:** la nutricionista prescribe "equivalentes" por comida, por ejemplo 2 proteínas + 2 almidones + 1 grasa + verduras libres, y el socio elige qué alimento usar dentro de cada grupo.
- **Referencia regional,** el Sistema Mexicano de Alimentos Equivalentes ([SMAE, Pérez Lizaur 2014, vía UNAM](https://fisiologia.facmed.unam.mx/wp-content/uploads/2019/02/2-Valoraci%C3%B3n-nutricional-Anexos.pdf)):
  - Verdura: 25 kcal (2 g de proteína, 4 g de carbohidrato).
  - Fruta: 60 kcal (15 g de carbohidrato).
  - Cereal o tubérculo sin grasa: 70 kcal (2 g de proteína, 15 g de carbohidrato).
  - Leguminosa: 120 kcal (8 g de proteína, 20 g de carbohidrato).
  - Proteína animal: 7 g de proteína, entre 40 y 100 kcal según su grasa.
  - Leche descremada: 95 kcal (9 g de proteína).
  - Grasa: 45 kcal (5 g de grasa).
- **Estado en la app:** `exchanges.ts` ya implementa casi lo mismo (proteína 7 g, almidón 15 g de carbohidrato, fruta 15 g, lácteo 8 g de proteína, grasa 5 g; verdura 5 g de carbohidrato frente a 4 g en SMAE).
- **Pros:** es el idioma natural de una nutricionista latinoamericana. Da flexibilidad real (mote ↔ arroz ↔ yuca ↔ verde) y conecta directo con las plantillas por kcal.
- **Contras:** al socio le cuesta aprender los grupos, y para un plato mixto (locro, encebollado) hay que desglosar.
- **Para quién:** socios con objetivo concreto a 9 semanas que ya dominan el Modelo A, o que piden más estructura.

### Modelo C — **Plantillas por nivel de kcal** (menú con opciones)

- **Qué es:** la versión digital de las hojas de cálculo que ya usa la nutricionista (`MealPlanTemplate`, "Estándar 1400 kcal").
- **Niveles:** 1.200–2.400 kcal, en saltos que decida la nutricionista.
- **Opciones:** cada comida trae 2–3 opciones equivalentes, construidas con los intercambios del Modelo B.
- **Pros:** cero fricción para el socio ("hoy como la opción 2"). Es rápido de asignar y alimenta el semáforo automático por comida (`MealLogEntry`).
- **Contras:** se vuelve monótono y la adherencia cae si no se rotan opciones. Además, la "comida real" (reuniones, fines de semana) queda fuera del plan.
- **Para quién:** quien prefiere que le digan exactamente qué comer. Conviene combinarlo con el Modelo B para los cambios.

### Modelo D — **Macros + diario** (seguimiento detallado)

- **Qué es:** una meta de kcal y proteína (`NutritionTarget`) más el diario tipo MFP con buscador y código de barras (`FoodLogEntry`).
- **Evidencia:** el registro constante se asocia con más pérdida de peso ([Burke 2011](https://www.jandonline.org/article/s0002-8223(10)01644-5/abstract)).
- **Pros:** es lo más preciso y útil para quien se estanca o busca recomposición fina.
- **Contras:** exige mucho y no a todos les funciona para siempre. Hay riesgo de obsesionarse, sobre todo con un enfoque rígido ([Stewart 2002](https://pubmed.ncbi.nlm.nih.gov/11883916/)).
- **Para quién:** Nivel 3 o socios motivados por datos, en bloques de 9 semanas con "descanso de registro" en la semana de Recuperar (*propuesta*).

### Modelo E (ajuste encima de A–D) — **Combustible según el trabajo**

- **Qué es:** la proteína no cambia de un día a otro. Lo que se mueve es el **almidón**: +1 mano ahuecada (o +1–2 intercambios) en días exigentes, y −1 en días suaves. Se apoya en el concepto de "fuel for the work required" ([Impey 2018](https://pubmed.ncbi.nlm.nih.gov/29453741/)) y en los rangos por carga del [ACSM joint 2016](https://www.dietitians.ca/DietitiansOfCanada/media/Documents/Resources/noap-position-paper.pdf?ext=.pdf).
- **Mapeo SRXFIT (propuesta):**

  | Día o semana | Almidón |
  |---|---|
  | **Días C y D** (sentadilla/potencia, Christine/AMRAP) y la **semana 3 "Desafiar"** | +1 |
  | **Día E** (Zona 2 y movilidad) y días de descanso | −1 |
  | **Semana 4 "Recuperar"** | Opción de ir a **mantenimiento** (pausa de dieta) |

- **Evidencia honesta:** la periodización de carbohidratos se estudió sobre todo en **atletas de resistencia**. Para socios que buscan bajar grasa, lo que manda sigue siendo el **total semanal** ([ISSN 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5470183/)). Por eso es un **ajuste**, no la base.
- **Pros:** conecta la comida con el mesociclo y refuerza la identidad "prescrita" del método.
- **Contras:** agrega complejidad. Hay que ofrecerlo solo a quien ya cumple lo básico.

### Tabla resumen

| Modelo | Precisión | Carga para la nutricionista | Carga para el socio | Uso sugerido |
|---|---|---|---|---|
| A. Plato + manos | Media | Muy baja | Muy baja | **Todos (por defecto)** |
| B. Intercambios | Media-alta | Media (una vez) | Media | Objetivo a 9 semanas |
| C. Plantillas kcal | Alta (si se cumple) | Baja (reutiliza) | Baja | Quien quiere "qué como" |
| D. Macros + diario | Alta | Baja (la app calcula) | Alta | Estancados, Nivel 3, recomposición |
| E. Según el trabajo | — (ajuste) | Baja | Media | Quien ya cumple A–D |

---

## 5. Adaptación a la comida ecuatoriana (Paso 2d)

### 5.1 Proteínas base (disponibles en Quito)

| Alimento | Proteína por 100 g | Fuente | Nota |
|---|---|---|---|
| **Chochos cocidos o desamargados** | **12,8–17,7 g**; ~128–141 kcal; **~14–15 g de fibra** | [Tabla de Composición de Alimentos, Cuenca 2018](https://www2.ucuenca.edu.ec/images/NOTICIASINSTITUCION/junio19/Tabla-de-composicion-de-alimentos.-Cuenca-Ecuador-2018_compressed.pdf) | Una estrella nacional: proteína y fibra a la vez. El INIAP reporta hasta **51 % de proteína en base seca** en chocho desamargado ([INIAP](https://eva.iniap.gob.ec/web2/oferta-tecnologica/chocho/)). El cevichocho es un snack post-entreno natural. |
| Pechuga de pollo cocida | 32,1 g | [USDA FDC 171140](https://fdc.nal.usda.gov/) | |
| Atún en lata, escurrido | 29,1 g (en aceite) | [USDA FDC 173708](https://fdc.nal.usda.gov/) | Mejor en agua para ahorrar grasa. |
| Queso fresco | 18,1 g | [USDA FDC 172223](https://fdc.nal.usda.gov/) | También cuenta como grasa: 1 palma de queso no equivale a 1 palma de pollo. |
| Huevo cocido | 12,6 g (~155 kcal) | [USDA FDC 173424](https://fdc.nal.usda.gov/) | |
| Lenteja cocida | 9,0 g (7,9 g de fibra) | [USDA FDC 172421](https://fdc.nal.usda.gov/) | Cuenta como **proteína + almidón**. |
| Fréjol negro cocido | 8,9 g (8,7 g de fibra) | [USDA FDC 173735](https://fdc.nal.usda.gov/) | Igual que la lenteja. |
| Quinua cocida | 4,4 g (120 kcal) | [USDA FDC 168917](https://fdc.nal.usda.gov/) | Es **almidón**, no proteína, aunque se venda como "proteica". |

*Otras opciones comunes sin cifra citada aquí:* pescado blanco (tilapia, corvina), sardina en lata, camarón, carne magra de res o cerdo, yogur natural o griego, leche y cuy. La nutricionista puede cargar sus valores en la app desde la tabla ecuatoriana.

**GABA Ecuador, mensajes aplicables** ([FAO/MSP](https://www.fao.org/nutrition/education/dietary-guidelines/regions/ecuador/en/)):
- **Mensaje 2:** incluir alimentos de origen animal o **menestras** a diario.
- **Mensaje 4:** combinar **menestras con cereal** (arroz, maíz, quinua).
- **Mensaje 3:** verduras o frutas en todas las comidas.
- **Mensaje 6:** evitar ultraprocesados, comida rápida y bebidas endulzadas.
- **Mensaje 9:** valorar los alimentos del Ecuador.

El Plato SRXFIT puede presentarse como **"las GABA con dosis"**.

### 5.2 Almidones andinos y costeños (la "mano ahuecada")

- **Qué entra:** mote, choclo, papa, yuca, verde, maduro, arroz, quinua, fideo, pan, tostado y canguil.
- **Algunos datos:**
  - Mote (maíz blanco cocido): **121 kcal/100 g** ([Tabla Cuenca 2018](https://www2.ucuenca.edu.ec/images/NOTICIASINSTITUCION/junio19/Tabla-de-composicion-de-alimentos.-Cuenca-Ecuador-2018_compressed.pdf)).
  - Verde hervido: 121 kcal y 1,1 g de proteína/100 g ([USDA FDC 168216](https://fdc.nal.usda.gov/)).
  - Yuca cruda: 160 kcal/100 g ([USDA FDC 169985](https://fdc.nal.usda.gov/)).
- **La preparación manda:**
  - Maduro **hervido 121 kcal** frente a **frito 215 kcal** por 100 g ([Tabla Cuenca 2018](https://www2.ucuenca.edu.ec/images/NOTICIASINSTITUCION/junio19/Tabla-de-composicion-de-alimentos.-Cuenca-Ecuador-2018_compressed.pdf)).
  - Regla SRXFIT: **frito = mano ahuecada + pulgar de grasa**.
- **Platos típicos que parecen proteína y no lo son:**
  - Humita: 224 kcal, 11,5 g de grasa y 4,6 g de proteína por 100 g.
  - Mote pillo: 157 kcal y ~2 g de proteína por 100 g.
  - Ambos cuentan como **almidón + grasa**, no como proteína ([Tabla Cuenca 2018](https://www2.ucuenca.edu.ec/images/NOTICIASINSTITUCION/junio19/Tabla-de-composicion-de-alimentos.-Cuenca-Ecuador-2018_compressed.pdf)).

### 5.3 Platos típicos traducidos al Plato SRXFIT (guía práctica, *propuesta*)

| Plato | Cómo se lee | Ajuste SRXFIT |
|---|---|---|
| **Encebollado** | Proteína (albacora) + almidón (yuca) + cebolla | Buena base. Chifles o pan aparte cuentan como almidón y grasa extra. |
| **Ceviche** de pescado o camarón | Proteína + verdura (cebolla, tomate) | Excelente. El canguil cuenta como almidón y los chifles como almidón + grasa. |
| **Cevichocho** | Proteína vegetal + fibra + tostado | Snack post-entreno. Controlar el tostado (1 mano ahuecada). |
| **Locro de papa** | Almidón + lácteo o grasa (queso, aguacate) | Poca proteína: añadir **huevo** o una porción de pollo o queso aparte. |
| **Menestra con arroz** | Proteína + almidón, más almidón | Media porción de arroz o un poco más de menestra, y una proteína animal si toca déficit. |
| **Seco de pollo o de chivo** | Proteína + almidón (arroz) + maduro | Elegir **o** arroz **o** maduro (1 mano ahuecada), más ensalada. |
| **Hornado / fritada** | Proteína alta en grasa + mote + llapingachos | Es comida de fin de semana: 1 palma, 1 mano de mote, ensalada, y "sin cuero". Nada prohibido. |
| **Bolón de verde** | Almidón + grasa (queso, chicharrón) | Si es desayuno, sumar **huevos** como proteína y reducir el tamaño del bolón. |
| **Almuerzo ejecutivo** (sopa + segundo + jugo) | Doble almidón (sopa con papa + arroz) y jugo azucarado | Pedir más ensalada, cambiar el jugo por agua y comer el segundo con 1 palma de proteína. |

### 5.4 Canasta base económica (sin precios; no hay fuente de precios aquí)

- **Proteínas:** huevos, chochos, atún en lata, pollo, lenteja, fréjol, queso fresco y leche o yogur.
- **Almidones:** avena, arroz, papa, mote, verde y yuca.
- **Verduras:** de mercado. La fruta, entera.
- **Grasas:** aguacate y aceite.

Con eso se arman todas las plantillas del Modelo C sin productos importados. Conviene que la nutricionista cargue estos alimentos en la base de la app con valores de la tabla ecuatoriana.

---

## 6. Propuesta: "Filosofía de Nutrición SRXFIT" (1 página) — Paso 2e

> **Nutrición Prescrita. Comida real. Medida cada 9 semanas.**
> Así como entrenamos con dosis, comemos con dosis: diagnóstico, prescripción y seguimiento.

### Los 7 principios

1. **Prescrita, no genérica.**
   - Todo empieza con la bioimpedancia de la semana 1 y un objetivo medible a 9 semanas.
   - El plan es una dosis (kcal y porciones) que se ajusta con datos, no una dieta de moda.
2. **Proteína primero.**
   - **1,6–2,2 g/kg** (con peso de referencia topado en IMC 30 si hay obesidad), repartida en **4 tomas** de ~0,4 g/kg o **20–40 g** cada una ([ISSN](https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/), [Morton](https://pubmed.ncbi.nlm.nih.gov/28698222/), [Schoenfeld & Aragon](https://pubmed.ncbi.nlm.nih.gov/29497353/), [Weijs](https://pubmed.ncbi.nlm.nih.gov/39514335/)).
   - En mayores de 50–55, cuidar especialmente las **25–30 g por comida** ([PROT-AGE](https://pubmed.ncbi.nlm.nih.gov/23867520/)).
3. **Déficit moderado, fuerza intacta.**
   - Déficit de **~10–20 %** (o **500–750 kcal**), con meta de **0,5–1 % del peso por semana** ([Garthe](https://pubmed.ncbi.nlm.nih.gov/21558571/), [AHA/ACC/TOS](https://www.ahajournals.org/doi/10.1161/01.cir.0000437739.71477.ee)).
   - Si en la semana 9 cae el 3RM, el déficit estaba mal dosificado.
4. **Comida real ecuatoriana.**
   - El Plato SRXFIT: ½ verduras y fruta, ¼ proteína, ¼ almidón andino o costeño, y un pulgar de grasa. Son las GABA con dosis.
   - Mínimo de ultraprocesados ([Hall 2019](https://pubmed.ncbi.nlm.nih.gov/31105044/)).
   - **25–30 g de fibra** y **400 g de frutas y verduras** ([Reynolds](https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(18)31809-9/fulltext), [OMS](https://www.who.int/news-room/fact-sheets/detail/healthy-diet)).
5. **Adherencia antes que perfección.**
   - No hay alimentos prohibidos, hay porciones y frecuencia.
   - La meta es una semana **mayoritariamente verde**, no un día perfecto ([Dansinger](https://pubmed.ncbi.nlm.nih.gov/15632335/), [DIETFITS](https://jamanetwork.com/journals/jama/fullarticle/2673150), [Stewart](https://pubmed.ncbi.nlm.nih.gov/11883916/)).
6. **Combustible según el trabajo.**
   - La proteína es fija. El almidón sube en días y semanas exigentes y baja en días de Zona 2.
   - La semana de Recuperar puede ser semana de mantenimiento ([Impey](https://pubmed.ncbi.nlm.nih.gov/29453741/), [MATADOR](https://www.nature.com/articles/ijo2017206)).
7. **Suplementos al final, y nada de detox.**
   - Orden de importancia: energía y macros son el pastel, el horario es el glaseado y los suplementos son las chispas ([ISSN](https://pmc.ncbi.nlm.nih.gov/articles/PMC5470183/)).
   - Con respaldo: **creatina 3–5 g/día** ([ISSN](https://pmc.ncbi.nlm.nih.gov/articles/PMC5469049/)) y proteína en polvo como comodín.
   - "Detox" no ([Klein & Kiat](https://onlinelibrary.wiley.com/doi/10.1111/jhn.12286)).

### Cómo se conecta con evaluaciones y mesociclos

| Momento SRXFIT | Acción de nutrición |
|---|---|
| **Semana 1 (ingreso)** | Bioimpedancia. Elegir **nivel** (A: plato y manos / B: intercambios / C: plantilla kcal / D: macros y diario). Asignar plantilla o meta en la app. "Prioridad de la semana" (`NutritionFocus`). |
| **Semanas 1–3** (Aprender → Desafiar) | Déficit o superávit prescrito. Semáforo diario. Ajuste de almidón en días C y D (opcional). |
| **Semana 4** (Recuperar) | Opción de semana de **mantenimiento** (pausa de dieta) y descanso del diario para quien usa el nivel D. Revisar la tendencia del semáforo. |
| **Semanas 5–8** | Segundo mesociclo. Si el semáforo es verde y el peso no se mueve en 2–3 semanas, ajustar ±1 mano o ±1 intercambio (*propuesta*). |
| **Semana 9** (re-evaluación) | Bioimpedancia junto a los tests. La **hoja de semana 9** muestra Δ % grasa, Δ masa muscular y Δ fuerza. Pasar de nivel (A → B → C/D) o mantener. Nueva plantilla y nueva meta de 9 semanas. |

### Cómo lo usa la nutricionista en la app (ya existente + ajustes sugeridos)

1. **Plantillas por kcal** (`MealPlanTemplate`).
   - Crear 5–7 niveles una sola vez, cada uno con 2–3 opciones por comida armadas con **intercambios** y alimentos ecuatorianos.
   - Asignar y reescalar por socio en segundos.
2. **Intercambios** (`exchanges.ts`).
   - Mostrar al socio "tu almuerzo = 2 proteínas + 2 almidones + verduras libres" y dejarle cambiar mote ↔ arroz ↔ verde.
   - *Ajuste sugerido:* documentar que los valores de referencia siguen el SMAE, y revisar la referencia de verdura (5 g frente a 4 g).
3. **Calculadora** (`calc.ts`).
   - *Ajuste sugerido 1:* peso de referencia con **tope en IMC 30**, o **g/kg de masa libre de grasa** si hay bioimpedancia ([Weijs 2024](https://pubmed.ncbi.nlm.nih.gov/39514335/)).
   - *Ajuste sugerido 2:* reservar el déficit del 20 % para % de grasa alto ([ISSN](https://pmc.ncbi.nlm.nih.gov/articles/PMC5470183/)).
4. **Semáforo de adherencia** (`AdherenceLevel`: verde >80 %, amarillo 60–80, naranja 40–60, rojo <40).
   - *Propuesta:* agregarlo por **semana** y por **mesociclo** para la vista de la nutricionista. Una lista de "socios en naranja o rojo 2 semanas seguidas" le dice a quién llamar primero.
   - Es la forma de atender a 130 personas con 1 profesional: **gestión por excepción**.
5. **Diario** (`FoodLogEntry`, código de barras).
   - Solo para el nivel D o para diagnosticar un estancamiento de 2 semanas.
   - El registro constante se asocia con más pérdida de peso ([Burke 2011](https://www.jandonline.org/article/s0002-8223(10)01644-5/abstract)).
6. **Cápsulas y recetas** (`NutritionTip`, `Recipe`).
   - Aquí vive el contenido educativo: el Plato SRXFIT, cómo leer un encebollado, el ebook de batidos verdes reencuadrado, creatina y agua.
   - Así se reemplazan los PDFs sueltos por WhatsApp.
7. **KPIs del programa** (*propuesta*):
   - % de socios con bioimpedancia en la semana 1 y en la semana 9.
   - % de semanas verdes o amarillas.
   - Δ mediana de % grasa y de masa muscular por bloque.
   - % de socios en déficit que **mantienen o suben su 3RM**. Es la métrica que une la nutrición con la identidad SRXFIT.

---

## 7. Fuentes

**Documentos internos:** SRXFit_Metodologia_v1 2026.docx; SRXFit_Onboarding_Evaluacion_v1.docx; código de la app (`prisma/schema.prisma`, `src/lib/nutrition/calc.ts`, `exchanges.ts`, `adherence.ts`).

**Posiciones y guías**
- [ISSN — Protein and exercise (Jäger 2017)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/)
- [ISSN — Nutrient timing (Kerksick 2017)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5596471/)
- [ISSN — Diets and body composition (Aragon 2017)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5470183/)
- [ISSN — Creatine (Kreider 2017)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5469049/)
- [ISSN — Caffeine (Guest 2021)](https://doaj.org/article/a1068ad28ad547e6aa8a91845065b6f8)
- [ACSM/AND/DC — Nutrition and Athletic Performance 2016 (PDF)](https://www.dietitians.ca/DietitiansOfCanada/media/Documents/Resources/noap-position-paper.pdf?ext=.pdf)
- [ACSM — Exercise and Fluid Replacement 2007](https://pubmed.ncbi.nlm.nih.gov/17277604/)
- [AHA/ACC/TOS 2013 — Obesity guideline](https://www.ahajournals.org/doi/10.1161/01.cir.0000437739.71477.ee)
- [OMS — Alimentación sana](https://www.who.int/news-room/fact-sheets/detail/healthy-diet)
- [EFSA 2010 — Water DRV](https://efsa.onlinelibrary.wiley.com/doi/10.2903/j.efsa.2010.1459)
- [PROT-AGE 2013](https://pubmed.ncbi.nlm.nih.gov/23867520/)
- [GABA Ecuador (FAO)](https://www.fao.org/nutrition/education/dietary-guidelines/regions/ecuador/en/) · [MSP GABA](https://www.salud.gob.ec/guias-alimentarias-gabas/)
- [Harvard Healthy Eating Plate](https://nutritionsource.hsph.harvard.edu/healthy-eating-plate/)

**Estudios**
- [Morton 2018](https://pubmed.ncbi.nlm.nih.gov/28698222/)
- [Helms 2014](https://www.researchgate.net/publication/257350851_A_Systematic_Review_of_Dietary_Protein_During_Caloric_Restriction_in_Resistance_Trained_Lean_Athletes_A_Case_for_Higher_Intakes)
- [Schoenfeld & Aragon 2018](https://pubmed.ncbi.nlm.nih.gov/29497353/)
- [Garthe 2011](https://pubmed.ncbi.nlm.nih.gov/21558571/)
- [Roberts/Helms 2020 — Physique athletes](https://pmc.ncbi.nlm.nih.gov/articles/PMC7052702/)
- [Iraki 2019 — Off-season](https://pmc.ncbi.nlm.nih.gov/articles/PMC6680710/)
- [Barakat 2020 — Recomposition](https://journals.lww.com/nsca-scj/Fulltext/2020/10000/Body_Recomposition__Can_Trained_Individuals_Build.3.aspx)
- [Weijs 2024 — Protein in obesity](https://pubmed.ncbi.nlm.nih.gov/39514335/)
- [Weinheimer 2010](https://pubmed.ncbi.nlm.nih.gov/20591106/)
- [Sardeli 2018](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5946208/)
- [Reynolds 2019](https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(18)31809-9/fulltext)
- [Hall 2019](https://pubmed.ncbi.nlm.nih.gov/31105044/)
- [DIETFITS 2018](https://jamanetwork.com/journals/jama/fullarticle/2673150)
- [Dansinger 2005](https://pubmed.ncbi.nlm.nih.gov/15632335/)
- [Burke 2011](https://www.jandonline.org/article/s0002-8223(10)01644-5/abstract)
- [Stewart 2002](https://pubmed.ncbi.nlm.nih.gov/11883916/)
- [TREAT 2020](https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/2771095)
- [TREATY 2022](https://www.nejm.org/doi/full/10.1056/NEJMoa2114833)
- [MATADOR 2018](https://www.nature.com/articles/ijo2017206)
- [ICECAP 2021](https://www.researchgate.net/publication/349347390_Continuous_versus_Intermittent_Dieting_for_Fat_Loss_and_Fat-Free_Mass_Retention_in_Resistance-trained_Adults_The_ICECAP_Trial)
- [PREDIMED 2018](https://www.nejm.org/doi/full/10.1056/NEJMoa1800389)
- [Mancini 2016](https://www.amjmed.com/article/S0002-9343(15)30027-9/fulltext)
- [Impey 2018](https://pubmed.ncbi.nlm.nih.gov/29453741/)
- [Klein & Kiat 2015 — Detox](https://onlinelibrary.wiley.com/doi/10.1111/jhn.12286)
- [Green smoothie oxalate nephropathy (AJKD)](https://pubmed.ncbi.nlm.nih.gov/29203127/)
- [Muraki 2013 — Fruit vs juice](https://news.harvard.edu/gazette/story/2013/08/reduce-type-2-diabetes-risk/)
- [Gibson 2016 — Hand portions](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4976119/)
- [Hand scale 2025 (Appetite)](https://pubmed.ncbi.nlm.nih.gov/40669561/)

**Métodos prácticos y datos de alimentos**
- [Precision Nutrition — hand portion math](https://www.precisionnutrition.com/hand-portion-math-to-track-macros) · [calorie control guide](https://www.precisionnutrition.com/calorie-control-guide)
- [SMAE (anexo UNAM)](https://fisiologia.facmed.unam.mx/wp-content/uploads/2019/02/2-Valoraci%C3%B3n-nutricional-Anexos.pdf)
- [Tabla de Composición de Alimentos, Cuenca 2018](https://www2.ucuenca.edu.ec/images/NOTICIASINSTITUCION/junio19/Tabla-de-composicion-de-alimentos.-Cuenca-Ecuador-2018_compressed.pdf)
- [INIAP — Chocho](https://eva.iniap.gob.ec/web2/oferta-tecnologica/chocho/)
- [USDA FoodData Central](https://fdc.nal.usda.gov/)
- [ENSANUT 2018 — sobrepeso y obesidad](https://www.ecuadorencifras.gob.ec/documentos/web-inec/Estadisticas_Sociales/ENSANUT/ENSANUT_2018/Principales%20resultados%20ENSANUT_2018.pdf): 64,68 % de los adultos de 19–59 años con sobrepeso u obesidad, y 25,7 % con obesidad. Contexto para el ajuste de proteína con tope en IMC 30.
