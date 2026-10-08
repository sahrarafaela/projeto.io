// ============================================================
// KNIFE BATTLE LIVE (1v1 por pares + sem ressuscitar + moedas transferidas + tamanho dinâmico)
// ============================================================
// 10 moedas = 1 faca
//
// REGRAS:
// - O mesmo userId atualiza o jogador (ganha mais moedas) ENQUANTO VIVO
// - Se morrer (coins == 0), NÃO RESSUSCITA mesmo que mande moedas depois
// - Dano/ataque TRANSFERE moedas do alvo para o atacante (não somem)
// - Combate 1v1 por pares (ranking por moedas): (1º vs 2º), (3º vs 4º)...
// - Maior persegue o menor; menor foge do maior
// - Maior é mais rápido (velocidade dinâmica por facas)
// - Tamanho do corpo cresce com as facas e colisão considera também o alcance das facas
// - 3 rotações completas => 1 ataque de 10 moedas (ou resto)
// - Rodada dura 5 minutos
// ============================================================


// ============================================================
// CONFIGURAÇÕES
// ============================================================

const WIDTH = 1000;
const HEIGHT = 650;

const ROUND_DURATION_MS = 5 * 60 * 1000;

const GRID_SIZE = 180;

const SPAWN_SAFE_DISTANCE = 145;
const SPAWN_ATTEMPTS = 60;

const SPAWN_PROTECTION_MS = 5000;

const MAX_LIST_ROWS = 100;
const MAX_VISUAL_KNIVES = 24;

// Pareamento 1v1
const PAIR_REBUILD_INTERVAL_MS = 350;


// ============================================================
// MOVIMENTO / TAMANHO
// ============================================================

const PLAYER_RADIUS_BASE = 26;           // base do corpo
const PLAYER_RADIUS_BONUS_CAP = 22;      // quanto pode crescer no máximo
const PLAYER_RADIUS_BONUS_SCALE = 2.2;   // crescimento ~ sqrt(facas) * scale

const PLAYER_SPACE_MARGIN = 8;

const COMBAT_BODY_GAP = 12;

const COMBAT_DISTANCE = 112;

const MAX_COMBAT_DISTANCE = 150;

const MIN_COMBAT_DISTANCE = 82;

const RETURN_TO_BATTLE_DISTANCE = 185;

const MIN_MOVE_SPEED = 25;
const MAX_MOVE_SPEED = 48;

const COMBAT_STRAFE_FORCE = 0.48;

const SEPARATION_FORCE = 1.8;

const BORDER_MARGIN = 65;


// ============================================================
// COMBATE
// ============================================================

const ROTATIONS_PER_COIN_DAMAGE = 3;

const COINS_PER_ATTACK = 10;

const MIN_ROTATION_SPEED = 0.065;
const MAX_ROTATION_SPEED = 0.085;

const KNIFE_LENGTH = 28;

const TOOL_HIT_GAP = 18;

const COMBAT_HIT_BUFFER = 22;


// ============================================================
// ESTADO
// ============================================================

let players = [];

const playerMap = new Map();

const pendingPlayers = new Map();

let spatialGrid = new Map();

let scene = null;

let weaponGraphics = null;

let playerCountText = null;
let roundTimerText = null;
let roundText = null;
let battleText = null;

let roundNumber = 1;
let roundElapsedMs = 0;

let roundActive = false;
let roundEnded = false;

let battleMessageTimer = 0;

let nextColorIndex = 0;

let listUpdateTimer = 0;

let playerSequence = 0;

let pairRebuildTimer = 0;

const socket = io();

socket.on("snapshot", (data) => {
    // opcional: você pode limpar e reconstruir, mas o mais comum é só usar para UI
    // Vou só atualizar o timer base se quiser (aqui deixo simples)
});

socket.on("playerUpdate", (p) => {
    const existing = playerMap.get(String(p.userId));

    if (!existing) {
        // cria jogador novo
        addPlayerToArena(p.name, p.avatar, p.coins, p.userId);

        // se servidor já mandar como morto (pouco provável), elimina
        const created = playerMap.get(String(p.userId));
        if (created && p.alive === false) {
            eliminatePlayer(created, null);
        }

        return;
    }

    // Atualiza dados SEM ressuscitar
    existing.name = p.name;
    existing.avatar = p.avatar;

    if (existing.nameText) existing.nameText.setText(existing.name);
    if (existing.avatarText) existing.avatarText.setText(existing.avatar);

    if (!existing.alive) {
        // morto não volta: ignora atualizações de coins
        return;
    }

    // sincroniza moedas do servidor
    existing.coins = p.coins;
    existing.kills = p.kills;

    existing.knifeCount = calculateKnifeCount(existing.coins);
    existing.power = calculatePower(existing.knifeCount);
    existing.hp = existing.maxHp;

    updatePlayerVisuals(existing, 0);
    updatePlayersList();
    updatePlayerPreview();
});

socket.on("pairs", ({ pairs }) => {
    // zera targets
    for (const pl of players) {
        if (!pl.alive) continue;
        pl.targetId = null;
        pl.aiTimer = 0;
    }

    // aplica pares
    for (const [a, b] of pairs) {
        const pa = playerMap.get(String(a));
        const pb = playerMap.get(String(b));
        if (!pa || !pb) continue;
        if (!pa.alive || !pb.alive) continue;

        pa.targetId = pb.userId;
        pb.targetId = pa.userId;
    }
});

socket.on("roundEnd", ({ winnerId }) => {
    // encerra localmente também
    checkWinner();
});

socket.on("info", (data) => {
    if (data && data.message) setStatus(data.message);
});


// ============================================================
// CORES
// ============================================================

function hslToColorInt(h, s, l) {

    s /= 100;
    l /= 100;

    const k = n =>
        (n + h / 30) % 12;

    const a =
        s *
        Math.min(
            l,
            1 - l
        );

    const f = n =>
        l -
        a *
        Math.max(
            -1,
            Math.min(
                k(n) - 3,
                Math.min(
                    9 - k(n),
                    1
                )
            )
        );

    const r = Math.round(255 * f(0));
    const g = Math.round(255 * f(8));
    const b = Math.round(255 * f(4));

    return (
        (r << 16) |
        (g << 8) |
        b
    );
}


function getNextColor() {

    const hue =
        (
            nextColorIndex *
            137.508
        ) % 360;

    nextColorIndex++;

    return hslToColorInt(
        hue,
        75,
        58
    );
}


