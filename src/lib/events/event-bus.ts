import { EventEmitter } from "node:events";
import type { RunEvent } from "@/lib/types";

type GlobalWithBus = typeof globalThis & {
  __agenticEventBus?: EventEmitter;
};

const globalForBus = globalThis as GlobalWithBus;
const bus = globalForBus.__agenticEventBus ?? new EventEmitter();
bus.setMaxListeners(200);
globalForBus.__agenticEventBus = bus;

const keyForRun = (runId: string) => `run:${runId}`;

export function publishRunEvent(event: RunEvent) {
  bus.emit(keyForRun(event.runId), event);
}

export function subscribeToRun(runId: string, callback: (event: RunEvent) => void) {
  const key = keyForRun(runId);
  bus.on(key, callback);
  return () => {
    bus.off(key, callback);
  };
}

