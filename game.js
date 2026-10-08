// ============================================================
// KNIFE BATTLE LIVE
// ============================================================
// Regras:
//
// 10 moedas = 1 faca
// Novo jogador entra imediatamente ao receber moedas
// Heart-Me também entra imediatamente
//
// Combate:
// - jogador forte persegue
// - jogador fraco foge
// - forte tenta permanecer atrás/lateral do fraco
// - corpos nunca devem ficar sobrepostos
// - espaço das facas é respeitado fora do combate
// - durante combate as pontas das facas podem se alcançar
// - corpo não causa dano
// - somente as facas causam dano
// - a cada 3 rotações completas = -10 moedas
// - 0 moedas = eliminado
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


// ============================================================
// MOVIMENTO
// ============================================================

const PLAYER_RADIUS = 28;

// Espaço mínimo físico do corpo.
const MIN_PLAYER_DISTANCE = 82;

// Espaço extra para impedir que as áreas das facas
// fiquem se sobrepondo quando não existe combate.
const PLAYER_SPACE_MARGIN = 10;

// Pequena distância adicional entre os corpos
// quando dois jogadores estão efetivamente lutando.
const COMBAT_BODY_GAP = 10;

// Distância desejada entre o forte e o fraco.
const BEHIND_DISTANCE = 118;

const BEHIND_SIDE_OFFSET = 38;

const BORDER_MARGIN = 65;

const MIN_MOVE_SPEED = 24;
const MAX_MOVE_SPEED = 48;

const FLEE_SPEED = 42;
const CHASE_SPEED = 34;

const SEPARATION_FORCE = 2.8;


// ============================================================
// COMBATE
// ============================================================

// 3 voltas completas = -10 moedas
const ROTATIONS_PER_COIN_DAMAGE = 3;

const COINS_PER_ATTACK = 10;

const MIN_ROTATION_SPEED = 0.055;
const MAX_ROTATION_SPEED = 0.075;

const KNIFE_LENGTH = 28;

const TOOL_HIT_GAP = 10;


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


function colorToHex(color) {

    return (
        "#" +
        color
            .toString(16)
            .padStart(6, "0")
    );

}


// ============================================================
// UTILITÁRIOS
// ============================================================

function clamp(value, min, max) {

    return Math.max(
        min,
        Math.min(max, value)
    );

}


function distanceBetween(
    x1,
    y1,
    x2,
    y2
) {

    const dx = x2 - x1;
    const dy = y2 - y1;

    return Math.sqrt(
        dx * dx +
        dy * dy
    );

}


function normalizeVector(x, y) {

    const length =
        Math.sqrt(
            x * x +
            y * y
        );

    if (length < 0.0001) {

        return {
            x: 0,
            y: 0
        };

    }

    return {
        x: x / length,
        y: y / length
    };

}


function normalizeAngle(angle) {

    while (
        angle > Math.PI
    ) {

        angle -=
            Math.PI * 2;

    }

    while (
        angle < -Math.PI
    ) {

        angle +=
            Math.PI * 2;

    }

    return angle;

}


// ============================================================
// FACAS
// ============================================================

function calculateKnifeCount(coins) {

    return Math.floor(
        Math.max(
            0,
            Number(coins) || 0
        ) / 10
    );

}


function calculatePower(knifeCount) {

    if (
        knifeCount <= 0
    ) {

        return 0;

    }

    return (
        5 +
        Math.sqrt(
            knifeCount
        ) * 2
    );

}


// Distância do centro até a base da faca.
function getOrbitRadius(player) {

    return (
        56 +
        Math.min(
            42,
            Math.sqrt(
                player.knifeCount
            ) * 2.8
        )
    );

}


// Alcance total do centro do jogador
// até a ponta da faca.
function getPlayerWeaponReach(player) {

    if (
        !player ||
        player.knifeCount <= 0
    ) {

        return 0;

    }

    return (
        getOrbitRadius(player) +
        KNIFE_LENGTH
    );

}


// ============================================================
// ESPAÇO OCUPADO PELO PLAYER
// ============================================================
//
// Fora de combate:
//
// corpo + órbita + comprimento da faca
//
// Isso faz com que dois jogadores não fiquem
// simplesmente um por cima das facas do outro.
//
// Durante combate existe uma exceção:
// eles podem aproximar as pontas das facas,
// mas nunca os corpos.
//

function getPlayerSpaceRadius(player) {

    if (!player || !player.alive) {

        return PLAYER_RADIUS;

    }

    return (
        PLAYER_RADIUS +
        getPlayerWeaponReach(player) +
        PLAYER_SPACE_MARGIN
    );

}


// ============================================================
// PHASER
// ============================================================

const config = {

    type: Phaser.AUTO,

    width: WIDTH,
    height: HEIGHT,

    parent: "game-container",

    backgroundColor:
        "#111827",

    scene: {

        create: create,
        update: update

    }

};


const game =
    new Phaser.Game(config);


// ============================================================
// CREATE
// ============================================================

function create() {

    scene = this;


    // ========================================================
    // GRADE
    // ========================================================

    const grid =
        scene.add.graphics();

    grid.lineStyle(
        1,
        0x222b3a,
        0.5
    );

    for (
        let x = 0;
        x < WIDTH;
        x += 50
    ) {

        grid.lineBetween(
            x,
            0,
            x,
            HEIGHT
        );

    }

    for (
        let y = 0;
        y < HEIGHT;
        y += 50
    ) {

        grid.lineBetween(
            0,
            y,
            WIDTH,
            y
        );

    }


    // ========================================================
    // BORDA
    // ========================================================

    const border =
        scene.add.graphics();

    border.lineStyle(
        4,
        0x374151,
        1
    );

    border.strokeRect(
        8,
        8,
        WIDTH - 16,
        HEIGHT - 16
    );


    // ========================================================
    // FACAS
    // ========================================================

    weaponGraphics =
        scene.add.graphics();

    weaponGraphics.setDepth(3);


    // ========================================================
    // HUD
    // ========================================================

    playerCountText =
        scene.add.text(
            20,
            15,
            "",
            {
                fontSize: "19px",
                color: "#ffffff",
                fontStyle: "bold"
            }
        );


    roundText =
        scene.add.text(
            20,
            42,
            "",
            {
                fontSize: "14px",
                color: "#9ca3af"
            }
        );


    roundTimerText =
        scene.add.text(
            WIDTH - 20,
            18,
            "",
            {
                fontSize: "22px",
                color: "#ffffff",
                fontStyle: "bold"
            }
        );

    roundTimerText.setOrigin(
        1,
        0
    );


    battleText =
        scene.add.text(
            WIDTH / 2,
            20,
            "",
            {
                fontSize: "20px",
                color: "#ffffff",
                fontStyle: "bold"
            }
        );

    battleText.setOrigin(0.5);


    createWinnerOverlay();


    beginRound();

}


// ============================================================
// WINNER OVERLAY
// ============================================================

