import { exec } from "child_process";
import fs from "fs";

var ver = JSON.parse(fs.readFileSync("package.json"))["version"];
exec(`gh release create v${ver} --generate-notes`);
