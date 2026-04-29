import crypto from "crypto";
import fs from "fs";
import path from "path";

const rootDir = process.cwd();

const toEnvFormat = (pem) => pem.replace(/\n/g, "\\n");

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const envFiles = [
  {
    examplePath: "backend/user/.env.example",
    targetPath: "backend/user/.env",
    replacements: {
      JWT_PRIVATE_KEY: toEnvFormat(privateKey),
      JWT_PUBLIC_KEY: toEnvFormat(publicKey),
    },
  },
  {
    examplePath: "backend/chat/.env.example",
    targetPath: "backend/chat/.env",
    replacements: {
      JWT_PUBLIC_KEY: toEnvFormat(publicKey),
    },
  },
  {
    examplePath: "backend/mail/.env.example",
    targetPath: "backend/mail/.env",
    replacements: {},
  },
  {
    examplePath: "frontend/.env.example",
    targetPath: "frontend/.env.local",
    replacements: {},
  },
];

const applyReplacements = (content, replacements) => {
  return Object.entries(replacements).reduce((nextContent, [key, value]) => {
    return nextContent.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
  }, content);
};

for (const { examplePath, targetPath, replacements } of envFiles) {
  const absoluteExamplePath = path.join(rootDir, examplePath);
  const absoluteTargetPath = path.join(rootDir, targetPath);

  if (fs.existsSync(absoluteTargetPath)) {
    console.log(`Skipped existing ${targetPath}`);
    continue;
  }

  const content = fs.readFileSync(absoluteExamplePath, "utf8");
  fs.writeFileSync(
    absoluteTargetPath,
    applyReplacements(content, replacements),
    "utf8",
  );
  console.log(`Created ${targetPath}`);
}

console.log("Local env setup complete.");
