import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { RawBusinessRecord, SearchInput, SearchQuery, SocialAccount, SocialPost, Store } from "../models/types.ts";

export class NicheScoutDatabase {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS search_tasks (id TEXT PRIMARY KEY, input_json TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT);
      CREATE TABLE IF NOT EXISTS search_queries (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, query_text TEXT NOT NULL, reason TEXT, FOREIGN KEY(task_id) REFERENCES search_tasks(id));
      CREATE TABLE IF NOT EXISTS stores (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, store_name TEXT NOT NULL, normalized_name TEXT NOT NULL, city TEXT NOT NULL, district TEXT, category TEXT, data_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS store_sources (id INTEGER PRIMARY KEY AUTOINCREMENT, store_id TEXT NOT NULL, source TEXT NOT NULL, external_id TEXT, source_url TEXT, raw_data TEXT NOT NULL, FOREIGN KEY(store_id) REFERENCES stores(id));
      CREATE TABLE IF NOT EXISTS social_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, external_id TEXT NOT NULL, author_type TEXT NOT NULL, data_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS social_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, external_id TEXT NOT NULL, author_type TEXT NOT NULL, raw_text TEXT, data_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS store_post_matches (id INTEGER PRIMARY KEY AUTOINCREMENT, store_id TEXT NOT NULL, post_external_id TEXT NOT NULL, match_score REAL NOT NULL, status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, store_id TEXT NOT NULL, contact_type TEXT NOT NULL, contact_value TEXT NOT NULL, source TEXT NOT NULL, source_url TEXT, confidence REAL NOT NULL, data_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS scores (store_id TEXT PRIMARY KEY, match_score REAL NOT NULL, contact_score REAL NOT NULL, priority_score REAL NOT NULL, evidence_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS raw_records (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, source TEXT NOT NULL, external_id TEXT, raw_data TEXT NOT NULL, created_at TEXT NOT NULL);
    `);
  }

  startTask(id: string, input: SearchInput, queries: SearchQuery[]): void {
    this.db.prepare("INSERT INTO search_tasks(id,input_json,status,created_at) VALUES(?,?,?,?)").run(id, JSON.stringify(input), "RUNNING", new Date().toISOString());
    const insert = this.db.prepare("INSERT INTO search_queries(task_id,query_text,reason) VALUES(?,?,?)");
    for (const query of queries) insert.run(id, query.text, query.reason);
  }

  saveRaw(taskId: string, records: RawBusinessRecord[], posts: SocialPost[], accounts: SocialAccount[]): void {
    const insert = this.db.prepare("INSERT INTO raw_records(task_id,source,external_id,raw_data,created_at) VALUES(?,?,?,?,?)");
    for (const item of [...records, ...posts, ...accounts]) insert.run(taskId, item.source, item.externalId, JSON.stringify(item.rawData), new Date().toISOString());
    const postInsert = this.db.prepare("INSERT INTO social_posts(task_id,external_id,author_type,raw_text,data_json) VALUES(?,?,?,?,?)");
    for (const post of posts) postInsert.run(taskId, post.externalId, post.authorType, `${post.title}\n${post.body}`, JSON.stringify(post));
    const accountInsert = this.db.prepare("INSERT INTO social_accounts(task_id,external_id,author_type,data_json) VALUES(?,?,?,?)");
    for (const account of accounts) accountInsert.run(taskId, account.externalId, account.authorType, JSON.stringify(account));
  }

  saveStores(taskId: string, stores: Store[]): void {
    const storeInsert = this.db.prepare("INSERT INTO stores(id,task_id,store_name,normalized_name,city,district,category,data_json) VALUES(?,?,?,?,?,?,?,?)");
    const sourceInsert = this.db.prepare("INSERT INTO store_sources(store_id,source,external_id,source_url,raw_data) VALUES(?,?,?,?,?)");
    const contactInsert = this.db.prepare("INSERT INTO contacts(store_id,contact_type,contact_value,source,source_url,confidence,data_json) VALUES(?,?,?,?,?,?,?)");
    const scoreInsert = this.db.prepare("INSERT INTO scores(store_id,match_score,contact_score,priority_score,evidence_json) VALUES(?,?,?,?,?)");
    const matchInsert = this.db.prepare("INSERT INTO store_post_matches(store_id,post_external_id,match_score,status) VALUES(?,?,?,?)");
    for (const store of stores) {
      storeInsert.run(store.id, taskId, store.storeName, store.normalizedName, store.city, store.district ?? null, store.category ?? null, JSON.stringify(store));
      for (const source of store.sources) sourceInsert.run(store.id, source.source, source.externalId, source.sourceUrl ?? null, JSON.stringify(source.rawData));
      for (const contact of store.contacts) contactInsert.run(store.id, contact.type, contact.value, contact.source, contact.sourceUrl ?? null, contact.confidence, JSON.stringify(contact));
      scoreInsert.run(store.id, store.matchScore, store.contactScore, store.priorityScore, JSON.stringify(store.evidence));
      for (const post of store.posts) matchInsert.run(store.id, post.externalId, store.entityMatchScore ?? 1, store.reviewStatus);
    }
  }

  completeTask(id: string): void {
    this.db.prepare("UPDATE search_tasks SET status='COMPLETED', completed_at=? WHERE id=?").run(new Date().toISOString(), id);
  }

  close(): void { this.db.close(); }
}
