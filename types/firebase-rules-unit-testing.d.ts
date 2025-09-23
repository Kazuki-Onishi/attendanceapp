declare module '@firebase/rules-unit-testing' {
  import type { Firestore } from 'firebase/firestore';

  export interface RulesTestContext {
    firestore(): Firestore;
  }

  export interface RulesTestEnvironment {
    authenticatedContext(uid: string, token?: Record<string, unknown>): RulesTestContext;
    withSecurityRulesDisabled<T>(callback: (context: RulesTestContext) => Promise<T>): Promise<T>;
    clearFirestore(): Promise<void>;
    cleanup(): Promise<void>;
  }

  export function initializeTestEnvironment(options: {
    projectId: string;
    firestore: { rules: string };
  }): Promise<RulesTestEnvironment>;

  export function assertSucceeds<T>(promise: Promise<T>): Promise<T>;
  export function assertFails<T = unknown>(promise: Promise<T>): Promise<T>;
}
