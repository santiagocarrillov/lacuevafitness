// Self-signed test certificate packed as .p12 (tests only — never a real signature).
import forge from "node-forge";

export function makeTestP12(password: string, opts: { cn?: string } = {}): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "0a1b2c3d4e";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  const attrs = [
    { name: "commonName", value: opts.cn ?? "PRUEBA LA CUEVA" },
    { name: "organizationName", value: "Pruebas & Cía" },
    { name: "countryName", value: "EC" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([{ name: "keyUsage", digitalSignature: true, nonRepudiation: true }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const asn = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: "3des" });
  return Buffer.from(forge.asn1.toDer(asn).getBytes(), "binary");
}
