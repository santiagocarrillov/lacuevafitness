/**
 * Offline tests for Click-to-WhatsApp referral parsing + first-touch attribution.
 * No DB, no network.
 *
 * Usage:
 *   npm run test:referral
 */

import assert from "node:assert/strict";
import {
  parseReferral,
  leadAttributionUpdate,
  referralLeadSource,
  adContextLine,
} from "../src/lib/whatsapp/referral";

// Shape taken from Meta's webhook docs for a CTWA inbound text message.
const ctwaMessage = {
  from: "593999999999",
  id: "wamid.TEST",
  timestamp: "1758100000",
  type: "text",
  text: { body: "Hola, quiero info de la promo" },
  referral: {
    source_url: "https://fb.me/abc123",
    source_id: "120212345678900",
    source_type: "ad",
    headline: "2 semanas por $9",
    body: "Entrena SRXFIT con evaluación incluida",
    media_type: "image",
    image_url: "https://scontent.example/img.jpg",
    ctwa_clid: "ARAkLkA8rmlFeiCktEJQ-QTwRiyYHAFDLMNDBH0CD3qpjd0HR4irJ6LEkR7JwFF4XvnO2E4Nx0-eM-GABDLOPaOdRMv-_zfUQ2a",
  },
};
const occurredAt = new Date(1758100000 * 1000);

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

test("parses a CTWA referral", () => {
  const r = parseReferral(ctwaMessage);
  assert.ok(r);
  assert.equal(r.source_id, "120212345678900");
  assert.equal(r.source_type, "ad");
  assert.equal(r.headline, "2 semanas por $9");
  assert.equal(r.ctwa_clid?.startsWith("ARAk"), true);
});

test("returns null for messages without referral / junk referral", () => {
  assert.equal(parseReferral({ type: "text", text: { body: "hola" } }), null);
  assert.equal(parseReferral({ referral: "nope" }), null);
  assert.equal(parseReferral({ referral: {} }), null);
  assert.equal(parseReferral(null), null);
});

test("infers Instagram vs Facebook from source_url", () => {
  assert.equal(referralLeadSource({ source_url: "https://www.instagram.com/p/xyz" }), "INSTAGRAM");
  assert.equal(referralLeadSource({ source_url: "https://fb.me/abc" }), "FACEBOOK");
  assert.equal(referralLeadSource({}), "FACEBOOK");
});

test("new WhatsApp lead gets attribution + ad source", () => {
  const r = parseReferral(ctwaMessage)!;
  const data = leadAttributionUpdate(
    { source: "WHATSAPP", adSourceId: null, ctwaClid: null, adSourceUrl: null },
    r,
    occurredAt,
  );
  assert.equal(data.adSourceId, "120212345678900");
  assert.equal(data.adHeadline, "2 semanas por $9");
  assert.equal(data.adSourceType, "ad");
  assert.equal(data.adReferredAt?.getTime(), occurredAt.getTime());
  assert.equal(data.source, "FACEBOOK");
});

test("first touch wins: already-attributed lead is not overwritten", () => {
  const r = parseReferral(ctwaMessage)!;
  const data = leadAttributionUpdate(
    { source: "FACEBOOK", adSourceId: "999", ctwaClid: null, adSourceUrl: null },
    r,
    occurredAt,
  );
  assert.deepEqual(data, {});
});

test("meaningful existing source (WEB_FORM) is kept", () => {
  const r = parseReferral(ctwaMessage)!;
  const data = leadAttributionUpdate(
    { source: "WEB_FORM", adSourceId: null, ctwaClid: null, adSourceUrl: null },
    r,
    occurredAt,
  );
  assert.equal(data.adSourceId, "120212345678900");
  assert.equal("source" in data, false);
});

test("agent context line", () => {
  const line = adContextLine({ adHeadline: "2 semanas por $9", adSourceType: "ad" }, "Entrena SRXFIT");
  assert.ok(line?.includes("2 semanas por $9"));
  assert.ok(line?.includes("anuncio"));
  assert.equal(adContextLine({ adHeadline: null, adSourceType: "ad" }, null), null);
});

console.log(`\n${passed} tests passed`);
