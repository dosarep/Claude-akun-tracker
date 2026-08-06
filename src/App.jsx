import { useState, useEffect, useRef, useCallback } from "react";
import { Check, Clock, RotateCcw, Zap, ListPlus, ChevronRight, Tag, RefreshCw, WifiOff } from "lucide-react";

const COOLDOWN_MS_DEFAULT = 5 * 60 * 60 * 1000; // 5 jam, dioverride oleh cooldownHours dari server
const API_URL = import.meta.env.VITE_API_URL; // URL Web App Apps Script, di-set lewat env var
const POLL_MS = 15000; // ambil data terbaru dari server tiap 15 detik

const palette = {
  bg: "#F2F4F7",
  card: "#FFFFFF",
  border: "#E6E9EF",
  text: "#182338",
  textDim: "#8A93A6",
  navy: "#1C2B45",
  navySoft: "#EEF2F7",
  ready: "#2E9E6E",
  readyBg: "#E8F5EF",
  cooldown: "#D98A3D",
  cooldownBg: "#FBF0E1",
  circleA: "#4F6D89",
  circleB: "#C9D8E4",
  danger: "#C74B4B",
};

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
  return d.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }) + " WIB";
}

function Ring({ progress, size = 60, stroke = 5, color, trackColor }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)" }}
      />
    </svg>
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
  const tickRef = useRef(null);
  const pollRef = useRef(null);

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
      setAccounts(data.accounts || []);
      setLog(data.log || []);
      if (data.cooldownHours) setCooldownHours(data.cooldownHours);
      setError(null);
      setLastSynced(Date.now());
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
      setAccounts(data.accounts || []);
      setLog(data.log || []);
      if (data.cooldownHours) setCooldownHours(data.cooldownHours);
      setError(null);
      setLastSynced(Date.now());
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

  const withStatus = accounts.map((a) => {
    const resetAt = a.lastUsedAt ? a.lastUsedAt + cooldownMs : null;
    const remaining = resetAt ? resetAt - now : 0;
    const isReady = !resetAt || remaining <= 0;
    const progress = resetAt ? Math.min(1, Math.max(0, (now - a.lastUsedAt) / cooldownMs)) : 1;
    return { ...a, resetAt, remaining, isReady, progress };
  });

  const readyAccounts = withStatus.filter((a) => a.isReady);
  const cooldownAccounts = withStatus.filter((a) => !a.isReady).sort((x, y) => x.remaining - y.remaining);

  let recommendation = null;
  if (readyAccounts.length > 0) {
    recommendation = [...readyAccounts].sort((x, y) => (x.lastUsedAt || 0) - (y.lastUsedAt || 0))[0];
  } else if (cooldownAccounts.length > 0) {
    recommendation = cooldownAccounts[0];
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const usageToday = log.filter((l) => l.ts >= todayStart.getTime()).length;

  // --- Layar setup kalau VITE_API_URL belum di-set ---
  if (error === "config") {
    return (
      <div className="w-full min-h-screen flex items-center justify-center p-6" style={{ background: palette.bg }}>
        <div className="max-w-md w-full rounded-2xl p-6" style={{ background: palette.card, border: `1px solid ${palette.border}` }}>
          <h1 className="text-lg font-bold mb-2" style={{ color: palette.navy }}>
            Setup belum selesai
          </h1>
          <p className="text-sm mb-3" style={{ color: palette.textDim }}>
            Variabel <code className="px-1 rounded" style={{ background: palette.navySoft }}>VITE_API_URL</code> belum di-set. Isi dengan URL
            Web App Apps Script (hasil Deploy &gt; New deployment) di pengaturan environment variable Vercel/Netlify-mu, lalu deploy ulang.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen relative overflow-hidden" style={{ background: palette.bg }}>
      <div className="absolute rounded-full" style={{ width: 260, height: 260, background: palette.circleB, top: -90, left: -90, opacity: 0.7 }} />
      <div className="absolute rounded-full" style={{ width: 60, height: 60, background: palette.circleA, top: 40, left: 70 }} />
      <div className="absolute rounded-full" style={{ width: 200, height: 200, background: palette.circleB, bottom: -80, right: -80, opacity: 0.6 }} />
      <div className="absolute rounded-full" style={{ width: 36, height: 36, background: palette.circleA, bottom: 120, right: 60, opacity: 0.5 }} />

      <div className="relative w-full max-w-3xl mx-auto px-5 py-10" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui" }}>
        <div className="text-center mb-6">
          <div style={{ color: palette.circleA, letterSpacing: "0.2em", fontSize: 11 }} className="uppercase font-semibold mb-2">
            Panel Kontrol
          </div>
          <h1 style={{ color: palette.navy }} className="text-3xl font-bold mb-1">
            Claude Account Tracker
          </h1>
          <p style={{ color: palette.textDim }} className="text-sm">
            Cooldown reset limit {cooldownHours} jam &middot; {usageToday}x dipakai hari ini
          </p>
        </div>

        {/* Status sinkronisasi */}
        <div className="flex items-center justify-center gap-2 mb-6 text-xs" style={{ color: palette.textDim }}>
          {error === "network" ? (
            <span className="flex items-center gap-1.5" style={{ color: palette.danger }}>
              <WifiOff size={12} /> Gagal sinkron ke server, mencoba lagi...
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Menyinkronkan..." : lastSynced ? `Sinkron terakhir ${formatClock(lastSynced)}` : "Memuat..."}
            </span>
          )}
        </div>

        {recommendation && (
          <div
            className="mb-7 rounded-2xl px-5 py-4 flex items-center justify-between transition-all duration-500"
            style={{ background: palette.card, boxShadow: "0 6px 24px rgba(24,35,56,0.06)" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{ background: recommendation.isReady ? palette.readyBg : palette.cooldownBg }}
              >
                <Zap size={16} color={recommendation.isReady ? palette.ready : palette.cooldown} />
              </div>
              <div className="text-sm" style={{ color: palette.text }}>
                {recommendation.isReady ? (
                  <>
                    Rekomendasi berikutnya: <b>{recommendation.name}</b> — siap dipakai
                  </>
                ) : (
                  <>
                    Semua akun cooldown. Paling cepat siap: <b>{recommendation.name}</b> dalam{" "}
                    <span style={{ fontFamily: "ui-monospace, monospace" }}>{formatDuration(recommendation.remaining)}</span>
                  </>
                )}
              </div>
            </div>
            <div className="text-xs font-semibold px-3 py-1.5 rounded-full shrink-0" style={{ background: palette.navySoft, color: palette.navy }}>
              {readyAccounts.length}/{accounts.length} siap
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {!loaded ? (
            <div className="col-span-2 text-center text-sm py-10" style={{ color: palette.textDim }}>
              Memuat data akun...
            </div>
          ) : (
            withStatus.map((a) => (
              <div
                key={a.id}
                className="rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5"
                style={{
                  background: palette.card,
                  boxShadow: a.id === recommendation?.id ? `0 10px 28px rgba(28,43,69,0.10)` : "0 4px 16px rgba(24,35,56,0.05)",
                  border: a.id === recommendation?.id ? `1px solid ${palette.circleA}55` : `1px solid ${palette.border}`,
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  {editingId === a.id ? (
                    <input
                      autoFocus
                      defaultValue={a.name}
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val && val !== a.name) renameAccount(a.id, val);
                        setEditingId(null);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                      className="bg-transparent outline-none border-b text-base font-bold w-32"
                      style={{ borderColor: palette.circleA, color: palette.navy }}
                    />
                  ) : (
                    <button
                      onClick={() => setEditingId(a.id)}
                      className="text-base font-bold text-left hover:opacity-70 transition-opacity"
                      style={{ color: palette.navy }}
                    >
                      {a.name}
                    </button>
                  )}
                  <span
                    className="text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wide font-semibold transition-colors duration-500"
                    style={{ background: a.isReady ? palette.readyBg : palette.cooldownBg, color: a.isReady ? palette.ready : palette.cooldown }}
                  >
                    {a.isReady ? "Siap" : "Cooldown"}
                  </span>
                </div>

                <div className="flex items-center gap-4 mb-4">
                  <div className="relative flex items-center justify-center shrink-0">
                    <Ring progress={a.progress} color={a.isReady ? palette.ready : palette.cooldown} trackColor={palette.navySoft} />
                    <div className="absolute">
                      {a.isReady ? <Check size={16} color={palette.ready} /> : <Clock size={16} color={palette.cooldown} />}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    {!a.isReady ? (
                      <>
                        <div className="text-lg font-bold tabular-nums" style={{ color: palette.cooldown, fontFamily: "ui-monospace, monospace" }}>
                          {formatDuration(a.remaining)}
                        </div>
                        <div className="text-[11px]" style={{ color: palette.textDim }}>
                          reset {formatClock(a.resetAt)}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm font-semibold" style={{ color: palette.ready }}>
                          Siap dipakai
                        </div>
                        <div className="text-[11px]" style={{ color: palette.textDim }}>
                          terakhir: {formatClock(a.lastUsedAt)}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="mb-4">
                  <label className="flex items-center gap-1.5 text-[11px] font-medium mb-1.5" style={{ color: palette.textDim }}>
                    <Tag size={11} /> Topic penggunaan
                  </label>
                  <input
                    defaultValue={a.topic}
                    onBlur={(e) => {
                      if (e.target.value !== a.topic) updateTopic(a.id, e.target.value);
                    }}
                    placeholder="mis. Riset kompetitor, VBA Sneakerzone..."
                    className="w-full text-xs rounded-lg px-3 py-2 outline-none transition-all duration-200 focus:ring-2"
                    style={{ background: palette.navySoft, color: palette.text, border: `1px solid ${palette.border}` }}
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => markUsed(a.id)}
                    className="flex-1 text-xs font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition-all duration-200 hover:brightness-125 active:scale-[0.98]"
                    style={{ background: palette.navy, color: "#fff" }}
                  >
                    <Zap size={12} /> Pakai sekarang
                  </button>
                  <button
                    onClick={() => resetManual(a.id)}
                    disabled={a.isReady}
                    className="text-xs rounded-xl py-2.5 px-3 flex items-center justify-center transition-all duration-200 hover:bg-black/5 active:scale-[0.98]"
                    style={{
                      background: "transparent",
                      border: `1px solid ${palette.border}`,
                      color: a.isReady ? palette.textDim : palette.navy,
                      opacity: a.isReady ? 0.35 : 1,
                    }}
                    title="Tandai siap manual (kalau ternyata belum limit)"
                  >
                    <RotateCcw size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="rounded-2xl p-5 transition-all duration-300" style={{ background: palette.card, boxShadow: "0 4px 16px rgba(24,35,56,0.05)", border: `1px solid ${palette.border}` }}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-bold flex items-center gap-2" style={{ color: palette.navy }}>
              <ListPlus size={14} /> Log Penggunaan
            </div>
            <div className="text-xs" style={{ color: palette.textDim }}>
              {log.length} entri
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto pr-1 text-xs">
            {!loaded ? (
              <div style={{ color: palette.textDim }}>Memuat...</div>
            ) : log.length === 0 ? (
              <div style={{ color: palette.textDim }}>Belum ada log. Klik "Pakai sekarang" di salah satu akun.</div>
            ) : (
              log.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between py-2 px-1.5 rounded-lg transition-colors duration-200 hover:bg-black/[0.02]"
                  style={{ borderBottom: `1px solid ${palette.border}` }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronRight size={12} color={palette.textDim} className="shrink-0" />
                    <span className="font-medium truncate" style={{ color: palette.text }}>
                      {entry.name}
                    </span>
                    {entry.topic && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full truncate" style={{ background: palette.navySoft, color: palette.circleA }}>
                        {entry.topic}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 ml-2" style={{ color: palette.textDim }}>
                    {formatClock(entry.ts)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-4 text-center text-[11px]" style={{ color: palette.textDim }}>
          Data sinkron otomatis lewat Google Sheet. Klik nama akun untuk ganti label, isi kolom topic untuk catat kegunaan.
        </div>
      </div>
    </div>
  );
}
