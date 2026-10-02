/**
 * Pruebas del parser de notas del dueño (src/lib/whatsapp/owner-commands.ts).
 * Uso: npm run test:owner-notas
 */
import assert from "node:assert/strict";
import { extractOwnerNotes, parseOwnerNote } from "../src/lib/whatsapp/owner-commands";

const cases: [string, ReturnType<typeof parseOwnerNote>][] = [
  ["nota: no propongas descuentos", { kind: "nota", text: "no propongas descuentos" }],
  ["Nota - La Cueva cierra el lunes", { kind: "nota", text: "La Cueva cierra el lunes" }],
  ["por qué: ya lo probamos en agosto", { kind: "porque", text: "ya lo probamos en agosto" }],
  ["Por que: sin tilde", { kind: "porque", text: "sin tilde" }],
  ["porque: junto", { kind: "porque", text: "junto" }],
  ["  NOTA:   con espacios  ", { kind: "nota", text: "con espacios" }],
  ["nota: varias\nlíneas", { kind: "nota", text: "varias\nlíneas" }],
  ["nota:", null],
  ["porque no vino ayer", null], // sin dos puntos: conversación normal, no nota
  ["anotación: algo", null],
  ["hola", null],
];
for (const [input, expected] of cases) assert.deepEqual(parseOwnerNote(input), expected, input);

process.env.OWNER_WHATSAPP = "593900000000";
const payload = {
  entry: [{ changes: [{ value: { messages: [
    { from: "593900000000", type: "text", text: { body: "nota: probar" } },
    { from: "593911111111", type: "text", text: { body: "nota: de un socio" } }, // no es el dueño
    { from: "593900000000", type: "text", text: { body: "hola" } },
    { from: "593900000000", type: "button", button: { payload: "ads:aprobada:x" } },
  ] } }] }],
};
assert.deepEqual(extractOwnerNotes(payload), [{ from: "593900000000", kind: "nota", text: "probar" }]);
console.log(`ok: ${cases.length} casos del parser + filtro por dueño`);
