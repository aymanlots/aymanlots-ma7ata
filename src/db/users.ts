import { db } from './index.ts';
import { users } from './schema.ts';

export async function getOrCreateUser(decodedToken: {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}) {
  try {
    const [user] = await db
      .insert(users)
      .values({
        uid: decodedToken.uid,
        email: decodedToken.email ?? '',
        displayName: decodedToken.name ?? null,
        photoUrl: decodedToken.picture ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: decodedToken.email ?? '',
          displayName: decodedToken.name ?? null,
          photoUrl: decodedToken.picture ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return user;
  } catch (dbErr) {
    console.error('[DB Error]', dbErr);
    throw new Error('Database error while syncing user');
  }
}
