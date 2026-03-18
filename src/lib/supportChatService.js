import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  setDoc,
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { auth, db } from "@/lib/firebase";

const SUPPORT_CHATS_COLLECTION = "supportChats";
const SUPPORT_ACTIVE_SESSION_KEY = "vicmar_support_active_session";
const SUPPORT_VISITOR_ID_KEY = "vicmar_support_visitor_id";
const SUPPORT_CHATS_FALLBACK_KEY = "vicmar_support_chats_fallback";
const LOCAL_CHANGE_EVENT = "vicmar-support-chat-updated";

let supportSessionsCache = [];
let supportAuthPromise = null;

function safeParse(value, fallbackValue) {
  if (!value) {
    return fallbackValue;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallbackValue;
  }
}

function isPermissionDeniedError(error) {
  return error?.code === "permission-denied" || String(error?.message ?? "").includes("Missing or insufficient permissions");
}

function logUnexpectedError(error) {
  if (!isPermissionDeniedError(error)) {
    console.error(error);
  }
}

async function ensureSupportAuth(allowAnonymous = true) {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  if (!allowAnonymous) {
    throw new Error("Support chat requires authenticated user.");
  }

  if (supportAuthPromise) {
    return supportAuthPromise;
  }

  supportAuthPromise = signInAnonymously(auth)
    .then((credential) => credential.user)
    .catch((error) => {
      throw error;
    })
    .finally(() => {
      supportAuthPromise = null;
    });

  return supportAuthPromise;
}

