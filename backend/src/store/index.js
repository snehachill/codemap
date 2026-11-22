import { config } from '../config.js';
import { dimensions } from '../embed/index.js';
import { createMemoryStore } from './memory.js';
import { createMongoStore } from './mongo.js';

export async function createStore() {
  const store = config.mongoUri ? await createMongoStore(config.mongoUri, config.dbName) : createMemoryStore();
  await store.init(dimensions);
  return store;
}