// ============================================================
// UTILITÁRIOS
// ============================================================

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function distanceBetween(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

function normalizeVector(x, y) {
    const length = Math.sqrt(x * x + y * y);
    if (length < 0.0001) return { x: 0, y: 0 };
    return { x: x / length, y: y / length };
}


// ============================================================
// FACAS / FORÇA
// ============================================================

function calculateKnifeCount(coins) {
    return Math.floor(Math.max(0, Number(coins) || 0) / 10);
}

function calculatePower(knifeCount) {
    if (knifeCount <= 0) return 0;
    return 5 + Math.sqrt(knifeCount) * 2;
}

function getOrbitRadius(player) {
    return (
        56 +
        Math.min(
            42,
            Math.sqrt(Math.max(0, player.knifeCount)) * 2.8
        )
    );
}

function getPlayerWeaponReach(player) {
    if (!player || player.knifeCount <= 0) return 0;
    return getOrbitRadius(player) + KNIFE_LENGTH;
}


// ============================================================
// TAMANHO DO CORPO (cresce com facas)
// ============================================================

function getBodyRadius(player) {
    if (!player) return PLAYER_RADIUS_BASE;

    const bonus =
        Math.min(
            PLAYER_RADIUS_BONUS_CAP,
            Math.sqrt(Math.max(0, player.knifeCount)) * PLAYER_RADIUS_BONUS_SCALE
        );

    return PLAYER_RADIUS_BASE + bonus;
}


// ============================================================
// VELOCIDADE (maior mais rápido)
// ============================================================

function getChaseSpeed(player) {
    const bonus = Math.min(26, Math.sqrt(Math.max(0, player.knifeCount)) * 6);
    return clamp(52 + bonus, 52, 88);
}

function getFleeSpeed(player) {
    const bonus = Math.min(18, Math.sqrt(Math.max(0, player.knifeCount)) * 4);
    return clamp(40 + bonus, 38, 72);
}


// ============================================================
// ESPAÇO (corpo + alcance facas)
// ============================================================

function getPlayerSpaceRadius(player) {
    if (!player || !player.alive) return getBodyRadius(player);
    return getBodyRadius(player) + getPlayerWeaponReach(player) + PLAYER_SPACE_MARGIN;
}


// ============================================================
// COMBATE
// ============================================================

function isCombatPair(a, b) {
    if (!a || !b || !a.alive || !b.alive) return false;
    return (a.targetId === b.userId && b.targetId === a.userId);
}


// ============================================================
// PAREAMENTO 1v1 POR RANKING
// ============================================================

function decideModeForPair(player, target) {
    if (!player || !target) return "wander";

    if (player.power !== target.power) {
        return player.power > target.power ? "chase" : "flee";
    }

    if (player.coins !== target.coins) {
        return player.coins > target.coins ? "chase" : "flee";
    }

    return player.sequence < target.sequence ? "chase" : "flee";
}

function hasValidPairTarget(player) {
    if (!player || !player.alive) return false;

    const target = player.targetId ? playerMap.get(player.targetId) : null;
    if (!target || !target.alive) return false;

    if (player.spawnProtectionMs > 0 || target.spawnProtectionMs > 0) return false;

    return isCombatPair(player, target);
}

function rebuildCombatPairs() {
    for (const p of players) {
        if (!p.alive) continue;
        p.targetId = null;
        p.aiMode = "wander";
        p.aiTimer = 0;
    }

    const eligible = players
        .filter(p => p.alive && p.spawnProtectionMs <= 0)
        .sort((a, b) => (b.coins - a.coins) || (b.power - a.power) || (a.sequence - b.sequence));

    for (let i = 0; i < eligible.length - 1; i += 2) {
        const a = eligible[i];
        const b = eligible[i + 1];

        a.targetId = b.userId;
        b.targetId = a.userId;

        a.aiMode = decideModeForPair(a, b);
        b.aiMode = decideModeForPair(b, a);
    }
}

function ensureCombatPairs(delta) {
    pairRebuildTimer -= delta;

    const eligible = players.filter(p => p.alive && p.spawnProtectionMs <= 0);
    const invalidAssigned = eligible.some(p => p.targetId && !hasValidPairTarget(p));

    if (pairRebuildTimer > 0 && !invalidAssigned) return;

    pairRebuildTimer = PAIR_REBUILD_INTERVAL_MS;
    rebuildCombatPairs();
}


// ============================================================
// PHASER
// ============================================================

const config = {
    type: Phaser.AUTO,
    width: WIDTH,
    height: HEIGHT,
    parent: "game-container",
    backgroundColor: "#111827",
    scene: { create, update }
};

const game = new Phaser.Game(config);


// ============================================================
// CREATE
// ============================================================

function create() {
    scene = this;

    // Grade
    const grid = scene.add.graphics();
    grid.lineStyle(1, 0x222b3a, 0.5);
    for (let x = 0; x < WIDTH; x += 50) grid.lineBetween(x, 0, x, HEIGHT);
    for (let y = 0; y < HEIGHT; y += 50) grid.lineBetween(0, y, WIDTH, y);

    // Borda
    const border = scene.add.graphics();
    border.lineStyle(4, 0x374151, 1);
    border.strokeRect(8, 8, WIDTH - 16, HEIGHT - 16);

    // Armas
    weaponGraphics = scene.add.graphics();
    weaponGraphics.setDepth(20);

    // HUD
    playerCountText = scene.add.text(20, 15, "", { fontSize: "19px", color: "#ffffff", fontStyle: "bold" });
    playerCountText.setDepth(200);

    roundText = scene.add.text(20, 42, "", { fontSize: "14px", color: "#9ca3af" });
    roundText.setDepth(200);

    roundTimerText = scene.add.text(WIDTH - 20, 18, "", { fontSize: "22px", color: "#ffffff", fontStyle: "bold" });
    roundTimerText.setOrigin(1, 0);
    roundTimerText.setDepth(200);

    battleText = scene.add.text(WIDTH / 2, 20, "", {
        fontSize: "20px",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 4
    });
    battleText.setOrigin(0.5);
    battleText.setDepth(250);

    createWinnerOverlay();
    beginRound();
}


// ============================================================
// WINNER OVERLAY
// ============================================================

function createWinnerOverlay() {
    scene.winnerContainer = scene.add.container(WIDTH / 2, HEIGHT / 2);
    scene.winnerContainer.setDepth(1000);

    const background = scene.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, 0.86);

    const winText = scene.add.text(0, -205, "WIN", {
        fontSize: "115px",
        color: "#ffffff",
        fontStyle: "bold"
    }).setOrigin(0.5);

    const winnerAvatar = scene.add.text(0, -80, "😎", { fontSize: "68px" }).setOrigin(0.5);

    const winnerName = scene.add.text(0, 5, "", {
        fontSize: "46px",
        color: "#ffffff",
        fontStyle: "bold"
    }).setOrigin(0.5);

    const killsText = scene.add.text(0, 68, "", {
        fontSize: "28px",
        color: "#ffffff",
        fontStyle: "bold"
    }).setOrigin(0.5);

    const finalText = scene.add.text(0, 125, "RODADA FINALIZADA", {
        fontSize: "18px",
        color: "#9ca3af",
        fontStyle: "bold"
    }).setOrigin(0.5);

    const instructionText = scene.add.text(0, 165, 'Clique em "Nova rodada"', {
        fontSize: "14px",
        color: "#6b7280"
    }).setOrigin(0.5);

    scene.winnerContainer.add([background, winText, winnerAvatar, winnerName, killsText, finalText, instructionText]);
    scene.winnerContainer.setVisible(false);

    scene.winnerData = { winnerAvatar, winnerName, killsText };
}


