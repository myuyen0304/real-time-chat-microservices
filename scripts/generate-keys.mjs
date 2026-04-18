import crypto from "crypto";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const toEnvFormat = (pem) => pem.replace(/\n/g, "\\n");

console.log("=== Copy vào backend/user/.env ===");
console.log(`JWT_PRIVATE_KEY=${toEnvFormat(privateKey)}`);
console.log(`JWT_PUBLIC_KEY=${toEnvFormat(publicKey)}`);
console.log("\n=== Copy vào backend/chat/.env ===");
console.log(`JWT_PUBLIC_KEY=${toEnvFormat(publicKey)}`);
