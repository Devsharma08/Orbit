import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const destination = new URL("../dist/sql/schema.sql", import.meta.url);
await mkdir(fileURLToPath(new URL("../dist/sql/", import.meta.url)), {
  recursive: true,
});
await copyFile(new URL("../sql/schema.sql", import.meta.url), destination);
