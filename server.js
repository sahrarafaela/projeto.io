const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir seu front
app.use(express.static("public"));

// ====== Regras do jogo (iguais às do client) ======
const ROUND_DURATION_MS = 5 * 60 * 1000;
const SPAWN_PROTECTION_MS = 5000;

const COINS_PER_ATTACK = 10;

function calculateKnifeCount(coins) {
  return Math.floor(Math.max(0, Number(coins) || 0) / 10);
}

function calculatePower(knifeCount) {
  if (knifeCount <= 0) return 0;
  return 5 + Math.sqrt(knifeCount) * 2;
}

function computeDerived(p) {
  p.knifeCount = calculateKnifeCount(p.coins);
  p.power = calculatePower(p.knifeCount);
  return p;
}

// ====== Estado do servidor ======
let roundNumber = 1;
let roundActive = true;
let roundStartAt = Date.now();

const players = new Map(); // userId -> player

function now() {
  return Date.now();
}

function getAlivePlayers() {
  return [...players.values()].filter(p => p.alive);
}

function getRoundRemainingMs() {
  const elapsed = now() - roundStartAt;
  return Math.max(0, ROUND_DURATION_MS - elapsed);
}

function snapshot() {
  return {
    roundNumber,
    roundActive,
    remainingMs: getRoundRemainingMs(),
    players: [...players.values()].map(p => ({
      userId: p.userId,
      name: p.name,
      avatar: p.avatar,
      coins: p.coins,
      kills: p.kills,
      alive: p.alive,
      spawnProtectionUntil: p.spawnProtectionUntil
    }))
  };
}

// ====== Pareamento 1v1 no servidor ======
function rebuildPairs() {
  const alive = getAlivePlayers()
    .filter(p => now() >= p.spawnProtectionUntil)
    .sort((a, b) => (b.coins - a.coins) || (a.createdAt - b.createdAt));

  // limpa
  for (const p of players.values()) {
    p.targetId = null;
  }

  // pares (1º vs 2º), (3º vs 4º)...
  const pairs = [];
  for (let i = 0; i < alive.length - 1; i += 2) {
    const a = alive[i];
    const b = alive[i + 1];
    a.targetId = b.userId;
    b.targetId = a.userId;
    pairs.push([a.userId, b.userId]);
  }

  io.emit("pairs", { pairs });
}

function emitPlayer(p) {
  io.emit("playerUpdate", {
    userId: p.userId,
    name: p.name,
    avatar: p.avatar,
    coins: p.coins,
    kills: p.kills,
    alive: p.alive,
    spawnProtectionUntil: p.spawnProtectionUntil,
    targetId: p.targetId || null
  });
}

function checkEndCondition() {
  if (!roundActive) return;

  const alive = getAlivePlayers();
  if (alive.length <= 1) {
    roundActive = false;
    const winner = alive.length === 1 ? alive[0] : null;
    io.emit("roundEnd", {
      winnerId: winner ? winner.userId : null
    });
  }
}

function ensureRoundTime() {
  if (!roundActive) return;
  if (getRoundRemainingMs() <= 0) {
    // Importante: você disse que quer acabar quando não sobrar ninguém.
    // Então aqui NÃO escolhemos por moedas.
    // Podemos apenas deixar continuar (morte súbita) OU encerrar.
    // Vou deixar continuar (relógio “zera”, mas segue até sobrar 0/1).
    // Se preferir encerrar, me diga.
  }
}

// ====== Eventos ======
io.on("connection", (socket) => {
  socket.emit("snapshot", snapshot());
  socket.emit("pairs", { pairs: [] });

  socket.on("gift", (payload) => {
    if (!roundActive) return;

    const userId = String(payload.userId || "").trim();
    const name = String(payload.name || "Player").trim();
    const avatar = String(payload.avatar || "😎").trim();
    const amount = Math.max(0, Number(payload.amount) || 0);

    if (!userId || !name || amount <= 0) return;

    const existing = players.get(userId);

    if (existing) {
      // Não ressuscita
      if (!existing.alive) {
        socket.emit("info", { message: "⛔ Eliminado não volta." });
        return;
      }

      existing.name = name;
      existing.avatar = avatar;
      existing.coins += amount;
      computeDerived(existing);

      emitPlayer(existing);
      rebuildPairs();
      return;
    }

    // Novo jogador
    const p = computeDerived({
      userId,
      name,
      avatar,
      coins: amount,
      kills: 0,
      alive: true,
      createdAt: now(),
      spawnProtectionUntil: now() + SPAWN_PROTECTION_MS,
      targetId: null
    });

    players.set(userId, p);
    emitPlayer(p);
    rebuildPairs();
  });

  // Ataque: servidor aplica transferência e morte
  socket.on("attack", (payload) => {
    if (!roundActive) return;

    const attackerId = String(payload.attackerId || "");
    const targetId = String(payload.targetId || "");

    const attacker = players.get(attackerId);
    const target = players.get(targetId);

    if (!attacker || !target) return;
    if (!attacker.alive || !target.alive) return;

    // proteção
    if (now() < target.spawnProtectionUntil) return;

    // precisa ser par 1v1
    if (attacker.targetId !== target.userId || target.targetId !== attacker.userId) return;

    // somente mais forte ataca
    computeDerived(attacker);
    computeDerived(target);

    if (attacker.power <= target.power) return;

    const damage = Math.min(COINS_PER_ATTACK, target.coins);
    if (damage <= 0) return;

    target.coins -= damage;
    attacker.coins += damage;

    computeDerived(target);
    computeDerived(attacker);

    if (target.coins <= 0) {
      target.coins = 0;
      target.alive = false;
      target.targetId = null;

      attacker.kills += 1;
      attacker.targetId = null;
    }

    emitPlayer(attacker);
    emitPlayer(target);

    rebuildPairs();
    checkEndCondition();
  });
});

// Tick simples só pra garantir checagens
setInterval(() => {
  ensureRoundTime();
  checkEndCondition();
}, 250);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});
