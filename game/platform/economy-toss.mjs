// Online, single-tab example. No offline queue, local grants, or cached-state replay.
// Own every wallet mutation and SDK init through this instance. Before changing
// account/game/env/base externally, close() and create a new instance; never call
// SDK.setApiBase/init behind it. options() is the game's current configuration.
const copy = value => JSON.parse(JSON.stringify(value));
const error = (code, result) => Object.assign(new Error(code), { code, result });
const integer = (n, max = 2147483647) => Number.isSafeInteger(n) && n >= 0 && n <= max;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const currency = value => typeof value === 'string' && /^[a-z][a-z0-9_]{0,31}$/.test(value) && value !== 'cash';
// JSON.parse alone loses duplicate keys and integer spelling (1.0 / 1e0).
function strictJSON(text) {
  let offset = 0;
  const token = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*"|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\]:,]/y;
  const next = () => {
    while (/\s/.test(text[offset] ?? '') && offset < text.length) offset++;
    token.lastIndex = offset; const match = token.exec(text);
    if (!match) throw error('INVALID_JSON'); offset = token.lastIndex; return match[0];
  };
  function value(t = next(), depth = 0) {
    if (depth > 32) throw error('INVALID_JSON');
    if (t === '{') {
      const out = Object.create(null), seen = new Set(); let key = next();
      if (key === '}') return out;
      for (;;) {
        if (key[0] !== '"') throw error('INVALID_JSON'); key = JSON.parse(key);
        if (seen.has(key) || next() !== ':') throw error('INVALID_JSON'); seen.add(key);
        out[key] = value(next(), depth + 1); const end = next();
        if (end === '}') return out; if (end !== ',') throw error('INVALID_JSON'); key = next();
      }
    }
    if (t === '[') {
      const out = []; let item = next(); if (item === ']') return out;
      for (;;) { out.push(value(item, depth + 1)); const end = next(); if (end === ']') return out;
        if (end !== ',') throw error('INVALID_JSON'); item = next(); }
    }
    if (t[0] === '"' || ['true','false','null'].includes(t)) return JSON.parse(t);
    if (!/^-?(0|[1-9]\d*)$/.test(t) || !Number.isSafeInteger(Number(t))) throw error('INVALID_JSON_INTEGER');
    return Number(t);
  }
  const result = value(); if (text.slice(offset).trim()) throw error('INVALID_JSON'); return result;
}
function validate(wallet, rights, env) {
  if (wallet?.ok !== true || !Array.isArray(wallet.balanceList)) throw error('INVALID_WALLET');
  const balances = Object.create(null);
  for (const row of wallet.balanceList) {
    if (!object(row) || !currency(row.currency) || Object.hasOwn(balances,row.currency) || !integer(row.balance)) throw error('INVALID_WALLET');
    balances[row.currency] = row.balance;
  }
  const t = rights?.timedBenefits;
  if (rights?.ok !== true || !Array.isArray(rights.entitlements) || !Array.isArray(rights.skus) || !object(t) ||
      t.version !== 1 || t.complete !== true || t.env !== env ||
      !['adFreeUntilUnixMs','infiniteHeartsUntilUnixMs','serverNowUnixMs'].every(k => integer(t[k],8640000000000000)) || t.serverNowUnixMs === 0) throw error('INVALID_ENTITLEMENTS');
  const owned = new Set();
  for (const row of rights.entitlements) {
    if (!object(row) || typeof row.sku !== 'string' || !row.sku.trim() || !integer(row.quantity,Number.MAX_SAFE_INTEGER) || row.quantity === 0 ||
        typeof row.created_at !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(row.created_at) ||
        !integer(Date.parse(row.created_at),t.serverNowUnixMs)) throw error('INVALID_ENTITLEMENTS');
    owned.add(row.sku);
  }
  if (new Set(rights.skus).size !== rights.skus.length || rights.skus.length !== owned.size || rights.skus.some(sku => !owned.has(sku))) throw error('INVALID_SKUS');
  return { wallet:balances, entitlements:rights.entitlements, skus:rights.skus, timedBenefits:t };
}

/**
 * boot(): shared init -> fresh snapshot -> SDK recovery -> ready snapshot.
 * recover(): explicit same-scope recovery; use after an uncertain network result.
 * buy({sku,quantity,currency}): SDK payment result, followed by a serialized UI refresh.
 * applyWallet({id,currency,amount,reason,ref?}): one ordinary server ledger action.
 *   id is generated once per user action; retain it when retrying an uncertain
 *   response. Do not create a fresh id to retry a spend. No offline replay exists.
 * close(): permanent disposal; rejects queued work and invalidates continuations.
 * getSnapshot(): isolated view or null, with volatile shopReady. No cached load.
 * AUTH_REFRESHED_RETRY means the old action failed; new scope recovery finished.
 * Its result may hold an already granted IAP receipt. Never auto-buy again.
 * This gate covers this instance only, not other tabs/devices. Server idempotency
 * remains authoritative; integrations must not create multiple active instances.
 */