function generateId(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getFallbackSessions() {
  const rawValue = localStorage.getItem(SUPPORT_CHATS_FALLBACK_KEY);
  const parsedValue = safeParse(rawValue, []);
  return Array.isArray(parsedValue) ? parsedValue : [];
}

function saveFallbackSessions(sessions, shouldBroadcast = true) {
  localStorage.setItem(SUPPORT_CHATS_FALLBACK_KEY, JSON.stringify(sessions));
  if (shouldBroadcast) {
    window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
  }
}

function nowIso() {
  return new Date().toISOString();
}

function sortByUpdatedAtDesc(sessions) {
  return [...sessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function syncCacheFromSessions(sessions) {
  supportSessionsCache = sortByUpdatedAtDesc(sessions);
  return supportSessionsCache;
}

function createBotMessage(text) {
  return {
    id: generateId("msg"),
    sender: "bot",
    text,
    createdAt: nowIso(),
  };
}

function getOrCreateVisitorId() {
  const storedVisitorId = localStorage.getItem(SUPPORT_VISITOR_ID_KEY);
  if (storedVisitorId) {
    return storedVisitorId;
  }

  const nextVisitorId = generateId("visitor");
  localStorage.setItem(SUPPORT_VISITOR_ID_KEY, nextVisitorId);
  return nextVisitorId;
}

function getFallbackSessionById(chatId) {
  return getFallbackSessions().find((session) => session.id === chatId) ?? null;
}

function upsertFallbackSession(session, shouldBroadcast = true) {
  const nextSessions = [
    ...getFallbackSessions().filter((item) => item.id !== session.id),
    session,
  ];

  saveFallbackSessions(nextSessions, shouldBroadcast);
  syncCacheFromSessions(nextSessions);
  return session;
}

function deleteFallbackSession(chatId, shouldBroadcast = true) {
  const nextSessions = getFallbackSessions().filter((session) => session.id !== chatId);
  saveFallbackSessions(nextSessions, shouldBroadcast);
  syncCacheFromSessions(nextSessions);
}

function mutateFallbackSession(chatId, mutator) {
  const existing = getFallbackSessionById(chatId);
  if (!existing) {
    return null;
  }

  const nextSession = mutator(existing);
  if (!nextSession) {
    return null;
  }

  return upsertFallbackSession(nextSession);
}

function normalizeMessage(rawMessage, index = 0) {
  return {
    id: String(rawMessage?.id ?? generateId(`msg-${index}`)),
    sender: String(rawMessage?.sender ?? "bot"),
    text: String(rawMessage?.text ?? ""),
    adminName: rawMessage?.adminName ? String(rawMessage.adminName) : undefined,
    createdAt: String(rawMessage?.createdAt ?? nowIso()),
  };
}

function toWritableMessage(rawMessage, index = 0) {
  const writableMessage = {
    id: String(rawMessage?.id ?? generateId(`msg-${index}`)),
    sender: String(rawMessage?.sender ?? "bot"),
    text: String(rawMessage?.text ?? ""),
    createdAt: String(rawMessage?.createdAt ?? nowIso()),
  };

  const adminName = String(rawMessage?.adminName ?? "").trim();
  if (adminName) {
    writableMessage.adminName = adminName;
  }

  return writableMessage;
}

function normalizeSession(sessionId, rawSession) {
  const visitorId = String(rawSession?.visitorId ?? "");
  const normalizedMessages = Array.isArray(rawSession?.messages)
    ? rawSession.messages.map((message, index) => normalizeMessage(message, index))
    : [];

  return {
    id: sessionId,
    createdAt: String(rawSession?.createdAt ?? nowIso()),
    updatedAt: String(rawSession?.updatedAt ?? rawSession?.createdAt ?? nowIso()),
    status: String(rawSession?.status ?? "bot"),
    liveAgentRequested: Boolean(rawSession?.liveAgentRequested),
    visitorId,
    visitorLabel: String(rawSession?.visitorLabel ?? `Visitor ${(visitorId || sessionId).slice(-4).toUpperCase()}`),
    messages: normalizedMessages,
  };
}

function stripSessionForWrite(session) {
  return {
    createdAt: String(session.createdAt ?? nowIso()),
    updatedAt: String(session.updatedAt ?? session.createdAt ?? nowIso()),
    status: String(session.status ?? "bot"),
    liveAgentRequested: session.liveAgentRequested,
    visitorId: String(session.visitorId ?? ""),
    visitorLabel: String(session.visitorLabel ?? "Visitor"),
    messages: Array.isArray(session.messages)
      ? session.messages.map((message, index) => toWritableMessage(message, index))
      : [],
  };
}

function createSessionObject(visitorId) {
  const resolvedVisitorId = String(visitorId || getOrCreateVisitorId());
  const sessionId = generateId("chat");
  const createdAt = nowIso();

  return {
    id: sessionId,
    createdAt,
    updatedAt: createdAt,
    status: "bot",
    liveAgentRequested: false,
    visitorId: resolvedVisitorId,
    visitorLabel: `Visitor ${resolvedVisitorId.slice(-4).toUpperCase()}`,
    messages: [
      createBotMessage("Hi! I am Vicmar assistant. Choose a question below or type your own question."),
    ],
  };
}

async function mutateSession(chatId, mutator, options = {}) {
  const sessionRef = doc(db, SUPPORT_CHATS_COLLECTION, chatId);
  const fallbackSession = getFallbackSessionById(chatId);
  const allowAnonymous = options.allowAnonymous ?? true;

  try {
    const user = await ensureSupportAuth(allowAnonymous);
    const authUid = user?.uid ?? "";

    const nextSession = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(sessionRef);
      if (!snapshot.exists() && !fallbackSession) {
        return null;
      }

      let currentSession = snapshot.exists()
        ? normalizeSession(snapshot.id, snapshot.data())
        : normalizeSession(chatId, fallbackSession);

      if (!snapshot.exists() && authUid) {
        currentSession = {
          ...currentSession,
          visitorId: authUid,
          visitorLabel: `Visitor ${authUid.slice(-4).toUpperCase()}`,
        };
      }

      const mutatedSession = mutator(currentSession);
      if (!mutatedSession) {
        return null;
      }

      transaction.set(sessionRef, stripSessionForWrite(mutatedSession), { merge: true });
      return mutatedSession;
    });

    if (nextSession) {
      upsertFallbackSession(nextSession, false);
    }

    return nextSession;
  } catch (error) {
    console.error(error);
    return mutateFallbackSession(chatId, mutator);
  }
}

export async function getOrCreateActiveSupportSession() {
  const activeId = localStorage.getItem(SUPPORT_ACTIVE_SESSION_KEY);
  if (activeId) {
    const cachedSession = supportSessionsCache.find((session) => session.id === activeId);
    if (cachedSession) {
      return cachedSession;
    }

    const fallbackSession = getFallbackSessionById(activeId);
    let fallbackCandidate = fallbackSession;

    try {
      await ensureSupportAuth();
      const snapshot = await getDoc(doc(db, SUPPORT_CHATS_COLLECTION, activeId));
      if (snapshot.exists()) {
        const nextSession = normalizeSession(snapshot.id, snapshot.data());
        upsertFallbackSession(nextSession, false);
        return nextSession;
      }
    } catch (error) {
      if (isPermissionDeniedError(error)) {
        if (localStorage.getItem(SUPPORT_ACTIVE_SESSION_KEY) === activeId) {
          localStorage.removeItem(SUPPORT_ACTIVE_SESSION_KEY);
        }
        deleteFallbackSession(activeId, false);
        fallbackCandidate = null;
      } else {
        logUnexpectedError(error);
      }
    }

    if (fallbackCandidate) {
      return fallbackCandidate;
    }
  }

  return await createSupportSession();
}

export async function createSupportSession() {
  let authVisitorId = "";

  try {
    const user = await ensureSupportAuth();
    authVisitorId = user?.uid ?? "";
    if (authVisitorId) {
      localStorage.setItem(SUPPORT_VISITOR_ID_KEY, authVisitorId);
    }
  } catch (error) {
    logUnexpectedError(error);
  }

  const newSession = createSessionObject(authVisitorId);

  try {
    if (!auth.currentUser) {
      await ensureSupportAuth();
    }

    await setDoc(
      doc(db, SUPPORT_CHATS_COLLECTION, newSession.id),
      stripSessionForWrite(newSession),
      { merge: true },
    );
  } catch (error) {
    logUnexpectedError(error);
  }

  upsertFallbackSession(newSession);
  localStorage.setItem(SUPPORT_ACTIVE_SESSION_KEY, newSession.id);

  return newSession;
}

export function getSupportSession(chatId) {
  return supportSessionsCache.find((session) => session.id === chatId)
    ?? getFallbackSessionById(chatId)
    ?? null;
}

export function getAllSupportSessions() {
  if (supportSessionsCache.length === 0) {
    syncCacheFromSessions(getFallbackSessions());
  }

  return sortByUpdatedAtDesc(supportSessionsCache);
}

function subscribeToFallbackSessions(onChange, options = {}) {
  const scopedChatId = options.chatId ? String(options.chatId) : "";

  const notify = () => {
    const nextSessions = syncCacheFromSessions(getFallbackSessions());
    if (scopedChatId) {
      onChange(nextSessions.filter((session) => session.id === scopedChatId));
      return;
    }

    onChange(nextSessions);
  };

  const handleStorage = (event) => {
    if (event.key && event.key !== SUPPORT_CHATS_FALLBACK_KEY) {
      return;
    }

    notify();
  };

  notify();
  window.addEventListener("storage", handleStorage);
  window.addEventListener(LOCAL_CHANGE_EVENT, notify);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(LOCAL_CHANGE_EVENT, notify);
  };
}

