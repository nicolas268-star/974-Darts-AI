import { readFile } from "node:fs/promises";
const [packageJson, release] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../../backend/RELEASE.json", import.meta.url), "utf8").then(JSON.parse),
]);

if (packageJson.version !== release.version) {
  throw new Error(
    `Version incohérente : frontend ${packageJson.version}, release backend ${release.version}.`,
  );
}

console.log(`Version unique validée : ${release.version}`);
