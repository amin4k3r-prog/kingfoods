import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const dataUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const cache = new Map();
function moduleUrl(path) {
  if (cache.has(path)) return cache.get(path);
  let source = readFileSync(path, 'utf8');
  if (path === resolve(root, 'lib/server.ts')) source = `
    export const db=()=>globalThis.__labelsTest.db;
    export const bucket=()=>({delete:async()=>{}});
    export function sameOrigin(r){if(r.headers.get('origin')&&r.headers.get('origin')!==new URL(r.url).origin)throw new Error('Origem inválida');}
    export const failure=e=>Response.json({error:e.message},{status:e.name==='Unauthenticated'?401:400});`;
  if (path === resolve(root, 'lib/auth.ts')) source = `
    export async function requireUser(){if(!globalThis.__labelsTest.authorized)throw Object.assign(new Error('Sessão encerrada'),{name:'Unauthenticated'});return {id:'u',name:'Teste'};}
    export const audit=async()=>{};`;
  if (path === resolve(root, 'lib/metric-history.ts')) source = 'export const recordMetricHistory=async()=>[];';
  let js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  js = js.replace(/from\s+['"]([^'"]+)['"]/g, (match, specifier) => {
    const file = specifier.startsWith('@/') ? resolve(root, specifier.slice(2)) : resolve(dirname(path), specifier);
    return `from ${JSON.stringify(moduleUrl(file + '.ts'))}`;
  });
  const url = dataUrl(js); cache.set(path, url); return url;
}

test('labels survive real delete/import handlers, remain per installment, and only explicit removal clears them', async () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  // Start from the existing production schema; the feature initializes itself.
  for (const name of readdirSync(resolve(root, 'drizzle')).filter(n => /^000[0-6].*\.sql$/.test(n)).sort())
    sql.exec(readFileSync(resolve(root, 'drizzle', name), 'utf8'));
  sql.exec("INSERT INTO users(id,name,login,password_hash,created_at,updated_at) VALUES('u','Teste','teste','unused','2026-10-21','2026-10-21')");
  globalThis.__labelsTest = {
    authorized: true,
    db: {
      prepare(query) {
        let args = [];
        return {
          bind(...values) { args = values; return this; },
          async all() { return { results: sql.prepare(query).all(...args) }; },
          async first() { return sql.prepare(query).get(...args) ?? null; },
          async run() { return { meta: sql.prepare(query).run(...args) }; },
        };
      },
      async batch(operations) {
        sql.exec('BEGIN');
        try { const result = []; for (const op of operations) result.push(await op.run()); sql.exec('COMMIT'); return result; }
        catch (error) { sql.exec('ROLLBACK'); throw error; }
      },
    },
  };
  const labels = await import(moduleUrl(resolve(root, 'app/api/title-label/route.ts')));
  const board = await import(moduleUrl(resolve(root, 'app/api/board/route.ts')));
  const importer = await import(moduleUrl(resolve(root, 'app/api/import/route.ts')));
  const post = (api, body, origin = 'https://test') => api.POST(new Request('https://test/api', {
    method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify(body),
  }));
  const ok = async response => { const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); return body; };
  const getCards = async () => (await ok(await board.GET(new Request('https://test/api/board')))).cards;
  const importDocuments = async documents => ok(await post(importer, {
    presentDocuments: documents,
    rows: documents.map(document => ({ document, customer: 'BAR DO GAUCHO II LTDA', due: '2026-10-01', amount: 283256,
      balance_display: '2.832,56', charge_type: '', seller: '', customer_id: null })),
  }));
  try {
    await importDocuments(['23184 - 1 - 2', '23184 - 1 - 3']);
    let card = (await getCards()).find(c => c.document === '23184 - 1 - 2');
    const originalId = card.id;
    const save = (text = 'EM CARTORIO', color = 'red') => post(labels, { action: 'save', id: card.id, document: card.document, text, color });
    await ok(await save());
    assert.deepEqual((await getCards()).find(c => c.id === card.id).label, { text: 'EM CARTORIO', color: 'red' });
    assert.equal((await getCards()).find(c => c.document.endsWith('3')).label, null);
    // Runtime initialization and a later migration can be applied in either order.
    sql.exec(readFileSync(resolve(root, 'drizzle/0007_persistent_title_labels.sql'), 'utf8'));
    await ok(await post(board, { action: 'delete_all_titles' }));
    assert.equal((await getCards()).length, 0);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM title_labels').get().n, 1);
    await importDocuments(['23184-1-2', '23184-1-3']);
    card = (await getCards()).find(c => c.document === '23184-1-2');
    assert.notEqual(card.id, originalId);
    assert.deepEqual(card.label, { text: 'EM CARTORIO', color: 'red' });
    for (const color of ['green', 'yellow', 'red']) {
      await ok(await save('  ACORDO EM ANDAMENTO  ', color));
      assert.deepEqual((await getCards()).find(c => c.id === card.id).label, { text: 'ACORDO EM ANDAMENTO', color });
    }
    await ok(await post(board, { action: 'paid', id: card.id, paid: 1 }));
    assert.equal((await getCards()).find(c => c.id === card.id).label.text, 'ACORDO EM ANDAMENTO');
    // Import also deletes absent titles: labels must survive that path too.
    await ok(await post(board, { action: 'paid', id: card.id, paid: 0 }));
    await importDocuments(['23184-1-3']);
    assert.equal((await getCards()).some(c => c.id === card.id), false);
    await importDocuments(['23184-1-2', '23184-1-3']);
    card = (await getCards()).find(c => c.document === '23184-1-2');
    assert.equal(card.label.text, 'ACORDO EM ANDAMENTO');
    // Individual title deletion must behave the same way.
    await ok(await post(board, { action: 'delete', id: card.id }));
    await importDocuments(['23184-1-2', '23184-1-3']);
    card = (await getCards()).find(c => c.document === '23184-1-2');
    assert.equal(card.label.text, 'ACORDO EM ANDAMENTO');
    for (const [text, color] of [['', 'red'], [' ', 'red'], ['x'.repeat(121), 'red'], ['Valid', 'blue']])
      assert.equal((await save(text, color)).status, 400);
    assert.equal((await post(labels, { action: 'save', id: card.id, document: 'other', text: 'x', color: 'red' })).status, 400);
    assert.equal((await post(labels, { action: 'save', id: 'missing', document: card.document, text: 'x', color: 'red' })).status, 400);
    assert.equal((await post(labels, null)).status, 400);
    assert.equal((await post(labels, { action: 'remove', id: card.id, document: card.document }, 'https://foreign')).status, 400);
    globalThis.__labelsTest.authorized = false;
    assert.equal((await save()).status, 401);
    assert.equal((await board.GET(new Request('https://test/api/board'))).status, 401);
    globalThis.__labelsTest.authorized = true;
    await ok(await post(labels, { action: 'remove', id: card.id, document: card.document }));
    await ok(await post(board, { action: 'delete_all_titles' }));
    await importDocuments(['23184-1-2']);
    assert.equal((await getCards())[0].label, null);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM title_labels').get().n, 0);
    assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action='remove_title_label'").get().n, 1);
  } finally {
    sql.close(); delete globalThis.__labelsTest;
  }
});