export function subscribeToSupportSessions(onChange, onError, options = {}) {
  const allowAnonymous = options.allowAnonymous ?? true;
  const scopedChatId = options.chatId ? String(options.chatId) : "";
  const unsubscribeFallback = subscribeToFallbackSessions(onChange, { chatId: scopedChatId });
  let unsubscribeFirestore = () => {};

  let fallbackEnabled = false;

  const enableFallbackOnly = (error) => {
    if (fallbackEnabled) {
      return;
    }

    fallbackEnabled = true;
    logUnexpectedError(error);
    if (onError) {
      onError(error);
    }
  };

  let isCancelled = false;

  const startFirestoreSync = async () => {
    try {
      await ensureSupportAuth(allowAnonymous);
      if (isCancelled) {
        return;
      }

      if (scopedChatId) {
        const sessionDocRef = doc(db, SUPPORT_CHATS_COLLECTION, scopedChatId);
        unsubscribeFirestore = onSnapshot(
          sessionDocRef,
          (snapshot) => {
            if (!snapshot.exists()) {
              deleteFallbackSession(scopedChatId, false);
              onChange([]);
              return;
            }

            const nextSession = normalizeSession(snapshot.id, snapshot.data());
            upsertFallbackSession(nextSession, false);
            onChange([nextSession]);
          },
          (error) => {
            enableFallbackOnly(error);
          },
        );
      } else {
        const collectionRef = collection(db, SUPPORT_CHATS_COLLECTION);
        unsubscribeFirestore = onSnapshot(
          collectionRef,
          (snapshot) => {
            const nextSessions = [];

            snapshot.forEach((sessionDoc) => {
              nextSessions.push(normalizeSession(sessionDoc.id, sessionDoc.data()));
            });

            supportSessionsCache = sortByUpdatedAtDesc(nextSessions);
            saveFallbackSessions(supportSessionsCache, false);
            onChange(supportSessionsCache);
          },
          (error) => {
            enableFallbackOnly(error);
          },
        );
      }
    } catch (error) {
      enableFallbackOnly(error);
    }
  };

  startFirestoreSync();

  return () => {
    isCancelled = true;
    unsubscribeFallback();
    unsubscribeFirestore();
  };
}