// ============================================================
// RODADA
// ============================================================

function beginRound() {
    clearCurrentRound();

    roundElapsedMs = 0;
    roundActive = true;
    roundEnded = false;
    battleMessageTimer = 0;

    pairRebuildTimer = 0;

    const button = document.getElementById("new-round-button");
    if (button) button.disabled = true;

    createInitialBots();

    updateRoundTimer();
    updatePlayersList();
    updatePlayerPreview();
}

function startNewRound() {
    if (roundActive) return;
    roundNumber++;
    beginRound();
    setStatus("🔥 Nova rodada iniciada!");
}

function clearCurrentRound() {
    for (const player of players) destroyPlayerVisuals(player);

    players = [];
    playerMap.clear();
    pendingPlayers.clear();
    spatialGrid.clear();
    nextColorIndex = 0;
    playerSequence = 0;

    if (weaponGraphics) weaponGraphics.clear();

    if (scene && scene.winnerContainer) scene.winnerContainer.setVisible(false);
}

function destroyPlayerVisuals(player) {
    const visuals = [
        player.body,
        player.aura,
        player.avatarText,
        player.nameText,
        player.coinText,
        player.knifeText,
        player.killText,
        player.hpBackground,
        player.hpBar
    ];

    for (const object of visuals) {
        if (object && object.destroy) object.destroy();
    }
}


// ============================================================
// BOTS (teste)
// ============================================================

function createInitialBots() {
    addPlayerToArena("Sara", "🧑", 50, "bot-sara");
    addPlayerToArena("Player2", "😎", 100, "bot-player2");
    addPlayerToArena("Player3", "👽", 250, "bot-player3");
    addPlayerToArena("Player4", "🤖", 500, "bot-player4");
}


// ============================================================
// GRID
// ============================================================

function getGridKey(x, y) {
    return Math.floor(x / GRID_SIZE) + ":" + Math.floor(y / GRID_SIZE);
}

function rebuildSpatialGrid() {
    spatialGrid.clear();

    for (const player of players) {
        if (!player.alive) continue;

        const key = getGridKey(player.x, player.y);

        if (!spatialGrid.has(key)) spatialGrid.set(key, []);
        spatialGrid.get(key).push(player);
    }
}

function getPlayersNearPosition(x, y, radius) {
    const cellX = Math.floor(x / GRID_SIZE);
    const cellY = Math.floor(y / GRID_SIZE);
    const cellRadius = Math.ceil(radius / GRID_SIZE);

    const result = [];

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
        for (let dy = -cellRadius; dy <= cellRadius; dy++) {
            const key = (cellX + dx) + ":" + (cellY + dy);
            const cell = spatialGrid.get(key);
            if (!cell) continue;

            for (const player of cell) {
                if (distanceBetween(x, y, player.x, player.y) <= radius) result.push(player);
            }
        }
    }

    return result;
}


// ============================================================
// SPAWN
// ============================================================

function findSafeSpawnPosition() {
    rebuildSpatialGrid();

    let bestPosition = null;
    let bestDistance = -1;

    for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
        const x = Phaser.Math.Between(120, WIDTH - 120);
        const y = Phaser.Math.Between(120, HEIGHT - 120);

        let nearest = Infinity;

        for (const player of players) {
            if (!player.alive) continue;
            const distance = distanceBetween(x, y, player.x, player.y);
            nearest = Math.min(nearest, distance);
        }

        if (nearest >= SPAWN_SAFE_DISTANCE) return { x, y };

        if (nearest > bestDistance) {
            bestDistance = nearest;
            bestPosition = { x, y };
        }
    }

    return bestPosition || { x: WIDTH / 2, y: HEIGHT / 2 };
}


// ============================================================
// CRIAR PLAYER
// ============================================================

