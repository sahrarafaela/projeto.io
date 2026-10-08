// ======================================================
// KNIFE BATTLE LIVE
// ======================================================
//
// REGRAS
//
// 10 moedas = 1 faca
// Rodada = 5 minutos
// Entrada = 10 moedas OU Heart-Me
// Identidade = userId
//
// Novo jogador:
// - spawn seguro
// - 7 segundos de proteção
//
// Combate:
// - HP alto
// - dano controlado
// - IA escolhe alvo
// - jogador fraco foge
// - jogador forte persegue
//
// ======================================================


// ======================================================
// CONFIGURAÇÕES
// ======================================================

const WIDTH = 1000;
const HEIGHT = 650;


// Rodada de 5 minutos

const ROUND_DURATION_MS =
    5 * 60 * 1000;


// Grade espacial

const GRID_SIZE = 180;


// Distância considerada segura no spawn

const SPAWN_SAFE_DISTANCE = 160;


// Quantas tentativas serão feitas
// para encontrar um bom spawn

const SPAWN_ATTEMPTS = 60;


// Proteção do novo jogador

const SPAWN_PROTECTION_MS =
    7000;


// ======================================================
// CORREÇÃO IMPORTANTE
// ======================================================
//
// Esta constante estava faltando.
//
// Não representa limite de jogadores.
// É somente o número máximo de jogadores
// mostrados na lista lateral.
//

const MAX_LIST_ROWS = 100;


// ======================================================
// FACAS VISUAIS
// ======================================================
//
// O jogador pode ter:
//
// 100 facas
// 500 facas
// 1000 facas
//
// Não precisamos criar 1000 objetos visuais.
//

const MAX_VISUAL_KNIVES = 24;


// ======================================================
// ESTADO
// ======================================================

let players = [];


// userId -> player

const playerMap =
    new Map();


// userId -> jogador aguardando

const pendingPlayers =
    new Map();


// grade espacial

let spatialGrid =
    new Map();


// cena

let scene = null;


// ======================================================
// ELEMENTOS VISUAIS
// ======================================================

let weaponGraphics = null;

let playerCountText = null;

let roundTimerText = null;

let roundText = null;

let battleText = null;


// ======================================================
// RODADA
// ======================================================

let roundNumber = 1;

let roundElapsedMs = 0;

let roundActive = false;

let roundEnded = false;

let battleMessageTimer = 0;

let lastDisplayedSecond = -1;


// ======================================================
// CORES
// ======================================================

let nextColorIndex = 0;


// ======================================================
// CONVERTER HSL PARA COR
// ======================================================

function hslToColorInt(
    h,
    s,
    l
) {

    s /= 100;
    l /= 100;


    const k =
        n =>
            (
                n +
                h / 30
            ) % 12;


    const a =
        s *
        Math.min(
            l,
            1 - l
        );


    const f =
        n =>
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


    const r =
        Math.round(
            255 * f(0)
        );


    const g =
        Math.round(
            255 * f(8)
        );


    const b =
        Math.round(
            255 * f(4)
        );


    return (
        (r << 16) |
        (g << 8) |
        b
    );

}


// ======================================================
// PRÓXIMA COR
// ======================================================

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


// ======================================================
// COR PARA HEX
// ======================================================

function colorToHex(
    color
) {

    return (
        "#" +
        color
            .toString(16)
            .padStart(
                6,
                "0"
            )
    );

}


// ======================================================
// CONFIGURAÇÃO PHASER
// ======================================================

const config = {

    type: Phaser.AUTO,

    width: WIDTH,

    height: HEIGHT,

    parent: "game-container",

    backgroundColor: "#111827",

    scene: {

        create: create,

        update: update

    }

};


const game =
    new Phaser.Game(config);


// ======================================================
// CREATE
// ======================================================

function create() {

    scene = this;


    // ==================================================
    // GRADE DO MAPA
    // ==================================================

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


    // ==================================================
    // CAMADA GLOBAL DAS FACAS
    // ==================================================

    weaponGraphics =
        scene.add.graphics();


    weaponGraphics.setDepth(
        3
    );


    // ==================================================
    // HUD
    // ==================================================

    playerCountText =
        scene.add.text(
            20,
            15,
            "",
            {
                fontSize: "19px",

                color: "#ffffff",

                fontStyle:
                    "bold"
            }
        );


    roundText =
        scene.add.text(
            20,
            42,
            "",
            {
                fontSize: "14px",

                color:
                    "#9ca3af"
            }
        );


    roundTimerText =
        scene.add.text(
            WIDTH - 20,
            18,
            "",
            {
                fontSize: "22px",

                color:
                    "#ffffff",

                fontStyle:
                    "bold"
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

                color:
                    "#ffffff",

                fontStyle:
                    "bold"
            }
        );


    battleText.setOrigin(
        0.5
    );


    // ==================================================
    // TELA FINAL
    // ==================================================

    createWinnerOverlay();


    // ==================================================
    // COMEÇAR
    // ==================================================

    beginRound();

}


// ======================================================
// WINNER OVERLAY
// ======================================================

