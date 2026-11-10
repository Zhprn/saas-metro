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
          keys[type] = {
            ...(keys[type] || {}),
            ...data[type],
          };
        }
      },
    },
  };

  const saveCreds = async () => {
    await prisma.waSession.upsert({
      where: { id: sessionId },
      update: {
        data: JSON.parse(
          JSON.stringify({ creds: state.creds, keys }, BufferJSON.replacer),
        ),
      },
      create: {
        id: sessionId,
        data: JSON.parse(
          JSON.stringify({ creds: state.creds, keys }, BufferJSON.replacer),
        ),
      },
    });
  };

  return { state, saveCreds };
};
