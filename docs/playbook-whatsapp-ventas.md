# Playbook: vendedor AI en WhatsApp + anuncios que le traen prospectos

Cómo montamos, de punta a punta, un agente de ventas que atiende WhatsApp solo y
recibe tráfico de anuncios de Meta. Escrito después de hacerlo en La Cueva
(septiembre 2026) para poder repetirlo en otro negocio o con un cliente.

**Qué se logra:** el cliente hace clic en un anuncio → se abre WhatsApp con un
mensaje escrito → el bot responde en segundos, califica, manda la ubicación y
agenda → todo queda en un CRM propio, y cada conversación sabe de qué anuncio
vino.

**Cuánto toma:** entre 2 y 4 semanas, y la mayor parte es esperar a Meta. El
trabajo real son unos 3 o 4 días.

---

## 0. Antes de empezar: decisiones que cuestan caro si se toman mal

| Decisión | Recomendación | Por qué |
|---|---|---|
| **Qué número usa el bot** | Un chip nuevo, o uno que nadie use a diario | Al pasarlo a la API **deja de funcionar en la app de WhatsApp del teléfono**. Los chats viejos se quedan en ese celular. |
| **En qué portafolio (Business) vive todo** | Número, cuenta publicitaria y página **en el mismo portafolio** | Es el error que más tiempo nos costó. Ver §6. |
| **Quién atiende después del bot** | Definirlo antes de lanzar | El bot abre y agenda; alguien tiene que cerrar y recibir. |
| **La oferta de entrada** | Una sola, concreta y barata | Lo que mejor funciona en anuncios es precio bajo + promesa clara. |

**Requisitos previos:** negocio verificado en Meta (Business Verification),
método de pago en la cuenta de WhatsApp, y una web con **política de privacidad**
y **página de eliminación de datos** (Meta las exige en la revisión de la app).

---

## 1. Lado Meta: de cero a poder enviar mensajes

1. **Crear la app** en developers.facebook.com (tipo Business) y agregarle el
   producto **WhatsApp**.
2. **Configurar el webhook**: URL pública de tu app + un token de verificación
   inventado por ti. Suscribir el campo **`messages`**.
   - ⚠️ Si tu app tiene un proxy o middleware que protege rutas, **deja pública
     la ruta del webhook**. A nosotros nos bloqueó la verificación y no era obvio.
3. **Crear un usuario del sistema** (System User) en Configuración del negocio,
   con acceso total a la cuenta de WhatsApp y a la app.
4. **App Review**: pedir acceso avanzado a `whatsapp_business_messaging`.
   - Requiere descripción del uso, **un video del flujo funcionando** y el
     formulario de manejo de datos (procesadores, país, responsable).
   - Tarda ~2 o 3 semanas. **Empieza por aquí**, es el camino crítico.
   - Mientras esperas, se puede probar todo con el **número de prueba** que Meta
     regala y tokens temporales de 24 horas.
5. **Cuando aprueben**: generar el **token permanente** del usuario del sistema
   (caducidad "Nunca") con `whatsapp_business_messaging` y
   `whatsapp_business_management`.

---

## 2. Pasar el número real a la API (30 minutos, y varias trampas)

1. **Eliminar la cuenta de WhatsApp de ese número en el teléfono**: Ajustes →
   Cuenta → Eliminar mi cuenta. No basta con cerrar sesión ni desinstalar.
   Si no lo haces, Meta responde *"This phone number is already registered"*.
2. En **WhatsApp Manager → Números de teléfono → Agregar**: nombre visible,
   categoría, y verificación por **SMS** (deja el chip en un teléfono).
3. **Registrar en Cloud API** con un PIN de 6 dígitos (queda como PIN de
   verificación en dos pasos, guárdalo).
4. **Suscribir la app al webhook de esa cuenta de WhatsApp.** Es el paso que
   más se olvida: sin él, el número recibe mensajes y tu sistema nunca se entera.
5. **Probar**: escríbele desde otro teléfono y revisa que llegue y responda.

**Trampas reales que nos pasaron:**
- Después de migrar, los teléfonos guardan en caché que ese número "no tiene
  WhatsApp". Abre el chat con **`wa.me/<número>`** y funciona.
- El nombre visible queda "en revisión" unas horas. No impide operar.
- Si cambias el ID del número en tus variables de entorno, **redespliega y
  espera**: los mensajes que lleguen antes usan la versión vieja y fallan.
- Un valor de variable de entorno con **espacios o comillas** al pegarlo hace que
  los envíos fallen sin explicación.

---

## 3. Lado software: lo mínimo que debe tener

**El agente.** Un endpoint que recibe el webhook, guarda el mensaje, llama al
modelo con un *playbook de ventas* como system prompt, y responde.

Lo que hizo la diferencia en calidad:
- **El playbook es un documento editable**, no texto escondido en el código. Ahí
  van la oferta, los horarios, las objeciones y el tono. Se ajusta a diario.
- **Salida estructurada** para los datos (sede, objetivo, etapa, fecha de cita) y
  **texto libre para la respuesta**. Cuando forzamos el texto libre dentro de la
  gramática estructurada, el modelo producía typos y frases cortadas.
- **Interruptores de entorno**: uno para encender el agente y otro para
  autoenviar. Así se arranca en modo borrador y se revisa antes de soltar.
- **Regla de la ventana de 24 horas**: fuera de ella WhatsApp solo acepta
  plantillas aprobadas. Tenlo en cuenta en recordatorios y reenganches.

**El inbox.** Una pantalla donde el equipo ve las conversaciones, **toma el
control** (pausa el bot) y **lo devuelve**. Sin esto el bot es una caja negra y
nadie confía en él.