function createWinnerOverlay() {

    scene.winnerContainer =
        scene.add.container(
            WIDTH / 2,
            HEIGHT / 2
        );


    scene.winnerContainer.setDepth(
        100
    );


    // ==================================================
    // FUNDO
    // ==================================================

    const background =
        scene.add.rectangle(
            0,
            0,
            WIDTH,
            HEIGHT,
            0x000000,
            0.86
        );


    // ==================================================
    // WIN
    // ==================================================

    const winText =
        scene.add.text(
            0,
            -205,
            "WIN",
            {
                fontSize:
                    "115px",

                color:
                    "#ffffff",

                fontStyle:
                    "bold"
            }
        );


    winText.setOrigin(
        0.5
    );


    // ==================================================
    // AVATAR
    // ==================================================

    const winnerAvatar =
        scene.add.text(
            0,
            -80,
            "😎",
            {
                fontSize:
                    "68px"
            }
        );


    winnerAvatar.setOrigin(
        0.5
    );


    // ==================================================
    // NOME
    // ==================================================

    const winnerName =
        scene.add.text(
            0,
            5,
            "",
            {
                fontSize:
                    "46px",

                color:
                    "#ffffff",

                fontStyle:
                    "bold"
            }
        );


    winnerName.setOrigin(
        0.5
    );


    // ==================================================
    // KILLS
    // ==================================================

    const killsText =
        scene.add.text(
            0,
            68,
            "",
            {
                fontSize:
                    "28px",

                color:
                    "#ffffff",

                fontStyle:
                    "bold"
            }
        );


    killsText.setOrigin(
        0.5
    );


    // ==================================================
    // FINAL
    // ==================================================

    const finalText =
        scene.add.text(
            0,
            125,
            "RODADA FINALIZADA",
            {
                fontSize:
                    "18px",

                color:
                    "#9ca3af",

                fontStyle:
                    "bold"
            }
        );


    finalText.setOrigin(
        0.5
    );


    // ==================================================
    // INSTRUÇÃO
    // ==================================================

    const instructionText =
        scene.add.text(
            0,
            165,
            'Clique em "Nova rodada"',
            {
                fontSize:
                    "14px",

                color:
                    "#6b7280"
            }
        );


    instructionText.setOrigin(
        0.5
    );


    scene.winnerContainer.add(
        [
            background,
            winText,
            winnerAvatar,
            winnerName,
            killsText,
            finalText,
            instructionText
        ]
    );


    scene.winnerContainer.setVisible(
        false
    );


    scene.winnerData = {

        winText:
            winText,

        winnerAvatar:
            winnerAvatar,

        winnerName:
            winnerName,

        killsText:
            killsText

    };

}


// ======================================================
// INICIAR RODADA
// ======================================================

function beginRound() {

    clearCurrentRound();


    roundElapsedMs =
        0;


    roundActive =
        true;


    roundEnded =
        false;


    battleMessageTimer =
        0;


    lastDisplayedSecond =
        -1;


    battleText.setText(
        ""
    );


    const newRoundButton =
        document.getElementById(
            "new-round-button"
        );


    newRoundButton.disabled =
        true;


    createInitialBots();


    updateRoundTimer();

    updatePlayersList();

    updatePlayerPreview();

}


// ======================================================
// NOVA RODADA
// ======================================================

function startNewRound() {

    if (
        roundActive
    ) {

        return;

    }


    roundNumber++;


    beginRound();


    setStatus(
        "🔥 Nova rodada iniciada!"
    );

}


// ======================================================
// LIMPAR RODADA
// ======================================================

function clearCurrentRound() {

    for (
        const player
        of players
    ) {

        if (
            player.aura
        ) {

            player.aura.destroy();

        }


        if (
            player.avatarText
        ) {

            player.avatarText.destroy();

        }


        if (
            player.nameText
        ) {

            player.nameText.destroy();

        }


        if (
            player.coinText
        ) {

            player.coinText.destroy();

        }


        if (
            player.knifeText
        ) {

            player.knifeText.destroy();

        }


        if (
            player.killText
        ) {

            player.killText.destroy();

        }


        if (
            player.hpBackground
        ) {

            player.hpBackground.destroy();

        }


        if (
            player.hpBar
        ) {

            player.hpBar.destroy();

        }

    }


    players = [];


    playerMap.clear();


    pendingPlayers.clear();


    spatialGrid.clear();


    nextColorIndex =
        0;


    if (
        weaponGraphics
    ) {

        weaponGraphics.clear();

    }


    if (
        scene.winnerContainer
    ) {

        scene.winnerContainer
            .setVisible(
                false
            );

    }


    // Cancelar apenas animações
    // do vencedor.

    if (
        scene.winnerData
    ) {

        scene.tweens.killTweensOf(
            scene.winnerData.winText
        );

    }

}


// ======================================================
// BOTS
// ======================================================

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


// ======================================================
// FACAS
// ======================================================

function calculateKnifeCount(
    coins
) {

    return Math.floor(
        Number(coins) / 10
    );

}


// ======================================================
// FORÇA
// ======================================================

function calculatePower(
    knifeCount
) {

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


// ======================================================
// RAIO DAS FACAS
// ======================================================

function getOrbitRadius(
    player
) {

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


// ======================================================
// GRID
// ======================================================

function getGridKey(
    x,
    y
) {

    return (
        Math.floor(
            x /
            GRID_SIZE
        ) +
        ":" +
        Math.floor(
            y /
            GRID_SIZE
        )
    );

}


// ======================================================
// RECONSTRUIR GRID
// ======================================================

function rebuildSpatialGrid() {

    spatialGrid.clear();


    for (
        const player
        of players
    ) {

        if (
            !player.alive
        ) {

            continue;

        }


        const key =
            getGridKey(
                player.x,
                player.y
            );


        if (
            !spatialGrid.has(
                key
            )
        ) {

            spatialGrid.set(
                key,
                []
            );

        }


        spatialGrid
            .get(key)
            .push(
                player
            );

    }

}


// ======================================================
// JOGADORES PERTO
// ======================================================

function getPlayersNearPosition(
    x,
    y,
    radius
) {

    const cellX =
        Math.floor(
            x /
            GRID_SIZE
        );


    const cellY =
        Math.floor(
            y /
            GRID_SIZE
        );


    const cellRadius =
        Math.ceil(
            radius /
            GRID_SIZE
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
                    cellX +
                    dx
                ) +
                ":" +
                (
                    cellY +
                    dy
                );


            const cell =
                spatialGrid.get(
                    key
                );


            if (!cell) {

                continue;

            }


            for (
                const player
                of cell
            ) {

                result.push(
                    player
                );

            }

        }

    }


    return result;

}


// ======================================================
// SPAWN SEGURO
// ======================================================

