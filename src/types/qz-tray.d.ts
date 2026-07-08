// qz-tray ships no TypeScript types. This app only ever calls a handful of
// promise-based methods (see src/lib/qz-print.ts), so a loose ambient type
// is enough rather than hand-modeling the whole API surface.
declare module "qz-tray" {
  const qz: {
    websocket: {
      connect: (options?: Record<string, unknown>) => Promise<void>;
      isActive: () => boolean;
      disconnect: () => Promise<void>;
    };
    printers: {
      find: (query?: string) => Promise<string | string[]>;
      getDefault: () => Promise<string>;
    };
    configs: {
      create: (printer: string, options?: Record<string, unknown>) => unknown;
    };
    print: (config: unknown, data: unknown[]) => Promise<void>;
    security: {
      setCertificatePromise: (
        promiseCall: (resolve: (cert: string) => void, reject: (err?: unknown) => void) => void,
      ) => void;
      setSignaturePromise: (
        promiseFactory: (
          toSign: string,
        ) => (resolve: (signature: string) => void, reject: (err?: unknown) => void) => void,
      ) => void;
      setSignatureAlgorithm: (algorithm: string) => void;
    };
  };
  export default qz;
}