function createWinnerOverlay() {

    scene.winnerContainer =
        scene.add.container(
            WIDTH / 2,
            HEIGHT / 2
        );

    scene.winnerContainer.setDepth(100);


    const background =
        scene.add.rectangle(
            0,
            0,
            WIDTH,
            HEIGHT,
            0x000000,
            0.86
        );


    const winText =
        scene.add.text(
            0,
            -205,
            "WIN",
            {
                fontSize: "115px",
                color: "#ffffff",
                fontStyle: "bold"
            }
        );

    winText.setOrigin(0.5);


    const winnerAvatar =
        scene.add.text(
            0,
            -80,
            "😎",
            {
                fontSize: "68px"
            }
        );

    winnerAvatar.setOrigin(0.5);


    const winnerName =
        scene.add.text(
            0,
            5,
            "",
            {
                fontSize: "46px",
                color: "#ffffff",
                fontStyle: "bold"
            }
        );

    winnerName.setOrigin(0.5);


    const killsText =
        scene.add.text(
            0,
            68,
            "",
            {
                fontSize: "28px",
                color: "#ffffff",
                fontStyle: "bold"
            }
        );

    killsText.setOrigin(0.5);


    const finalText =
        scene.add.text(
            0,
            125,
            "RODADA FINALIZADA",
            {
                fontSize: "18px",
                color: "#9ca3af",
                fontStyle: "bold"
            }
        );

    finalText.setOrigin(0.5);


    const instructionText =
        scene.add.text(
            0,
            165,
            'Clique em "Nova rodada"',
            {
                fontSize: "14px",
                color: "#6b7280"
            }
        );

    instructionText.setOrigin(0.5);


    scene.winnerContainer.add([
        background,
        winText,
        winnerAvatar,
        winnerName,
        killsText,
        finalText,
        instructionText
    ]);


    scene.winnerContainer.setVisible(
        false
    );


    scene.winnerData = {

        winText,
        winnerAvatar,
        winnerName,
        killsText

    };

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

    const button =
        document.getElementById(
            "new-round-button"
        );

    if (button) {

        button.disabled = true;

    }


    createInitialBots();

    updateRoundTimer();
    updatePlayersList();
    updatePlayerPreview();

}


// ============================================================
// NOVA RODADA
// ============================================================

function startNewRound() {

    if (roundActive) {

        return;

    }

    roundNumber++;

    beginRound();

    setStatus(
        "🔥 Nova rodada iniciada!"
    );

}


// ============================================================
// LIMPAR RODADA
// ============================================================

function clearCurrentRound() {

    for (
        const player of players
    ) {

        destroyPlayerVisuals(
            player
        );

    }


    players = [];

    playerMap.clear();

    pendingPlayers.clear();

    spatialGrid.clear();

    nextColorIndex = 0;

    playerSequence = 0;


    if (weaponGraphics) {

        weaponGraphics.clear();

    }


    if (
        scene &&
        scene.winnerContainer
    ) {

        scene.winnerContainer
            .setVisible(false);

    }

}


// ============================================================
// DESTRUIR VISUAIS
// ============================================================

function destroyPlayerVisuals(player) {

    const visuals = [

        player.aura,
        player.avatarText,
        player.nameText,
        player.coinText,
        player.knifeText,
        player.killText,
        player.hpBackground,
        player.hpBar

    ];

    for (
        const object of visuals
    ) {

        if (
            object &&
            object.destroy
        ) {

            object.destroy();

        }

    }

}


// ============================================================
// BOTS INICIAIS
// ============================================================

function createInitialBots() {

    addPlayerToArena(
        "Sara",
        "🧑",
        50,
        "bot-sara"
    );


    addPlayerToArena(
        "Player2",
        "😎",
        100,
        "bot-player2"
    );


    addPlayerToArena(
        "Player3",
        "👽",
        250,
        "bot-player3"
    );


    addPlayerToArena(
        "Player4",
        "🤖",
        500,
        "bot-player4"
    );

}


// ============================================================
// GRID
// ============================================================

function getGridKey(x, y) {

    return (
        Math.floor(
            x / GRID_SIZE
        ) +
        ":" +
        Math.floor(
            y / GRID_SIZE
        )
    );

}


function rebuildSpatialGrid() {

    spatialGrid.clear();

    for (
        const player of players
    ) {

        if (!player.alive) {

            continue;

        }

        const key =
            getGridKey(
                player.x,
                player.y
            );

        if (
            !spatialGrid.has(key)
        ) {

            spatialGrid.set(
                key,
                []
            );

        }

        spatialGrid
            .get(key)
            .push(player);

    }

}