function addPlayerToArena(name, avatar, coins, userId) {
    const normalizedId = String(userId);

    const existing = playerMap.get(normalizedId);

    // Se já existe:
    // - se vivo: soma moedas
    // - se morto: NÃO ressuscita, ignora
    if (existing) {
        if (!existing.alive) {
            showBattleMessage("⛔ " + existing.name + " já foi eliminado e não pode voltar.");
            return existing;
        }
        if (Number(coins) > 0) addCoinsToExistingPlayer(existing, Number(coins));
        return existing;
    }

    const spawn = findSafeSpawnPosition();

    const safeCoins = Math.max(0, Number(coins) || 0);
    const knifeCount = calculateKnifeCount(safeCoins);
    const color = getNextColor();
    const angle = Math.random() * Math.PI * 2;

    const player = {
        userId: normalizedId,
        sequence: ++playerSequence,

        name: name || "Player",
        avatar: avatar || "😎",

        x: spawn.x,
        y: spawn.y,

        targetX: spawn.x,
        targetY: spawn.y,

        coins: safeCoins,
        knifeCount,
        power: calculatePower(knifeCount),

        color,

        maxHp: 600,
        hp: 600,

        alive: true,
        kills: 0,

        targetId: null,
        aiMode: "wander",
        aiTimer: 0,

        wanderAngle: angle,
        wanderTimer: Phaser.Math.Between(600, 1200),

        fleeSide: Math.random() < 0.5 ? -1 : 1,
        combatSide: Math.random() < 0.5 ? -1 : 1,

        lastMoveDirX: Math.cos(angle),
        lastMoveDirY: Math.sin(angle),

        rotationAngle: Math.random() * Math.PI * 2,
        rotationSpeed: Phaser.Math.FloatBetween(MIN_ROTATION_SPEED, MAX_ROTATION_SPEED),
        rotationTurns: 0,

        spawnProtectionMs: SPAWN_PROTECTION_MS,
        recentHitMs: 0,

        // VISUAIS
        body: null,
        aura: null,
        avatarText: null,
        nameText: null,
        coinText: null,
        knifeText: null,
        killText: null,
        hpBackground: null,
        hpBar: null
    };

    const bodyRadius = getBodyRadius(player);

    // Corpo
    player.body = scene.add.circle(player.x, player.y, bodyRadius, player.color, 0.95);
    player.body.setStrokeStyle(3, 0xffffff, 0.9);
    player.body.setDepth(4);

    // Aura
    player.aura = scene.add.circle(player.x, player.y, bodyRadius + 8, player.color, 0.14);
    player.aura.setStrokeStyle(2, player.color, 0.4);
    player.aura.setDepth(2);

    // Avatar
    player.avatarText = scene.add.text(player.x, player.y, player.avatar, {
        fontSize: "27px",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 2
    });
    player.avatarText.setOrigin(0.5);
    player.avatarText.setDepth(8);

    // Nome
    player.nameText = scene.add.text(player.x, player.y - (bodyRadius + 16), player.name, {
        fontSize: "14px",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 4
    });
    player.nameText.setOrigin(0.5);
    player.nameText.setDepth(9);

    // Moedas
    player.coinText = scene.add.text(player.x, player.y + (bodyRadius + 10), `🪙 ${player.coins}`, {
        fontSize: "12px",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3
    });
    player.coinText.setOrigin(0.5);
    player.coinText.setDepth(9);

    // Facas
    player.knifeText = scene.add.text(player.x, player.y + (bodyRadius + 25), `🔪 ${player.knifeCount}`, {
        fontSize: "11px",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3
    });
    player.knifeText.setOrigin(0.5);
    player.knifeText.setDepth(9);

    // Kills
    player.killText = scene.add.text(player.x, player.y + (bodyRadius + 39), `💀 ${player.kills}`, {
        fontSize: "10px",
        color: "#fca5a5",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3
    });
    player.killText.setOrigin(0.5);
    player.killText.setDepth(9);

    // HP
    player.hpBackground = scene.add.rectangle(player.x, player.y + (bodyRadius + 53), 60, 5, 0x000000, 0.85);
    player.hpBackground.setOrigin(0.5);
    player.hpBackground.setDepth(9);

    player.hpBar = scene.add.rectangle(player.x - 30, player.y + (bodyRadius + 53), 60, 5, 0x22c55e, 1);
    player.hpBar.setOrigin(0, 0.5);
    player.hpBar.setDepth(10);

    players.push(player);
    playerMap.set(normalizedId, player);

    updatePlayerVisuals(player, 0);
    updatePlayersList();

    pairRebuildTimer = 0;

    return player;
}


// ============================================================
// IA (respeita pares)
// ============================================================

function updateAI(player, delta) {
    if (!player.alive) return;

    player.aiTimer -= delta;

    if (hasValidPairTarget(player)) {
        const target = playerMap.get(player.targetId);
        player.aiMode = decideModeForPair(player, target);
        return;
    }

    player.aiMode = "wander";
    player.targetId = null;
}


// ============================================================
// WANDER
// ============================================================

function chooseWanderTarget(player) {
    const margin = BORDER_MARGIN + 30;

    player.targetX = Phaser.Math.Between(margin, WIDTH - margin);
    player.targetY = Phaser.Math.Between(margin, HEIGHT - margin);
    player.wanderTimer = Phaser.Math.Between(1000, 2000);
}


// ============================================================
// MOVIMENTO
// ============================================================

function movePlayer(player, delta) {
    if (!player.alive) return;

    const dt = Math.min(delta, 50) / 1000;

    let desiredX = 0;
    let desiredY = 0;

    const target = player.targetId ? playerMap.get(player.targetId) : null;

    // Sem alvo => wander
    if (!target || !target.alive) {
        player.wanderTimer -= delta;

        if (
            player.wanderTimer <= 0 ||
            distanceBetween(player.x, player.y, player.targetX, player.targetY) < 35
        ) {
            chooseWanderTarget(player);
        }

        const wander = normalizeVector(player.targetX - player.x, player.targetY - player.y);
        desiredX = wander.x;
        desiredY = wander.y;
    }

    // Fuga
    else if (player.aiMode === "flee") {
        const dx = player.x - target.x;
        const dy = player.y - target.y;

        const distance = Math.sqrt(dx * dx + dy * dy);

        const away = normalizeVector(dx, dy);
        const toward = normalizeVector(-dx, -dy);

        if (distance >= RETURN_TO_BATTLE_DISTANCE) {
            desiredX = toward.x;
            desiredY = toward.y;
        } else {
            const side = player.fleeSide;
            const tangentX = -away.y * side;
            const tangentY = away.x * side;

            desiredX = away.x * 0.55 + tangentX * 0.65;
            desiredY = away.y * 0.55 + tangentY * 0.65;
        }
    }

    // Caça
    else {
        const dx = target.x - player.x;
        const dy = target.y - player.y;

        const distance = Math.sqrt(dx * dx + dy * dy);
        const toTarget = normalizeVector(dx, dy);

        if (distance > MAX_COMBAT_DISTANCE) {
            desiredX = toTarget.x;
            desiredY = toTarget.y;
        } else if (distance > COMBAT_DISTANCE) {
            desiredX = toTarget.x;
            desiredY = toTarget.y;
        } else {
            const side = player.combatSide;
            const tangentX = -toTarget.y * side;
            const tangentY = toTarget.x * side;

            const forward = distance > MIN_COMBAT_DISTANCE ? 0.35 : -0.05;

            desiredX = toTarget.x * forward + tangentX * COMBAT_STRAFE_FORCE;
            desiredY = toTarget.y * forward + tangentY * COMBAT_STRAFE_FORCE;
        }
    }

    // Separação
    const nearbyRadius = Math.max(280, getPlayerSpaceRadius(player) + 80);
    const nearby = getPlayersNearPosition(player.x, player.y, nearbyRadius);

    let separationX = 0;
    let separationY = 0;

    for (const other of nearby) {
        if (other === player || !other.alive) continue;

        const dx = player.x - other.x;
        const dy = player.y - other.y;

        let distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 0.001) continue;

        const combat = isCombatPair(player, other);

        const requiredDistance =
            combat
                ? (getBodyRadius(player) + getBodyRadius(other) + COMBAT_BODY_GAP)
                : (getPlayerSpaceRadius(player) + getPlayerSpaceRadius(other));

        if (distance < requiredDistance) {
            const strength = (requiredDistance - distance) / requiredDistance;
            const force = combat ? 0.35 : 1.0;

            separationX += (dx / distance) * strength * force;
            separationY += (dy / distance) * strength * force;
        }
    }

    desiredX += separationX * SEPARATION_FORCE;
    desiredY += separationY * SEPARATION_FORCE;

    // Borda
    const borderSpace = getBodyRadius(player) + 8;

    if (player.x < borderSpace) desiredX += 2;
    if (player.x > WIDTH - borderSpace) desiredX -= 2;
    if (player.y < borderSpace) desiredY += 2;
    if (player.y > HEIGHT - borderSpace) desiredY -= 2;

    // Movimento final
    const movement = normalizeVector(desiredX, desiredY);

    const speed =
        player.aiMode === "chase"
            ? getChaseSpeed(player)
            : player.aiMode === "flee"
                ? getFleeSpeed(player)
                : Phaser.Math.Clamp(player.moveSpeed || MIN_MOVE_SPEED, MIN_MOVE_SPEED, MAX_MOVE_SPEED);

    player.x += movement.x * speed * dt;
    player.y += movement.y * speed * dt;

    // Limites
    const r = getBodyRadius(player);

    player.x = Phaser.Math.Clamp(player.x, r + 5, WIDTH - r - 5);
    player.y = Phaser.Math.Clamp(player.y, r + 5, HEIGHT - r - 5);
}


