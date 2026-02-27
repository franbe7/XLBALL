const path = require("path");
const fs = require("fs");
const { StatsStore } = require("./store");

require("dotenv").config();

const TEAM = {
  SPECTATORS: 0,
  RED: 1,
  BLUE: 2,
};

let firstAdminAssigned = false;

async function getHBInit() {
  const mod = require("haxball.js");
  const resolved = mod && typeof mod.then === "function" ? await mod : mod;

  // Si el export es objeto, tomar default si existe
  const candidate = resolved?.default ?? resolved;

  // Caso A: ya es HBInit (normalmente recibe config, aridad >= 1)
  if (typeof candidate === "function" && candidate.length >= 1) {
    return candidate;
  }

  // Caso B: es factory (normalmente aridad 0) que retorna HBInit
  if (typeof candidate === "function") {
    const maybeHBInit = await candidate();
    if (typeof maybeHBInit === "function") return maybeHBInit;
  }

  // Caso C: viene colgado como propiedad
  if (typeof resolved?.HBInit === "function") return resolved.HBInit;
  if (typeof resolved?.default?.HBInit === "function")
    return resolved.default.HBInit;

  throw new Error(`No se pudo resolver HBInit (typeof=${typeof resolved})`);
}

async function main() {
  const HBInit = await getHBInit();
  const config = {
    roomName: process.env.ROOM_NAME || "XLball MVP Stats",
    roomPassword: process.env.ROOM_PASSWORD || null,
    maxPlayers: Number(process.env.MAX_PLAYERS || 12),
    public: String(process.env.PUBLIC_ROOM || "false").toLowerCase() === "true",
    playerName: process.env.PLAYER_NAME || "StatsBot",
    token: process.env.TOKEN || "thr1.AAAAAGmht3gWyuCTkupd3A.ljBdfE-mJ1c",
    customStadiumPath: process.env.CUSTOM_STADIUM_PATH || "maps/mvp_arena.hbs",
  };

  if (!config.token) {
    throw new Error("Falta TOKEN en .env (headless token de HaxBall)");
  }

  const room = HBInit({
    roomName: config.roomName,
    maxPlayers: config.maxPlayers,
    password: config.roomPassword || undefined,
    public: config.public,
    noPlayer: true,
    playerName: config.playerName,
    token: config.token,
  });

  room.onRoomLink = (link) => console.log("Room link:", link);

  const store = new StatsStore(path.resolve(process.cwd(), "data/stats.json"));

  let matchState = resetMatchState();

  function resetMatchState() {
    return {
      active: false,
      score: { red: 0, blue: 0 },
      lastTouch: null,
      participants: new Set(),
      teamByKey: new Map(),
    };
  }

  function getPlayerKey(player) {
    if (player.auth && player.auth.trim()) return `auth:${player.auth}`;
    if (player.conn && player.conn.trim()) return `conn:${player.conn}`;
    return `id:${player.id}`;
  }

  function normalizePlayer(player) {
    return {
      key: getPlayerKey(player),
      name: player.name,
      auth: player.auth || null,
      conn: player.conn || null,
    };
  }

  function isGameTeam(team) {
    return team === TEAM.RED || team === TEAM.BLUE;
  }

  function refreshStadium() {
    const fullPath = path.resolve(process.cwd(), config.customStadiumPath);
    if (!fs.existsSync(fullPath)) {
      console.warn(
        `[stadium] No existe ${fullPath}, se usa estadio por defecto.`,
      );
      return;
    }
    const raw = fs.readFileSync(fullPath, "utf8");
    room.setCustomStadium(raw);
    console.log(`[stadium] Cargado: ${fullPath}`);
  }

  function formatPlayerStats(stats) {
    const winrate =
      stats.matchesPlayed > 0
        ? Math.round((stats.wins / stats.matchesPlayed) * 100)
        : 0;
    return `${stats.name} | PJ:${stats.matchesPlayed} W:${stats.wins} L:${stats.losses} WR:${winrate}% G:${stats.goals} OG:${stats.ownGoals} S:${stats.shots}`;
  }

  function reply(playerId, text) {
    room.sendAnnouncement(text, playerId, 0x9ad0ff, "normal", 1);
  }

  function registerPlayer(player) {
    const info = normalizePlayer(player);
    store.touchPlayer(info.key, info);
    if (matchState.active && isGameTeam(player.team)) {
      matchState.participants.add(info.key);
      matchState.teamByKey.set(info.key, player.team);
    }
  }

  function handleCommand(player, rawMessage) {
    const [command, ...rest] = rawMessage.trim().split(/\s+/);

    if (command === "!help") {
      reply(
        player.id,
        "Comandos: !me | !stats | !top [goals|wins|matchesPlayed|shots] | !map",
      );
      return false;
    }

    if (command === "!me" || command === "!stats") {
      const key = getPlayerKey(player);
      const stats = store.getPlayer(key);
      if (!stats) {
        reply(player.id, "No hay stats todavia para tu usuario.");
        return false;
      }
      reply(player.id, formatPlayerStats(stats));
      return false;
    }

    if (command === "!top") {
      const metric = rest[0] || "goals";
      const allowed = new Set(["goals", "wins", "matchesPlayed", "shots"]);
      if (!allowed.has(metric)) {
        reply(
          player.id,
          `Metrica invalida. Usa: ${Array.from(allowed).join(", ")}`,
        );
        return false;
      }

      const top = store.topBy(metric, 5);
      if (top.length === 0) {
        reply(player.id, "Aun no hay datos para el ranking.");
        return false;
      }

      const msg = top
        .map((p, idx) => `${idx + 1}.${p.name}(${p[metric] || 0})`)
        .join(" | ");
      reply(player.id, `TOP ${metric}: ${msg}`);
      return false;
    }

    if (command === "!map") {
      refreshStadium();
      reply(player.id, "Mapa custom cargado.");
      return false;
    }

    return true;
  }

  room.onRoomLink = (link) => {
    console.log(`\n[room] Link: ${link}`);
    console.log(`[room] Nombre: ${config.roomName}`);
    console.log("[room] Escribe !help en el chat para comandos.\n");
    refreshStadium();
  };

  room.onPlayerJoin = (player) => {
    if (!firstAdminAssigned) {
      room.setPlayerAdmin(player.id, true);
      firstAdminAssigned = true;
      room.sendAnnouncement(
        `${player.name} es admin (primer usuario en entrar).`,
        null,
        0x00ff00,
        "normal",
        1,
      );
    }

    registerPlayer(player);
    reply(player.id, "Bienvenido. Comandos: !me !top !help");
  };

  room.onPlayerLeave = (player) => {
    const key = getPlayerKey(player);
    const info = normalizePlayer(player);
    store.touchPlayer(key, info);
  };

  room.onPlayerTeamChange = (player) => {
    if (!matchState.active) return;
    const key = getPlayerKey(player);
    if (isGameTeam(player.team)) {
      matchState.participants.add(key);
      matchState.teamByKey.set(key, player.team);
    } else {
      matchState.teamByKey.set(key, TEAM.SPECTATORS);
    }
  };

  room.onPlayerBallKick = (player) => {
    const key = getPlayerKey(player);
    store.addStat(key, "shots", 1);

    if (!matchState.active) return;
    matchState.lastTouch = {
      key,
      team: player.team,
      at: Date.now(),
    };
  };

  room.onTeamGoal = (team) => {
    if (team === TEAM.RED) matchState.score.red += 1;
    if (team === TEAM.BLUE) matchState.score.blue += 1;

    const lt = matchState.lastTouch;
    if (!lt) return;
    if (Date.now() - lt.at > 7000) return;

    if (lt.team === team) {
      store.addStat(lt.key, "goals", 1);
    } else if (isGameTeam(lt.team)) {
      store.addStat(lt.key, "ownGoals", 1);
    }
  };

  room.onGameStart = () => {
    matchState = resetMatchState();
    matchState.active = true;

    room.getPlayerList().forEach((player) => {
      registerPlayer(player);
      const key = getPlayerKey(player);
      if (isGameTeam(player.team)) {
        matchState.participants.add(key);
        matchState.teamByKey.set(key, player.team);
      }
    });

    console.log("[match] Inicio de partido");
  };

  room.onGameStop = () => {
    if (!matchState.active) return;
    matchState.active = false;

    const winnerTeam =
      matchState.score.red === matchState.score.blue
        ? null
        : matchState.score.red > matchState.score.blue
          ? TEAM.RED
          : TEAM.BLUE;

    for (const key of matchState.participants) {
      const team = matchState.teamByKey.get(key) || TEAM.SPECTATORS;
      const didWin = winnerTeam !== null && team === winnerTeam;
      const didLose =
        winnerTeam !== null && isGameTeam(team) && team !== winnerTeam;
      store.addMatchResult(key, didWin, didLose);
    }

    store.incrementTotalMatches();

    console.log(
      `[match] Fin de partido | Score RED ${matchState.score.red} - ${matchState.score.blue} BLUE`,
    );
  };

  room.onPlayerChat = (player, message) => {
    if (!message.startsWith("!")) return true;
    return handleCommand(player, message);
  };

  process.on("SIGINT", () => {
    store.persistNow();
    console.log("\n[bot] Guardado final de stats. Saliendo...");
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
