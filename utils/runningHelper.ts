const { exec } = require("child_process");
import { execSync } from "child_process";

async function runScript(command: string): Promise<boolean> {
  await execSync(command, { stdio: "inherit" });
  return true;
}

export default runScript;