export async function appendUserMessage(chatId, text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    return null;
  }

  return await mutateSession(chatId, (session) => {
    const createdAt = nowIso();

    return {
      ...session,
      updatedAt: createdAt,
      messages: [
        ...(session.messages ?? []),
        {
          id: generateId("msg"),
          sender: "user",
          text: trimmed,
          createdAt,
        },
      ],
    };
  });
}

export async function appendBotMessage(chatId, text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    return null;
  }

  return await mutateSession(chatId, (session) => {
    const createdAt = nowIso();

    return {
      ...session,
      updatedAt: createdAt,
      messages: [
        ...(session.messages ?? []),
        {
          ...createBotMessage(trimmed),
          createdAt,
        },
      ],
    };
  });
}

export async function requestLiveAgent(chatId) {
  return await mutateSession(chatId, (session) => {
    if (session.liveAgentRequested) {
      return session;
    }

    const createdAt = nowIso();

    return {
      ...session,
      updatedAt: createdAt,
      status: "awaiting-agent",
      liveAgentRequested: true,
      messages: [
        ...(session.messages ?? []),
        {
          id: generateId("msg"),
          sender: "system",
          text: "Live agent request submitted. An admin will reply here soon.",
          createdAt,
        },
      ],
    };
  });
}

export async function setConversationStatus(chatId, status) {
  return await mutateSession(chatId, (session) => ({
    ...session,
    status,
    updatedAt: nowIso(),
  }));
}

export async function appendAdminMessage(chatId, text, adminName = "Admin") {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    return null;
  }

  return await mutateSession(chatId, (session) => {
    const createdAt = nowIso();

    return {
      ...session,
      status: "agent-connected",
      liveAgentRequested: true,
      updatedAt: createdAt,
      messages: [
        ...(session.messages ?? []),
        {
          id: generateId("msg"),
          sender: "admin",
          text: trimmed,
          adminName,
          createdAt,
        },
      ],
    };
  });
}

export async function endSupportSession(chatId) {
  try {
    await ensureSupportAuth();
    await deleteDoc(doc(db, SUPPORT_CHATS_COLLECTION, chatId));
  } catch (error) {
    logUnexpectedError(error);
  }

  if (localStorage.getItem(SUPPORT_ACTIVE_SESSION_KEY) === chatId) {
    localStorage.removeItem(SUPPORT_ACTIVE_SESSION_KEY);
  }

  deleteFallbackSession(chatId);
  return null;
}