// ============================================================
// RESOLVER SOBREPOSIÇÃO (corpo + facas)
// ============================================================

function resolveAllPlayerOverlaps() {
    for (let pass = 0; pass < 2; pass++) {
        rebuildSpatialGrid();

        for (const player of players) {
            if (!player.alive) continue;

            const nearby = getPlayersNearPosition(player.x, player.y, 320);

            for (const other of nearby) {
                if (other === player || !other.alive) continue;

                // evita empurrar duas vezes o mesmo par
                if (player.sequence >= other.sequence) continue;

                let dx = player.x - other.x;
                let dy = player.y - other.y;

                let distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 0.001) {
                    const angle = Math.random() * Math.PI * 2;
                    dx = Math.cos(angle);
                    dy = Math.sin(angle);
                    distance = 1;
                }

                const combat = isCombatPair(player, other);

                const requiredDistance =
                    combat
                        ? (getBodyRadius(player) + getBodyRadius(other) + COMBAT_BODY_GAP)
                        : (getPlayerSpaceRadius(player) + getPlayerSpaceRadius(other));

                if (distance < requiredDistance) {
                    const overlap = requiredDistance - distance;
                    const nx = dx / distance;
                    const ny = dy / distance;

                    const push = combat ? overlap * 0.20 : overlap * 0.50;

                    player.x += nx * push;
                    player.y += ny * push;

                    other.x -= nx * push;
                    other.y -= ny * push;

                    const r1 = getBodyRadius(player);
                    const r2 = getBodyRadius(other);

                    player.x = Phaser.Math.Clamp(player.x, r1 + 5, WIDTH - r1 - 5);
                    player.y = Phaser.Math.Clamp(player.y, r1 + 5, HEIGHT - r1 - 5);

                    other.x = Phaser.Math.Clamp(other.x, r2 + 5, WIDTH - r2 - 5);
                    other.y = Phaser.Math.Clamp(other.y, r2 + 5, HEIGHT - r2 - 5);
                }
            }
        }
    }
}


// ============================================================
// ROTAÇÃO / ATAQUE
// ============================================================

function updateRotation(player, delta) {
    if (!player.alive || player.knifeCount <= 0) return;

    player.rotationAngle += player.rotationSpeed * (delta / 16.6667);

    while (player.rotationAngle >= Math.PI * 2) {
        player.rotationAngle -= Math.PI * 2;
        player.rotationTurns++;
    }

    if (player.rotationTurns >= ROTATIONS_PER_COIN_DAMAGE) {
        tryAttack(player);
        player.rotationTurns = 0;
    }
}


// ============================================================
// FACAS (geometria)
// ============================================================

function getKnifePoints(player, index) {
    if (!player || player.knifeCount <= 0) return null;

    const count = Math.min(player.knifeCount, MAX_VISUAL_KNIVES);
    const spacing = Math.PI * 2 / count;

    const angle = player.rotationAngle + spacing * index;
    const orbit = getOrbitRadius(player);

    const baseX = player.x + Math.cos(angle) * orbit;
    const baseY = player.y + Math.sin(angle) * orbit;

    const tipX = baseX + Math.cos(angle) * KNIFE_LENGTH;
    const tipY = baseY + Math.sin(angle) * KNIFE_LENGTH;

    return { baseX, baseY, tipX, tipY, angle };
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;

    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 0.000001) return distanceBetween(px, py, x1, y1);

    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
    t = clamp(t, 0, 1);

    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;

    return distanceBetween(px, py, closestX, closestY);
}

function knifeSegmentsTouch(knifeA, knifeB) {
    if (!knifeA || !knifeB) return false;

    if (
        pointToSegmentDistance(
            knifeA.tipX, knifeA.tipY,
            knifeB.baseX, knifeB.baseY, knifeB.tipX, knifeB.tipY
        ) <= TOOL_HIT_GAP
    ) return true;

    if (
        pointToSegmentDistance(
            knifeB.tipX, knifeB.tipY,
            knifeA.baseX, knifeA.baseY, knifeA.tipX, knifeA.tipY
        ) <= TOOL_HIT_GAP
    ) return true;

    return false;
}

