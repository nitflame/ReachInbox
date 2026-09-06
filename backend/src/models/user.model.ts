import { query } from "../config/db";
import type { UserRecord } from "../types/email";

export async function findUserById(id: string): Promise<UserRecord | null> {
  const result = await query<UserRecord>(`SELECT * FROM users WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function findOrCreateUserByEmail(email: string): Promise<UserRecord> {
  const normalized = email.trim().toLowerCase();

  const existing = await query<UserRecord>(`SELECT * FROM users WHERE email = $1`, [normalized]);
  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const inserted = await query<UserRecord>(
    `INSERT INTO users (email)
     VALUES ($1)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING *`,
    [normalized]
  );

  return inserted.rows[0];
}

export interface GoogleProfileInput {
  googleId: string;
  email: string;
  name?: string | null;
  avatar?: string | null;
}

export async function findOrCreateUserByGoogleProfile(
  profile: GoogleProfileInput
): Promise<UserRecord> {
  const normalizedEmail = profile.email.trim().toLowerCase();
  const googleId = profile.googleId.trim();
  const name = profile.name?.trim() || null;
  const avatar = profile.avatar?.trim() || null;

  try {
    // 1. First look up by google_id
    const existingByGoogleId = await query<UserRecord>(
      `SELECT * FROM users WHERE google_id = $1`,
      [googleId]
    );

    if (existingByGoogleId.rows[0]) {
      const user = existingByGoogleId.rows[0];
      const updated = await query<UserRecord>(
        `UPDATE users
         SET name = COALESCE($2, name),
             avatar = COALESCE($3, avatar),
             email = $4,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [user.id, name, avatar, normalizedEmail]
      );
      return updated.rows[0];
    }

    // 2. If google_id is not found, look up by email
    const existingByEmail = await query<UserRecord>(
      `SELECT * FROM users WHERE email = $1`,
      [normalizedEmail]
    );

    if (existingByEmail.rows[0]) {
      const user = existingByEmail.rows[0];
      const linked = await query<UserRecord>(
        `UPDATE users
         SET google_id = $2,
             name = COALESCE($3, name),
             avatar = COALESCE($4, avatar),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [user.id, googleId, name, avatar]
      );
      return linked.rows[0];
    }

    // 3. Otherwise create a new user
    const inserted = await query<UserRecord>(
      `INSERT INTO users (google_id, email, name, avatar)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (google_id) DO UPDATE
         SET name = EXCLUDED.name, avatar = EXCLUDED.avatar, updated_at = NOW()
       RETURNING *`,
      [googleId, normalizedEmail, name, avatar]
    );

    return inserted.rows[0];
  } catch (err) {
    // If a unique constraint race condition occurs during concurrent logins, retry fetching by google_id or email
    const retryByGoogle = await query<UserRecord>(`SELECT * FROM users WHERE google_id = $1`, [googleId]);
    if (retryByGoogle.rows[0]) return retryByGoogle.rows[0];

    const retryByEmail = await query<UserRecord>(`SELECT * FROM users WHERE email = $1`, [normalizedEmail]);
    if (retryByEmail.rows[0]) return retryByEmail.rows[0];

    throw err;
  }
}
