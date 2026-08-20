import fs from "node:fs";
import { upsertJob } from "../../plugins/pi/scripts/lib/state.mjs";

const [cwd, startFile, id] = process.argv.slice(2);
while (!fs.existsSync(startFile)) {
  await new Promise((resolve) => setTimeout(resolve, 1));
}
for (let index = 0; index < 10; index += 1) {
  upsertJob(cwd, { id, status: "running", sequence: index });
}
