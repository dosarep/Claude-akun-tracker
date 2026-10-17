import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Zap, RotateCcw, RefreshCw, WifiOff, Search, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL; // URL Web App Apps Script, di-set lewat env var
const POLL_MS = 15000; // ambil data terbaru dari server tiap 15 detik
const LOG_PREVIEW = 50;

function formatDuration(ms) {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatClock(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  return (
    d.toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }) + " WIB"
  );
}

function formatAgo(ts, now) {
  if (!ts) return "belum pernah dipakai";
  const min = Math.max(0, Math.floor((now - ts) / 60000));
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

function SortHead({ label, k, sort, onSort, className }) {
  const active = sort.key === k;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <th className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(k)}>
        {label}
        <Icon size={13} style={{ opacity: active ? 1 : 0.5 }} />
      </button>
    </th>
  );
}

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [log, setLog] = useState([]);
  const [cooldownHours, setCooldownHours] = useState(5);
  const [now, setNow] = useState(Date.now());
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: null, dir: "asc" });
  const [showAllLog, setShowAllLog] = useState(false);
  const tickRef = useRef(null);
  const pollRef = useRef(null);

  const applyState = (data) => {
    setAccounts(data.accounts || []);
    setLog(data.log || []);
    if (data.cooldownHours) setCooldownHours(data.cooldownHours);
    setError(null);
    setLastSynced(Date.now());
  };

  const fetchState = useCallback(async (silent) => {
    if (!API_URL) {
      setError("config");
      setLoaded(true);
      return;
    }
    if (!silent) setSyncing(true);
    try {
      const res = await fetch(`${API_URL}?action=state`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      applyState(data);
    } catch (e) {
      console.error("Gagal sinkron:", e);
      setError("network");
    } finally {
      setSyncing(false);
      setLoaded(true);
    }
  }, []);

  const postAction = async (action, payload) => {
    if (!API_URL) return;
    setSyncing(true);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // hindari CORS preflight
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      applyState(data);
    } catch (e) {
      console.error("Gagal kirim aksi:", e);
      setError("network");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchState(false);
    pollRef.current = setInterval(() => fetchState(true), POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [fetchState]);

  useEffect(() => {
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  const markUsed = (id) => postAction("markUsed", { name: id });
  const resetManual = (id) => postAction("resetManual", { name: id });
  const renameAccount = (id, name) => postAction("renameAccount", { name: id, newName: name });
  const updateTopic = (id, topic) => postAction("updateTopic", { name: id, topic });

  const cooldownMs = (cooldownHours || 5) * 60 * 60 * 1000;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const usageToday = log.filter((l) => l.ts >= todayStart.getTime()).length;

  const usageTodayByName = useMemo(() => {
    const map = {};
    const start = todayStart.getTime();
    log.forEach((l) => {
      if (l.ts >= start) map[l.name] = (map[l.name] || 0) + 1;
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log]);

  const withStatus = accounts.map((a, i) => {
    const resetAt = a.lastUsedAt ? a.lastUsedAt + cooldownMs : null;
    const remaining = resetAt ? resetAt - now : 0;
    const isReady = !resetAt || remaining <= 0;
    const progress = resetAt ? Math.min(1, Math.max(0, (now - a.lastUsedAt) / cooldownMs)) : 1;
    return { ...a, order: i, resetAt, remaining, isReady, progress, usedToday: usageTodayByName[a.name] || 0 };
  });

  const readyAccounts = withStatus.filter((a) => a.isReady);
  const cooldownAccounts = withStatus.filter((a) => !a.isReady).sort((x, y) => x.remaining - y.remaining);

  let recommendation = null;
  if (readyAccounts.length > 0) {
    recommendation = [...readyAccounts].sort((x, y) => (x.lastUsedAt || 0) - (y.lastUsedAt || 0))[0];
  } else if (cooldownAccounts.length > 0) {
    recommendation = cooldownAccounts[0];
  }

  const onSort = (key) => {
    setSort((s) => {
      if (s.key !== key) return { key, dir: "asc" };
      if (s.dir === "asc") return { key, dir: "desc" };
      return { key: null, dir: "asc" };
    });
  };

  const sortValue = (a, key) => {
    switch (key) {
      case "name": return a.name.toLowerCase();
      case "status": return a.isReady ? 0 : 1;
      case "remaining": return a.isReady ? -1 : a.remaining;
      case "resetAt": return a.resetAt || 0;
      case "lastUsedAt": return a.lastUsedAt || 0;
      case "usedToday": return a.usedToday;
      case "topic": return (a.topic || "").toLowerCase();
      default: return a.order;
    }
  };

  const q = query.trim().toLowerCase();
  let rows = withStatus.filter((a) => {
    if (filter === "ready" && !a.isReady) return false;
    if (filter === "cooldown" && a.isReady) return false;
    if (q && !`${a.name} ${a.topic || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  if (sort.key) {
    rows = [...rows].sort((x, y) => {
      const vx = sortValue(x, sort.key);
      const vy = sortValue(y, sort.key);
      const c = vx < vy ? -1 : vx > vy ? 1 : x.order - y.order;
      return sort.dir === "asc" ? c : -c;
    });
  }

  // --- Layar setup kalau VITE_API_URL belum di-set ---
  if (error === "config") {
    return (
      <div className="setup">
        <div>
          <h1>Setup belum selesai</h1>
          <p>
            Variabel <code>VITE_API_URL</code> belum di-set. Isi dengan URL Web App Apps Script (hasil Deploy &gt; New deployment) di
            Environment Variables Vercel, lalu deploy ulang.
          </p>
        </div>
      </div>
    );
  }

  const logRows = showAllLog ? log : log.slice(0, LOG_PREVIEW);

  return (
    <div className="page">
      <header className="head">
        <div>
          <h1>Claude Account Tracker</h1>
          <p>
            Reset limit tiap {cooldownHours} jam. {usageToday}x dipakai hari ini.
          </p>
        </div>
        {error === "network" ? (
          <span className="sync bad" role="status">
            <WifiOff size={13} /> Gagal sinkron ke server, mencoba lagi
          </span>
        ) : (
          <span className="sync" role="status">
            <RefreshCw size={13} className={syncing ? "spin" : ""} />
            {syncing ? "Menyinkronkan" : lastSynced ? `Sinkron terakhir ${formatClock(lastSynced)}` : "Memuat"}
          </span>
        )}
      </header>

      {recommendation && (
        <div className="next">
          <Zap size={16} />
          <div className="grow">
            {recommendation.isReady ? (
              <>
                Pakai berikutnya: <b>{recommendation.name}</b>
              </>
            ) : (
              <>
                Semua akun cooldown. Paling cepat siap: <b>{recommendation.name}</b> dalam{" "}
                <span className="time">{formatDuration(recommendation.remaining)}</span>
              </>
            )}
          </div>
          <div className="count">
            {readyAccounts.length} dari {accounts.length} akun siap
          </div>
        </div>
      )}

      <div className="toolbar">
        <div className="seg" role="group" aria-label="Filter status">
          {[
            ["all", "Semua", withStatus.length],
            ["ready", "Siap", readyAccounts.length],
            ["cooldown", "Cooldown", cooldownAccounts.length],
          ].map(([k, label, n]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {label}
              <span className="n">{n}</span>
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={14} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari akun atau topic"
            aria-label="Cari akun atau topic"
          />
        </label>
      </div>

      <div className="panel">
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <SortHead label="Akun" k="name" sort={sort} onSort={onSort} className="col-name" />
                <SortHead label="Status" k="status" sort={sort} onSort={onSort} />
                <SortHead label="Sisa cooldown" k="remaining" sort={sort} onSort={onSort} />
                <SortHead label="Reset pada" k="resetAt" sort={sort} onSort={onSort} />
                <SortHead label="Terakhir dipakai" k="lastUsedAt" sort={sort} onSort={onSort} />
                <SortHead label="Hari ini" k="usedToday" sort={sort} onSort={onSort} className="right" />
                <SortHead label="Topic penggunaan" k="topic" sort={sort} onSort={onSort} />
                <th className="right">
                  <div className="th">Aksi</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {!loaded ? (
                <tr>
                  <td colSpan={8} className="empty">Memuat data akun...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty">
                    {accounts.length === 0 ? "Belum ada akun di Google Sheet." : "Tidak ada akun yang cocok dengan filter."}
                  </td>
                </tr>
              ) : (
                rows.map((a) => {
                  const isPick = a.id === recommendation?.id;
                  const tone = a.isReady ? "ready" : "cool";
                  return (
                    <tr key={a.id} className={isPick ? (a.isReady ? "pick" : "pick wait") : ""}>
                      <td className="col-name">
                        {editingId === a.id ? (
                          <input
                            autoFocus
                            defaultValue={a.name}
                            aria-label={`Ganti nama ${a.name}`}
                            onBlur={(e) => {
                              const val = e.target.value.trim();
                              if (val && val !== a.name) renameAccount(a.id, val);
                              setEditingId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.target.blur();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="name-input"
                          />
                        ) : (
                          <>
                            <button type="button" className="name-btn" onClick={() => setEditingId(a.id)} title="Klik untuk ganti nama">
                              {a.name}
                            </button>
                            {isPick && <span className={`tag-next ${a.isReady ? "" : "wait"}`}>Berikutnya</span>}
                          </>
                        )}
                      </td>
                      <td>
                        <span className={`pill ${tone}`}>
                          <i />
                          {a.isReady ? "Siap" : "Cooldown"}
                        </span>
                      </td>
                      <td className="remain">
                        {a.isReady ? (
                          <div className="t ready">Siap dipakai</div>
                        ) : (
                          <div className="t cool">{formatDuration(a.remaining)}</div>
                        )}
                        <div className={`bar ${tone}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(a.progress * 100)} aria-label="Progres cooldown">
                          <span style={{ width: `${a.progress * 100}%` }} />
                        </div>
                      </td>
                      <td className="when">{a.isReady ? <span className="muted">-</span> : formatClock(a.resetAt)}</td>
                      <td className="when">
                        {formatClock(a.lastUsedAt)}
                        <small>{formatAgo(a.lastUsedAt, now)}</small>
                      </td>
                      <td className="num">{a.usedToday}x</td>
                      <td>
                        <input
                          key={`${a.id}-${a.topic || ""}`}
                          defaultValue={a.topic}
                          aria-label={`Topic penggunaan ${a.name}`}
                          onBlur={(e) => {
                            if (e.target.value !== (a.topic || "")) updateTopic(a.id, e.target.value);
                          }}
                          onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                          placeholder="mis. Riset kompetitor, VBA Sneakerzone"
                          className="topic"
                        />
                      </td>
                      <td>
                        <div className="act">
                          <button type="button" className="btn" onClick={() => markUsed(a.id)}>
                            <Zap size={13} /> Pakai sekarang
                          </button>
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => resetManual(a.id)}
                            disabled={a.isReady}
                            aria-label={`Tandai ${a.name} siap manual`}
                            title="Tandai siap manual (kalau ternyata belum limit)"
                          >
                            <RotateCcw size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-head">
        <h2>Log penggunaan</h2>
        <span>
          {log.length} entri
          {log.length > LOG_PREVIEW && (
            <>
              {" "}
              <button type="button" className="name-btn" style={{ fontWeight: 500 }} onClick={() => setShowAllLog((v) => !v)}>
                {showAllLog ? "Tampilkan 50 terbaru" : "Tampilkan semua"}
              </button>
            </>
          )}
        </span>
      </div>
      <div className="panel">
        <div className="scroll log">
          <table>
            <thead>
              <tr>
                <th><div className="th">Waktu</div></th>
                <th><div className="th">Akun</div></th>
                <th style={{ width: "50%" }}><div className="th">Topic</div></th>
              </tr>
            </thead>
            <tbody>
              {!loaded ? (
                <tr><td colSpan={3} className="empty">Memuat...</td></tr>
              ) : log.length === 0 ? (
                <tr><td colSpan={3} className="empty">Belum ada log. Klik "Pakai sekarang" di salah satu akun.</td></tr>
              ) : (
                logRows.map((entry) => (
                  <tr key={entry.id}>
                    <td className="when">{formatClock(entry.ts)}</td>
                    <td style={{ fontWeight: 600 }}>{entry.name}</td>
                    <td>{entry.topic || <span className="muted">-</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="foot">Data tersinkron otomatis lewat Google Sheet. Klik nama akun untuk ganti label, klik judul kolom untuk mengurutkan.</p>
    </div>
  );
}
