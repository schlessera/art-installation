/**
 * Actor Self-Registration
 *
 * This module provides a function for actors to self-register with the runtime.
 * When an actor bundle is loaded, it should call registerActor() to make itself
 * available to the scheduler.
 *
 * @example
 * ```typescript
 * import { registerActor } from '@art/actor-sdk';
 *
 * const myActor: Actor = { ... };
 *
 * // Self-register when the bundle loads
 * registerActor(myActor);
 *
 * export default myActor;
 * ```
 */

import type { Actor } from '@art/types';

/**
 * Global registration function exposed by the runtime.
 */
declare global {
  interface Window {
    __registerActor?: (actor: Actor, bundlePath: string) => void;
  }
}

/**
 * Register an actor with the runtime.
 * This should be called when the actor bundle loads.
 *
 * @param actor - The actor to register
 * @param bundlePath - Optional bundle path (defaults to current script URL)
 */
export function registerActor(actor: Actor, bundlePath?: string): void {
  // Determine bundle path from current script if not provided
  const path = bundlePath ?? detectBundlePath();

  if (typeof window !== 'undefined' && window.__registerActor) {
    window.__registerActor(actor, path);
    console.log(`[Actor] Registered: ${actor.metadata.id}`);
  } else {
    console.warn(
      `[Actor] Runtime not ready. Actor ${actor.metadata.id} will be registered when runtime loads.`
    );
    // Queue for later registration
    queueForRegistration(actor, path);
  }
}

/**
 * Queue for actors that load before the runtime.
 */
const pendingActors: Array<{ actor: Actor; path: string }> = [];

/**
 * Queue an actor for registration when runtime becomes available.
 */
function queueForRegistration(actor: Actor, path: string): void {
  pendingActors.push({ actor, path });

  // Set up a watcher for when the runtime becomes available
  if (typeof window !== 'undefined') {
    const checkInterval = setInterval(() => {
      if (window.__registerActor) {
        clearInterval(checkInterval);
        // Register all pending actors
        for (const pending of pendingActors) {
          window.__registerActor(pending.actor, pending.path);
          console.log(`[Actor] Registered (delayed): ${pending.actor.metadata.id}`);
        }
        pendingActors.length = 0;
      }
    }, 100);

    // Give up after 30 seconds
    setTimeout(() => clearInterval(checkInterval), 30000);
  }
}

/**
 * Detect the current script's URL for bundle path.
 */
function detectBundlePath(): string {
  if (typeof document !== 'undefined') {
    // Try to get the current script
    const currentScript = document.currentScript as HTMLScriptElement | null;
    if (currentScript?.src) {
      return currentScript.src;
    }

    // Fallback: check for module import.meta.url
    // This won't work in all contexts, so we use a fallback
  }

  return 'unknown';
}

/**
 * Check if the runtime is available.
 */
export function isRuntimeAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.__registerActor;
}

/**
 * Get the number of pending registrations.
 */
export function getPendingCount(): number {
  return pendingActors.length;
}
