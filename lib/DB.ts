//import Client from "pg/lib/native/client.js";
import { Client } from "pg";
import Pool from "pg-pool";

export type Json = string | number | boolean | null | Json[] | JsonObject;
export type JsonObject = { [key: string]: Json };

export function interpolate(jsonpath: string, vars: Json): string {
  const obj = typeof vars !== "object" || vars === null ? [vars] : vars;
  return jsonpath.replace(/\$[_A-Za-z][_0-9A-Za-z]*/, (match) =>
    // @ts-ignore: Element implicitly has an 'any' type
    JSON.stringify(obj[match.slice(1)] ?? null)
  );
}

export class DB<TSource extends JsonObject> {
  client: Client;
  counter: number;
  cached_getByUUID: Map<string, TSource>;
  cached_getByUniqueKey: Map<string, string>;
  cached_queryJsonPath: Map<string, string[]>;
  pending_getByUUID: Set<string>;
  pending_getByUniqueKey: Set<string>;
  pending_queryJsonPath: Set<string>;
  promise: Promise<void> | null;
  lastbatch: number;
  constructor(client: Client) {
    this.client = client;
    this.counter = 0;
    this.cached_getByUUID = new Map();
    this.cached_getByUniqueKey = new Map();
    this.cached_queryJsonPath = new Map();
    this.pending_getByUUID = new Set();
    this.pending_getByUniqueKey = new Set();
    this.pending_queryJsonPath = new Set();
    this.promise = null;
    this.lastbatch = -1;
  }
  async _fetchBatch(): Promise<void> {
    //await null; // may not wait long enough
    //setimmediate because it is after the promise queue
    await new Promise((resolve) => setImmediate(resolve));
    // Also works since nextTick
    //await new Promise(resolve => process.nextTick(resolve));
    const batch = this.counter++;
    const pending_getByUUID = Array.from(this.pending_getByUUID);
    const pending_getByUniqueKey = Array.from(this.pending_getByUniqueKey);
    const pending_queryJsonPath = Array.from(this.pending_queryJsonPath);
    this.pending_getByUUID = new Set();
    this.pending_getByUniqueKey = new Set();
    this.pending_queryJsonPath = new Set();
    const options = {
      id: pending_getByUUID,
      uk: pending_getByUniqueKey,
      jp: pending_queryJsonPath.map((query) => JSON.parse(query)),
    };
    const values = [JSON.stringify(options)];
    const name = "fetchbatch";
    const text = `\
WITH filtered AS NOT MATERIALIZED (
  SELECT * FROM items WHERE items.allowed @@ '$.view[*] == "system.Everyone"'
),
options AS MATERIALIZED (SELECT $1::jsonb as options)
SELECT 'id' as kind, null AS index, filtered.id::text AS id, object
FROM options, filtered, jsonb_array_elements_text(options->'id') AS ids(id)
WHERE filtered.id = ids.id::uuid
UNION ALL
SELECT 'uk' as kind, index - 1, filtered.id::text AS id, object
FROM options, filtered, jsonb_array_elements_text(options->'uk') WITH ORDINALITY queries(query, index)
WHERE uniquekeys @@ query::jsonpath
UNION ALL
SELECT 'jp' as kind, index - 1, null AS id, COALESCE((
  SELECT jsonb_agg(id ORDER BY object->(query->>'orderBy'), id)
  FROM filtered
  WHERE object @@ (query->>'path')::jsonpath
), '[]'::jsonb) AS object
FROM options, jsonb_array_elements(options->'jp') WITH ORDINALITY queries(query, index)
;`;
    type Row =
      | { kind: "id"; index: null; id: string; object: TSource }
      | { kind: "uk"; index: number; id: string; object: TSource }
      | { kind: "jp"; index: number; id: null; object: string[] };
    const result = await this.client.query<Row>({ name, text, values });
    for (const row of result.rows) {
      switch (row.kind) {
        case "id":
          this.cached_getByUUID.set(row.id, row.object);
          break;
        case "uk":
          this.cached_getByUniqueKey.set(
            pending_getByUniqueKey[row.index]!,
            row.id
          );
          if (!this.cached_getByUUID.has(row.id)) {
            this.cached_getByUUID.set(row.id, row.object);
          }
          break;
        case "jp":
          this.cached_queryJsonPath.set(
            pending_queryJsonPath[row.index]!,
            row.object
          );
          break;
        default:
          throw new Error("unreachable");
      }
    }
    this.promise = null;
    this.lastbatch = batch;
  }
  async _pending(): Promise<void> {
    const batch = this.counter;
    while (this.lastbatch !== batch) {
      if (this.promise === null) {
        this.promise = this._fetchBatch();
      }
      await this.promise;
    }
  }
  async getByUUID(itemid: string): Promise<TSource | undefined> {
    let obj = this.cached_getByUUID.get(itemid);
    if (obj !== undefined) {
      return obj;
    }
    this.pending_getByUUID.add(itemid);
    await this._pending();
    return this.cached_getByUUID.get(itemid);
  }
  async getByUniqueKey(ns: string, name: string): Promise<TSource | undefined> {
    const query = `$.${JSON.stringify(ns)}==${JSON.stringify(name)}`;
    let itemid = this.cached_getByUniqueKey.get(query);
    if (itemid === undefined) {
      this.pending_getByUniqueKey.add(query);
      await this._pending();
      itemid = this.cached_getByUniqueKey.get(query);
      if (itemid === undefined) {
        return undefined;
      }
    }
    return this.cached_getByUUID.get(itemid);
  }
  async queryJsonPath(
    path: string,
    vars: Json = null,
    orderBy?: string
  ): Promise<string[]> {
    const query = JSON.stringify({ path: interpolate(path, vars), orderBy });
    let itemids = this.cached_queryJsonPath.get(query);
    if (itemids !== undefined) {
      return itemids;
    }
    this.pending_queryJsonPath.add(query);
    await this._pending();
    return this.cached_queryJsonPath.get(query) ?? [];
  }
}

const config = {};
const pool = new Pool(config);

export function withDB<TSource extends JsonObject, Args extends any[], R>(
  fn: (db: DB<TSource>, ...args: Args) => R | Promise<R>
): (...args: Args) => Promise<R> {
  return async (...args) => {
    // XXX This should be deferred until first use.
    const client = await pool.connect();
    let erred = false;
    let result;
    try {
      await client.query("BEGIN");
      const db = new DB<TSource>(client);
      result = await fn(db, ...args);
    } catch (err) {
      erred = true;
      throw err;
    } finally {
      await client.query("ROLLBACK");
      client.release(erred);
    }
    return result;
  };
}