function weaponsCanHit(attacker, target) {
    if (!attacker || !target || attacker.knifeCount <= 0 || target.knifeCount <= 0) return false;

    const attackerCount = Math.min(attacker.knifeCount, MAX_VISUAL_KNIVES);
    const targetCount = Math.min(target.knifeCount, MAX_VISUAL_KNIVES);

    for (let i = 0; i < attackerCount; i++) {
        const knifeA = getKnifePoints(attacker, i);

        for (let j = 0; j < targetCount; j++) {
            const knifeB = getKnifePoints(target, j);
            if (knifeSegmentsTouch(knifeA, knifeB)) return true;
        }
    }

    return false;
}


// ============================================================
// ATAQUE (TRANSFERÊNCIA DE MOEDAS) + SEM "pile-on"
// ============================================================

function tryAttack(player) {
    if (!player.alive || player.knifeCount <= 0) return false;

    const target = player.targetId ? playerMap.get(player.targetId) : null;
    if (!target || !target.alive) return false;
    if (target.spawnProtectionMs > 0) return false;

    // Só ataca se for o par 1v1
    if (!isCombatPair(player, target)) return false;

    // Somente o mais forte ataca
    if (player.power <= target.power) return false;

    const attackerReach = getPlayerWeaponReach(player);
    const targetReach = getPlayerWeaponReach(target);

    const distance = distanceBetween(player.x, player.y, target.x, target.y);

    const maximumDistance =
        attackerReach + targetReach + TOOL_HIT_GAP + COMBAT_HIT_BUFFER;

    if (distance > maximumDistance) return false;

    let weaponHit = weaponsCanHit(player, target);

    // fallback de contato
    if (!weaponHit && distance <= attackerReach + targetReach + 8) {
        weaponHit = true;
    }

    if (!weaponHit) return false;

    // TRANSFERÊNCIA
    const oldTargetCoins = target.coins;
    const damage = Math.min(COINS_PER_ATTACK, target.coins);
    if (damage <= 0) return false;

    target.coins = Math.max(0, target.coins - damage);
    player.coins += damage;

    // recalcula ambos
    target.knifeCount = calculateKnifeCount(target.coins);
    target.power = calculatePower(target.knifeCount);

    player.knifeCount = calculateKnifeCount(player.coins);
    player.power = calculatePower(player.knifeCount);

    target.hp = target.maxHp * (target.coins / Math.max(oldTargetCoins, 1));
    target.hp = Math.max(0, target.hp);

    player.hp = player.maxHp;

    target.recentHitMs = 220;

    showBattleMessage(
        "🔪 " + player.name + " roubou " + target.name +
        " (-" + damage + " 🪙 / +" + damage + " 🪙)"
    );


    socket.emit("attack", {
        attackerId: player.userId,
        targetId: target.userId
    });



    updatePlayerVisuals(target, 0);
    updatePlayerVisuals(player, 0);

    updatePlayersList();

    if (target.coins <= 0) eliminatePlayer(target, player);

    return true;
}


// ============================================================
// ELIMINAR (NÃO RESSUSCITA)
// ============================================================

function eliminatePlayer(target, attacker) {
    if (!target.alive) return;

    target.alive = false;
    target.hp = 0;
    target.targetId = null;
    target.coins = 0;
    target.knifeCount = 0;
    target.power = 0;

    if (attacker) {
        attacker.kills++;
        attacker.targetId = null;
        attacker.aiTimer = 0;
    }

    for (const player of players) {
        if (player.targetId === target.userId) {
            player.targetId = null;
            player.aiTimer = 0;
        }
    }

    pairRebuildTimer = 0;

    showBattleMessage(
        "💀 " + target.name + " foi eliminado por " + (attacker ? attacker.name : "ninguém") + "!"
    );

    const objects = [
        target.body,
        target.aura,
        target.avatarText,
        target.nameText,
        target.coinText,
        target.knifeText,
        target.killText,
        target.hpBackground,
        target.hpBar
    ];

    for (const object of objects) {
        if (!object) continue;

        scene.tweens.add({
            targets: object,
            alpha: 0,
            scale: 0.2,
            duration: 350
        });
    }

    updatePlayersList();
    setTimeout(checkWinner, 80);
}


// ============================================================
// DESENHAR FACAS
// ============================================================

function drawAllWeapons() {
    if (!weaponGraphics) return;

    weaponGraphics.clear();

    for (const player of players) {
        if (!player.alive || player.knifeCount <= 0) continue;

        const count = Math.min(player.knifeCount, MAX_VISUAL_KNIVES);

        for (let i = 0; i < count; i++) {
            const knife = getKnifePoints(player, i);
            if (!knife) continue;

            weaponGraphics.lineStyle(4, player.color, 1);
            weaponGraphics.lineBetween(knife.baseX, knife.baseY, knife.tipX, knife.tipY);

            const sideX = -Math.sin(knife.angle) * 5;
            const sideY = Math.cos(knife.angle) * 5;

            weaponGraphics.fillStyle(player.color, 1);
            weaponGraphics.beginPath();
            weaponGraphics.moveTo(knife.tipX, knife.tipY);

            weaponGraphics.lineTo(
                knife.tipX - Math.cos(knife.angle) * 9 + sideX,
                knife.tipY - Math.sin(knife.angle) * 9 + sideY
            );

            weaponGraphics.lineTo(
                knife.tipX - Math.cos(knife.angle) * 9 - sideX,
                knife.tipY - Math.sin(knife.angle) * 9 - sideY
            );

            weaponGraphics.closePath();
            weaponGraphics.fillPath();
        }
    }
}


// ============================================================
// VISUAL
// ============================================================

function updatePlayerVisuals(player, delta) {
    if (!player) return;

    if (player.recentHitMs > 0) player.recentHitMs -= delta;
    if (player.spawnProtectionMs > 0) player.spawnProtectionMs -= delta;

    const bodyRadius = getBodyRadius(player);

    if (player.body) {
        player.body.setPosition(player.x, player.y);
        if (player.body.setRadius) player.body.setRadius(bodyRadius);

        player.body.setFillStyle(
            player.color,
            player.spawnProtectionMs > 0 ? 0.75 : 0.95
        );
    }

    if (player.aura) {
        player.aura.setPosition(player.x, player.y);
        if (player.aura.setRadius) player.aura.setRadius(bodyRadius + 8);

        player.aura.setFillStyle(
            player.color,
            player.spawnProtectionMs > 0 ? 0.30 : 0.14
        );
    }

    if (player.avatarText) player.avatarText.setPosition(player.x, player.y);

    if (player.nameText) {
        player.nameText.setPosition(player.x, player.y - (bodyRadius + 16));
    }

    if (player.coinText) {
        player.coinText.setPosition(player.x, player.y + (bodyRadius + 10));
        player.coinText.setText(`🪙 ${player.coins}`);
    }

    if (player.knifeText) {
        player.knifeText.setPosition(player.x, player.y + (bodyRadius + 25));
        player.knifeText.setText(`🔪 ${player.knifeCount}`);
    }

    if (player.killText) {
        player.killText.setPosition(player.x, player.y + (bodyRadius + 39));
        player.killText.setText(`💀 ${player.kills}`);
    }

    updateHealthBar(player, bodyRadius);
}

