import {
  AuthenticationState,
  BufferJSON,
  initAuthCreds,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import { PrismaService } from 'src/prisma/prisma.service';

export const useDbAuthState = async (
  sessionId: string,
  prisma: PrismaService,
): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  dispose: () => Promise<void>;
}> => {
  const existing = await prisma.waSession.findUnique({
    where: { id: sessionId },
  });

  let creds = initAuthCreds();
  let keys: any = {};

  if (existing?.data) {
    const restored = JSON.parse(
      JSON.stringify(existing.data),
      BufferJSON.reviver,
    );

    creds = restored.creds;
    keys = restored.keys || {};
  }

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async (type, ids) => {
        const data = keys[type] || {};
        const result: { [id: string]: any } = {};

        for (const id of ids) {
          if (data[id]) {
            result[id] = data[id];
          }
        }

        return result;
      },
      set: async (data) => {
        for (const type in data) {
          const current = { ...(keys[type] || {}) };
          for (const id in data[type]) {
            const value = data[type][id];
            // Baileys passes null to delete a key (e.g. consumed pre-keys)
            if (value === null || value === undefined) delete current[id];
            else current[id] = value;
          }
          keys[type] = current;
        }
        // Signal keys (sessions, pre-keys, sender keys) MUST be persisted too,
        // otherwise they are lost on restart and the session breaks (Bad MAC / no decrypt).
        scheduleSave();
      },
    },
  };

  let disposed = false;

  const writeToDb = async () => {
    if (disposed) return;
    const data = JSON.parse(
      JSON.stringify({ creds: state.creds, keys }, BufferJSON.replacer),
    );
    await prisma.waSession.upsert({
      where: { id: sessionId },
      update: { data },
      create: { id: sessionId, data },
    });
  };

  // Serialise writes so an older snapshot never overwrites a newer one,
  // and debounce bursts of key updates into a single write.
  let saving: Promise<void> = Promise.resolve();
  let timer: NodeJS.Timeout | null = null;

  const saveCreds = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    saving = saving.then(writeToDb, writeToDb).catch((err) => {
      console.error(`[WA auth] Failed to save creds for ${sessionId}:`, err);
    });
    return saving;
  };

  const scheduleSave = () => {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void saveCreds();
    }, 500);
  };

  /** Stop all future writes (call before deleting the stored credentials). */
  const dispose = async () => {
    disposed = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    await saving;
  };

  return { state, saveCreds, dispose };
};

/** Remove stored credentials so the next connect starts fresh with a new QR. */
export const clearDbAuthState = async (
  sessionId: string,
  prisma: PrismaService,
) => {
  await prisma.waSession.deleteMany({ where: { id: sessionId } });
};
