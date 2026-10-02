// XAdES-BES enveloped signature for SRI electronic documents (server only).
// The SRI requires RSA-SHA1 / SHA1 digests, inclusive C14N, three references
// (SignedProperties, KeyInfo, the #comprobante document) and the signature as
// the last child of the root. The XML we build is already canonical (no
// whitespace between tags, C14N text escaping, no empty elements), so the
// canonical form of each signed node is produced as a string here and the
// test suite verifies it independently with xml-crypto.

import forge from "node-forge";

const DS = "http://www.w3.org/2000/09/xmldsig#";
const ETSI = "http://uri.etsi.org/01903/v1.3.2#";
// Inclusive C14N of a node inside <ds:Signature> renders every namespace in
// scope on the apex element, sorted by prefix.
const NS = `xmlns:ds="${DS}" xmlns:etsi="${ETSI}"`;

export type SigningCert = {
  privateKey: forge.pki.rsa.PrivateKey;
  certificate: forge.pki.Certificate;
  certDer: string; // binary string
  subject: string;
  issuer: string;
  serial: string; // decimal
  notBefore: Date;
  notAfter: Date;
};

const attrName = (a: forge.pki.CertificateField) => a.shortName ?? a.name ?? a.type;
/** RFC 2253 order (most specific first), as most SRI signers print it. */
const dn = (attrs: forge.pki.CertificateField[]) => [...attrs].reverse().map((a) => `${attrName(a)}=${a.value}`).join(",");