function getPlayersNearPosition(
    x,
    y,
    radius
) {

    const cellX =
        Math.floor(
            x / GRID_SIZE
        );

    const cellY =
        Math.floor(
            y / GRID_SIZE
        );

    const cellRadius =
        Math.ceil(
            radius / GRID_SIZE
        );

    const result = [];


    for (
        let dx = -cellRadius;
        dx <= cellRadius;
        dx++
    ) {

        for (
            let dy = -cellRadius;
            dy <= cellRadius;
            dy++
        ) {

            const key =
                (
                    cellX + dx
                ) +
                ":" +
                (
                    cellY + dy
                );

            const cell =
                spatialGrid.get(key);

            if (!cell) {

                continue;

            }

            for (
                const player of cell
            ) {

                if (
                    distanceBetween(
                        x,
                        y,
                        player.x,
                        player.y
                    ) <= radius
                ) {

                    result.push(player);

                }

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


    for (
        let attempt = 0;
        attempt < SPAWN_ATTEMPTS;
        attempt++
    ) {

        const x =
            Phaser.Math.Between(
                120,
                WIDTH - 120
            );

        const y =
            Phaser.Math.Between(
                120,
                HEIGHT - 120
            );


        let nearest =
            Infinity;


        for (
            const player of players
        ) {

            if (!player.alive) {

                continue;

            }


            const distance =
                distanceBetween(
                    x,
                    y,
                    player.x,
                    player.y
                );

            nearest =
                Math.min(
                    nearest,
                    distance
                );

        }


        if (
            nearest >=
            SPAWN_SAFE_DISTANCE
        ) {

            return {
                x,
                y
            };

        }


        if (
            nearest >
            bestDistance
        ) {

            bestDistance =
                nearest;

            bestPosition = {
                x,
                y
            };

        }

    }


    return (
        bestPosition || {
            x: WIDTH / 2,
            y: HEIGHT / 2
        }
    );

}


// ============================================================
// CRIAR JOGADOR
// ============================================================

function addPlayerToArena(
    name,
    avatar,
    coins,
    userId
) {

    const normalizedId =
        String(userId);


    const existing =
        playerMap.get(
            normalizedId
        );


    if (existing) {

        if (
            Number(coins) > 0
        ) {

            addCoinsToExistingPlayer(
                existing,
                Number(coins)
            );

        }

        return existing;

    }


    const spawn =
        findSafeSpawnPosition();


    const safeCoins =
        Math.max(
            0,
            Number(coins) || 0
        );


    const knifeCount =
        calculateKnifeCount(
            safeCoins
        );


    const color =
        getNextColor();


    const wanderAngle =
        Math.random() *
        Math.PI * 2;


    const player = {

        userId:
            normalizedId,

        sequence:
            ++playerSequence,

        name:
            name || "Player",

        avatar:
            avatar || "😎",

        x:
            spawn.x,

        y:
            spawn.y,

        targetX:
            spawn.x,

        targetY:
            spawn.y,

        coins:
            safeCoins,

        knifeCount,

        power:
            calculatePower(
                knifeCount
            ),

        color,

        maxHp: 600,

        hp: 600,

        alive: true,

        waiting: false,

        kills: 0,

        targetId: null,

        aiMode: "wander",

        aiTimer: Phaser.Math.Between(
            700,
            1500
        ),

        moveTimer: 0,

        wanderAngle,

        wanderTimer:
            Phaser.Math.Between(
                900,
                2200
            ),

        fleeSide:
            Math.random() < 0.5
                ? -1
                : 1,

        behindSide:
            Math.random() < 0.5
                ? -1
                : 1,

        lastMoveDirX:
            Math.cos(
                wanderAngle
            ),

        lastMoveDirY:
            Math.sin(
                wanderAngle
            ),

        rotationAngle:
            Math.random() *
            Math.PI * 2,

        rotationSpeed:
            Phaser.Math.FloatBetween(
                MIN_ROTATION_SPEED,
                MAX_ROTATION_SPEED
            ),

        rotationTurns: 0,

        spawnProtectionMs:
            SPAWN_PROTECTION_MS,

        recentHitMs: 0,

        aura: null,
        avatarText: null,
        nameText: null,
        coinText: null,
        knifeText: null,
        killText: null,
        hpBackground: null,
        hpBar: null

    };


    // ========================================================
    // VISUAL
    // ========================================================

    player.aura =
        scene.add.circle(
            player.x,
            player.y,
            PLAYER_RADIUS + 6,
            player.color,
            0.16
        );

    player.aura.setDepth(1);


    player.avatarText =
        scene.add.text(
            player.x,
            player.y,
            player.avatar,
            {
                fontSize: "28px"
            }
        );

    player.avatarText.setOrigin(
        0.5
    );

    player.avatarText.setDepth(5);


    player.nameText =
        scene.add.text(
            player.x,
            player.y - 43,
            player.name,
            {
                fontSize: "14px",
                color: "#ffffff",
                fontStyle: "bold",
                stroke: "#000000",
                strokeThickness: 3
            }
        );

    player.nameText.setOrigin(
        0.5
    );

    player.nameText.setDepth(6);


    player.coinText =
        scene.add.text(
            player.x,
            player.y + 35,
            `🪙 ${player.coins}`,
            {
                fontSize: "12px",
                color: "#ffffff",
                stroke: "#000000",
                strokeThickness: 3
            }
        );

    player.coinText.setOrigin(
        0.5
    );

    player.coinText.setDepth(6);


    player.knifeText =
        scene.add.text(
            player.x,
            player.y + 50,
            `🔪 ${player.knifeCount}`,
            {
                fontSize: "11px",
                color: "#d1d5db",
                stroke: "#000000",
                strokeThickness: 2
            }
        );

    player.knifeText.setOrigin(
        0.5
    );

    player.knifeText.setDepth(6);


    player.killText =
        scene.add.text(
            player.x,
            player.y + 64,
            `💀 ${player.kills}`,
            {
                fontSize: "10px",
                color: "#fca5a5",
                stroke: "#000000",
                strokeThickness: 2
            }
        );

    player.killText.setOrigin(
        0.5
    );

    player.killText.setDepth(6);


    player.hpBackground =
        scene.add.rectangle(
            player.x,
            player.y + 78,
            60,
            5,
            0x000000,
            0.8
        );

    player.hpBackground.setOrigin(
        0.5
    );

    player.hpBackground.setDepth(6);


    player.hpBar =
        scene.add.rectangle(
            player.x - 30,
            player.y + 78,
            60,
            5,
            0x22c55e,
            1
        );

    player.hpBar.setOrigin(
        0,
        0.5
    );

    player.hpBar.setDepth(7);


    players.push(player);

    playerMap.set(
        normalizedId,
        player
    );


    updatePlayerVisuals(
        player,
        0
    );

    updatePlayersList();


    return player;

}


// ============================================================
// IA
// ============================================================

function getTargeters(target) {

    let count = 0;

    for (
        const player of players
    ) {

        if (
            !player.alive ||
            player === target
        ) {

            continue;

        }

        if (
            player.targetId ===
            target.userId
        ) {

            count++;

        }

    }

    return count;

}


function chooseTarget(player) {

    const opponents =
        players.filter(
            other =>
                other !== player &&
                other.alive &&
                other.spawnProtectionMs <= 0
        );


    if (
        opponents.length === 0
    ) {

        player.targetId = null;

        return null;

    }


    let candidates =
        opponents.filter(
            target =>
                player.power >=
                target.power * 1.10
        );


    if (
        candidates.length === 0
    ) {

        candidates =
            opponents;

    }


    let best = null;
    let bestScore = -Infinity;


    for (
        const target of candidates
    ) {

        const distance =
            distanceBetween(
                player.x,
                player.y,
                target.x,
                target.y
            );


        const targeters =
            getTargeters(
                target
            );


        let score = 0;


        score +=
            (
                player.power -
                target.power
            ) * 10;


        score -=
            distance * 0.025;


        score -=
            targeters * 180;


        if (
            targeters >= 1 &&
            player.power <
            target.power * 2
        ) {

            score -= 500;

        }


        if (
            score > bestScore
        ) {

            bestScore = score;
            best = target;

        }

    }


    if (best) {

        player.targetId =
            best.userId;

    }


    return best;

}


// ============================================================
// MODO DA IA
// ============================================================

function updateAI(
    player,
    delta
) {

    if (!player.alive) {

        return;

    }


    player.aiTimer -= delta;


    const currentTarget =
        player.targetId
            ? playerMap.get(
                player.targetId
            )
            : null;


    const targetInvalid =
        !currentTarget ||
        !currentTarget.alive ||
        currentTarget === player ||
        currentTarget.spawnProtectionMs > 0;


    if (
        targetInvalid ||
        player.aiTimer <= 0
    ) {

        chooseTarget(player);

        player.aiTimer =
            Phaser.Math.Between(
                700,
                1300
            );

    }


    const target =
        player.targetId
            ? playerMap.get(
                player.targetId
            )
            : null;


    if (
        !target ||
        !target.alive
    ) {

        player.aiMode =
            "wander";

        return;

    }


    if (
        player.power >=
        target.power * 1.10
    ) {

        player.aiMode =
            "chase";

    }
    else {

        player.aiMode =
            "flee";

    }

}


// ============================================================
// WANDER
// ============================================================

function chooseWanderTarget(
    player
) {

    const margin =
        BORDER_MARGIN + 20;


    player.targetX =
        Phaser.Math.Between(
            margin,
            WIDTH - margin
        );


    player.targetY =
        Phaser.Math.Between(
            margin,
            HEIGHT - margin
        );


    player.wanderTimer =
        Phaser.Math.Between(
            1400,
            3000
        );

}


// ============================================================
// DIREÇÃO
// ============================================================

function getMovementDirection(
    player
) {

    const dir =
        normalizeVector(
            player.lastMoveDirX,
            player.lastMoveDirY
        );


    if (
        Math.abs(dir.x) +
        Math.abs(dir.y) >
        0.01
    ) {

        return dir;

    }


    return {
        x: 1,
        y: 0
    };

}


// ============================================================
// MOVIMENTO
// ============================================================

function movePlayer(
    player,
    delta
) {

    if (
        !player.alive
    ) {

        return;

    }


    const dt =
        Math.min(
            delta,
            50
        ) / 1000;


    let desiredX = 0;
    let desiredY = 0;


    const target =
        player.targetId
            ? playerMap.get(
                player.targetId
            )
            : null;


    // ========================================================
    // WANDER
    // ========================================================

    if (
        !target ||
        !target.alive
    ) {

        player.wanderTimer -=
            delta;


        if (
            player.wanderTimer <= 0 ||
            distanceBetween(
                player.x,
                player.y,
                player.targetX,
                player.targetY
            ) < 35
        ) {

            chooseWanderTarget(
                player
            );

        }


        const wander =
            normalizeVector(
                player.targetX -
                player.x,
                player.targetY -
                player.y
            );


        desiredX =
            wander.x;

        desiredY =
            wander.y;

    }


    // ========================================================
    // FRACO = FUGIR
    // ========================================================

    else if (
        player.aiMode ===
        "flee"
    ) {

        const away =
            normalizeVector(
                player.x -
                target.x,
                player.y -
                target.y
            );


        const side = {
            x:
                -away.y *
                player.fleeSide,

            y:
                away.x *
                player.fleeSide
        };


        const flee =
            normalizeVector(
                away.x * 0.78 +
                side.x * 0.32,

                away.y * 0.78 +
                side.y * 0.32
            );


        desiredX =
            flee.x;

        desiredY =
            flee.y;

    }


    // ========================================================
    // FORTE = FICAR ATRÁS
    // ========================================================

    else {

        const targetDir =
            getMovementDirection(
                target
            );


        const sideX =
            -targetDir.y *
            player.behindSide;

        const sideY =
            targetDir.x *
            player.behindSide;


        const desiredTargetX =
            target.x -
            targetDir.x *
            BEHIND_DISTANCE +
            sideX *
            BEHIND_SIDE_OFFSET;


        const desiredTargetY =
            target.y -
            targetDir.y *
            BEHIND_DISTANCE +
            sideY *
            BEHIND_SIDE_OFFSET;


        const toBehind =
            normalizeVector(
                desiredTargetX -
                player.x,

                desiredTargetY -
                player.y
            );


        const distanceToTarget =
            distanceBetween(
                player.x,
                player.y,
                target.x,
                target.y
            );


        if (
            Math.abs(
                distanceToTarget -
                BEHIND_DISTANCE
            ) < 35
        ) {

            const follow =
                normalizeVector(
                    targetDir.x * 0.85 +
                    sideX * 0.22,

                    targetDir.y * 0.85 +
                    sideY * 0.22
                );


            desiredX =
                follow.x;

            desiredY =
                follow.y;

        }

        else {

            desiredX =
                toBehind.x;

            desiredY =
                toBehind.y;

        }


        const relativeX =
            player.x -
            target.x;

        const relativeY =
            player.y -
            target.y;


        const frontness =
            relativeX *
            targetDir.x +
            relativeY *
            targetDir.y;


        if (
            frontness > 10 &&
            distanceToTarget <
            BEHIND_DISTANCE + 60
        ) {

            const around =
                normalizeVector(
                    sideX * 0.9 -
                    targetDir.x * 0.15,

                    sideY * 0.9 -
                    targetDir.y * 0.15
                );


            desiredX =
                around.x;

            desiredY =
                around.y;

        }

    }


    // ========================================================
    // SEPARAÇÃO DURANTE MOVIMENTO
    // ========================================================

    const nearbyRadius =
        Math.max(
            MIN_PLAYER_DISTANCE + 35,
            250
        );


    const nearby =
        getPlayersNearPosition(
            player.x,
            player.y,
            nearbyRadius
        );


    let separationX = 0;
    let separationY = 0;


    for (
        const other of nearby
    ) {

        if (
            other === player ||
            !other.alive
        ) {

            continue;

        }


        const dx =
            player.x -
            other.x;

        const dy =
            player.y -
            other.y;


        const distance =
            Math.sqrt(
                dx * dx +
                dy * dy
            );


        if (
            distance < 0.001
        ) {

            continue;

        }


        const playerTargetingOther =
            player.targetId ===
            other.userId;


        const otherTargetingPlayer =
            other.targetId ===
            player.userId;


        const isCombatPair =
            playerTargetingOther ||
            otherTargetingPlayer;


        let requiredDistance;


        if (isCombatPair) {

            // Durante uma luta:
            // as facas podem chegar uma na outra,
            // mas os corpos nunca se atravessam.
            requiredDistance =
                (
                    PLAYER_RADIUS * 2
                ) +
                COMBAT_BODY_GAP;

        }
        else {

            // Fora de combate:
            // respeita o espaço completo das facas.
            requiredDistance =
                getPlayerSpaceRadius(
                    player
                ) +
                getPlayerSpaceRadius(
                    other
                );

        }


        if (
            distance <
            requiredDistance
        ) {

            const strength =
                (
                    requiredDistance -
                    distance
                ) /
                requiredDistance;


            separationX +=
                (
                    dx / distance
                ) *
                strength;

            separationY +=
                (
                    dy / distance
                ) *
                strength;

        }

    }


    desiredX +=
        separationX *
        SEPARATION_FORCE;


    desiredY +=
        separationY *
        SEPARATION_FORCE;


    // ========================================================
    // BORDA
    // ========================================================

    let borderX = 0;
    let borderY = 0;


    const borderSpace =
        Math.min(
            BORDER_MARGIN,
            getPlayerSpaceRadius(
                player
            )
        );


    if (
        player.x <
        borderSpace
    ) {

        borderX +=
            (
                borderSpace -
                player.x
            ) /
            borderSpace;

    }


    if (
        player.x >
        WIDTH -
        borderSpace
    ) {

        borderX -=
            (
                player.x -
                (
                    WIDTH -
                    borderSpace
                )
            ) /
            borderSpace;

    }


    if (
        player.y <
        borderSpace
    ) {

        borderY +=
            (
                borderSpace -
                player.y
            ) /
            borderSpace;

    }


    if (
        player.y >
        HEIGHT -
        borderSpace
    ) {

        borderY -=
            (
                player.y -
                (
                    HEIGHT -
                    borderSpace
                )
            ) /
            borderSpace;

    }


    desiredX +=
        borderX * 2.2;


    desiredY +=
        borderY * 2.2;


    const movement =
        normalizeVector(
            desiredX,
            desiredY
        );


    let speed =
        Phaser.Math.Clamp(
            player.moveSpeed ||
            MIN_MOVE_SPEED,
            MIN_MOVE_SPEED,
            MAX_MOVE_SPEED
        );


    if (
        player.aiMode ===
        "flee"
    ) {

        speed =
            FLEE_SPEED;

    }
    else if (
        player.aiMode ===
        "chase"
    ) {

        speed =
            CHASE_SPEED;

    }


    player.x +=
        movement.x *
        speed *
        dt;


    player.y +=
        movement.y *
        speed *
        dt;


    if (
        Math.abs(movement.x) +
        Math.abs(movement.y) >
        0.05
    ) {

        player.lastMoveDirX =
            movement.x;

        player.lastMoveDirY =
            movement.y;

    }


    // ========================================================
    // LIMITES
    // ========================================================

    player.x =
        Phaser.Math.Clamp(
            player.x,
            PLAYER_RADIUS + 5,
            WIDTH -
            PLAYER_RADIUS -
            5
        );


    player.y =
        Phaser.Math.Clamp(
            player.y,
            PLAYER_RADIUS + 5,
            HEIGHT -
            PLAYER_RADIUS -
            5
        );

}


// ============================================================
// RESOLVER SOBREPOSIÇÃO
// ============================================================

function resolveAllPlayerOverlaps() {

    for (
        let pass = 0;
        pass < 3;
        pass++
    ) {

        rebuildSpatialGrid();


        for (
            const player of players
        ) {

            if (
                !player.alive
            ) {

                continue;

            }


            const nearby =
                getPlayersNearPosition(
                    player.x,
                    player.y,
                    300
                );


            for (
                const other of nearby
            ) {

                if (
                    other === player ||
                    !other.alive
                ) {

                    continue;

                }


                if (
                    player.sequence >=
                    other.sequence
                ) {

                    continue;

                }


                let dx =
                    player.x -
                    other.x;

                let dy =
                    player.y -
                    other.y;


                let distance =
                    Math.sqrt(
                        dx * dx +
                        dy * dy
                    );


                if (
                    distance < 0.001
                ) {

                    const angle =
                        Math.random() *
                        Math.PI *
                        2;

                    dx =
                        Math.cos(angle);

                    dy =
                        Math.sin(angle);

                    distance = 1;

                }


                const playerTargetingOther =
                    player.targetId ===
                    other.userId;


                const otherTargetingPlayer =
                    other.targetId ===
                    player.userId;


                const isCombatPair =
                    playerTargetingOther ||
                    otherTargetingPlayer;


                let requiredDistance;


                if (isCombatPair) {

                    // Em combate, permite que as facas
                    // se alcancem, mas os corpos não.
                    requiredDistance =
                        (
                            PLAYER_RADIUS * 2
                        ) +
                        COMBAT_BODY_GAP;

                }
                else {

                    // Fora de combate, respeita
                    // o espaço total das facas.
                    requiredDistance =
                        getPlayerSpaceRadius(
                            player
                        ) +
                        getPlayerSpaceRadius(
                            other
                        );

                }


                if (
                    distance <
                    requiredDistance
                ) {

                    const overlap =
                        requiredDistance -
                        distance;


                    const nx =
                        dx / distance;

                    const ny =
                        dy / distance;


                    const push =
                        overlap * 0.5;


                    player.x +=
                        nx * push;

                    player.y +=
                        ny * push;


                    other.x -=
                        nx * push;

                    other.y -=
                        ny * push;


                    player.x =
                        Phaser.Math.Clamp(
                            player.x,
                            PLAYER_RADIUS + 5,
                            WIDTH -
                            PLAYER_RADIUS -
                            5
                        );


                    player.y =
                        Phaser.Math.Clamp(
                            player.y,
                            PLAYER_RADIUS + 5,
                            HEIGHT -
                            PLAYER_RADIUS -
                            5
                        );


                    other.x =
                        Phaser.Math.Clamp(
                            other.x,
                            PLAYER_RADIUS + 5,
                            WIDTH -
                            PLAYER_RADIUS -
                            5
                        );


                    other.y =
                        Phaser.Math.Clamp(
                            other.y,
                            PLAYER_RADIUS + 5,
                            HEIGHT -
                            PLAYER_RADIUS -
                            5
                        );

                }

            }

        }

    }

}


// ============================================================
// ROTAÇÃO DAS FACAS
// ============================================================

function updateRotation(
    player,
    delta
) {

    if (
        !player.alive ||
        player.knifeCount <= 0
    ) {

        return;

    }


    player.rotationAngle +=
        player.rotationSpeed *
        (
            delta /
            16.6667
        );


    // Pode acontecer de o frame ser grande.
    while (
        player.rotationAngle >=
        Math.PI * 2
    ) {

        player.rotationAngle -=
            Math.PI * 2;

        player.rotationTurns++;

    }


    // ========================================================
    // EXATAMENTE 3 ROTAÇÕES = -10 MOEDAS
    // ========================================================

    if (
        player.rotationTurns >=
        ROTATIONS_PER_COIN_DAMAGE
    ) {

        tryAttack(
            player
        );

        // IMPORTANTE:
        // sempre zera depois da terceira volta.
        //
        // Não fica:
        // 3 -> 2 -> 2 -> 2
        //
        // Agora:
        // 0 -> 1 -> 2 -> 3 -> ATAQUE -> 0
        player.rotationTurns = 0;

    }

}


// ============================================================
// CALCULAR PONTOS DA FACA
// ============================================================

function getKnifePoints(
    player,
    index
) {

    if (
        !player ||
        player.knifeCount <= 0
    ) {

        return null;

    }


    const count =
        Math.min(
            player.knifeCount,
            MAX_VISUAL_KNIVES
        );


    if (count <= 0) {

        return null;

    }


    const spacing =
        Math.PI * 2 /
        count;


    const angle =
        player.rotationAngle +
        spacing * index;


    const baseX =
        player.x +
        Math.cos(angle) *
        getOrbitRadius(player);


    const baseY =
        player.y +
        Math.sin(angle) *
        getOrbitRadius(player);


    const tipX =
        baseX +
        Math.cos(angle) *
        KNIFE_LENGTH;


    const tipY =
        baseY +
        Math.sin(angle) *
        KNIFE_LENGTH;


    return {

        baseX,
        baseY,
        tipX,
        tipY,
        angle

    };

}


// ============================================================
// DISTÂNCIA ENTRE SEGMENTOS
// ============================================================

function pointToSegmentDistance(
    px,
    py,
    x1,
    y1,
    x2,
    y2
) {

    const dx =
        x2 - x1;

    const dy =
        y2 - y1;


    const lengthSquared =
        dx * dx +
        dy * dy;


    if (
        lengthSquared <=
        0.000001
    ) {

        return distanceBetween(
            px,
            py,
            x1,
            y1
        );

    }


    let t =
        (
            (px - x1) * dx +
            (py - y1) * dy
        ) /
        lengthSquared;


    t =
        clamp(
            t,
            0,
            1
        );


    const closestX =
        x1 +
        t * dx;


    const closestY =
        y1 +
        t * dy;


    return distanceBetween(
        px,
        py,
        closestX,
        closestY
    );

}


// ============================================================
// COLISÃO ENTRE DUAS FACAS
// ============================================================

function knifeSegmentsTouch(
    knifeA,
    knifeB
) {

    if (
        !knifeA ||
        !knifeB
    ) {

        return false;

    }


    const tolerance =
        TOOL_HIT_GAP;


    const aToB =
        pointToSegmentDistance(
            knifeA.baseX,
            knifeA.baseY,
            knifeB.baseX,
            knifeB.baseY,
            knifeB.tipX,
            knifeB.tipY
        );


    if (
        aToB <= tolerance
    ) {

        return true;

    }


    const aTipToB =
        pointToSegmentDistance(
            knifeA.tipX,
            knifeA.tipY,
            knifeB.baseX,
            knifeB.baseY,
            knifeB.tipX,
            knifeB.tipY
        );


    if (
        aTipToB <= tolerance
    ) {

        return true;

    }


    const bToA =
        pointToSegmentDistance(
            knifeB.baseX,
            knifeB.baseY,
            knifeA.baseX,
            knifeA.baseY,
            knifeA.tipX,
            knifeA.tipY
        );


    if (
        bToA <= tolerance
    ) {

        return true;

    }


    const bTipToA =
        pointToSegmentDistance(
            knifeB.tipX,
            knifeB.tipY,
            knifeA.baseX,
            knifeA.baseY,
            knifeA.tipX,
            knifeA.tipY
        );


    return (
        bTipToA <= tolerance
    );

}


// ============================================================
// VERIFICAR SE AS FACAS PODEM ATINGIR
// ============================================================

function weaponsCanHit(
    attacker,
    target
) {

    if (
        !attacker ||
        !target ||
        attacker.knifeCount <= 0 ||
        target.knifeCount <= 0
    ) {

        return false;

    }


    const attackerCount =
        Math.min(
            attacker.knifeCount,
            MAX_VISUAL_KNIVES
        );


    const targetCount =
        Math.min(
            target.knifeCount,
            MAX_VISUAL_KNIVES
        );


    for (
        let i = 0;
        i < attackerCount;
        i++
    ) {

        const attackerKnife =
            getKnifePoints(
                attacker,
                i
            );


        if (!attackerKnife) {

            continue;

        }


        for (
            let j = 0;
            j < targetCount;
            j++
        ) {

            const targetKnife =
                getKnifePoints(
                    target,
                    j
                );


            if (!targetKnife) {

                continue;

            }


            if (
                knifeSegmentsTouch(
                    attackerKnife,
                    targetKnife
                )
            ) {

                return true;

            }

        }

    }


    return false;

}


// ============================================================
// ATAQUE
// ============================================================

function tryAttack(player) {

    if (
        !player.alive ||
        player.knifeCount <= 0
    ) {

        return false;

    }


    const target =
        player.targetId
            ? playerMap.get(
                player.targetId
            )
            : null;


    if (
        !target ||
        !target.alive
    ) {

        return false;

    }


    if (
        target.spawnProtectionMs >
        0
    ) {

        return false;

    }


    // ========================================================
    // SOMENTE O MAIS FORTE PODE ATACAR
    // ========================================================

    if (
        player.power <=
        target.power
    ) {

        return false;

    }


    // ========================================================
    // DISTÂNCIA MÁXIMA POSSÍVEL DAS ARMAS
    // ========================================================

    const attackerReach =
        getPlayerWeaponReach(
            player
        );


    const targetReach =
        getPlayerWeaponReach(
            target
        );


    const distance =
        distanceBetween(
            player.x,
            player.y,
            target.x,
            target.y
        );


    const maximumWeaponDistance =
        attackerReach +
        targetReach +
        TOOL_HIT_GAP;


    if (
        distance >
        maximumWeaponDistance
    ) {

        return false;

    }


    // ========================================================
    // CONFIRMA SE EXISTE CONTATO REAL ENTRE FACAS
    // ========================================================

    if (
        !weaponsCanHit(
            player,
            target
        )
    ) {

        return false;

    }


    // ========================================================
    // -10 MOEDAS
    // ========================================================

    const oldCoins =
        target.coins;


    const damage =
        Math.min(
            COINS_PER_ATTACK,
            target.coins
        );


    target.coins =
        Math.max(
            0,
            target.coins -
            damage
        );


    target.knifeCount =
        calculateKnifeCount(
            target.coins
        );


    target.power =
        calculatePower(
            target.knifeCount
        );


    // Mantém HP apenas como indicador visual.
    target.hp =
        target.maxHp *
        (
            target.coins /
            Math.max(
                oldCoins,
                1
            )
        );


    target.hp =
        Math.max(
            0,
            target.hp
        );


    target.recentHitMs =
        180;


    // ========================================================
    // EFEITO DE ACERTO
    // ========================================================

    if (
        target.avatarText
    ) {

        target.avatarText.setScale(
            1.15
        );


        scene.tweens.add({

            targets:
                target.avatarText,

            scale: 1,

            duration: 100

        });

    }


    showBattleMessage(
        "🔪 " +
        player.name +
        " acertou " +
        target.name +
        " (-" +
        damage +
        " 🪙)"
    );


    updatePlayerVisuals(
        target,
        0
    );


    updatePlayersList();


    // ========================================================
    // MORTE
    // ========================================================

    if (
        target.coins <= 0
    ) {

        eliminatePlayer(
            target,
            player
        );

    }


    return true;

}


// ============================================================
// ELIMINAR
// ============================================================

function eliminatePlayer(
    target,
    attacker
) {

    if (
        !target.alive
    ) {

        return;

    }


    target.alive = false;

    target.hp = 0;

    target.targetId = null;


    if (attacker) {

        attacker.kills++;

    }


    // Todos que estavam atacando o morto
    // precisam procurar outro alvo.
    for (
        const player of players
    ) {

        if (
            player.targetId ===
            target.userId
        ) {

            player.targetId = null;

            player.aiTimer = 0;

        }

    }


    showBattleMessage(
        "💀 " +
        target.name +
        " foi eliminado!"
    );


    const objects = [

        target.aura,
        target.avatarText,
        target.nameText,
        target.coinText,
        target.knifeText,
        target.killText,
        target.hpBackground,
        target.hpBar

    ];


    for (
        const object of objects
    ) {

        if (
            object
        ) {

            scene.tweens.add({

                targets:
                    object,

                alpha: 0,

                duration: 300

            });

        }

    }


    updatePlayersList();


    setTimeout(
        checkWinner,
        50
    );

}


// ============================================================
// DESENHAR FACAS
// ============================================================

function drawAllWeapons() {

    if (!weaponGraphics) {

        return;

    }


    weaponGraphics.clear();


    for (
        const player of players
    ) {

        if (
            !player.alive ||
            player.knifeCount <= 0
        ) {

            continue;

        }


        const count =
            Math.min(
                player.knifeCount,
                MAX_VISUAL_KNIVES
            );


        for (
            let i = 0;
            i < count;
            i++
        ) {

            const knife =
                getKnifePoints(
                    player,
                    i
                );


            if (!knife) {

                continue;

            }


            weaponGraphics.lineStyle(
                3,
                player.color,
                1
            );


            weaponGraphics.lineBetween(
                knife.baseX,
                knife.baseY,
                knife.tipX,
                knife.tipY
            );


            const sideX =
                -Math.sin(
                    knife.angle
                ) * 5;


            const sideY =
                Math.cos(
                    knife.angle
                ) * 5;


            weaponGraphics.fillStyle(
                player.color,
                1
            );


            weaponGraphics.beginPath();


            weaponGraphics.moveTo(
                knife.tipX,
                knife.tipY
            );


            weaponGraphics.lineTo(
                knife.tipX -
                Math.cos(
                    knife.angle
                ) * 9 +
                sideX,

                knife.tipY -
                Math.sin(
                    knife.angle
                ) * 9 +
                sideY
            );


            weaponGraphics.lineTo(
                knife.tipX -
                Math.cos(
                    knife.angle
                ) * 9 -
                sideX,

                knife.tipY -
                Math.sin(
                    knife.angle
                ) * 9 -
                sideY
            );


            weaponGraphics.closePath();

            weaponGraphics.fillPath();

        }

    }

}


// ============================================================
// VISUAL DO PLAYER
// ============================================================

function updatePlayerVisuals(
    player,
    delta
) {

    if (!player) {

        return;

    }


    if (
        player.recentHitMs > 0
    ) {

        player.recentHitMs -=
            delta;

    }


    if (
        player.spawnProtectionMs > 0
    ) {

        player.spawnProtectionMs -=
            delta;

    }


    if (
        player.aura
    ) {

        player.aura.setPosition(
            player.x,
            player.y
        );


        player.aura.setFillStyle(
            player.color,
            player.spawnProtectionMs > 0
                ? 0.30
                : 0.16
        );

    }


    if (
        player.avatarText
    ) {

        player.avatarText.setPosition(
            player.x,
            player.y
        );

    }


    if (
        player.nameText
    ) {

        player.nameText.setPosition(
            player.x,
            player.y - 43
        );

    }


    if (
        player.coinText
    ) {

        player.coinText.setPosition(
            player.x,
            player.y + 35
        );


        player.coinText.setText(
            `🪙 ${player.coins}`
        );

    }


    if (
        player.knifeText
    ) {

        player.knifeText.setPosition(
            player.x,
            player.y + 50
        );


        player.knifeText.setText(
            `🔪 ${player.knifeCount}`
        );

    }


    if (
        player.killText
    ) {

        player.killText.setPosition(
            player.x,
            player.y + 64
        );


        player.killText.setText(
            `💀 ${player.kills}`
        );

    }


    updateHealthBar(
        player
    );

}


// ============================================================
// HP VISUAL
// ============================================================

function updateHealthBar(player) {

    if (
        !player.hpBackground ||
        !player.hpBar
    ) {

        return;

    }


    player.hpBackground.setPosition(
        player.x,
        player.y + 78
    );


    player.hpBar.setPosition(
        player.x - 30,
        player.y + 78
    );


    const ratio =
        clamp(
            player.hp /
            player.maxHp,
            0,
            1
        );


    player.hpBar.width =
        60 * ratio;


    if (
        ratio > 0.5
    ) {

        player.hpBar.setFillStyle(
            0x22c55e
        );

    }
    else if (
        ratio > 0.25
    ) {

        player.hpBar.setFillStyle(
            0xf59e0b
        );

    }
    else {

        player.hpBar.setFillStyle(
            0xef4444
        );

    }

}


// ============================================================
// WINNER
// ============================================================

function checkWinner() {

    if (!roundActive) {

        return;

    }


    const alive =
        players.filter(
            player =>
                player.alive
        );


    if (
        alive.length > 1
    ) {

        return;

    }


    if (
        alive.length === 1
    ) {

        showWinner(
            alive[0]
        );

    }
    else {

        finishRound();

    }

}


// ============================================================
// SHOW WINNER
// ============================================================

function showWinner(
    winner
) {

    if (!winner) {

        finishRound();

        return;

    }


    roundActive = false;
    roundEnded = true;


    const button =
        document.getElementById(
            "new-round-button"
        );


    if (button) {

        button.disabled = false;

    }


    if (
        scene.winnerData
    ) {

        scene.winnerData
            .winnerAvatar
            .setText(
                winner.avatar
            );


        scene.winnerData
            .winnerName
            .setText(
                winner.name
            );


        scene.winnerData
            .killsText
            .setText(
                `💀 ${winner.kills} kills`
            );

    }


    scene.winnerContainer
        .setVisible(true);


    updateRoundTimer();

}


// ============================================================
// FINISH ROUND
// ============================================================

function finishRound() {

    roundActive = false;
    roundEnded = true;


    const button =
        document.getElementById(
            "new-round-button"
        );


    if (button) {

        button.disabled = false;

    }


    updateRoundTimer();

}


// ============================================================
// TIMER
// ============================================================

function updateRoundTimer() {

    const remaining =
        Math.max(
            0,
            ROUND_DURATION_MS -
            roundElapsedMs
        );


    const totalSeconds =
        Math.ceil(
            remaining / 1000
        );


    const minutes =
        Math.floor(
            totalSeconds / 60
        );


    const seconds =
        totalSeconds % 60;


    if (
        roundTimerText
    ) {

        roundTimerText.setText(
            `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        );

    }


    if (
        roundText
    ) {

        roundText.setText(
            `Rodada ${roundNumber}`
        );

    }


    const participants =
        players.filter(
            player =>
                player.alive
        ).length;


    const waiting =
        pendingPlayers.size;


    const participantElement =
        document.getElementById(
            "panel-participants"
        );


    if (
        participantElement
    ) {

        participantElement.innerText =
            participants;

    }


    const waitingElement =
        document.getElementById(
            "panel-waiting"
        );


    if (
        waitingElement
    ) {

        waitingElement.innerText =
            waiting;

    }


    if (
        playerCountText
    ) {

        playerCountText.setText(
            `👥 ${participants}`
        );

    }

}


// ============================================================
// FIM POR TEMPO
// ============================================================

function checkTimeWinner() {

    const alive =
        players.filter(
            player =>
                player.alive
        );


    if (
        alive.length === 0
    ) {

        finishRound();

        return;

    }


    alive.sort(
        (
            a,
            b
        ) =>
            b.coins -
            a.coins
    );


    showWinner(
        alive[0]
    );

}


// ============================================================
// UPDATE
// ============================================================

function update(
    time,
    delta
) {

    if (
        !roundActive
    ) {

        drawAllWeapons();

        return;

    }


    delta =
        Math.min(
            delta,
            50
        );


    roundElapsedMs +=
        delta;


    if (
        roundElapsedMs >=
        ROUND_DURATION_MS
    ) {

        checkTimeWinner();

        return;

    }


    rebuildSpatialGrid();


    // ========================================================
    // IA + MOVIMENTO
    // ========================================================

    for (
        const player of players
    ) {

        if (
            !player.alive
        ) {

            continue;

        }


        updateAI(
            player,
            delta
        );


        movePlayer(
            player,
            delta
        );

    }


    // ========================================================
    // SEPARAÇÃO FINAL
    // ========================================================

    resolveAllPlayerOverlaps();


    // ========================================================
    // ROTAÇÃO
    // ========================================================

    for (
        const player of players
    ) {

        if (
            !player.alive
        ) {

            continue;

        }


        updateRotation(
            player,
            delta
        );


        updatePlayerVisuals(
            player,
            delta
        );

    }


    drawAllWeapons();


    // ========================================================
    // MENSAGEM
    // ========================================================

    if (
        battleMessageTimer > 0
    ) {

        battleMessageTimer -=
            delta;

    }
    else {

        battleText.setText(
            ""
        );

    }


    // ========================================================
    // LISTA
    // ========================================================

    listUpdateTimer -=
        delta;


    if (
        listUpdateTimer <= 0
    ) {

        listUpdateTimer = 250;

        updatePlayersList();
        updatePlayerPreview();
        updateRoundTimer();

    }

}


// ============================================================
// ADICIONAR MOEDAS
// ============================================================

function addCoinsToExistingPlayer(
    player,
    amount
) {

    const value =
        Math.max(
            0,
            Number(amount) || 0
        );


    if (
        value <= 0
    ) {

        return;

    }


    player.coins +=
        value;


    player.knifeCount =
        calculateKnifeCount(
            player.coins
        );


    player.power =
        calculatePower(
            player.knifeCount
        );


    player.hp =
        player.maxHp;


    updatePlayerVisuals(
        player,
        0
    );


    showBattleMessage(
        "🎁 " +
        player.name +
        " recebeu +" +
        value +
        " moedas!"
    );


    updatePlayersList();
    updatePlayerPreview();

}


// ============================================================
// SEND COINS
// ============================================================

function sendCoins(amount) {

    if (
        !roundActive
    ) {

        setStatus(
            "⏰ A rodada terminou."
        );

        return;

    }


    const nameElement =
        document.getElementById(
            "username"
        );


    const userIdElement =
        document.getElementById(
            "userid"
        );


    const avatarElement =
        document.getElementById(
            "avatar"
        );


    const name =
        nameElement
            ? nameElement.value.trim()
            : "";


    const userId =
        userIdElement
            ? userIdElement.value.trim()
            : "";


    const avatar =
        avatarElement
            ? avatarElement.value.trim()
            : "😎";


    if (!name) {

        setStatus(
            "⚠️ Digite o nome."
        );

        return;

    }


    if (!userId) {

        setStatus(
            "⚠️ Digite o ID."
        );

        return;

    }


    const value =
        Math.max(
            0,
            Number(amount) || 0
        );


    if (
        value <= 0
    ) {

        return;

    }


    const existing =
        playerMap.get(
            String(userId)
        );


    if (existing) {

        existing.name =
            name;


        existing.avatar =
            avatar || "😎";


        if (
            existing.nameText
        ) {

            existing.nameText.setText(
                existing.name
            );

        }


        if (
            existing.avatarText
        ) {

            existing.avatarText.setText(
                existing.avatar
            );

        }


        addCoinsToExistingPlayer(
            existing,
            value
        );


        setStatus(
            "🎁 " +
            name +
            " recebeu +" +
            value +
            " moedas!"
        );


        return;

    }


    const player =
        addPlayerToArena(
            name,
            avatar || "😎",
            value,
            userId
        );


    pendingPlayers.delete(
        String(userId)
    );


    showBattleMessage(
        "🔥 " +
        player.name +
        " entrou na arena!"
    );


    setStatus(
        "🔥 " +
        player.name +
        " entrou! 🛡️ Proteção inicial."
    );


    updatePlayersList();
    updatePlayerPreview();
    updateRoundTimer();

}


// ============================================================
// HEART-ME
// ============================================================

function sendHeart() {

    if (
        !roundActive
    ) {

        setStatus(
            "⏰ A rodada terminou."
        );

        return;

    }


    const nameElement =
        document.getElementById(
            "username"
        );


    const userIdElement =
        document.getElementById(
            "userid"
        );


    const avatarElement =
        document.getElementById(
            "avatar"
        );


    const name =
        nameElement
            ? nameElement.value.trim()
            : "";


    const userId =
        userIdElement
            ? userIdElement.value.trim()
            : "";


    const avatar =
        avatarElement
            ? avatarElement.value.trim()
            : "❤️";


    if (!name) {

        setStatus(
            "⚠️ Digite o nome."
        );

        return;

    }


    if (!userId) {

        setStatus(
            "⚠️ Digite o ID."
        );

        return;

    }


    const existing =
        playerMap.get(
            String(userId)
        );


    if (existing) {

        setStatus(
            "❤️ " +
            name +
            " já está na arena."
        );

        return;

    }


    const player =
        addPlayerToArena(
            name,
            avatar || "❤️",
            10,
            userId
        );


    pendingPlayers.delete(
        String(userId)
    );


    showBattleMessage(
        "❤️ " +
        player.name +
        " entrou na arena!"
    );


    setStatus(
        "❤️ " +
        name +
        " entrou usando Heart-Me!"
    );


    updatePlayersList();
    updatePlayerPreview();
    updateRoundTimer();

}


// ============================================================
// FUNÇÃO COMPATÍVEL COM PENDENTES
// ============================================================

function enterPendingPlayer(
    pending
) {

    if (!pending) {

        return null;

    }


    const userId =
        String(
            pending.userId
        );


    const existing =
        playerMap.get(
            userId
        );


    if (existing) {

        pendingPlayers.delete(
            userId
        );

        return existing;

    }


    pendingPlayers.delete(
        userId
    );


    return addPlayerToArena(
        pending.name,
        pending.avatar,
        pending.coins,
        userId
    );

}


// ============================================================
// PREVIEW
// ============================================================

function updatePlayerPreview() {

    const userIdElement =
        document.getElementById(
            "userid"
        );


    const coinsElement =
        document.getElementById(
            "preview-coins"
        );


    const knivesElement =
        document.getElementById(
            "preview-knives"
        );


    const killsElement =
        document.getElementById(
            "preview-kills"
        );


    if (
        !coinsElement ||
        !knivesElement ||
        !killsElement
    ) {

        return;

    }


    const userId =
        userIdElement
            ? userIdElement.value.trim()
            : "";


    if (!userId) {

        coinsElement.innerText = "0";
        knivesElement.innerText = "0";
        killsElement.innerText = "0";

        return;

    }


    const player =
        playerMap.get(
            String(userId)
        );


    if (player) {

        coinsElement.innerText =
            player.coins;

        knivesElement.innerText =
            player.knifeCount;

        killsElement.innerText =
            player.kills;

        return;

    }


    const pending =
        pendingPlayers.get(
            String(userId)
        );


    if (pending) {

        coinsElement.innerText =
            pending.coins;

        knivesElement.innerText =
            calculateKnifeCount(
                pending.coins
            );

        killsElement.innerText =
            "0";

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

    const element =
        document.getElementById(
            "selected-status"
        );


    if (element) {

        element.innerText =
            message;

    }

}


// ============================================================
// LISTA
// ============================================================

function updatePlayersList() {

    const container =
        document.getElementById(
            "players-list"
        );


    if (!container) {

        return;

    }


    if (
        players.length === 0
    ) {

        container.innerHTML =
            '<div class="empty-list">Nenhum jogador ainda.</div>';

        return;

    }


    const sorted =
        [...players].sort(
            (
                a,
                b
            ) => {

                if (
                    a.alive &&
                    !b.alive
                ) {

                    return -1;

                }


                if (
                    !a.alive &&
                    b.alive
                ) {

                    return 1;

                }


                if (
                    b.kills !==
                    a.kills
                ) {

                    return (
                        b.kills -
                        a.kills
                    );

                }


                return (
                    b.coins -
                    a.coins
                );

            }
        );


    const visible =
        sorted.slice(
            0,
            MAX_LIST_ROWS
        );


    container.innerHTML = "";


    for (
        const player of visible
    ) {

        const row =
            document.createElement(
                "div"
            );


        row.className =
            "player-row";


        if (
            !player.alive
        ) {

            row.classList.add(
                "player-dead"
            );

        }


        const avatar =
            document.createElement(
                "div"
            );


        avatar.className =
            "player-avatar";


        avatar.innerText =
            player.avatar;


        const info =
            document.createElement(
                "div"
            );


        info.className =
            "player-info";


        const name =
            document.createElement(
                "div"
            );


        name.className =
            "player-name";


        name.innerText =
            player.alive
                ? player.name
                : "💀 " +
                  player.name;


        const data =
            document.createElement(
                "div"
            );


        data.className =
            "player-data";


        data.innerText =
            "🪙 " +
            player.coins +
            " | 🔪 " +
            player.knifeCount +
            " | 💀 " +
            player.kills +
            " | ❤️ " +
            Math.ceil(
                player.hp
            );


        info.appendChild(
            name
        );


        info.appendChild(
            data
        );


        row.appendChild(
            avatar
        );


        row.appendChild(
            info
        );


        row.addEventListener(
            "click",
            function() {

                const username =
                    document.getElementById(
                        "username"
                    );


                const userid =
                    document.getElementById(
                        "userid"
                    );


                const avatarInput =
                    document.getElementById(
                        "avatar"
                    );


                if (username) {

                    username.value =
                        player.name;

                }


                if (userid) {

                    userid.value =
                        player.userId;

                }


                if (avatarInput) {

                    avatarInput.value =
                        player.avatar;

                }


                updatePlayerPreview();

            }
        );


        container.appendChild(
            row
        );

    }


    if (
        players.length >
        MAX_LIST_ROWS
    ) {

        const footer =
            document.createElement(
                "div"
            );


        footer.className =
            "list-limit";


        footer.innerText =
            "Exibindo " +
            MAX_LIST_ROWS +
            " de " +
            players.length +
            " participantes.";


        container.appendChild(
            footer
        );

    }

}


// ============================================================
// MENSAGEM
// ============================================================

function showBattleMessage(
    message
) {

    if (!battleText) {

        return;

    }


    battleText.setText(
        message
    );


    battleMessageTimer =
        1800;

}


// ============================================================
// TESTE DO SIMULADOR
// ============================================================
//
// Console:
//
// testAdd("Joao", "123", "😎", 10)
//
// ============================================================

window.testAdd =
    function(
        name,
        userId,
        avatar = "😎",
        coins = 10
    ) {

        const username =
            document.getElementById(
                "username"
            );


        const userid =
            document.getElementById(
                "userid"
            );


        const avatarInput =
            document.getElementById(
                "avatar"
            );


        if (username) {

            username.value =
                name;

        }


        if (userid) {

            userid.value =
                String(userId);

        }


        if (avatarInput) {

            avatarInput.value =
                avatar;

        }


        sendCoins(
            coins
        );

    };


// ============================================================
// FUNÇÃO DE TESTE DIRETO
// ============================================================

window.addPendingPlayer =
    function(
        name,
        userId,
        avatar = "😎",
        coins = 10
    ) {

        if (!roundActive) {

            return null;

        }


        const player =
            addPlayerToArena(
                name,
                avatar,
                coins,
                userId
            );


        pendingPlayers.delete(
            String(userId)
        );


        updatePlayersList();
        updatePlayerPreview();
        updateRoundTimer();


        return player;

    };


// ============================================================
// API GLOBAL
// ============================================================

window.sendCoins =
    sendCoins;

window.sendHeart =
    sendHeart;

window.startNewRound =
    startNewRound;

window.beginRound =
    beginRound;

window.updatePlayerPreview =
    updatePlayerPreview;


// ============================================================
// DEBUG
// ============================================================

window.KnifeBattle = {

    get players() {

        return players;

    },


    get playerMap() {

        return playerMap;

    },


    get pendingPlayers() {

        return pendingPlayers;

    },


    addPlayer:
        addPlayerToArena,


    attack:
        tryAttack,


    startRound:
        beginRound,


    newRound:
        startNewRound

};
