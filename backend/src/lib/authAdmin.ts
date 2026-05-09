import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "./config";

export interface AuthAdminClient {
  deleteUser(authUserId: string): Promise<void>;
  createConfirmedEmailUser?(input: { email: string; password: string }): Promise<{ id: string; email?: string }>;
}

export class SupabaseAuthAdminClient implements AuthAdminClient {
  private readonly client: SupabaseClient;

  constructor(private readonly config: AppConfig) {
    if (!this.config.supabaseServiceRoleKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for auth user deletion.");
    }

    this.client = createClient(this.config.supabaseProjectUrl, this.config.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });
  }

  async deleteUser(authUserId: string): Promise<void> {
    const { error } = await this.client.auth.admin.deleteUser(authUserId, true);
    if (error) {
      throw new Error(`Supabase auth deletion failed: ${error.message}`);
    }
  }

  async createConfirmedEmailUser(input: { email: string; password: string }): Promise<{ id: string; email?: string }> {
    const email = input.email.trim().toLowerCase();
    const createResult = await this.client.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true
    });

    if (!createResult.error && createResult.data.user) {
      return { id: createResult.data.user.id, email: createResult.data.user.email };
    }

    const message = createResult.error?.message ?? "";
    if (!/already|exists|registered/i.test(message)) {
      throw new Error(`Supabase auth user creation failed: ${message || "Unknown error"}`);
    }

    const { data, error: listError } = await this.client.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) {
      throw new Error(`Supabase auth user lookup failed: ${listError.message}`);
    }

    const existing = data.users.find((user) => user.email?.toLowerCase() === email);
    if (!existing) {
      throw new Error("Supabase auth user already exists, but could not be found for confirmation.");
    }

    const updateResult = await this.client.auth.admin.updateUserById(existing.id, {
      password: input.password,
      email_confirm: true
    });
    if (updateResult.error || !updateResult.data.user) {
      throw new Error(`Supabase auth user confirmation failed: ${updateResult.error?.message ?? "Unknown error"}`);
    }

    return { id: updateResult.data.user.id, email: updateResult.data.user.email };
  }
}