export function createAitEconomy({ sdk = globalThis.GfSDK, options, fetch = globalThis.fetch,
  storage = globalThis.localStorage, gameApiBase = 'https://kzqkpbmdiyyvcsssktzc.supabase.co/functions/v1/game', restoreTimeoutMs = 25000 } = {}) {
  let closed = false, generation = 0, revision = 0, tail = Promise.resolve(), initPromise, bootPromise;
  let snapshot = null, publishedScope, ready = false, busy = 0;
  const signatures = new Map(), duration = Math.min(25000,Math.max(1,restoreTimeoutMs));
  const readOptions = () => copy(typeof options === 'function' ? options() : options);
  const base = () => String(typeof gameApiBase === 'function' ? gameApiBase() : gameApiBase).replace(/\/+$/,'');
  function capture() {
    const opts = readOptions(), session = sdk.getSession(), token = sdk.getToken();
    if (closed || !session || session.platform !== 'toss' || session.provider !== opts.gameId || !session.deviceId || !token ||
        opts.platform !== 'toss' || !['test','live'].includes(opts.toss?.env) || opts.toss.credentials ||
        opts.apiBase !== opts.toss.proxyBase || sdk.cash?.deliveryContractVersion !== 2) throw error('SESSION_NOT_READY');
    return { session, token, generation, config:JSON.stringify(opts), base:base(),
      identity:{deviceId:session.deviceId,gameId:opts.gameId,env:opts.toss.env,apiBase:opts.apiBase,proxyBase:opts.toss.proxyBase,gameApiBase:base()} };
  }
  function check(scope, lease) {
    if (closed || scope.generation !== generation || sdk.getSession() !== scope.session || sdk.getToken() !== scope.token ||
        scope.session.deviceId !== scope.identity.deviceId || scope.session.provider !== scope.identity.gameId ||
        JSON.stringify(readOptions()) !== scope.config || base() !== scope.base) throw error('ACCOUNT_CHANGED');
    if (scope.revision !== undefined && scope.revision !== revision) throw error('REVISION_CHANGED');
    if (lease && (!lease.alive || Date.now() >= lease.until)) throw error('RESTORE_TIMEOUT');
  }
  async function initialize() {
    if (!initPromise) {
      if (closed) throw error('CLOSED');
      const opts = readOptions(), expected = JSON.stringify(opts), epoch = ++generation;
      ready = false;
      initPromise = (async () => {
        const session = await sdk.init(opts);
        if (closed || epoch !== generation || expected !== JSON.stringify(readOptions()) || sdk.getSession() !== session) throw error('ACCOUNT_CHANGED');
        return capture();
      })();
    }
    try { return await initPromise; } finally { initPromise = undefined; }
  }
  async function limited(scope, run) {
    check(scope); const lease = { alive:true, until:Date.now()+duration, controller:new AbortController() }; let timer;
    try { return await Promise.race([run(lease), new Promise((_,reject) => { timer = setTimeout(() => {
      lease.alive = false; lease.controller.abort(); reject(error('RESTORE_TIMEOUT'));
    },duration); })]); }
    finally { lease.alive = false; clearTimeout(timer); lease.controller.abort(); }
  }
  async function request(scope, lease, endpoint, body) {
    check(scope,lease);
    const response = await fetch(scope.base+endpoint,{method:body===undefined?'GET':'POST', cache:'no-store', signal:lease.controller.signal,
      headers:{Authorization:'Bearer '+scope.token,'Content-Type':'application/json'}, ...(body===undefined?{}:{body:JSON.stringify(body)})});
    check(scope,lease);
    if (response.status === 401) { scope.authRequired = true; throw error('AUTH_REQUIRED'); }
    if (!response.ok) throw error('HTTP_'+response.status);
    const text = await response.text(); check(scope,lease); return strictJSON(text);
  }
  async function fresh(scope) {
    return limited(scope, async lease => {
      const wallet = await request(scope,lease,'/wallet'); check(scope,lease);
      const rights = await request(scope,lease,'/entitlements?env='+scope.identity.env); check(scope,lease);
      const state = validate(wallet,rights,scope.identity.env);
      const next = { version:1, scope:scope.identity, generation, revision:revision+1, ...state };
      check(scope,lease);
      // One atomic native setItem, one owner key. A failed write cannot change RAM or ACK.
      storage.setItem('gf:ait-economy:v1:'+encodeURIComponent(JSON.stringify(scope.identity)),JSON.stringify(next));
      check(scope,lease); snapshot = next; publishedScope = scope; scope.revision = ++revision;
      return true;
    });
  }
  function restore(scope) {
    let finish;
    const completion = new Promise(resolve => { finish = resolve; });
    const notify = async receipt => {
      try {
        check(scope);
        if (scope.authRequired || receipt?.ok !== true || receipt.found !== true || receipt.grantState !== 'granted' ||
            receipt.deviceId !== scope.identity.deviceId || receipt.gameId !== scope.identity.gameId || receipt.env !== scope.identity.env ||
            !receipt.orderId || !receipt.transactionId || !receipt.productId) throw error('RECEIPT_SCOPE');
        // Report the queue-owned snapshot result; this callback never starts a writer.
        const restored = await completion; check(scope); return restored === true;
      } catch (e) { scope.restoreError = e; return false; }
    };
    return {notify,finish};
  }
  function afterSDK(scope,result) {
    check(scope);
    if (scope.authRequired) throw error('AUTH_REQUIRED',result);
    return result;
  }
  async function bootstrap(scope) {
    const ui = restore(scope); let restored = false;
    try {
      await fresh(scope); check(scope);
      const result = afterSDK(scope,await sdk.transactions.recover({restore:ui.notify}));
      if (result?.success !== true || scope.restoreError) throw error('RECOVERY_PENDING',result);
      await fresh(scope); check(scope); restored = true; ready = true; return getSnapshot();
    } finally { ui.finish(restored); }
  }
  function enqueue(kind, run, needsReady = true, input) {
    let captured, held;
    try { if (kind !== 'boot') captured = capture(); held = input===undefined ? undefined : copy(input); } catch(e) { return Promise.reject(e); }
    const job = tail.then(async () => {
      let scope; busy++;
      try {
        if (captured) check(captured);
        if (needsReady && !ready) throw error('RECOVERY_REQUIRED');
        scope = captured ?? await initialize(); check(scope); scope.revision = revision;
        try { return await run(scope,held); }
        catch (e) {
          ready = false;
          if (!scope.authRequired) throw e;
          check(scope); // Never reauthenticate an externally changed owner's request.
          const newScope = await initialize(); check(newScope); newScope.revision = revision;
          // Old SDK purchase/recovery has settled and ACK=false before this separate cycle.
          await bootstrap(newScope); check(newScope);
          if (kind === 'boot' || kind === 'recover') return getSnapshot();
          throw error('AUTH_REFRESHED_RETRY',e.result); // Never replay an old buy or spend.
        }
      } catch(e) { if (e.code !== 'AUTH_REFRESHED_RETRY') ready = false; throw e; }
      finally { busy--; }
    });
    tail = job.catch(() => {}); return job;
  }
  function getSnapshot() {
    if (!snapshot) return null;
    try { check(publishedScope); return { ...copy(snapshot), shopReady:ready && busy===0 }; } catch { return null; }
  }
  return {
    boot() {
      if (!bootPromise) {
        bootPromise = enqueue('boot',bootstrap,false).then(() => getSnapshot());
        void bootPromise.finally(() => { bootPromise = undefined; }).catch(() => {});
      }
      return bootPromise;
    },
    recover:() => enqueue('recover',bootstrap,false).then(() => getSnapshot()),
    buy:input => enqueue('buy',async (scope,held) => {
      const ui = restore(scope); let restored = false;
      try {
      const result = await sdk.transactions.purchase(held,{restore:ui.notify});
      ready = false;
      if (result?.success !== true) return result;
      // Native payment is already complete. Retain this queue's writer lock while
      // refreshing the UI, and never replace the successful payment result with a UI error.
      try { await fresh(scope); check(scope); restored = true; ready = true; }
      catch (e) {
        scope.restoreError = e;
        if (scope.authRequired) {
          try {
            check(scope);
            const newScope = await initialize(); check(newScope); newScope.revision = revision;
            await bootstrap(newScope); check(newScope);
          } catch { ready = false; }
        }
      }
      return result;
      } finally { ui.finish(restored); }
    },true,input),
    applyWallet:input => enqueue('applyWallet',async (scope,held) => {
      const {id,currency:unit,amount,reason,ref} = held ?? {};
      if (typeof id !== 'string' || !id.trim() || id.length>200 || !currency(unit) || !Number.isSafeInteger(amount) ||
          amount===0 || Math.abs(amount)>1000000000 || !['ad','mission','play','shop','use'].includes(reason) ||
          (ref!==undefined && (typeof ref!=='string' || ref.length>200))) throw error('INVALID_MUTATION');
      const body = {currency:unit,amount,reason,idem:id+':'+unit,...(ref===undefined?{}:{ref})};
      const key = JSON.stringify(scope.identity)+body.idem, signature = JSON.stringify(body);
      if (signatures.has(key) && signatures.get(key)!==signature) throw error('idempotency input changed');
      signatures.set(key,signature); // Keep the original ID on uncertain outcomes; no automatic replay.
      const result = await limited(scope,lease=>request(scope,lease,'/wallet/apply',body)); check(scope);
      if (!integer(result.balance) || !((result.ok===true && ['OK','DUPLICATE'].includes(result.status)) ||
          (result.ok===false && result.status==='INSUFFICIENT'))) throw error('INVALID_MUTATION_RESULT');
      // A duplicate response's balance may be historical. Re-read current authoritative state.
      await fresh(scope); check(scope); ready = true; return result;
    },true,input),
    close() { closed = true; generation++; ready = false; snapshot = null; },
    getSnapshot
  };
}