function updateHealthBar(player, bodyRadius) {
    if (!player.hpBackground || !player.hpBar) return;

    const y = player.y + (bodyRadius + 53);

    player.hpBackground.setPosition(player.x, y);
    player.hpBar.setPosition(player.x - 30, y);

    const ratio = clamp(player.hp / player.maxHp, 0, 1);
    player.hpBar.width = 60 * ratio;

    if (ratio > 0.5) player.hpBar.setFillStyle(0x22c55e);
    else if (ratio > 0.25) player.hpBar.setFillStyle(0xf59e0b);
    else player.hpBar.setFillStyle(0xef4444);
}


// ============================================================
// WINNER
// ============================================================

function checkWinner() {
    if (!roundActive) return;

    const alive = players.filter(p => p.alive);
    if (alive.length > 1) return;

    if (alive.length === 1) showWinner(alive[0]);
    else finishRound();
}

function showWinner(winner) {
    if (!winner) { finishRound(); return; }

    roundActive = false;
    roundEnded = true;

    const button = document.getElementById("new-round-button");
    if (button) button.disabled = false;

    if (scene.winnerData) {
        scene.winnerData.winnerAvatar.setText(winner.avatar);
        scene.winnerData.winnerName.setText(winner.name);
        scene.winnerData.killsText.setText(`💀 ${winner.kills} kills`);
    }

    scene.winnerContainer.setVisible(true);
    updateRoundTimer();
}

function finishRound() {
    roundActive = false;
    roundEnded = true;

    const button = document.getElementById("new-round-button");
    if (button) button.disabled = false;

    updateRoundTimer();
}


// ============================================================
// TIMER
// ============================================================