function findSafeSpawnPosition() {

    rebuildSpatialGrid();


    let bestPosition =
        null;


    let bestDistance =
        -1;


    for (
        let attempt = 0;
        attempt <
        SPAWN_ATTEMPTS;
        attempt++
    ) {

        const x =
            Phaser.Math.Between(
                80,
                WIDTH - 80
            );


        const y =
            Phaser.Math.Between(
                100,
                HEIGHT - 80
            );


        const nearby =
            getPlayersNearPosition(
                x,
                y,
                SPAWN_SAFE_DISTANCE
            );


        // Nenhum jogador nessa área

        if (
            nearby.length === 0
        ) {

            return {
                x,
                y
            };

        }


        let nearest =
            Infinity;


        for (
            const player
            of nearby
        ) {

            const distance =
                distanceBetween(
                    x,
                    y,
                    player.x,
                    player.y
                );


            if (
                distance <
                nearest
            ) {

                nearest =
                    distance;

            }

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


    if (
        bestPosition
    ) {

        return bestPosition;

    }


    return {

        x:
            WIDTH / 2,

        y:
            HEIGHT / 2

    };

}


// ======================================================
// CRIAR JOGADOR
// ======================================================

function addPlayerToArena(
    name,
    avatar,
    coins,
    userId
) {

    const normalizedId =
        String(
            userId
        );


    // ================================================
    // EVITAR DUPLICAÇÃO
    // ================================================

    const existing =
        playerMap.get(
            normalizedId
        );


    if (
        existing
    ) {

        return existing;

    }


    // ================================================
    // SPAWN
    // ================================================

    const spawn =
        findSafeSpawnPosition();


    // ================================================
    // COR
    // ================================================

    const color =
        getNextColor();


    const safeCoins =
        Math.max(
            0,
            Number(coins) || 0
        );


    // ================================================
    // PLAYER
    // ================================================

    const player = {

        userId:
            normalizedId,

        name:
            name,

        avatar:
            avatar,


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


        knifeCount:
            calculateKnifeCount(
                safeCoins
            ),


        power:
            0,


        color:
            color,


        // ==========================================
        // VIDA
        // ==========================================

        maxHp:
            600,

        hp:
            600,


        // ==========================================
        // ESTADO
        // ==========================================

        alive:
            true,

        waiting:
            false,


        // ==========================================
        // KILLS
        // ==========================================

        kills:
            0,


        // ==========================================
        // IA
        // ==========================================

        targetId:
            null,

        aiMode:
            "wander",

        aiTimer:
            0,


        // ==========================================
        // MOVIMENTO
        // ==========================================

        moveTimer:
            0,


        // ==========================================
        // ROTAÇÃO
        // ==========================================

        rotationAngle:
            Math.random() *
            Math.PI * 2,

        rotationSpeed:
            0.02,


        // ==========================================
        // ATAQUE
        // ==========================================

        attackTimer:
            Phaser.Math.Between(
                900,
                1600
            ),


        // ==========================================
        // PROTEÇÃO
        // ==========================================

        spawnProtectionMs:
            SPAWN_PROTECTION_MS,


        // ==========================================
        // HIT RECENTE
        // ==========================================

        recentHitMs:
            0,


        // ==========================================
        // VISUAIS
        // ==========================================

        aura:
            null,

        avatarText:
            null,

        nameText:
            null,

        coinText:
            null,

        knifeText:
            null,

        killText:
            null,

        hpBackground:
            null,

        hpBar:
            null

    };


    player.power =
        calculatePower(
            player.knifeCount
        );


    // ================================================
    // AURA
    // ================================================

    player.aura =
        scene.add.circle(
            player.x,
            player.y,
            31,
            player.color,
            0.13
        );


    player.aura.setStrokeStyle(
        2,
        player.color,
        0.9
    );


    player.aura.setDepth(
        1
    );


    // ================================================
    // AVATAR
    // ================================================

    player.avatarText =
        scene.add.text(
            player.x,
            player.y,
            player.avatar,
            {
                fontSize:
                    "45px"
            }
        );


    player.avatarText
        .setOrigin(
            0.5
        );


    player.avatarText.setDepth(
        5
    );


    // ================================================
    // NOME
    // ================================================

    player.nameText =
        scene.add.text(
            player.x,
            player.y - 45,
            player.name,
            {
                fontSize:
                    "14px",

                color:
                    colorToHex(
                        player.color
                    ),

                fontStyle:
                    "bold"
            }
        );


    player.nameText
        .setOrigin(
            0.5
        );


    player.nameText.setDepth(
        6
    );


    // ================================================
    // MOEDAS
    // ================================================

    player.coinText =
        scene.add.text(
            player.x,
            player.y + 44,
            "🪙 " +
            player.coins,
            {
                fontSize:
                    "11px",

                color:
                    "#facc15",

                fontStyle:
                    "bold"
            }
        );


    player.coinText
        .setOrigin(
            0.5
        );


    player.coinText.setDepth(
        6
    );


    // ================================================
    // FACAS
    // ================================================

    player.knifeText =
        scene.add.text(
            player.x,
            player.y + 58,
            "🔪 " +
            player.knifeCount,
            {
                fontSize:
                    "11px",

                color:
                    "#ffffff",

                fontStyle:
                    "bold"
            }
        );


    player.knifeText
        .setOrigin(
            0.5
        );


    player.knifeText.setDepth(
        6
    );


    // ================================================
    // KILLS
    // ================================================

    player.killText =
        scene.add.text(
            player.x,
            player.y + 72,
            "💀 0",
            {
                fontSize:
                    "10px",

                color:
                    "#ff8787",

                fontStyle:
                    "bold"
            }
        );


    player.killText
        .setOrigin(
            0.5
        );


    player.killText.setDepth(
        6
    );


    // ================================================
    // HP BACKGROUND
    // ================================================

    player.hpBackground =
        scene.add.rectangle(
            player.x,
            player.y + 34,
            60,
            6,
            0x333333
        );


    player.hpBackground
        .setOrigin(
            0.5
        );


    player.hpBackground.setDepth(
        4
    );


    // ================================================
    // HP
    // ================================================

    player.hpBar =
        scene.add.rectangle(
            player.x - 30,
            player.y + 34,
            60,
            6,
            player.color
        );


    player.hpBar.setOrigin(
        0,
        0.5
    );


    player.hpBar.setDepth(
        5
    );


    // ================================================
    // SALVAR
    // ================================================

    players.push(
        player
    );


    playerMap.set(
        normalizedId,
        player
    );


    return player;

}


// ======================================================
// SOMAR MOEDAS AO PLAYER
// ======================================================

function addCoinsToExistingPlayer(
    player,
    amount
) {

    if (
        !player
    ) {

        return;

    }


    if (
        !player.alive
    ) {

        setStatus(
            "💀 " +
            player.name +
            " já foi eliminado."
        );

        return;

    }


    const oldCoins =
        player.coins;


    const oldKnives =
        player.knifeCount;


    // ================================================
    // SOMAR
    // ================================================

    player.coins +=
        Number(amount);


    // ================================================
    // RECALCULAR
    // ================================================

    player.knifeCount =
        calculateKnifeCount(
            player.coins
        );


    player.power =
        calculatePower(
            player.knifeCount
        );


    // ================================================
    // ATUALIZAR VISUAL
    // ================================================

    player.coinText.setText(
        "🪙 " +
        player.coins
    );


    player.knifeText.setText(
        "🔪 " +
        player.knifeCount
    );


    // ================================================
    // QUANTAS FACAS GANHOU
    // ================================================

    const gained =
        player.knifeCount -
        oldKnives;


    if (
        gained > 0
    ) {

        showBattleMessage(
            "🔪 " +
            player.name +
            " ganhou +" +
            gained +
            " faca" +
            (
                gained === 1
                    ? ""
                    : "s"
            ) +
            "!"
        );

    }


    setStatus(
        "🪙 " +
        player.name +
        " agora possui " +
        player.coins +
        " moedas e " +
        player.knifeCount +
        " facas."
    );


    updatePlayersList();

    updatePlayerPreview();

}


// ======================================================
// ESCOLHER ALVO
// ======================================================

function chooseTarget(
    player
) {

    const nearby =
        getPlayersNearPosition(
            player.x,
            player.y,
            500
        );


    const candidates =
        [];


    for (
        const other
        of nearby
    ) {

        if (
            other === player
        ) {

            continue;

        }


        if (
            !other.alive
        ) {

            continue;

        }


        // Não perseguir recém-chegados

        if (
            other.spawnProtectionMs >
            0
        ) {

            continue;

        }


        const distance =
            distanceBetween(
                player.x,
                player.y,
                other.x,
                other.y
            );


        candidates.push({

            player:
                other,

            distance:
                distance

        });

    }


    if (
        candidates.length === 0
    ) {

        return null;

    }


    // ================================================
    // SE TEM FORÇA:
    // PROCURAR MAIS FRACOS
    // ================================================

    if (
        player.knifeCount > 0
    ) {

        const weaker =
            candidates
                .filter(
                    item =>
                        player.knifeCount >
                        item.player.knifeCount *
                        1.15
                )
                .sort(
                    (
                        a,
                        b
                    ) => {

                        if (
                            a.player.knifeCount !==
                            b.player.knifeCount
                        ) {

                            return (
                                a.player.knifeCount -
                                b.player.knifeCount
                            );

                        }


                        return (
                            a.distance -
                            b.distance
                        );

                    }
                );


        if (
            weaker.length > 0
        ) {

            return (
                weaker[0].player
            );

        }

    }


    // ================================================
    // CASO CONTRÁRIO:
    // MAIS PRÓXIMO
    // ================================================

    candidates.sort(
        (
            a,
            b
        ) =>
            a.distance -
            b.distance
    );


    return candidates[0].player;

}


// ======================================================
// IA
// ======================================================

function updateAI(
    player,
    delta
) {

    if (
        !player.alive
    ) {

        return;

    }


    player.aiTimer -=
        delta;


    if (
        player.aiTimer > 0
    ) {

        return;

    }


    player.aiTimer =
        Phaser.Math.Between(
            300,
            550
        );


    const target =
        chooseTarget(
            player
        );


    if (
        !target
    ) {

        player.targetId =
            null;

        player.aiMode =
            "wander";

        return;

    }


    player.targetId =
        target.userId;


    const own =
        player.knifeCount;


    const enemy =
        target.knifeCount;


    // ================================================
    // SEM FACAS
    // ================================================

    if (
        own <= 0
    ) {

        player.aiMode =
            "flee";

    }


    // ================================================
    // MUITO MAIS FRACO
    // ================================================

    else if (
        own <
        enemy * 0.72
    ) {

        player.aiMode =
            "flee";

    }


    // ================================================
    // MAIS FORTE
    // ================================================

    else if (
        own >
        enemy * 1.20
    ) {

        player.aiMode =
            "chase";

    }


    // ================================================
    // FORÇA PARECIDA
    // ================================================

    else {

        player.aiMode =
            "duel";

    }

}


// ======================================================
// MOVIMENTO
// ======================================================

function movePlayer(
    player,
    delta
) {

    if (
        !player.alive
    ) {

        return;

    }


    const target =
        player.targetId
            ? playerMap.get(
                player.targetId
            )
            : null;


    // ================================================
    // SEM ALVO
    // ================================================

    if (
        !target ||
        !target.alive ||
        target.spawnProtectionMs > 0
    ) {

        player.targetId =
            null;


        player.aiMode =
            "wander";


        player.moveTimer -=
            delta;


        if (
            player.moveTimer <= 0
        ) {

            player.targetX =
                Phaser.Math.Between(
                    70,
                    WIDTH - 70
                );


            player.targetY =
                Phaser.Math.Between(
                    90,
                    HEIGHT - 70
                );


            player.moveTimer =
                Phaser.Math.Between(
                    900,
                    2200
                );

        }

    }


    // ================================================
    // COM ALVO
    // ================================================

    else {

        const dx =
            target.x -
            player.x;


        const dy =
            target.y -
            player.y;


        const distance =
            Math.sqrt(
                dx * dx +
                dy * dy
            );


        // ============================================
        // FUGIR
        // ============================================

        if (
            player.aiMode ===
            "flee"
        ) {

            if (
                distance > 0
            ) {

                player.targetX =
                    player.x -
                    (
                        dx /
                        distance
                    ) *
                    260;


                player.targetY =
                    player.y -
                    (
                        dy /
                        distance
                    ) *
                    260;

            }

        }


        // ============================================
        // PERSEGUIR
        // ============================================

        else if (
            player.aiMode ===
            "chase"
        ) {

            player.targetX =
                target.x;


            player.targetY =
                target.y;

        }


        // ============================================
        // DUELO
        // ============================================

        else {

            const desiredDistance =
                getOrbitRadius(
                    player
                ) +
                18;


            if (
                distance >
                desiredDistance
            ) {

                player.targetX =
                    target.x;


                player.targetY =
                    target.y;

            }
            else {

                const angle =
                    Math.atan2(
                        dy,
                        dx
                    );


                const sideAngle =
                    angle +
                    Math.PI / 2;


                player.targetX =
                    target.x +
                    Math.cos(
                        sideAngle
                    ) *
                    65;


                player.targetY =
                    target.y +
                    Math.sin(
                        sideAngle
                    ) *
                    65;

            }

        }

    }


    // ================================================
    // MOVIMENTO
    // ================================================

    const dx =
        player.targetX -
        player.x;


    const dy =
        player.targetY -
        player.y;


    const distance =
        Math.sqrt(
            dx * dx +
            dy * dy
        );


    if (
        distance < 1
    ) {

        return;

    }


    const speed =
        player.knifeCount <= 0

            ? 0.60

            : Math.min(
                1.25,
                0.68 +
                Math.sqrt(
                    player.knifeCount
                ) *
                0.015
            );


    player.x +=
        (
            dx /
            distance
        ) *
        speed;


    player.y +=
        (
            dy /
            distance
        ) *
        speed;


    // ================================================
    // LIMITES
    // ================================================

    player.x =
        Phaser.Math.Clamp(
            player.x,
            45,
            WIDTH - 45
        );


    player.y =
        Phaser.Math.Clamp(
            player.y,
            70,
            HEIGHT - 45
        );

}


// ======================================================
// ATAQUE
// ======================================================

function tryAttack(
    player
) {

    if (
        !player.alive
    ) {

        return;

    }


    if (
        player.knifeCount <= 0
    ) {

        return;

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

        return;

    }


    // Novo jogador protegido

    if (
        target.spawnProtectionMs > 0
    ) {

        return;

    }


    const distance =
        distanceBetween(
            player.x,
            player.y,
            target.x,
            target.y
        );


    const orbitRadius =
        getOrbitRadius(
            player
        );


    // ================================================
    // ALVO PRÓXIMO DO CÍRCULO DAS FACAS
    // ================================================

    if (
        Math.abs(
            distance -
            orbitRadius
        ) > 30
    ) {

        return;

    }


    // ================================================
    // DIREÇÃO DO ALVO
    // ================================================

    const targetAngle =
        Math.atan2(
            target.y -
            player.y,

            target.x -
            player.x
        );


    // ================================================
    // FACAS
    // ================================================

    const knifeSpacing =
        (
            Math.PI * 2
        ) /
        player.knifeCount;


    const relativeAngle =
        (
            targetAngle -
            player.rotationAngle +
            Math.PI * 2
        ) %
        (
            Math.PI * 2
        );


    const closestIndex =
        Math.round(
            relativeAngle /
            knifeSpacing
        );


    const closestKnifeAngle =
        player.rotationAngle +
        closestIndex *
        knifeSpacing;


    const angularDifference =
        Math.abs(
            normalizeAngle(
                targetAngle -
                closestKnifeAngle
            )
        );


    const tangentialDistance =
        orbitRadius *
        angularDifference;


    if (
        tangentialDistance > 24
    ) {

        return;

    }


    // ==================================================
    // DANO
    // ==================================================
    //
    // Cresce lentamente com as facas.
    //
    // Isso evita mortes instantâneas.
    //
    // ==================================================

    const scaledPower =
        Math.log2(
            player.knifeCount +
            1
        );


    let damage =
        3 +
        Math.floor(
            scaledPower *
            1.35
        ) +
        Phaser.Math.Between(
            0,
            2
        );


    // ================================================
    // MUITO MAIS FRACO
    // ================================================

    const ratio =
        player.power /
        Math.max(
            target.power,
            1
        );


    if (
        ratio < 0.55
    ) {

        damage =
            Math.max(
                2,
                Math.floor(
                    damage *
                    0.70
                )
            );

    }


    // ================================================
    // REDUÇÃO SE TOMOU HIT RECENTE
    // ================================================

    if (
        target.recentHitMs > 0
    ) {

        damage =
            Math.max(
                1,
                Math.floor(
                    damage *
                    0.80
                )
            );

    }


    // ================================================
    // APLICAR
    // ================================================

    target.hp -=
        damage;


    target.hp =
        Math.max(
            0,
            target.hp
        );


    target.recentHitMs =
        220;


    // ================================================
    // EFEITO
    // ================================================

    target.avatarText.setScale(
        1.10
    );


    scene.tweens.add({

        targets:
            target.avatarText,

        scale: 1,

        duration: 110

    });


    showBattleMessage(
        "🔪 " +
        player.name +
        " acertou " +
        target.name +
        " (-" +
        damage +
        ")"
    );


    // ================================================
    // MORTE
    // ================================================

    if (
        target.hp <= 0
    ) {

        eliminatePlayer(
            target,
            player
        );

    }

}


// ======================================================
// ELIMINAR
// ======================================================

function eliminatePlayer(
    target,
    attacker
) {

    if (
        !target.alive
    ) {

        return;

    }


    target.alive =
        false;


    target.targetId =
        null;


    // ================================================
    // KILL
    // ================================================

    attacker.kills++;


    // ================================================
    // MENSAGEM
    // ================================================

    showBattleMessage(
        "💀 " +
        target.name +
        " foi eliminado por " +
        attacker.name +
        "!"
    );


    // ================================================
    // VISUAL
    // ================================================

    target.avatarText.setAlpha(
        0.25
    );


    target.nameText.setAlpha(
        0.25
    );


    target.coinText.setAlpha(
        0.25
    );


    target.knifeText.setAlpha(
        0.25
    );


    target.killText.setAlpha(
        0.25
    );


    target.hpBackground.setAlpha(
        0.25
    );


    target.hpBar.setAlpha(
        0.25
    );


    target.aura.setAlpha(
        0.15
    );


    updatePlayersList();

}


// ======================================================
// DESENHAR FACAS
// ======================================================

function drawAllWeapons() {

    if (
        !weaponGraphics
    ) {

        return;

    }


    weaponGraphics.clear();


    const alive =
        players.filter(
            player =>
                player.alive
        );


    const aliveCount =
        alive.length;


    for (
        const player
        of alive
    ) {

        let visualLimit =
            MAX_VISUAL_KNIVES;


        // ==========================================
        // REDUÇÃO PARA GRANDES ARENAS
        // ==========================================

        if (
            aliveCount > 1000
        ) {

            visualLimit = 2;

        }
        else if (
            aliveCount > 500
        ) {

            visualLimit = 3;

        }
        else if (
            aliveCount > 250
        ) {

            visualLimit = 4;

        }
        else if (
            aliveCount > 100
        ) {

            visualLimit = 6;

        }
        else if (
            aliveCount > 50
        ) {

            visualLimit = 12;

        }


        const visualCount =
            Math.min(
                player.knifeCount,
                visualLimit
            );


        if (
            visualCount <= 0
        ) {

            continue;

        }


        const radius =
            getOrbitRadius(
                player
            );


        const spacing =
            (
                Math.PI * 2
            ) /
            visualCount;


        for (
            let i = 0;
            i < visualCount;
            i++
        ) {

            const angle =
                player.rotationAngle +
                spacing *
                i;


            const bladeLength =
                14 +
                Math.min(
                    10,
                    Math.sqrt(
                        player.knifeCount
                    )
                );


            const innerRadius =
                radius - 7;


            const outerRadius =
                radius +
                bladeLength;


            const x1 =
                player.x +
                Math.cos(
                    angle
                ) *
                innerRadius;


            const y1 =
                player.y +
                Math.sin(
                    angle
                ) *
                innerRadius;


            const x2 =
                player.x +
                Math.cos(
                    angle
                ) *
                outerRadius;


            const y2 =
                player.y +
                Math.sin(
                    angle
                ) *
                outerRadius;


            // ========================================
            // CABO
            // ========================================

            weaponGraphics.lineStyle(
                4,
                0x303030,
                1
            );


            weaponGraphics.beginPath();


            weaponGraphics.moveTo(
                x1,
                y1
            );


            weaponGraphics.lineTo(
                player.x +
                Math.cos(
                    angle
                ) *
                (
                    radius + 2
                ),

                player.y +
                Math.sin(
                    angle
                ) *
                (
                    radius + 2
                )
            );


            weaponGraphics.strokePath();


            // ========================================
            // LÂMINA
            // ========================================

            weaponGraphics.lineStyle(
                5,
                player.color,
                1
            );


            weaponGraphics.beginPath();


            weaponGraphics.moveTo(
                player.x +
                Math.cos(
                    angle
                ) *
                (
                    radius + 1
                ),

                player.y +
                Math.sin(
                    angle
                ) *
                (
                    radius + 1
                )
            );


            weaponGraphics.lineTo(
                x2,
                y2
            );


            weaponGraphics.strokePath();


            // ========================================
            // PONTA
            // ========================================

            weaponGraphics.fillStyle(
                0xffffff,
                0.95
            );


            weaponGraphics.fillCircle(
                x2,
                y2,
                2
            );

        }

    }

}


// ======================================================
// VISUAL DO JOGADOR
// ======================================================

function updatePlayerVisuals(
    player,
    delta
) {

    player.aura.setPosition(
        player.x,
        player.y
    );


    player.avatarText.setPosition(
        player.x,
        player.y
    );


    player.nameText.setPosition(
        player.x,
        player.y - 45
    );


    player.coinText.setPosition(
        player.x,
        player.y + 44
    );


    player.coinText.setText(
        "🪙 " +
        player.coins
    );


    player.knifeText.setPosition(
        player.x,
        player.y + 58
    );


    player.knifeText.setText(
        "🔪 " +
        player.knifeCount
    );


    player.killText.setPosition(
        player.x,
        player.y + 72
    );


    player.killText.setText(
        "💀 " +
        player.kills
    );


    player.hpBackground.setPosition(
        player.x,
        player.y + 34
    );


    player.hpBar.setPosition(
        player.x - 30,
        player.y + 34
    );


    player.hpBar.width =
        60 *
        (
            player.hp /
            player.maxHp
        );


    // ================================================
    // HIT RECENTE
    // ================================================

    if (
        player.recentHitMs > 0
    ) {

        player.recentHitMs =
            Math.max(
                0,
                player.recentHitMs -
                delta
            );

    }


    // ================================================
    // PROTEÇÃO
    // ================================================

    if (
        player.spawnProtectionMs > 0
    ) {

        player.spawnProtectionMs =
            Math.max(
                0,
                player.spawnProtectionMs -
                delta
            );


        player.aura.setAlpha(
            Math.sin(
                performance.now() *
                0.012
            ) > 0
                ? 0.35
                : 0.10
        );

    }
    else {

        player.aura.setAlpha(
            1
        );

    }

}


// ======================================================
// TIMER
// ======================================================

function updateRoundTimer() {

    const remaining =
        Math.max(
            0,
            ROUND_DURATION_MS -
            roundElapsedMs
        );


    const totalSeconds =
        Math.ceil(
            remaining /
            1000
        );


    const minutes =
        Math.floor(
            totalSeconds /
            60
        );


    const seconds =
        totalSeconds %
        60;


    const formatted =
        String(minutes)
            .padStart(
                2,
                "0"
            ) +
        ":" +
        String(seconds)
            .padStart(
                2,
                "0"
            );


    roundTimerText.setText(
        "⏱️ " +
        formatted
    );


    roundText.setText(
        "🏁 Rodada " +
        roundNumber
    );


    document
        .getElementById(
            "panel-round"
        )
        .innerText =
        roundNumber;


    document
        .getElementById(
            "panel-participants"
        )
        .innerText =
        players.length;


    document
        .getElementById(
            "panel-waiting"
        )
        .innerText =
        pendingPlayers.size;

}


// ======================================================
// ENCONTRAR VENCEDOR
// ======================================================

function findWinner() {

    const alive =
        players.filter(
            player =>
                player.alive
        );


    if (
        alive.length === 1
    ) {

        return alive[0];

    }


    const contenders =
        alive.length > 0
            ? alive
            : [...players];


    contenders.sort(
        (
            a,
            b
        ) => {

            if (
                b.kills !==
                a.kills
            ) {

                return (
                    b.kills -
                    a.kills
                );

            }


            if (
                b.hp !==
                a.hp
            ) {

                return (
                    b.hp -
                    a.hp
                );

            }


            if (
                b.knifeCount !==
                a.knifeCount
            ) {

                return (
                    b.knifeCount -
                    a.knifeCount
                );

            }


            return (
                b.coins -
                a.coins
            );

        }
    );


    return (
        contenders[0] ||
        null
    );

}


// ======================================================
// FINAL DA RODADA
// ======================================================

function endRound() {

    if (
        roundEnded
    ) {

        return;

    }


    roundActive =
        false;


    roundEnded =
        true;


    roundElapsedMs =
        ROUND_DURATION_MS;


    updateRoundTimer();


    const winner =
        findWinner();


    if (
        winner
    ) {

        showWinnerOverlay(
            winner
        );

    }


    document
        .getElementById(
            "new-round-button"
        )
        .disabled = false;


    updatePlayersList();

}


// ======================================================
// WIN
// ======================================================

function showWinnerOverlay(
    winner
) {

    // ================================================
    // FOTO / AVATAR
    // ================================================

    scene.winnerData
        .winnerAvatar
        .setText(
            winner.avatar ||
            "😎"
        );


    // ================================================
    // NOME
    // ================================================

    scene.winnerData
        .winnerName
        .setText(
            winner.name
        );


    // ================================================
    // COR
    // ================================================

    scene.winnerData
        .winnerName
        .setColor(
            colorToHex(
                winner.color
            )
        );


    // ================================================
    // KILLS
    // ================================================

    scene.winnerData
        .killsText
        .setText(
            "💀 " +
            winner.kills +
            " KILLS"
        );


    // ================================================
    // MOSTRAR
    // ================================================

    scene.winnerContainer
        .setVisible(
            true
        );


    // ================================================
    // ANIMAÇÕES
    // ================================================

    scene.tweens.killTweensOf(
        scene.winnerData.winText
    );


    scene.winnerData
        .winText
        .setScale(
            0.6
        );


    scene.winnerData
        .winnerAvatar
        .setScale(
            0.7
        );


    scene.winnerData
        .winnerName
        .setScale(
            0.7
        );


    scene.tweens.add({

        targets:
            scene.winnerData
                .winText,

        scale:
            1,

        duration:
            550,

        ease:
            "Back.easeOut"

    });


    scene.tweens.add({

        targets:
            scene.winnerData
                .winnerAvatar,

        scale:
            1,

        duration:
            550,

        delay:
            100,

        ease:
            "Back.easeOut"

    });


    scene.tweens.add({

        targets:
            scene.winnerData
                .winnerName,

        scale:
            1,

        duration:
            650,

        delay:
            150,

        ease:
            "Back.easeOut"

    });


    scene.tweens.add({

        targets:
            scene.winnerData
                .winText,

        scale:
            1.06,

        duration:
            750,

        yoyo:
            true,

        repeat:
            -1

    });

}


// ======================================================
// UPDATE
// ======================================================

function update(
    time,
    delta
) {

    // ================================================
    // RODADA ATIVA
    // ================================================

    if (
        roundActive
    ) {

        roundElapsedMs +=
            delta;


        // ==========================================
        // TIMER
        // ==========================================

        const currentSecond =
            Math.floor(
                roundElapsedMs /
                1000
            );


        if (
            currentSecond !==
            lastDisplayedSecond
        ) {

            lastDisplayedSecond =
                currentSecond;


            updateRoundTimer();

        }


        // ==========================================
        // FIM
        // ==========================================

        if (
            roundElapsedMs >=
            ROUND_DURATION_MS
        ) {

            endRound();

            return;

        }


        // ==========================================
        // GRID
        // ==========================================

        rebuildSpatialGrid();


        // ==========================================
        // JOGADORES
        // ==========================================

        for (
            const player
            of players
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


            player.rotationAngle +=
                player.rotationSpeed;


            player.attackTimer -=
                delta;


            if (
                player.attackTimer <= 0
            ) {

                tryAttack(
                    player
                );


                // ==================================
                // INTERVALO
                // ==================================
                //
                // Ataques mais lentos agora.
                //
                // ==================================

                const interval =
                    Math.max(
                        900,
                        1650 -
                        Math.sqrt(
                            player.knifeCount
                        ) *
                        40
                    );


                player.attackTimer =
                    interval;

            }


            updatePlayerVisuals(
                player,
                delta
            );

        }


        // ==========================================
        // ARMAS
        // ==========================================

        drawAllWeapons();

    }


    // ==================================================
    // MENSAGEM
    // ==================================================

    if (
        battleMessageTimer > 0
    ) {

        battleMessageTimer -=
            1;

    }
    else if (
        roundActive
    ) {

        battleText.setText(
            ""
        );

    }


    // ==================================================
    // PAINEL
    // ==================================================

    if (
        Math.floor(
            time /
            1000
        ) !==
        Math.floor(
            (
                time -
                delta
            ) /
            1000
        )
    ) {

        updatePlayersList();

        updatePlayerPreview();

        updateRoundTimer();

    }

}


// ======================================================
// ENVIAR MOEDAS
// ======================================================

function sendCoins(
    amount
) {

    if (
        !roundActive
    ) {

        setStatus(
            "⏰ A rodada terminou."
        );

        return;

    }


    const name =
        document
            .getElementById(
                "username"
            )
            .value
            .trim();


    const userIdInput =
        document
            .getElementById(
                "userid"
            )
            .value
            .trim();


    const avatar =
        document
            .getElementById(
                "avatar"
            )
            .value
            .trim() ||
        "😎";


    // ================================================
    // VALIDAÇÃO
    // ================================================

    if (!name) {

        setStatus(
            "⚠️ Digite o nome."
        );

        return;

    }


    if (!userIdInput) {

        setStatus(
            "⚠️ Digite o ID."
        );

        return;

    }


    const userId =
        String(
            userIdInput
        );


    // ================================================
    // PROCURAR JOGADOR
    // ================================================

    const existingPlayer =
        playerMap.get(
            userId
        );


    // ================================================
    // JÁ ESTÁ NA ARENA
    // ================================================

    if (
        existingPlayer
    ) {

        existingPlayer.name =
            name;


        existingPlayer.avatar =
            avatar;


        existingPlayer.nameText
            .setText(
                name
            );


        existingPlayer.avatarText
            .setText(
                avatar
            );


        addCoinsToExistingPlayer(
            existingPlayer,
            amount
        );


        return;

    }


    // ================================================
    // PROCURAR PENDENTE
    // ================================================

    let pending =
        pendingPlayers.get(
            userId
        );


    if (
        !pending
    ) {

        pending = {

            userId:
                userId,

            name:
                name,

            avatar:
                avatar,

            coins:
                0

        };


        pendingPlayers.set(
            userId,
            pending
        );

    }


    pending.name =
        name;


    pending.avatar =
        avatar;


    pending.coins +=
        Number(
            amount
        );


    // ================================================
    // ATINGIU 10
    // ================================================

    if (
        pending.coins >= 10
    ) {

        enterPendingPlayer(
            pending
        );

    }
    else {

        setStatus(
            "🪙 " +
            pending.name +
            " possui " +
            pending.coins +
            " moedas. " +
            "Faltam " +
            (
                10 -
                pending.coins
            ) +
            "."
        );

    }


    updatePlayerPreview();

    updateRoundTimer();

}


// ======================================================
// HEART-ME
// ======================================================

function sendHeart() {

    if (
        !roundActive
    ) {

        setStatus(
            "⏰ A rodada terminou."
        );

        return;

    }


    const name =
        document
            .getElementById(
                "username"
            )
            .value
            .trim();


    const userIdInput =
        document
            .getElementById(
                "userid"
            )
            .value
            .trim();


    const avatar =
        document
            .getElementById(
                "avatar"
            )
            .value
            .trim() ||
        "❤️";


    if (!name) {

        setStatus(
            "⚠️ Digite o nome."
        );

        return;

    }


    if (!userIdInput) {

        setStatus(
            "⚠️ Digite o ID."
        );

        return;

    }


    const userId =
        String(
            userIdInput
        );


    // ================================================
    // JÁ ESTÁ NA ARENA
    // ================================================

    const existingPlayer =
        playerMap.get(
            userId
        );


    if (
        existingPlayer
    ) {

        setStatus(
            "❤️ " +
            name +
            " já está na arena."
        );

        return;

    }


    // ================================================
    // PENDENTE
    // ================================================

    let pending =
        pendingPlayers.get(
            userId
        );


    if (
        !pending
    ) {

        pending = {

            userId:
                userId,

            name:
                name,

            avatar:
                avatar,

            coins:
                0

        };


        pendingPlayers.set(
            userId,
            pending
        );

    }


    pending.name =
        name;


    pending.avatar =
        avatar;


    // ================================================
    // ENTRAR
    // ================================================

    enterPendingPlayer(
        pending
    );


    setStatus(
        "❤️ " +
        name +
        " entrou usando Heart-Me!"
    );


    updatePlayerPreview();

    updateRoundTimer();

}


// ======================================================
// ENTRAR PENDENTE
// ======================================================

function enterPendingPlayer(
    pending
) {

    const userId =
        String(
            pending.userId
        );


    // Segurança

    if (
        playerMap.has(
            userId
        )
    ) {

        return;

    }


    // Remover da fila

    pendingPlayers.delete(
        userId
    );


    // Criar jogador

    const player =
        addPlayerToArena(
            pending.name,
            pending.avatar,
            pending.coins,
            userId
        );


    showBattleMessage(
        "🔥 " +
        player.name +
        " entrou na arena!"
    );


    setStatus(
        "🔥 " +
        player.name +
        " entrou! " +
        "🛡️ 7 segundos de proteção."
    );


    updatePlayersList();

    updatePlayerPreview();

    updateRoundTimer();

}


// ======================================================
// PREVIEW
// ======================================================

function updatePlayerPreview() {

    const userId =
        document
            .getElementById(
                "userid"
            )
            .value
            .trim();


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


    if (!userId) {

        coinsElement.innerText =
            "0";


        knivesElement.innerText =
            "0";


        killsElement.innerText =
            "0";


        return;

    }


    const normalizedId =
        String(
            userId
        );


    const player =
        playerMap.get(
            normalizedId
        );


    if (
        player
    ) {

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
            normalizedId
        );


    if (
        pending
    ) {

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


    coinsElement.innerText =
        "0";


    knivesElement.innerText =
        "0";


    killsElement.innerText =
        "0";

}


// ======================================================
// STATUS
// ======================================================

function setStatus(
    message
) {

    document
        .getElementById(
            "selected-status"
        )
        .innerText =
        message;

}


// ======================================================
// LISTA
// ======================================================

function updatePlayersList() {

    const container =
        document.getElementById(
            "players-list"
        );


    if (
        players.length === 0
    ) {

        container.innerHTML =
            '<div class="empty-list">' +
            'Nenhum jogador ainda.' +
            '</div>';


        return;

    }


    const sorted =
        [...players].sort(
            (
                a,
                b
            ) => {

                // Vivos primeiro

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


                // Kills

                if (
                    b.kills !==
                    a.kills
                ) {

                    return (
                        b.kills -
                        a.kills
                    );

                }


                // Moedas

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


    container.innerHTML =
        "";


    for (
        const player
        of visible
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

                document
                    .getElementById(
                        "username"
                    )
                    .value =
                    player.name;


                document
                    .getElementById(
                        "userid"
                    )
                    .value =
                    player.userId;


                document
                    .getElementById(
                        "avatar"
                    )
                    .value =
                    player.avatar;


                updatePlayerPreview();

            }
        );


        container.appendChild(
            row
        );

    }


    // ================================================
    // AVISO
    // ================================================

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


// ======================================================
// DISTÂNCIA
// ======================================================

function distanceBetween(
    x1,
    y1,
    x2,
    y2
) {

    const dx =
        x2 - x1;


    const dy =
        y2 - y1;


    return Math.sqrt(
        dx * dx +
        dy * dy
    );

}


// ======================================================
// NORMALIZAR ÂNGULO
// ======================================================

function normalizeAngle(
    angle
) {

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


// ======================================================
// MENSAGEM
// ======================================================

function showBattleMessage(
    message
) {

    battleText.setText(
        message
    );


    battleMessageTimer =
        140;

}


// ======================================================
// EXPORT DEBUG
// ======================================================
//
// Facilita testar no console.
//
// Você pode digitar:
//
// testAdd("Joao", "123", "😎", 10)
//
// ======================================================

window.testAdd =
    function(
        name,
        userId,
        avatar = "😎",
        coins = 10
    ) {

        document
            .getElementById(
                "username"
            )
            .value =
            name;


        document
            .getElementById(
                "userid"
            )
            .value =
            String(
                userId
            );


        document
            .getElementById(
                "avatar"
            )
            .value =
            avatar;


        sendCoins(
            coins
        );

    };