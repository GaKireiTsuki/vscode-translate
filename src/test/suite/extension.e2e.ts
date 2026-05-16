import * as assert from "node:assert";
import * as vscode from "vscode";

suite("vscode-translate activation", () => {
  suiteSetup(async function () {
    this.timeout(20_000);
    for (let i = 0; i < 40; i++) {
      const ext = vscode.extensions.all.find((e) => e.id.endsWith(".vscode-translate"));
      if (ext) {
        if (!ext.isActive) await ext.activate();
        return;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("vscode-translate extension not found in test host");
  });

  test("registers all eight contributed commands", async () => {
    const all = await vscode.commands.getCommands(true);
    const expected = [
      "translate.selection",
      "translate.toggleHover",
      "translate.setApiKey",
      "translate.clearApiKey",
      "translate.clearCache",
      "translate.showUsagePanel",
      "translate.resetStats",
      "translate.switchProvider",
    ];
    for (const id of expected) {
      assert.ok(all.includes(id), `Missing command: ${id}`);
    }
  });

  test("configuration exposes documented defaults", () => {
    const cfg = vscode.workspace.getConfiguration("translate");
    assert.strictEqual(cfg.get("activeProvider"), "openai");
    assert.strictEqual(cfg.get("hover.enabled"), false);
    assert.strictEqual(cfg.get("selection.autoOnSelect"), false);
    assert.strictEqual(cfg.get("cache.maxEntries"), 500);
    assert.strictEqual(cfg.get("maxCharsPerRequest"), 4000);
  });

  test("updating activeProvider persists at global scope", async () => {
    const cfg = vscode.workspace.getConfiguration("translate");
    const original = cfg.get<string>("activeProvider");
    try {
      await cfg.update("activeProvider", "deepl", vscode.ConfigurationTarget.Global);
      const after = vscode.workspace.getConfiguration("translate").get<string>("activeProvider");
      assert.strictEqual(after, "deepl");
    } finally {
      await cfg.update("activeProvider", original, vscode.ConfigurationTarget.Global);
    }
  });
});