function updateRoundTimer() {
    const remaining = Math.max(0, ROUND_DURATION_MS - roundElapsedMs);
    const totalSeconds = Math.ceil(remaining / 1000);

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (roundTimerText) {
        roundTimerText.setText(
            `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        );
    }

    if (roundText) roundText.setText(`Rodada ${roundNumber}`);

    const panelRound = document.getElementById("panel-round");
    if (panelRound) panelRound.innerText = roundNumber;

    const participants = players.filter(p => p.alive).length;
    const waiting = pendingPlayers.size;

    const participantElement = document.getElementById("panel-participants");
    if (participantElement) participantElement.innerText = participants;

    const waitingElement = document.getElementById("panel-waiting");
    if (waitingElement) waitingElement.innerText = waiting;

    if (playerCountText) playerCountText.setText(`👥 ${participants}`);
}

function checkTimeWinner() {
    const alive = players.filter(p => p.alive);
    if (alive.length === 0) { finishRound(); return; }

    alive.sort((a, b) => b.coins - a.coins);
    showWinner(alive[0]);
}


// ============================================================
// UPDATE
// ============================================================

function update(time, delta) {
    if (!roundActive) {
        drawAllWeapons();
        return;
    }

    delta = Math.min(delta, 50);
    roundElapsedMs += delta;

    if (roundElapsedMs >= ROUND_DURATION_MS) {
        checkTimeWinner();
        return;
    }

    rebuildSpatialGrid();

    // pareamento 1v1
    ensureCombatPairs(delta);

    // IA + movimento
    for (const player of players) {
        if (!player.alive) continue;

        updateAI(player, delta);
        movePlayer(player, delta);
    }

    // separação
    resolveAllPlayerOverlaps();

    // rotação + visuais
    for (const player of players) {
        if (!player.alive) continue;

        updateRotation(player, delta);
        updatePlayerVisuals(player, delta);
    }

    drawAllWeapons();

    // mensagem
    if (battleMessageTimer > 0) battleMessageTimer -= delta;
    else if (battleText) battleText.setText("");

    // painel/lista
    listUpdateTimer -= delta;
    if (listUpdateTimer <= 0) {
        listUpdateTimer = 250;
        updatePlayersList();
        updatePlayerPreview();
        updateRoundTimer();
    }
}


// ============================================================
// MOEDAS (NÃO RESSUSCITA)
// ============================================================

function addCoinsToExistingPlayer(player, amount) {
    const value = Math.max(0, Number(amount) || 0);
    if (value <= 0) return;

    // morto não volta
    if (!player.alive) {
        showBattleMessage("⛔ " + player.name + " já foi eliminado e não pode voltar.");
        return;
    }

    player.coins += value;

    player.knifeCount = calculateKnifeCount(player.coins);
    player.power = calculatePower(player.knifeCount);

    player.hp = player.maxHp;

    updatePlayerVisuals(player, 0);

    showBattleMessage("🎁 " + player.name + " recebeu +" + value + " moedas!");

    updatePlayersList();
    updatePlayerPreview();

    pairRebuildTimer = 0;
}


// ============================================================
// SEND COINS
// ============================================================

function sendCoins(amount) {
    if (!roundActive) { setStatus("⏰ A rodada terminou."); return; }

    const nameElement = document.getElementById("username");
    const userIdElement = document.getElementById("userid");
    const avatarElement = document.getElementById("avatar");

    const name = nameElement ? nameElement.value.trim() : "";
    const userId = userIdElement ? userIdElement.value.trim() : "";
    const avatar = avatarElement ? avatarElement.value.trim() : "😎";

    if (!name) { setStatus("⚠️ Digite o nome."); return; }
    if (!userId) { setStatus("⚠️ Digite o ID."); return; }

    const value = Math.max(0, Number(amount) || 0);
    if (value <= 0) return;

    const existing = socket.emit("gift", {
        userId,
        name,
        avatar,
        amount: value
    });

    setStatus("🎁 Enviado para o servidor: +" + value + " moedas");


    if (existing) {
        existing.name = name;
        existing.avatar = avatar || "😎";

        if (existing.nameText) existing.nameText.setText(existing.name);
        if (existing.avatarText) existing.avatarText.setText(existing.avatar);

        addCoinsToExistingPlayer(existing, value);

        setStatus("🎁 " + name + " recebeu +" + value + " moedas!");
        return;
    }

    const player = addPlayerToArena(name, avatar || "😎", value, userId);

    pendingPlayers.delete(String(userId));

    showBattleMessage("🔥 " + player.name + " entrou na arena!");
    setStatus("🔥 " + player.name + ' entrou! 🛡️ Proteção inicial.');

    updatePlayersList();
    updatePlayerPreview();
    updateRoundTimer();

    pairRebuildTimer = 0;

    socket.emit("gift", { userId, name, avatar, amount: value });

}


// ============================================================
// HEART
// ============================================================

function sendHeart() {
    if (!roundActive) { setStatus("⏰ A rodada terminou."); return; }

    const nameElement = document.getElementById("username");
    const userIdElement = document.getElementById("userid");
    const avatarElement = document.getElementById("avatar");

    const name = nameElement ? nameElement.value.trim() : "";
    const userId = userIdElement ? userIdElement.value.trim() : "";
    const avatar = avatarElement ? avatarElement.value.trim() : "❤️";

    if (!name) { setStatus("⚠️ Digite o nome."); return; }
    if (!userId) { setStatus("⚠️ Digite o ID."); return; }

    const existing = playerMap.get(String(userId));
    if (existing) {
        setStatus("❤️ " + name + " já está na arena.");
        return;
    }

    const player = addPlayerToArena(name, avatar || "❤️", 10, userId);

    pendingPlayers.delete(String(userId));

    showBattleMessage("❤️ " + player.name + " entrou na arena!");
    setStatus("❤️ " + name + " entrou usando Heart-Me!");

    updatePlayersList();
    updatePlayerPreview();
    updateRoundTimer();

    pairRebuildTimer = 0;
}


// ============================================================
// PREVIEW
// ============================================================

function updatePlayerPreview() {
    const userIdElement = document.getElementById("userid");
    const coinsElement = document.getElementById("preview-coins");
    const knivesElement = document.getElementById("preview-knives");
    const killsElement = document.getElementById("preview-kills");

    if (!coinsElement || !knivesElement || !killsElement) return;

    const userId = userIdElement ? userIdElement.value.trim() : "";

    if (!userId) {
        coinsElement.innerText = "0";
        knivesElement.innerText = "0";
        killsElement.innerText = "0";
        return;
    }

    const player = playerMap.get(String(userId));

    if (player) {
        coinsElement.innerText = player.coins;
        knivesElement.innerText = player.knifeCount;
        killsElement.innerText = player.kills;
        return;
    }

    const pending = pendingPlayers.get(String(userId));
    if (pending) {
        coinsElement.innerText = pending.coins;
        knivesElement.innerText = calculateKnifeCount(pending.coins);
        killsElement.innerText = "0";
        return;
    }

    coinsElement.innerText = "0";
    knivesElement.innerText = "0";
    killsElement.innerText = "0";
}


// ============================================================
// STATUS
// ============================================================

function setStatus(message) {
    const element = document.getElementById("selected-status");
    if (element) element.innerText = message;
}


// ============================================================
// LISTA
// ============================================================

function updatePlayersList() {
    const container = document.getElementById("players-list");
    if (!container) return;

    if (players.length === 0) {
        container.innerHTML = '<div class="empty-list">Nenhum jogador ainda.</div>';
        return;
    }

    const sorted = [...players].sort((a, b) => {
        if (a.alive && !b.alive) return -1;
        if (!a.alive && b.alive) return 1;

        if (b.kills !== a.kills) return b.kills - a.kills;
        return b.coins - a.coins;
    });

    const visible = sorted.slice(0, MAX_LIST_ROWS);
    container.innerHTML = "";

    for (const player of visible) {
        const row = document.createElement("div");
        row.className = "player-row";
        if (!player.alive) row.classList.add("player-dead");

        const avatar = document.createElement("div");
        avatar.className = "player-avatar";
        avatar.innerText = player.avatar;

        const info = document.createElement("div");
        info.className = "player-info";

        const name = document.createElement("div");
        name.className = "player-name";
        name.innerText = player.alive ? player.name : "💀 " + player.name;

        const data = document.createElement("div");
        data.className = "player-data";
        data.innerText =
            "🪙 " + player.coins +
            " | 🔪 " + player.knifeCount +
            " | 💀 " + player.kills +
            " | ❤️ " + Math.ceil(player.hp);

        info.appendChild(name);
        info.appendChild(data);

        row.appendChild(avatar);
        row.appendChild(info);

        row.addEventListener("click", function () {
            const username = document.getElementById("username");
            const userid = document.getElementById("userid");
            const avatarInput = document.getElementById("avatar");

            if (username) username.value = player.name;
            if (userid) userid.value = player.userId;
            if (avatarInput) avatarInput.value = player.avatar;

            updatePlayerPreview();
        });

        container.appendChild(row);
    }

    if (players.length > MAX_LIST_ROWS) {
        const footer = document.createElement("div");
        footer.className = "list-limit";
        footer.innerText = "Exibindo " + MAX_LIST_ROWS + " de " + players.length + " participantes.";
        container.appendChild(footer);
    }
}


// ============================================================
// MENSAGEM
// ============================================================

function showBattleMessage(message) {
    if (!battleText) return;

    battleText.setText(message);
    battleMessageTimer = 1800;
}


// ============================================================
// TESTES / API GLOBAL
// ============================================================

window.testAdd = function (name, userId, avatar = "😎", coins = 10) {
    const username = document.getElementById("username");
    const userid = document.getElementById("userid");
    const avatarInput = document.getElementById("avatar");

    if (username) username.value = name;
    if (userid) userid.value = String(userId);
    if (avatarInput) avatarInput.value = avatar;

    sendCoins(coins);
};

window.sendCoins = sendCoins;
window.sendHeart = sendHeart;
window.startNewRound = startNewRound;
window.beginRound = beginRound;
window.updatePlayerPreview = updatePlayerPreview;

window.KnifeBattle = {
    get players() { return players; },
    get playerMap() { return playerMap; },
    get pendingPlayers() { return pendingPlayers; },
    addPlayer: addPlayerToArena,
    attack: tryAttack,
    startRound: beginRound,
    newRound: startNewRound
};
