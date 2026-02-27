const fs = require("fs");
const path = require("path");

class StatsStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = {
      meta: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        totalMatches: 0
      },
      players: {}
    };
    this.saveTimer = null;
    this.ensureDataDir();
    this.load();
  }

  ensureDataDir() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      this.persistNow();
      return;
    }

    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.players && parsed.meta) {
        this.state = parsed;
      }
    } catch (error) {
      console.error("[store] No se pudo leer stats.json, usando estado nuevo:", error.message);
    }
  }

  persistSoon(delayMs = 700) {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persistNow(), delayMs);
  }

  persistNow() {
    this.state.meta.updatedAt = new Date().toISOString();
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
  }

  touchPlayer(key, info) {
    if (!this.state.players[key]) {
      this.state.players[key] = {
        key,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        name: info.name || "Unknown",
        auth: info.auth || null,
        conn: info.conn || null,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        goals: 0,
        ownGoals: 0,
        shots: 0
      };
    }

    const player = this.state.players[key];
    player.lastSeenAt = new Date().toISOString();
    if (info.name) player.name = info.name;
    if (info.auth) player.auth = info.auth;
    if (info.conn) player.conn = info.conn;
    this.persistSoon();
    return player;
  }

  addStat(key, field, amount = 1) {
    const player = this.state.players[key];
    if (!player) return;
    player[field] = (player[field] || 0) + amount;
    player.lastSeenAt = new Date().toISOString();
    this.persistSoon();
  }

  addMatchResult(key, didWin, didLose) {
    const player = this.state.players[key];
    if (!player) return;
    player.matchesPlayed += 1;
    if (didWin) player.wins += 1;
    if (didLose) player.losses += 1;
    player.lastSeenAt = new Date().toISOString();
    this.persistSoon();
  }

  incrementTotalMatches() {
    this.state.meta.totalMatches += 1;
    this.persistSoon();
  }

  getPlayer(key) {
    return this.state.players[key] || null;
  }

  topBy(metric, limit = 5) {
    return Object.values(this.state.players)
      .sort((a, b) => (b[metric] || 0) - (a[metric] || 0))
      .slice(0, limit);
  }
}

module.exports = { StatsStore };
