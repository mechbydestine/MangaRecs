// The units under test are pure functions, but they live in modules that also
// import AsyncStorage and the Supabase client at the top level. Neither has a
// native module under Jest, so both are stubbed here rather than importing the
// pure helpers from somewhere artificial.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// utils/connectivity registers a NetInfo listener at import time. Under Jest
// the real one keeps a native handle open and the worker never exits cleanly.
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: () => () => {},
  fetch: async () => ({ isConnected: true, isInternetReachable: true }),
}));

jest.mock('./supabase', () => {
  // Chainable no-op query builder: every method returns the builder, and
  // awaiting it resolves to an empty result. Enough for modules that build
  // queries at import time without ever running them in these tests.
  const builder = () => {
    const b = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'then') return undefined; // not a thenable until awaited
          return () => b;
        },
      }
    );
    return b;
  };
  return {
    supabase: {
      from: () => builder(),
      auth: {
        getSession: async () => ({ data: { session: null } }),
        getUser: async () => ({ data: { user: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => {},
    },
  };
});

// Sentry pulls in a native module and keeps a worker handle open under Jest.
jest.mock('@sentry/react-native', () => ({
  init: () => {},
  captureException: () => {},
  setUser: () => {},
}));

global.__DEV__ = true;
