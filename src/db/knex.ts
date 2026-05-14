import knex from "knex";
import knexConfig from "../../knexfile";

const db = knex(knexConfig.development);

export function getDbInstance() {
  return db;
}

export default db;