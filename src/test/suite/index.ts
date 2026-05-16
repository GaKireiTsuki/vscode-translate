import * as path from "node:path";
import { glob } from "glob";
import Mocha from "mocha";

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: "tdd", color: true, timeout: 20_000 });
  const testsRoot = path.resolve(__dirname, "..");
  const files = await glob("suite/**/*.e2e.js", { cwd: testsRoot });
  for (const f of files) mocha.addFile(path.resolve(testsRoot, f));
  await new Promise<void>((resolve, reject) => {
    try {
      mocha.run((failures) =>
        failures ? reject(new Error(`${failures} test(s) failed.`)) : resolve(),
      );
    } catch (e) {
      reject(e);
    }
  });
}
