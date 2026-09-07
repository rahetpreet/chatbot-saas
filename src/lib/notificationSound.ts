/**
 * A short two-tone chime for new conversations.
 *
 * Synthesised with the Web Audio API rather than shipping an audio file: no
 * asset to download before the first alert can play, nothing to cache-bust,
 * and it works offline.
 *
 * Browsers block audio until the user has interacted with the page, so the
 * first play after a fresh load may be silently refused. That is expected and
 * must never surface as an error.
 */

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    if (!context) context = new Ctor();
    return context;
  } catch {
    return null;
  }
}

/** Plays one note. */
function tone(ctx: AudioContext, frequency: number, startAt: number, duration: number, volume: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startAt);

  // Shaped rather than square, so it reads as a chime instead of a beep and
  // does not click at the edges.
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

/**
 * Unlocks audio on the agent's first interaction with the page.
 *
 * This is the whole reason the chime never played. A browser will only start an
 * audio context inside a user gesture, and the chime is fired from a background
 * poll — never a gesture. So the context was created suspended and stayed
 * suspended forever, and every alert was silently dropped.
 *
 * Calling `resume()` from the poll did not help either: it is asynchronous, so
 * the notes were scheduled against a clock that had not started yet and had
 * already elapsed by the time it did.
 *
 * Listening once for any click, key or touch fixes it: by the time a
 * conversation arrives, the context is already running.
 */
export function unlockNotificationSound(): () => void {
  if (typeof window === "undefined") return () => undefined;

  const unlock = () => {
    const ctx = getContext();
    if (!ctx) return;
    // Resuming an already-running context is a no-op, so this is safe to call
    // on whichever gesture happens to come first.
    if (ctx.state === "suspended") void ctx.resume();
  };

  const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
  for (const event of events) window.addEventListener(event, unlock, { once: true, passive: true });

  return () => {
    for (const event of events) window.removeEventListener(event, unlock);
  };
}

export function playNewConversationChime(volume = 0.18): void {
  const ctx = getContext();
  if (!ctx) return;

  try {
    if (ctx.state === "suspended") {
      // Still locked, so the agent has not interacted with the page yet.
      // Schedule the notes only once it is actually running, or they play
      // against a clock that has not started and are never heard.
      void ctx.resume().then(() => ring(ctx, volume)).catch(() => undefined);
      return;
    }
    ring(ctx, volume);
  } catch {
    /* audio is a nicety; never let it break the page */
  }
}

/** The two notes themselves, scheduled from the context's current clock. */
function ring(ctx: AudioContext, volume: number): void {
  const now = ctx.currentTime;
  tone(ctx, 880, now, 0.16, volume); // A5
  tone(ctx, 1174.7, now + 0.13, 0.22, volume); // D6
}

const SEEN_KEY = "chatflow_seen_conversations";

type SeenMap = Record<string, number>;

function readSeen(): SeenMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(SEEN_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeSeen(map: SeenMap): void {
  try {
    // Keep the store bounded: only the most recent few hundred matter.
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 300);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* private mode, or storage disabled */
  }
}

/**
 * True when a conversation has activity the agent has not looked at yet.
 *
 * Compared against last activity rather than a simple "seen" flag, so a
 * conversation that receives a new message after being read becomes unread
 * again.
 */
export function isUnread(conversation: { id: string; lastActiveAt?: string; startedAt?: string }): boolean {
  const seen = readSeen()[conversation.id];
  if (!seen) return true;
  const activity = new Date(conversation.lastActiveAt || conversation.startedAt || 0).getTime();
  return activity > seen;
}

export function markConversationRead(conversationId: string): void {
  const seen = readSeen();
  seen[conversationId] = Date.now();
  writeSeen(seen);
}

/** Marks everything currently listed as read, for a "clear all" action. */
export function markAllRead(conversations: Array<{ id: string }>): void {
  const seen = readSeen();
  const now = Date.now();
  for (const conversation of conversations) seen[conversation.id] = now;
  writeSeen(seen);
}