**Registrar los fallos de envío.** Esto nos costó dos pruebas a ciegas: si el
envío falla y solo lo escribes en la consola, en el inbox se ve **idéntico** a un
mensaje enviado. Guarda en cada mensaje:
`sendStatus` (SENT / FAILED / DRAFT), `sendError` (el error crudo de Meta) y
`sendAttemptedAt`, y **píntalo en rojo** en la interfaz. Un fallo silencioso con
anuncios corriendo es dinero que se pierde sin que nadie se entere.

**Una pantalla de diagnóstico** (solo para el dueño) que muestre: qué variables
están definidas y su valor cuando no son secretas, si el token es válido y cuándo
expira, los números de la cuenta con su estado, las apps suscritas al webhook, los
últimos mensajes salientes con su estado, y un **botón de envío de prueba que
imprima el error crudo de Meta**. Con eso se diagnostica en dos minutos lo que a
ciegas toma horas.

---

## 4. Medir de qué anuncio viene cada conversación

Cuando alguien llega desde un anuncio de clic a WhatsApp, el webhook incluye un
objeto **`referral`** con el id del anuncio, el titular, el texto y un
identificador de clic.

Guárdalo en el prospecto **en el primer contacto** (el primer anuncio gana) y
arma un reporte de prospectos → citas → asistencias → cierres **por anuncio**.
Sin esto solo sabes cuánto cuesta una conversación, que es la métrica que
engaña: en el historial de la cuenta había campañas con muchas conversaciones
baratas y cero socios.

---

## 5. Los anuncios

**Formato que funciona** (y lo confirma el histórico de la cuenta): video
vertical de una persona real del equipo hablando a cámara, con una oferta
concreta y barata. En La Cueva, ese tipo de anuncio costó entre $0.35 y $0.77 por
conversación, contra $1.90 a $3.90 de las promos genéricas.

**Configuración:**
- Objetivo **Interacción**, ubicación de conversión **Destinos de mensajes**,
  destino **manual y solo WhatsApp** (si dejas Messenger e Instagram, parte del
  tráfico no llega al bot).
- Meta de rendimiento: **maximizar conversaciones**.
- Ubicación: el **lugar** del negocio con radio pequeño. Meta **no acepta
  coordenadas** ni carga masiva de latitud/longitud: hay que buscar el negocio
  como "lugar" y ajustar el radio (mínimo 1 milla).
- **Mensaje prellenado** alineado con el anuncio ("Hola, quiero mis 2 semanas por
  $9"): el bot ya sabe de qué viene la persona.
- **Apaga las mejoras automáticas**: variaciones de texto con IA, stickers,
  retoques de video, traducción automática y, sobre todo, el formato
  **"Colección"**, que mete productos de cualquier catálogo viejo asociado a la
  cuenta.
- Un solo conjunto de anuncios si las sedes están cerca: dos círculos que se
  pisan compiten entre sí en la subasta.

**Al publicar:** el diálogo "Review and publish" incluye **todos** los borradores
viejos de la cuenta. Desmárcalos uno por uno y confirma el contador antes de
publicar.

---

## 6. El error que más tiempo nos costó

Meta exige que el número de WhatsApp esté **conectado a la página** que usa el
anuncio. Con un número en Cloud API, el flujo "Conectar otro número" pide
instalar la app de WhatsApp Business, cosa imposible, y sale el error **#2923012**.

Lo que **no** funcionó:
- Conectar el número desde la configuración de la página (solo ofrece Instagram).
- Compartir la cuenta de WhatsApp con el otro portafolio como socio: *"Unable to
  assign partners"*.

Lo que **sí** funcionó: **usar la cuenta publicitaria que está en el mismo
portafolio que el número.** Desde ahí el número aparece en la lista de destinos,
y además se puede elegir la página y el Instagram de la otra marca. Cero permisos
pendientes.

**Conclusión para el próximo montaje:** decide desde el día uno que el número, la
cuenta publicitaria y la página vivan en el mismo portafolio. Te ahorras un día
entero.

---

## 7. Lanzamiento y primeros días

**Antes de publicar:**
- [ ] Prueba real: escribir desde un teléfono ajeno y ver que el bot responda.
- [ ] Borrar las conversaciones de prueba: el bot arrastra ese historial como
      contexto y le habla a un prospecto real de una cita que no existe.
- [ ] Método de pago cargado y límite de gasto definido.
- [ ] El equipo sabe entrar al inbox y tomar el control.

**Presupuesto de arranque:** $10 diarios alcanza para aprender. Meta avisará que
es poco; es un aviso genérico, entrega igual.

**Qué mirar los primeros días:** costo por conversación por anuncio, cuántas
conversaciones terminan en cita, y cuántas citas asisten. Apaga lo que pase del
doble del mejor anuncio y mueve el presupuesto al ganador. Sube el presupuesto
solo cuando el costo por cita se sostenga.

**El bucle de mejora:** lee conversaciones reales todos los días la primera
semana. Las preguntas que el bot responde mal o esquiva son ediciones directas al
playbook. Es la parte que más rinde y la que más se abandona.

---

## Resumen del orden correcto

1. App de Meta + webhook + **App Review** (empieza ya, es lo lento).
2. Agente + inbox + registro de errores de envío, probando con el número de prueba.
3. Token permanente → migrar el número real → registrar → suscribir → probar.
4. Guardar el origen del anuncio en cada prospecto.
5. Cuenta publicitaria **en el mismo portafolio** del número.
6. Campaña chica, medir por anuncio, afinar el playbook a diario.
