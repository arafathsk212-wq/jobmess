const fs = require('fs/promises');
const path = require('path');

const dataDirectory = path.join(__dirname, 'data');
const storePath = path.join(dataDirectory, 'store.json');

const defaultStore = {
  linkedinSession: null,
  imports: [],
  campaigns: [],
};

async function ensureStore() {
  await fs.mkdir(dataDirectory, { recursive: true });

  try {
    await fs.access(storePath);
  } catch (error) {
    await fs.writeFile(storePath, JSON.stringify(defaultStore, null, 2));
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(storePath, 'utf8');

  if (!raw.trim()) {
    return { ...defaultStore };
  }

  const parsed = JSON.parse(raw);
  return {
    ...defaultStore,
    ...parsed,
    imports: Array.isArray(parsed.imports) ? parsed.imports : [],
    campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
  };
}

async function writeStore(store) {
  await ensureStore();
  await fs.writeFile(storePath, JSON.stringify(store, null, 2));
  return store;
}

async function updateStore(mutator) {
  const store = await readStore();
  const nextStore = (await mutator(store)) || store;
  await writeStore(nextStore);
  return nextStore;
}

module.exports = {
  dataDirectory,
  storePath,
  readStore,
  writeStore,
  updateStore,
};