/** Loads a .p12: picks the RSA key and the certificate whose public key matches it. */
export function loadP12(p12: Buffer, password: string): SigningCert {
  let parsed: forge.pkcs12.Pkcs12Pfx;
  try {
    parsed = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(p12.toString("binary"))), password);
  } catch {
    throw new Error("No se pudo abrir la firma electrónica: revisa el archivo .p12 y su clave.");
  }
  const keys = [
    ...(parsed.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(parsed.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ]
    .map((b) => b.key as forge.pki.rsa.PrivateKey | undefined)
    .filter((k): k is forge.pki.rsa.PrivateKey => !!k && !!k.n);
  const certs = (parsed.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => !!c);
  if (!keys.length || !certs.length) throw new Error("La firma electrónica no tiene clave privada o certificado.");

  const pairs = keys.flatMap((k) =>
    certs
      .filter((c) => {
        const pub = c.publicKey as forge.pki.rsa.PublicKey;
        return pub.n && pub.n.equals(k.n) && pub.e.equals(k.e);
      })
      .map((c) => ({ k, c })),
  );
  if (!pairs.length) throw new Error("Ningún certificado de la firma corresponde a su clave privada.");
  // Prefer the certificate meant for signing (digitalSignature / nonRepudiation).
  const signing = (c: forge.pki.Certificate) => {
    const ku = c.getExtension("keyUsage") as { digitalSignature?: boolean; nonRepudiation?: boolean } | null;
    return !ku || ku.digitalSignature || ku.nonRepudiation ? 1 : 0;
  };
  pairs.sort((a, b) => signing(b.c) - signing(a.c) || b.c.validity.notAfter.getTime() - a.c.validity.notAfter.getTime());
  const { k, c } = pairs[0];
  return {
    privateKey: k,
    certificate: c,
    certDer: forge.asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes(),
    subject: dn(c.subject.attributes),
    issuer: dn(c.issuer.attributes),
    serial: BigInt(`0x${c.serialNumber}`).toString(10),
    notBefore: c.validity.notBefore,
    notAfter: c.validity.notAfter,
  };
}

const sha1b64 = (s: string) => {
  const md = forge.md.sha1.create();
  md.update(s, "utf8");
  return forge.util.encode64(md.digest().getBytes());
};
const sha1b64Binary = (bin: string) => {
  const md = forge.md.sha1.create();
  md.update(bin, "raw");
  return forge.util.encode64(md.digest().getBytes());
};
const bigB64 = (n: forge.jsbn.BigInteger) => {
  let hex = n.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  return forge.util.encode64(forge.util.hexToBytes(hex));
};
const escText = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Ecuador local time with offset: 2026-10-02T10:15:00-05:00 */
function signingTime(d: Date) {
  const ec = new Date(d.getTime() - 5 * 3_600_000);
  return `${ec.toISOString().slice(0, 19)}-05:00`;
}

/**
 * Signs an SRI document. `xml` must be our generated document: an XML
 * declaration followed by the root element with id="comprobante".
 */
export function signSriXml(xml: string, cert: SigningCert, now = new Date()): string {
  const decl = xml.match(/^<\?xml[^>]*\?>/)?.[0] ?? "";
  const doc = xml.slice(decl.length);
  const rootName = doc.match(/^<([A-Za-z]+)[\s>]/)?.[1];
  if (!rootName || !doc.endsWith(`</${rootName}>`) || !doc.includes('id="comprobante"')) {
    throw new Error("El XML a firmar no tiene el formato esperado.");
  }
  const n = String(forge.random.getBytesSync(4).split("").reduce((a, ch) => a * 256 + ch.charCodeAt(0), 0) % 900000 + 100000);
  const sigId = `Signature${n}`;
  const spId = `${sigId}-SignedProperties${n}`;
  const certId = `Certificate${n}`;
  const refId = `Reference-ID-${n}`;

  const digestDoc = sha1b64(doc); // enveloped transform: digest without the signature

  const keyInfoInner =
    `<ds:X509Data><ds:X509Certificate>${forge.util.encode64(cert.certDer)}</ds:X509Certificate></ds:X509Data>` +
    `<ds:KeyValue><ds:RSAKeyValue><ds:Modulus>${bigB64(cert.privateKey.n)}</ds:Modulus><ds:Exponent>${bigB64(cert.privateKey.e)}</ds:Exponent></ds:RSAKeyValue></ds:KeyValue>`;
  const keyInfo = (ns: string) => `<ds:KeyInfo ${ns}Id="${certId}">${keyInfoInner}</ds:KeyInfo>`;

  const signedPropsInner =
    `<etsi:SignedSignatureProperties>` +
    `<etsi:SigningTime>${signingTime(now)}</etsi:SigningTime>` +
    `<etsi:SigningCertificate><etsi:Cert><etsi:CertDigest><ds:DigestMethod Algorithm="${DS}sha1"></ds:DigestMethod><ds:DigestValue>${sha1b64Binary(cert.certDer)}</ds:DigestValue></etsi:CertDigest>` +
    `<etsi:IssuerSerial><ds:X509IssuerName>${escText(cert.issuer)}</ds:X509IssuerName><ds:X509SerialNumber>${cert.serial}</ds:X509SerialNumber></etsi:IssuerSerial></etsi:Cert></etsi:SigningCertificate>` +
    `</etsi:SignedSignatureProperties>` +
    `<etsi:SignedDataObjectProperties><etsi:DataObjectFormat ObjectReference="#${refId}"><etsi:Description>contenido comprobante</etsi:Description><etsi:MimeType>text/xml</etsi:MimeType></etsi:DataObjectFormat></etsi:SignedDataObjectProperties>`;
  const signedProps = (ns: string) => `<etsi:SignedProperties ${ns}Id="${spId}">${signedPropsInner}</etsi:SignedProperties>`;

  const signedInfoInner =
    `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>` +
    `<ds:SignatureMethod Algorithm="${DS}rsa-sha1"></ds:SignatureMethod>` +
    `<ds:Reference Id="SignedPropertiesID${n}" Type="http://uri.etsi.org/01903#SignedProperties" URI="#${spId}"><ds:DigestMethod Algorithm="${DS}sha1"></ds:DigestMethod><ds:DigestValue>${sha1b64(signedProps(`${NS} `))}</ds:DigestValue></ds:Reference>` +
    `<ds:Reference URI="#${certId}"><ds:DigestMethod Algorithm="${DS}sha1"></ds:DigestMethod><ds:DigestValue>${sha1b64(keyInfo(`${NS} `))}</ds:DigestValue></ds:Reference>` +
    `<ds:Reference Id="${refId}" URI="#comprobante"><ds:Transforms><ds:Transform Algorithm="${DS}enveloped-signature"></ds:Transform></ds:Transforms><ds:DigestMethod Algorithm="${DS}sha1"></ds:DigestMethod><ds:DigestValue>${digestDoc}</ds:DigestValue></ds:Reference>`;
  const signedInfo = (ns: string) => `<ds:SignedInfo ${ns}Id="Signature-SignedInfo${n}">${signedInfoInner}</ds:SignedInfo>`;

  const md = forge.md.sha1.create();
  md.update(signedInfo(`${NS} `), "utf8");
  const signatureValue = forge.util.encode64(cert.privateKey.sign(md));

  const signature =
    `<ds:Signature ${NS} Id="${sigId}">` +
    signedInfo("") +
    `<ds:SignatureValue Id="SignatureValue${n}">${signatureValue}</ds:SignatureValue>` +
    keyInfo("") +
    `<ds:Object Id="${sigId}-Object${n}"><etsi:QualifyingProperties Target="#${sigId}">${signedProps("")}</etsi:QualifyingProperties></ds:Object>` +
    `</ds:Signature>`;

  return `${decl}${doc.slice(0, -`</${rootName}>`.length)}${signature}</${rootName}>`;
}
