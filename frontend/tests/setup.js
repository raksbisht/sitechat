require('@testing-library/jest-dom');

global.fetch = jest.fn();

global.localStorage = {
  store: {},
  getItem: jest.fn((key) => global.localStorage.store[key] || null),
  setItem: jest.fn((key, value) => {
    global.localStorage.store[key] = value;
  }),
  removeItem: jest.fn((key) => {
    delete global.localStorage.store[key];
  }),
  clear: jest.fn(() => {
    global.localStorage.store = {};
  })
};

global.sessionStorage = {
  store: {},
  getItem: jest.fn((key) => global.sessionStorage.store[key] || null),
  setItem: jest.fn((key, value) => {
    global.sessionStorage.store[key] = value;
  }),
  removeItem: jest.fn((key) => {
    delete global.sessionStorage.store[key];
  }),
  clear: jest.fn(() => {
    global.sessionStorage.store = {};
  })
};

Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: jest.fn().mockResolvedValue(undefined),
    readText: jest.fn().mockResolvedValue('')
  },
  writable: true
});

global.alert = jest.fn();
global.confirm = jest.fn(() => true);

beforeEach(() => {
  jest.clearAllMocks();
  global.localStorage.store = {};
  global.sessionStorage.store = {};
  document.body.innerHTML = '';
});
