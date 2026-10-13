import { emptyProgress, migrateProgress } from "./logic.js";

function browserStore() {
  try {
    if (typeof localStorage === "undefined") return null;
    const probe = "__chuanyue_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

function memoryStore() {
  const memory = new Map();
  return {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
}

const durable = browserStore() || memoryStore();
const session = typeof sessionStorage !== "undefined" ? sessionStorage : memoryStore();

export function loadProgress(storageKey) {
  try {
    const raw = durable.getItem(storageKey);
    if (!raw) return emptyProgress();
    return migrateProgress(JSON.parse(raw));
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(storageKey, progress) {
  durable.setItem(storageKey, JSON.stringify(progress));
}

export function clearProgress(storageKey, sessionKey, resultKey) {
  durable.removeItem(storageKey);
  session.removeItem(sessionKey);
  session.removeItem(resultKey);
}

export function loadSession(key) {
  try {
    const raw = session.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(key, value) {
  if (value == null) session.removeItem(key);
  else session.setItem(key, JSON.stringify(value));
}
