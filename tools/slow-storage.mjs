// THE DEVICE'S STORAGE, MADE SLOW OR SHORT FROM OUTSIDE — for the walks that
// measure what the app does while it waits on storage (decisions 075 and 076).
//
// Nothing here changes the app. Every lever is a browser API answered
// differently, installed with `page.addInitScript(slowStorage, cfg)` before
// any of the app's code runs, and the app's own code does the rest.
//
// THE DELETE IS HELD, NOT FAKED. The reproduction behind 075 found that a
// transaction stays alive only inside its own request callbacks, so a timer
// cannot keep one open — a chain of reads of a key that cannot exist, each
// issued from the last one's success handler, can. The ended session's range
// delete is therefore really uncommitted for `slow` ms and the chunk store is
// really locked against every other write, which is what a slow delete on the
// device does. Used by tools/keep-walk.mjs and section 8 of tools/a11y-walk.mjs.

/** THE INSTRUMENTS, as a function Playwright serialises into the page.
 *
 *  Takes `cfg`:
 *  - `slow` — ms to hold each ended photo's delete (a range delete on
 *    ips-session/chunks) open; 0 for none. Every such delete is logged in
 *    `window.__sweep` with its start and completion times.
 *  - `estimate` — "none" answers estimate() with nothing left of the
 *    allowance, "plenty" with a terabyte of it, a number with that many bytes
 *    left; absent leaves the browser's own.
 *  - `estimateDelay` — ms estimate() takes to answer.
 *  - `neverPersist` — persist() returns a promise that never settles and
 *    persisted() says no: Firefox with its prompt unanswered.
 *  - `quotaWhileDeleting` — N: once the first held delete has started, every
 *    write of a session photo's row is refused with a QuotaExceededError while
 *    fewer than N of them have completed — a nearly full disk, whose room only
 *    comes back as the old set goes. DECIDED WHEN THE WRITE RUNS, not when it
 *    is queued: a write queued behind the last held delete runs after that
 *    delete has committed, when under this model the room is back, and one
 *    decided at the call was refused for room that had already returned.
 *    Counted in `window.__quotaPlanted`, and each refusal timed in
 *    `window.__quotaAt` at the moment it reaches the app.
 *  - `quotaShape` — how that refusal arrives.
 *    "abort" (the default): the transaction aborts with a QuotaExceededError
 *    AFTER its last request has succeeded, so only `abort` fires — as
 *    Chromium reports a commit that did not fit, which only the app's
 *    `onabort` sees.
 *    "request": a REQUEST fails with a QuotaExceededError while the
 *    transaction's own `error` is still null — WebKit's refusal when its
 *    capacity-based allowance is exceeded ("Failed to PutOrAdd in database
 *    because not enough space for domain"). Not a full disk: WebKit never
 *    names a full disk that way.
 *    "full": a REQUEST fails with an UnknownError, "Unable to store record in
 *    object store", the transaction's `error` still null — what WebKit gives
 *    when SQLite finds the DISK full (SQLiteIDBBackingStore::addRecord maps
 *    every SQLite failure to it). The name says nothing about room.
 *  - `quotaSkip` — N: the first N row writes after the delete starts go
 *    through, so some of a set is stored before the refusals begin.
 *  - `quotaAlways` — a name fragment: that photo's row is refused for room
 *    every time, delete or no delete — a disk that is simply full.
 *  - `writeFail` — a name fragment: that photo's row write fails for a reason
 *    that is NOT room (an UnknownError at the commit, after the last request,
 *    so only `abort` fires), every time, counted in `window.__writeFailed`.
 *  - `clearAbort` — while `window.__clearAbort` is set (a walk sets it when it
 *    wants the refusal), every clear of the session index fails at its commit:
 *    the clear itself succeeds and the transaction then aborts with an
 *    UnknownError, so only `abort` fires — a disk that could not write the
 *    deletion. Counted in `window.__clearAborted`.
 *  - `openFail` — while `window.__openFail` is set, opening the session
 *    database fails with the UnknownError WebKit gives once its connection to
 *    the storage process is lost ("Connection to Indexed Database server lost.
 *    Refresh the page to try again"), as after a page sat in the background:
 *    nothing stored can be reached at all. Counted in `window.__openFailed`.
 *  - `failReread` — a pattern (a RegExp source) over file names: once
 *    `window.__failRereadArmed` is set, the first whole read of a matching
 *    file works and every later one fails, as a file changed or gone between
 *    two reads would.
 *  - `slowSlice` — { match, ms }: a slice of a file whose name holds `match`
 *    takes `ms` to read — a head that arrives only with the whole download.
 *  - `slowFullRead` — { match, ms }: the whole read of such a file takes `ms`.
 *  - `window.__slowFileReads` (ms, 0 until a walk sets it) delays every whole
 *    read of a picked file, the way a slow NEF read does.
 *  - `holdWrites` — ms to hold each session photo's write open once it starts,
 *    so a set is still being stored long after its first photo is on screen.
 *  - `hangSniff` — a name fragment: a SLICE of a picked file whose name holds
 *    it never finishes reading, the way a cloud placeholder does. The whole
 *    file still reads. Counted in `window.__sniffHung`.
 *  Also, always: `window.__slowReads` (ms, 0 until a walk sets it) delays the
 *  answer to every read of stored photo bytes; every modal open and close is
 *  logged AT THE CALL in `window.__dlg`; every word the busy card says, and
 *  every count beside it, in `window.__busyText` and `window.__busyCount`; and
 *  each Keep press in `window.__keeps`.
 *
 *  Returns nothing. What callers rely on: it is self-contained — it runs in
 *  the page and can close over nothing from this module. */
