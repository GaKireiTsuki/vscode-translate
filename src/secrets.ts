import type * as vscode from "vscode";
import type { ProviderId } from "./types";

const SECRET_PREFIX = "translate.secret.";

export type SecretField = "apiKey" | "appSecret";

function key(provider: ProviderId, field: SecretField): string {
  return `${SECRET_PREFIX}${provider}.${field}`;
}

export class Secrets {
  constructor(private readonly storage: vscode.SecretStorage) {}

  get(provider: ProviderId, field: SecretField = "apiKey"): Promise<string | undefined> {
    return Promise.resolve(this.storage.get(key(provider, field)));
  }

  set(provider: ProviderId, value: string, field: SecretField = "apiKey"): Promise<void> {
    return Promise.resolve(this.storage.store(key(provider, field), value));
  }

  delete(provider: ProviderId, field: SecretField = "apiKey"): Promise<void> {
    return Promise.resolve(this.storage.delete(key(provider, field)));
  }

  async deleteAll(provider: ProviderId): Promise<void> {
    await this.delete(provider, "apiKey");
    await this.delete(provider, "appSecret");
  }
}