export function slowStorage(cfg) {
  const L = (window.__sweep = []);
  if (cfg.slow > 0) {
    const orig = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (key) {
      const rq = orig.call(this, key);
      const tx = this.transaction;
      if (!(key instanceof IDBKeyRange) || this.name !== "chunks" || tx.db.name !== "ips-session") return rq;
      const e = { t0: performance.now(), tComplete: null };
      L.push(e);
      // The app assigns oncomplete BEFORE it calls delete (session.ts
      // dropBytes), so it can be wrapped: the stamp lands before the app's own
      // handler and whatever it releases.
      const appHandler = tx.oncomplete;
      tx.oncomplete = (ev) => { e.tComplete = performance.now(); appHandler?.call(tx, ev); };
      const store = this, deadline = e.t0 + cfg.slow;
      const hold = () => { if (performance.now() < deadline) store.get(["\u0000never", -1]).onsuccess = hold; };
      hold();
      return rq;
    };
  }
  if (cfg.estimate || cfg.estimateDelay || cfg.estimate === 0) {
    const orig = StorageManager.prototype.estimate;
    StorageManager.prototype.estimate = async function () {
      if (cfg.estimateDelay) await new Promise((r) => setTimeout(r, cfg.estimateDelay));
      if (cfg.estimate === "none") return { usage: 4e9, quota: 4e9 };
      if (cfg.estimate === "plenty") return { usage: 1e9, quota: 1e12 };
      // A number: that many bytes left in the allowance.
      if (typeof cfg.estimate === "number") return { usage: 4e9, quota: 4e9 + cfg.estimate };
      return orig.call(this);
    };
  }
  if (cfg.neverPersist) {
    StorageManager.prototype.persist = function () { window.__persistAsked = (window.__persistAsked || 0) + 1; return new Promise(() => {}); };
    StorageManager.prototype.persisted = function () { return Promise.resolve(false); };
  }
  if (cfg.openFail) {
    const origOpen = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name, ...a) {
      if (!window.__openFail || name !== "ips-session") return origOpen.call(this, name, ...a);
      window.__openFailed = (window.__openFailed || 0) + 1;
      // A request that fails as the real one does: its handlers are assigned
      // after open() returns, and the error arrives in a later task.
      const rq = { result: undefined, error: new DOMException("planted by the walk: Connection to Indexed Database server lost. Refresh the page to try again", "UnknownError") };
      setTimeout(() => rq.onerror?.({ target: rq, type: "error" }), 0);
      return rq;
    };
  }
  if (cfg.quotaWhileDeleting || cfg.holdWrites || cfg.quotaAlways || cfg.writeFail || cfg.clearAbort) {
    // THE ERROR A FAILED COMMIT CARRIES. An abort by script leaves the
    // transaction's `error` null, so the transactions failed here answer for
    // it themselves: a QuotaExceededError for a disk with no room, an
    // UnknownError for a write or a deletion that could not be made.
    const planted = new WeakMap();
    const errDesc = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, "error");
    Object.defineProperty(IDBTransaction.prototype, "error", {
      configurable: true,
      get() { const e = planted.get(this); return e ? new DOMException(e[1], e[0]) : errDesc.get.call(this); },
    });
    const ROOM = ["QuotaExceededError", "planted by the walk: no room on the disk"];
    // THE REQUEST-LEVEL SHAPES. A second add of the same row fails at the
    // request with a ConstraintError while `transaction.error` is still null —
    // the WebKit shape — and this getter makes that request's error the one
    // WebKit gives: a QuotaExceededError for its allowance ("request"), an
    // UnknownError for a full disk ("full").
    const plantedRq = new WeakMap();
    const rqErr = Object.getOwnPropertyDescriptor(IDBRequest.prototype, "error");
    Object.defineProperty(IDBRequest.prototype, "error", {
      configurable: true,
      get() { const e = plantedRq.get(this); return e ? new DOMException(e[1], e[0]) : rqErr.get.call(this); },
    });
    const RQ = {
      request: ["QuotaExceededError", "planted by the walk: Failed to PutOrAdd in database because not enough space for domain"],
      full: ["UnknownError", "planted by the walk: Unable to store record in object store"],
    };
    const fired = () => (window.__quotaAt ||= []).push(performance.now());
    // THE LAST REQUEST OF EACH WRITE. A commit that fails does so after every
    // request has succeeded, so nothing is left for an abort to fail and only
    // `abort` fires. Aborting from the row's own success failed every chunk
    // request still queued, their errors reached the app's `onerror` first, and
    // its `onabort` — the only handler a real Chromium commit failure reaches —
    // was never tested.
    const lastOf = new WeakMap();
    const failAtCommit = (tx, rq, err, then) => (lastOf.get(tx) ?? rq).addEventListener("success", () => {
      planted.set(tx, err);
      then?.();
      try { tx.abort(); } catch { /* already over */ }
    });
    /** Refuse this write for room — called from the row request's success
     *  handler, so the transaction is running and still active. */
    const refuse = (store, tx, rq, a) => {
      window.__quotaPlanted = (window.__quotaPlanted || 0) + 1;
      if (RQ[cfg.quotaShape]) {
        const rq2 = origAdd.apply(store, a);
        plantedRq.set(rq2, RQ[cfg.quotaShape]);
        rq2.addEventListener("error", fired);
        return;
      }
      failAtCommit(tx, rq, ROOM, fired);
    };
    let passed = 0;
    const origAdd = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...a) {
      const rq = origAdd.apply(this, a);
      const tx = this.transaction;
      if (tx.db.name !== "ips-session") return rq;
      if (this.name === "chunks") { lastOf.set(tx, rq); return rq; }
      if (this.name !== "meta") return rq;
      const store = this;
      const name = a[0]?.name ?? "";
      rq.addEventListener("success", () => {
        if (cfg.writeFail && name.includes(cfg.writeFail)) {
          window.__writeFailed = (window.__writeFailed || 0) + 1;
          failAtCommit(tx, rq, ["UnknownError", "planted by the walk: the write could not be made"]);
          return;
        }
        const deleting = L.length > 0 && L.filter((e) => e.tComplete !== null).length < (cfg.quotaWhileDeleting || 0);
        if (cfg.quotaAlways && name.includes(cfg.quotaAlways)) refuse(store, tx, rq, a);
        else if (cfg.quotaWhileDeleting && deleting && passed++ >= (cfg.quotaSkip || 0)) refuse(store, tx, rq, a);
        else if (cfg.holdWrites) {
          // Timed from the moment the transaction actually runs, not from when
          // it was queued behind another.
          const deadline = performance.now() + cfg.holdWrites;
          const hold = () => { if (performance.now() < deadline) store.get("\u0000never").onsuccess = hold; };
          hold();
        }
      });
      return rq;
    };
    if (cfg.clearAbort) {
      const origClear = IDBObjectStore.prototype.clear;
      IDBObjectStore.prototype.clear = function (...a) {
        const rq = origClear.apply(this, a);
        const tx = this.transaction;
        if (!window.__clearAbort || this.name !== "meta" || tx.db.name !== "ips-session") return rq;
        rq.addEventListener("success", () => {
          window.__clearAborted = (window.__clearAborted || 0) + 1;
          planted.set(tx, ["UnknownError", "planted by the walk: the deletion could not be written"]);
          try { tx.abort(); } catch { /* already over */ }
        });
        return rq;
      };
    }
  }
  {
    // READS OF PICKED FILES: a slice (a head-sniff) or the whole file, slowed,
    // stalled or failed by name. One patch for all of them, so the plants
    // cannot fight over Blob.prototype.
    const sliceOf = new WeakMap();
    const origSlice = Blob.prototype.slice;
    Blob.prototype.slice = function (...a) {
      const b = origSlice.apply(this, a);
      if (this instanceof File) sliceOf.set(b, this.name);
      return b;
    };
    const reads = new Map();
    const origAB = Blob.prototype.arrayBuffer;
    const later = (ms, p) => new Promise((res, rej) => setTimeout(() => p.then(res, rej), ms));
    Blob.prototype.arrayBuffer = function () {
      const sliced = sliceOf.get(this);
      if (sliced !== undefined) {
        if (cfg.hangSniff && sliced.includes(cfg.hangSniff)) { window.__sniffHung = (window.__sniffHung || 0) + 1; return new Promise(() => {}); }
        if (cfg.slowSlice && sliced.includes(cfg.slowSlice.match)) { window.__slowSliced = (window.__slowSliced || 0) + 1; return later(cfg.slowSlice.ms, origAB.call(this)); }
        return origAB.call(this);
      }
      if (this instanceof File) {
        if (cfg.failReread && new RegExp(cfg.failReread).test(this.name) && window.__failRereadArmed) {
          const n = (reads.get(this.name) || 0) + 1;
          reads.set(this.name, n);
          if (n > 1) { window.__rereadFailed = (window.__rereadFailed || 0) + 1; return Promise.reject(new DOMException("planted by the walk: the file changed", "NotReadableError")); }
        }
        if (cfg.slowFullRead && this.name.includes(cfg.slowFullRead.match)) return later(cfg.slowFullRead.ms, origAB.call(this));
        if (window.__slowFileReads > 0) return later(window.__slowFileReads, origAB.call(this));
      }
      return origAB.call(this);
    };
  }
  window.__slowReads = 0;
  window.__slowFileReads = 0;
  const origGetAll = IDBObjectStore.prototype.getAll;
  IDBObjectStore.prototype.getAll = function (...a) {
    const rq = origGetAll.apply(this, a);
    const ms = window.__slowReads || 0;
    if (ms > 0 && this.name === "chunks" && this.transaction.db.name === "ips-session") {
      const d = Object.getOwnPropertyDescriptor(IDBRequest.prototype, "onsuccess");
      Object.defineProperty(rq, "onsuccess", {
        configurable: true,
        get() { return d.get.call(this); },
        set(fn) { d.set.call(this, fn ? (ev) => setTimeout(() => fn.call(this, ev), ms) : fn); },
      });
    }
    return rq;
  };
  const D = (window.__dlg = []);
  const so = HTMLDialogElement.prototype.showModal, cl = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.showModal = function () { D.push({ t: performance.now(), id: this.id, op: "open", text: this.id === "busy" ? document.getElementById("busyText")?.textContent ?? "" : "" }); return so.call(this); };
  HTMLDialogElement.prototype.close = function (...a) { if (this.open) D.push({ t: performance.now(), id: this.id, op: "close" }); return cl.apply(this, a); };
  const B = (window.__busyText = []);
  const C = (window.__busyCount = []);
  const K = (window.__keeps = []);
  document.addEventListener("click", (ev) => { if (ev.target?.closest?.("#qlKeep")) K.push(performance.now()); }, true);
  document.addEventListener("DOMContentLoaded", () => {
    const watch = (id, log) => {
      const el = document.getElementById(id);
      if (el) new MutationObserver(() => log.push({ t: performance.now(), text: el.textContent ?? "" })).observe(el, { childList: true, characterData: true, subtree: true });
    };
    watch("busyText", B);
    watch("busyCount", C);
  });
}
