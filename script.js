let gameStarted = false;

const canvas = document.getElementById('tetris');
const context = canvas.getContext('2d');
context.scale(40, 40);

const nextCanvas = document.getElementById('next-piece');
const nextContext = nextCanvas.getContext('2d');
nextContext.scale(40, 40);

const holdCanvas = document.getElementById('hold-piece');
const holdContext = holdCanvas.getContext('2d');
holdContext.scale(40, 40);

// 添加总消除行数变量
let totalLines = 0;

// 修改回合定义
const rounds = {
    1: {
        target: 10,
        type: 'lines',
        description: '在本回合消除10行',
        speed: 1000
    },
    2: {
        target: 15,
        type: 'lines',
        description: '在本回合消除15行',
        speed: 800
    },
    3: {
        target: 20,
        type: 'lines',
        description: '在本回合消除20行',
        speed: 600
    },
    4: {
        target: 25,
        type: 'lines',
        description: '在本回合消除25行',
        speed: 400
    },
    5: {
        target: 30,
        type: 'lines',
        description: '在本回合消除30行',
        speed: 300
    }
};

// 添加回合进度变量
let currentRound = 1;
let roundLines = 0;  // 当前回合消除的行数

// 添加音频管理系统
const audioManager = {
    bgm: new Audio('sounds/bgm.mp3'),
    sounds: {
        move: new Audio('sounds/move.wav'),
        rotate: new Audio('sounds/rotate.wav'),
        drop: new Audio('sounds/drop.wav'),
        hardDrop: new Audio('sounds/hard-drop.wav'),  // 添加瞬间下落音效
        clear: new Audio('sounds/clear.wav'),
        gameOver: new Audio('sounds/game-over.wav'),
        levelUp: new Audio('sounds/level-up.wav'),
        explosion: new Audio('sounds/explosion.wav'),
        freeze: new Audio('sounds/freeze.wav'),
        freezeEnd: new Audio('sounds/freeze-end.wav'),
        hold: new Audio('sounds/hold.wav')
    },
    isMuted: false,
    bgmVolume: 0.3,
    sfxVolume: 0.5,

    initAudio() {
        // 设置背景音乐循环播放
        this.bgm.loop = true;
        this.bgm.volume = this.bgmVolume;

        // 设置音效音量
        Object.values(this.sounds).forEach(sound => {
            sound.volume = this.sfxVolume;
        });

        // 从本地存储加载音频设置
        const savedSettings = localStorage.getItem('audioSettings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            this.isMuted = settings.isMuted;
            this.bgmVolume = settings.bgmVolume;
            this.sfxVolume = settings.sfxVolume;
            this.updateVolumes();
        }
    },

    playBGM() {
        if (!this.isMuted) {
            this.bgm.play().catch(error => console.log('BGM播放失败:', error));
        }
    },

    pauseBGM() {
        this.bgm.pause();
    },

    playSound(soundName) {
        if (!this.isMuted && this.sounds[soundName]) {
            this.sounds[soundName].currentTime = 0;
            this.sounds[soundName].play().catch(error => console.log('音效播放失败:', error));
        }
    },

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.isMuted) {
            this.bgm.pause();
        } else {
            this.bgm.play().catch(error => console.log('BGM播放失败:', error));
        }
        this.saveSettings();
    },

    updateVolumes() {
        this.bgm.volume = this.isMuted ? 0 : this.bgmVolume;
        Object.values(this.sounds).forEach(sound => {
            sound.volume = this.isMuted ? 0 : this.sfxVolume;
        });
        this.saveSettings();
    },

    saveSettings() {
        const settings = {
            isMuted: this.isMuted,
            bgmVolume: this.bgmVolume,
            sfxVolume: this.sfxVolume
        };
        localStorage.setItem('audioSettings', JSON.stringify(settings));
    }
};

function arenaSweep() {
    let rowCount = 0;
    outer: for (let y = arena.length - 1; y > 0; --y) {
        for (let x = 0; x < arena[y].length; ++x) {
            if (arena[y][x] === 0) {
                continue outer;
            }
        }

        const row = arena.splice(y, 1)[0].fill(0);
        arena.unshift(row);
        ++y;
        rowCount++;
    }

    if (rowCount > 0) {
        // 播放消除行音效
        audioManager.playSound('clear');
        
        // 更新分数（累积制）
        if (rowCount === 1) {
            player.score += 10;
        } else if (rowCount === 2) {
            player.score += 20;
        } else if (rowCount === 3) {
            player.score += 50;
        } else if (rowCount === 4) {
            player.score += 100;
        }
        
        // 更新当前回合进度
        roundLines += rowCount;
        
        // 更新显示
        updateScore();
        updateRoundProgress();
        checkRoundComplete();
    }
}

function collide(arena, player) {
    const [m, o] = [player.matrix, player.pos];
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0 &&
               (arena[y + o.y] &&
                arena[y + o.y][x + o.x]) !== 0) {
                return true;
            }
        }
    }
    return false;
}

function createMatrix(w, h) {
    const matrix = [];
    while (h--) {
        matrix.push(new Array(w).fill(0));
    }
    return matrix;
}

// 修改颜色数组，添加道具颜色
const colors = [
    null,
    '#FF0D72',  // 红色
    '#0DC2FF',  // 蓝色
    '#0DFF72',  // 绿色
    '#F538FF',  // 紫色
    '#FF8E0D',  // 橙色
    '#FFE138',  // 黄色
    '#3877FF',  // 深蓝色
    '#000000',  // 黑色（炸弹）
    '#808080',  // 灰色（冰冻）
];

// 添加道具相关变量
const BOMB_COLOR = 8;    // 炸弹的颜色索引
const FREEZE_COLOR = 9;  // 冰冻的颜色索引
let freezeTimer = null;  // 冰冻倒计时
let freezeCountdown = 3; // 冰冻倒计时秒数

// 修改 createPiece 函数，添加道具生成逻辑
function createPiece(type) {
    const piece = createBasePiece(type);
    
    // 随机决定是否添加道具（20%概率）
    if (Math.random() < 0.2) {
        // 随机选择一个非空的方块位置
        const validPositions = [];
        piece.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    validPositions.push({x, y});
                }
            });
        });
        
        if (validPositions.length > 0) {
            const randomPos = validPositions[Math.floor(Math.random() * validPositions.length)];
            // 随机选择道具类型（炸弹或冰冻）
            piece[randomPos.y][randomPos.x] = Math.random() < 0.5 ? BOMB_COLOR : FREEZE_COLOR;
        }
    }
    
    return piece;
}

// 将原来的 createPiece 函数改名为 createBasePiece
function createBasePiece(type) {
    if (type === 'T') {
        return [
            [0, 0, 0],
            [5, 5, 5],
            [0, 5, 0],
        ];
    } else if (type === 'O') {
        return [
            [7, 7],
            [7, 7],
        ];
    } else if (type === 'L') {
        return [
            [0, 6, 0],
            [0, 6, 0],
            [0, 6, 6],
        ];
    } else if (type === 'J') {
        return [
            [0, 3, 0],
            [0, 3, 0],
            [3, 3, 0],
        ];
    } else if (type === 'I') {
        return [
            [0, 4, 0, 0],
            [0, 4, 0, 0],
            [0, 4, 0, 0],
            [0, 4, 0, 0],
        ];
    } else if (type === 'S') {
        return [
            [0, 2, 2],
            [2, 2, 0],
            [0, 0, 0],
        ];
    } else if (type === 'Z') {
        return [
            [1, 1, 0],
            [0, 1, 1],
            [0, 0, 0],
        ];
    }
}

function drawMatrix(matrix, offset) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                context.fillStyle = colors[value];
                context.fillRect(x + offset.x,
                               y + offset.y,
                               1, 1);
            }
        });
    });
}

function draw() {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // 绘制预览虚影
    const ghost = getGhostPosition();
    context.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    context.lineWidth = 0.05;
    ghost.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                context.strokeRect(
                    x + ghost.pos.x + 0.05,
                    y + ghost.pos.y + 0.05,
                    0.9,
                    0.9
                );
            }
        });
    });

    // 绘制已固定的方块
    drawMatrix(arena, {x: 0, y: 0});
    
    // 绘制当前方块和冰冻倒计时
    player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                // 绘制方块
                context.fillStyle = colors[value];
                context.fillRect(x + player.pos.x, y + player.pos.y, 1, 1);
                
                // 如果是冰冻方块且倒计时正在进行，绘制倒计时数字
                if (value === FREEZE_COLOR && freezeTimer) {
                    context.fillStyle = '#fff';
                    context.font = '1px Arial';
                    context.textAlign = 'center';
                    context.textBaseline = 'middle';
                    context.fillText(
                        freezeCountdown.toString(),
                        x + player.pos.x + 0.5,
                        y + player.pos.y + 0.5
                    );
                }
            }
        });
    });
}

// 修改爆炸效果函数
function explodeBomb(x, y) {
    const explosionRange = 2; // 增加爆炸范围到2格
    let clearedBlocks = 0; // 记录被清除的方块数
    
    for (let dy = -explosionRange; dy <= explosionRange; dy++) {
        for (let dx = -explosionRange; dx <= explosionRange; dx++) {
            const newY = y + dy;
            const newX = x + dx;
            
            // 检查是否在游戏区域内
            if (newY >= 0 && newY < arena.length && 
                newX >= 0 && newX < arena[0].length) {
                if (arena[newY][newX] !== 0) {
                    clearedBlocks++;
                }
                arena[newY][newX] = 0;
            }
        }
    }
    
    // 根据清除的方块数增加分数
    if (clearedBlocks > 0) {
        player.score += clearedBlocks * 5; // 每个方块5分
        updateScore();
    }
    
    // 添加爆炸动画效果
    showExplosionEffect(x, y);
}

// 修改爆炸动画效果
function showExplosionEffect(x, y) {
    const explosion = document.createElement('div');
    explosion.className = 'explosion';
    explosion.style.left = `${(x * 40) + 20}px`; // 居中显示
    explosion.style.top = `${(y * 40) + 20}px`;
    document.querySelector('.play-area').appendChild(explosion);
    
    // 添加爆炸音效
    audioManager.playSound('explosion');
    
    setTimeout(() => {
        explosion.remove();
    }, 500);
}

// 修改 merge 函数，添加道具触发逻辑
function merge(arena, player) {
    let hasBomb = false;
    let bombPositions = [];
    
    player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                const arenaX = x + player.pos.x;
                const arenaY = y + player.pos.y;
                
                if (value === BOMB_COLOR) {
                    hasBomb = true;
                    bombPositions.push({x: arenaX, y: arenaY});
                }
                
                arena[arenaY][arenaX] = value;
            }
        });
    });
    
    // 触发炸弹效果
    if (hasBomb) {
        bombPositions.forEach(pos => {
            setTimeout(() => {
                explodeBomb(pos.x, pos.y);
            }, 100);
        });
    }
}

// 修改冰冻效果处理
function checkFreezeEffect(piece) {
    let hasFreeze = false;
    piece.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value === FREEZE_COLOR) {
                hasFreeze = true;
            }
        });
    });
    
    if (hasFreeze && !freezeTimer) {
        freezeCountdown = 3;
        // 添加冰冻开始音效
        audioManager.playSound('freeze');
        
        freezeTimer = setInterval(() => {
            freezeCountdown--;
            if (freezeCountdown <= 0) {
                clearInterval(freezeTimer);
                freezeTimer = null;
                // 直接在当前位置固定方块
                freezeBlock();
                // 添加冰冻结束音效
                audioManager.playSound('freezeEnd');
            }
        }, 1000);
    }
}

// 添加冰冻固定函数
function freezeBlock() {
    // 直接在当前位置合并方块
    merge(arena, player);
    // 检查并清除完整的行
    arenaSweep();
    // 生成新的方块
    playerReset();
    // 更新分数
    updateScore();
    // 检查回合完成情况
    checkRoundComplete();
}

// 修改 playerReset 函数，确保在生成新方块时重置冰冻状态
function playerReset() {
    const pieces = 'TJLOSZI';
    
    // 清除之前的冰冻计时器
    if (freezeTimer) {
        clearInterval(freezeTimer);
        freezeTimer = null;
    }
    
    if (nextPiece === null) {
        nextPiece = createPiece(pieces[Math.floor(Math.random() * pieces.length)]);
    }
    
    player.matrix = nextPiece;
    nextPiece = createPiece(pieces[Math.floor(Math.random() * pieces.length)]);
    
    player.pos.y = 0;
    player.pos.x = (arena[0].length / 2 | 0) -
                   (player.matrix[0].length / 2 | 0);
    
    canHold = true;
    
    // 检查新方块是否包含冰冻效果
    checkFreezeEffect(player.matrix);
    
    if (collide(arena, player)) {
        handleGameOver();
        return true;
    }
    
    drawNextPiece();
    return false;
}

function playerRotate(dir) {
    const pos = player.pos.x;
    let offset = 1;
    rotate(player.matrix, dir);
    while (collide(arena, player)) {
        player.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > player.matrix[0].length) {
            rotate(player.matrix, -dir);
            player.pos.x = pos;
            return;
        }
    }
}

function playerDropToBottom() {
    if (gameOver) return;
    
    while (!collide(arena, player)) {
        player.pos.y++;
    }
    player.pos.y--;
    
    // 如果是手动落地，取消冰冻倒计时
    if (freezeTimer) {
        clearInterval(freezeTimer);
        freezeTimer = null;
    }
    
    // 播放瞬间下落音效
    audioManager.playSound('hardDrop');
    
    merge(arena, player);
    if (playerReset()) {
        return;
    }
    arenaSweep();
    updateScore();
    checkRoundComplete();
}

let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;

function gameLoop(time = 0) {
    // 始终检测手柄输入
    if (gamepadConnected) {
        const gamepad = navigator.getGamepads()[gamepadIndex];
        if (gamepad) {
            checkGamepadInput();
        }
    }

    // 只在游戏进行中且未暂停时更新游戏状态
    if (gameStarted && !gameOver && !isPaused && !document.getElementById('game-screen').classList.contains('hidden')) {
        const deltaTime = time - lastTime;
        
        dropCounter += deltaTime;
        if (dropCounter > dropInterval) {
            playerDrop();
            dropCounter = 0;
        }
        
        draw();
        lastTime = time;
    }

    requestAnimationFrame(gameLoop);
}

function updateScore() {
    document.getElementById('score').innerText = player.score;
    
    if (player.score >= 200) {
        dropInterval = 1000 / 2;
    } else if (player.score >= 100) {
        dropInterval = 1000 / 1.5;
    } else if (player.score >= 50) {
        dropInterval = 1000 / 1.2;
    } else {
        dropInterval = 1000;
    }
}

const arena = createMatrix(12, 20);

const player = {
    pos: {x: 0, y: 0},
    matrix: null,
    score: 0,
};

let nextPiece = null;
let holdPiece = null;
let canHold = true;

function drawNextPiece() {
    nextContext.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    
    const xOffset = (4 - nextPiece[0].length) / 2;
    const yOffset = (4 - nextPiece.length) / 2;
    
    nextPiece.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                nextContext.fillStyle = colors[value];
                nextContext.fillRect(x + xOffset, y + yOffset, 1, 1);
            }
        });
    });
}

function drawHoldPiece() {
    holdContext.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    
    if (holdPiece) {
        const xOffset = (4 - holdPiece[0].length) / 2;
        const yOffset = (4 - holdPiece.length) / 2;
        
        holdPiece.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    holdContext.fillStyle = colors[value];
                    holdContext.fillRect(x + xOffset, y + yOffset, 1, 1);
                }
            });
        });
    }
}

function holdBlock() {
    if (!canHold) return;
    
    const pieces = 'TJLOSZI';
    if (holdPiece === null) {
        holdPiece = player.matrix;
        player.matrix = nextPiece;
        nextPiece = createPiece(pieces[Math.floor(Math.random() * pieces.length)]);
    } else {
        const temp = player.matrix;
        player.matrix = holdPiece;
        holdPiece = temp;
    }
    
    // 播放储存方块音效
    audioManager.playSound('hold');
    
    player.pos.y = 0;
    player.pos.x = (arena[0].length / 2 | 0) -
                   (player.matrix[0].length / 2 | 0);
    
    canHold = false;
    
    drawHoldPiece();
    drawNextPiece();
}

// 修改键盘事件处理
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        togglePause();
        return;
    }
    
    if (isPaused || gameOver) return;

    if (event.keyCode === 37) {         // 左方向键
        if (playerMove(-1)) {
            if (lastMoveDirection === -1) {
                currentMoveDelay = Math.max(minMoveDelay, currentMoveDelay - accelerationRate);
            } else {
                currentMoveDelay = initialMoveDelay;
            }
            lastMoveDirection = -1;
        }
    } else if (event.keyCode === 39) {  // 右方向键
        if (playerMove(1)) {
            if (lastMoveDirection === 1) {
                currentMoveDelay = Math.max(minMoveDelay, currentMoveDelay - accelerationRate);
            } else {
                currentMoveDelay = initialMoveDelay;
            }
            lastMoveDirection = 1;
        }
    } else if (event.keyCode === 40) {  // 下方向键
        playerDrop();
        currentDropDelay = Math.max(minMoveDelay, currentDropDelay - accelerationRate);
    } else if (event.key.toLowerCase() === 'x') {  // X键逆时针旋转
        playerRotate(-1);
    } else if (event.key.toLowerCase() === 'c') {  // C键顺时针旋转
        playerRotate(1);
    } else if (event.keyCode === 32) {  // 空格键瞬间落下
        playerDropToBottom();
    } else if (event.key.toLowerCase() === 'z') {  // Z键储存方块
        holdBlock();
    }
});

// 添加键盘松开事件处理
document.addEventListener('keyup', event => {
    if (event.keyCode === 37 && lastMoveDirection === -1) {  // 左方向键
        lastMoveDirection = 0;
        currentMoveDelay = initialMoveDelay;
    } else if (event.keyCode === 39 && lastMoveDirection === 1) {  // 右方向键
        lastMoveDirection = 0;
        currentMoveDelay = initialMoveDelay;
    } else if (event.keyCode === 40) {  // 下方向键
        currentDropDelay = initialMoveDelay;
    }
});

document.getElementById('restart').addEventListener('click', resetGame);

function resetGame() {
    currentRound = 1;
    roundLines = 0;
    arena.forEach(row => row.fill(0));
    player.score = 0;
    dropInterval = rounds[1].speed;
    updateScore();
    gameOver = false;
    document.getElementById('game-over').style.display = 'none';
    document.querySelector('.new-high-score').classList.add('hidden');
    
    // 重置方块状态
    nextPiece = null;
    holdPiece = null;
    canHold = true;
    holdContext.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    
    // 重置时间
    startTime = Date.now();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
    
    // 初始化游戏
    updateRoundProgress();
    playerReset();
    gameStarted = true;
}

// 添加用户管理相关变量
let currentUser = localStorage.getItem('currentUser') || '';

// 获取用户名输入弹窗元素
const userModal = document.getElementById('user-modal');
const newUserBtn = document.getElementById('new-user');
const saveUserBtn = document.getElementById('save-user');
const userNameInput = document.getElementById('new-user-name');
const currentUserSpan = document.getElementById('current-user');

// 更新当前用户显示
function updateCurrentUser() {
    currentUserSpan.textContent = currentUser || '未登录';
    // 如果没有用户，禁用开始游戏按钮
    document.getElementById('start-game').disabled = !currentUser;
}

// 显示新用户弹窗
newUserBtn.addEventListener('click', () => {
    userModal.classList.remove('hidden');
    userNameInput.value = '';
    userNameInput.focus();
    updateUserList();
});

// 关闭新用户弹窗
document.querySelector('#user-modal .close-btn').addEventListener('click', () => {
    userModal.classList.add('hidden');
});

// 点击弹窗外部关闭
window.addEventListener('click', (event) => {
    if (event.target === userModal) {
        userModal.classList.add('hidden');
    }
});

// 保存新用户
saveUserBtn.addEventListener('click', () => {
    const userName = userNameInput.value.trim();
    if (userName) {
        if (!historyUsers.includes(userName)) {
            historyUsers.push(userName);
            localStorage.setItem('historyUsers', JSON.stringify(historyUsers));
            updateUserList();
        }
        selectUser(userName);
        userNameInput.value = '';
    }
});

// 添加历史用户相关变量和函数
let historyUsers = JSON.parse(localStorage.getItem('historyUsers') || '[]');

// 更新历史用户列表显示
function updateUserList() {
    const userList = document.getElementById('user-list');
    userList.innerHTML = historyUsers.map(user => `
        <div class="user-item" data-username="${user}">
            <span class="user-name">${user}</span>
            <button class="delete-btn" data-username="${user}">&times;</button>
        </div>
    `).join('');

    // 添加点击事件
    userList.querySelectorAll('.user-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-btn')) {
                selectUser(item.dataset.username);
            }
        });
    });

    // 添加删除按钮事件
    userList.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteUser(btn.dataset.username);
        });
    });
}

// 选择用户
function selectUser(username) {
    currentUser = username;
    localStorage.setItem('currentUser', currentUser);
    userModal.classList.add('hidden');
    updateCurrentUser();
}

// 删除用户
function deleteUser(username) {
    if (confirm(`确定要删除用户 "${username}" 吗？`)) {
        historyUsers = historyUsers.filter(user => user !== username);
        localStorage.setItem('historyUsers', JSON.stringify(historyUsers));
        if (currentUser === username) {
            currentUser = '';
            localStorage.removeItem('currentUser');
            updateCurrentUser();
        }
        updateUserList();
    }
}

// 修改 saveScore 函数，添加用户名
function saveScore(score) {
    let scores = JSON.parse(localStorage.getItem('tetrisScores') || '[]');
    
    scores.push({
        name: currentUser,
        score: score,
        time: gameTime,
        date: new Date().toLocaleDateString()
    });
    
    scores.sort((a, b) => b.score - a.score);
    scores = scores.slice(0, 10);
    
    localStorage.setItem('tetrisScores', JSON.stringify(scores));
    updateHighScores();
    
    if (scores[0].score === score) {
        document.querySelector('.new-high-score').classList.remove('hidden');
    }
}

// 修改 startGame 函数
function startGame() {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    gameStarted = true;
    gameOver = false;
    isPaused = false;
    
    // 播放背景音乐
    audioManager.playBGM();
    
    // 重置游戏状态
    currentRound = 1;
    roundLines = 0;
    arena.forEach(row => row.fill(0));
    player.score = 0;
    dropInterval = rounds[1].speed;
    
    // 重置方块状态
    nextPiece = null;
    holdPiece = null;
    canHold = true;
    holdContext.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    
    // 重置时间
    startTime = Date.now();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
    
    // 初始化游戏
    updateRoundProgress();
    playerReset();
    updateScore();
    
    // 立即开始游戏循环
    requestAnimationFrame(gameLoop);
}

// 添加开始游戏按钮事件监听
document.getElementById('start-game').addEventListener('click', startGame);

function updateHighScores() {
    const highScoresDiv = document.getElementById('high-scores');
    const scores = JSON.parse(localStorage.getItem('tetrisScores') || '[]');
    
    highScoresDiv.innerHTML = scores.map((score, index) => {
        const minutes = Math.floor(score.time / 60);
        const seconds = score.time % 60;
        const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        return `
            <div class="score-entry">
                <span class="rank">${index + 1}</span>
                <span class="name">${score.name || '未知玩家'}</span>
                <span class="score">${score.score}</span>
                <span class="time">${timeStr}</span>
                <span class="date">${score.date}</span>
            </div>
        `;
    }).join('');
}

// 添加游戏结束菜单按钮
const gameOverButtons = ['restart-game', 'back-to-menu', 'view-scores'];
let gameOverSelectedButton = 0;

// 添加暂停相关变量
let isPaused = false;
let pauseSelectedButton = 0;
const pauseButtons = ['resume-game', 'restart-from-pause', 'quit-to-menu'];

// 添加暂停/恢复游戏函数
function togglePause() {
    if (gameOver || !gameStarted) return;
    
    isPaused = !isPaused;
    const pauseMenu = document.getElementById('pause-menu');
    
    if (isPaused) {
        pauseMenu.classList.remove('hidden');
        pauseSelectedButton = 0;
        updatePauseMenuSelection();
        audioManager.pauseBGM();
    } else {
        pauseMenu.classList.add('hidden');
        audioManager.playBGM();
    }
}

// 添加暂停菜单选择更新函数
function updatePauseMenuSelection() {
    pauseButtons.forEach((buttonId, index) => {
        const button = document.getElementById(buttonId);
        if (button) {
            if (index === pauseSelectedButton) {
                button.classList.add('selected');
            } else {
                button.classList.remove('selected');
            }
        }
    });
}

// 修改 checkGamepadInput 函数
function checkGamepadInput() {
    if (!gamepadConnected) return;
    
    const gamepad = navigator.getGamepads()[gamepadIndex];
    if (!gamepad) return;

    // 在主菜单界面
    if (document.getElementById('game-screen').classList.contains('hidden')) {
        const dpadUp = gamepad.buttons[12].pressed;
        const dpadDown = gamepad.buttons[13].pressed;
        const buttonA = gamepad.buttons[0].pressed;

        if (dpadUp && !lastButtonStates[12]) {
            selectedButton = (selectedButton - 1 + menuButtons.length) % menuButtons.length;
            updateMenuSelection();
        }
        if (dpadDown && !lastButtonStates[13]) {
            selectedButton = (selectedButton + 1) % menuButtons.length;
            updateMenuSelection();
        }
        if (buttonA && !lastButtonStates[0]) {
            document.getElementById(menuButtons[selectedButton]).click();
        }
    }
    // 在游戏中
    else if (gameStarted) {
        // Start 按钮暂停/恢复游戏
        if (gamepad.buttons[9].pressed && !lastButtonStates[9]) {
            togglePause();
            return;
        }

        // 在暂停菜单中
        if (isPaused) {
            const dpadUp = gamepad.buttons[12].pressed;
            const dpadDown = gamepad.buttons[13].pressed;
            const buttonA = gamepad.buttons[0].pressed;

            if (dpadUp && !lastButtonStates[12]) {
                pauseSelectedButton = (pauseSelectedButton - 1 + pauseButtons.length) % pauseButtons.length;
                updatePauseMenuSelection();
            }
            if (dpadDown && !lastButtonStates[13]) {
                pauseSelectedButton = (pauseSelectedButton + 1) % pauseButtons.length;
                updatePauseMenuSelection();
            }
            if (buttonA && !lastButtonStates[0]) {
                document.getElementById(pauseButtons[pauseSelectedButton]).click();
            }
            return;
        }

        // 在游戏结束界面
        if (gameOver && document.getElementById('game-over').style.display === 'block') {
            const dpadLeft = gamepad.buttons[14].pressed;
            const dpadRight = gamepad.buttons[15].pressed;
            const buttonA = gamepad.buttons[0].pressed;

            if (dpadLeft && !lastButtonStates[14]) {
                gameOverSelectedButton = (gameOverSelectedButton - 1 + gameOverButtons.length) % gameOverButtons.length;
                updateGameOverSelection();
            }
            if (dpadRight && !lastButtonStates[15]) {
                gameOverSelectedButton = (gameOverSelectedButton + 1) % gameOverButtons.length;
                updateGameOverSelection();
            }
            if (buttonA && !lastButtonStates[0]) {
                document.getElementById(gameOverButtons[gameOverSelectedButton]).click();
            }
            return;
        }

        // 正常游戏控制
        if (!gameOver && !isPaused) {
            // 左右移动（支持摇杆和方向键）
            const axisX = gamepad.axes[0];
            const dpadLeft = gamepad.buttons[14].pressed;
            const dpadRight = gamepad.buttons[15].pressed;
            const dpadDown = gamepad.buttons[13].pressed;
            const dpadUp = gamepad.buttons[12].pressed;

            // 合并摇杆和方向键的输入
            let moveDirection = 0;
            if (Math.abs(axisX) > 0.5) {
                moveDirection = Math.sign(axisX);
            } else if (dpadLeft) {
                moveDirection = -1;
            } else if (dpadRight) {
                moveDirection = 1;
            }

            if (moveDirection !== 0) {
                if (moveDelayCounter <= 0) {
                    if (playerMove(moveDirection)) {
                        // 如果移动成功且方向相同，加速
                        if (lastMoveDirection === moveDirection) {
                            currentMoveDelay = Math.max(minMoveDelay, currentMoveDelay - accelerationRate);
                        } else {
                            currentMoveDelay = initialMoveDelay;
                        }
                    }
                    moveDelayCounter = currentMoveDelay;
                    lastMoveDirection = moveDirection;
                }
                moveDelayCounter -= 16;
            } else {
                moveDelayCounter = 0;
                currentMoveDelay = initialMoveDelay;
                lastMoveDirection = 0;
            }

            // 上方向键瞬间落下，下方向键加速下落
            if (dpadUp && !lastButtonStates[12]) {
                playerDropToBottom();
            }
            if (dpadDown) {
                if (dropDelayCounter <= 0) {
                    playerDrop();
                    currentDropDelay = Math.max(minMoveDelay, currentDropDelay - accelerationRate);
                    dropDelayCounter = currentDropDelay;
                }
                dropDelayCounter -= 16;
            } else {
                dropDelayCounter = 0;
                currentDropDelay = initialMoveDelay;
            }

            // 按钮控制
            if (gamepad.buttons[0].pressed && !lastButtonStates[0]) { // A键顺时针旋转
                playerRotate(1);
            }
            if (gamepad.buttons[1].pressed && !lastButtonStates[1]) { // B键逆时针旋转
                playerRotate(-1);
            }
            if (gamepad.buttons[2].pressed && !lastButtonStates[2]) { // X键储存方块
                holdBlock();
            }
            if (gamepad.buttons[3].pressed && !lastButtonStates[3]) { // Y键瞬间落下
                playerDropToBottom();
            }
        }
    }

    // 更新按钮状态
    for (let i = 0; i < gamepad.buttons.length; i++) {
        lastButtonStates[i] = gamepad.buttons[i].pressed;
    }
    lastAxesStates.x = gamepad.axes[0];
    lastAxesStates.y = gamepad.axes[1];
}

// 修改 handleGameOver 函数
function handleGameOver() {
    gameOver = true;
    gameStarted = false;
    document.getElementById('game-over').style.display = 'block';
    document.getElementById('final-score').textContent = player.score;
    
    // 播放游戏结束音效并停止背景音乐
    audioManager.pauseBGM();
    audioManager.playSound('gameOver');
    
    // 重置游戏结束菜单选择并立即更新选择状态
    gameOverSelectedButton = 0;
    updateGameOverSelection();
    
    // 检查是否是新高分
    const scores = JSON.parse(localStorage.getItem('tetrisScores') || '[]');
    if (scores.length === 0 || player.score > scores[0].score) {
        document.querySelector('.new-high-score').classList.remove('hidden');
    }
    
    // 保存分数
    saveScore();
}

// 修改游戏结束菜单选择更新函数
function updateGameOverSelection() {
    console.log('Updating game over selection:', gameOverSelectedButton); // 调试日志
    gameOverButtons.forEach((buttonId, index) => {
        const button = document.getElementById(buttonId);
        if (button) {
            if (index === gameOverSelectedButton) {
                button.classList.add('selected');
                console.log('Selected game over button:', buttonId); // 调试日志
            } else {
                button.classList.remove('selected');
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    updateCurrentUser();
    updateHighScores();
    
    // 初始化音频系统
    audioManager.initAudio();
    
    // 初始化音量控制
    document.getElementById('bgm-volume').value = audioManager.bgmVolume * 100;
    document.getElementById('sfx-volume').value = audioManager.sfxVolume * 100;
    if (audioManager.isMuted) {
        document.querySelector('.muted').classList.remove('hidden');
        document.querySelector('.unmuted').classList.add('hidden');
    }
    
    // 初始化菜单选择
    selectedButton = 0;
    updateMenuSelection();
    
    // 检查是否已经连接了游戏手柄
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) {
            console.log('Gamepad found:', gamepads[i]);
            gamepadConnected = true;
            gamepadIndex = i;
            lastButtonStates = Array(16).fill(false);
            break;
        }
    }
    
    // 立即开始游戏循环
    requestAnimationFrame(gameLoop);
});

let startTime = 0;
let gameTime = 0;
let timerInterval;

function updateTimer() {
    const currentTime = Date.now();
    const elapsedTime = Math.floor((currentTime - startTime) / 1000);
    const minutes = Math.floor(elapsedTime / 60);
    const seconds = elapsedTime % 60;
    document.getElementById('time').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    gameTime = elapsedTime;
}

// 修改进度更新函数
function updateRoundProgress() {
    const round = rounds[currentRound];
    document.getElementById('level').textContent = currentRound;
    document.getElementById('mission-text').textContent = round.description;
    document.getElementById('mission-target').textContent = round.target;
    document.getElementById('mission-progress').textContent = roundLines;
}

// 修改回合完成检查函数
function checkRoundComplete() {
    const round = rounds[currentRound];
    if (roundLines >= round.target) {
        showRoundComplete();
    }
}

// 修改回合完成显示函数
function showRoundComplete() {
    const roundCompleteDiv = document.createElement('div');
    roundCompleteDiv.className = 'level-complete';
    roundCompleteDiv.innerHTML = `
        <h2>回合完成！</h2>
        <p>进入下一回合</p>
        <p>当前总分：${player.score}</p>
    `;
    document.querySelector('.game-container').appendChild(roundCompleteDiv);
    
    // 播放升级音效
    audioManager.playSound('levelUp');
    
    gameOver = true;
    
    setTimeout(() => {
        roundCompleteDiv.remove();
        startNextRound();
    }, 3000);
}

// 修改开始下一回合函数
function startNextRound() {
    currentRound++;
    if (rounds[currentRound]) {
        // 重置回合状态，但保留总分
        arena.forEach(row => row.fill(0));
        roundLines = 0;  // 重置当前回合消除行数
        dropInterval = rounds[currentRound].speed;
        gameOver = false;
        
        // 重置方块状态
        nextPiece = null;
        holdPiece = null;
        canHold = true;
        holdContext.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
        
        // 显示新回合提示
        const roundStartDiv = document.createElement('div');
        roundStartDiv.className = 'level-complete';
        roundStartDiv.innerHTML = `
            <h2>第 ${currentRound} 回合</h2>
            <p>目标：${rounds[currentRound].description}</p>
            <p class="difficulty-note">难度提升：方块下落速度加快</p>
        `;
        document.querySelector('.game-container').appendChild(roundStartDiv);
        
        setTimeout(() => {
            roundStartDiv.remove();
            updateRoundProgress();
            playerReset();
            gameStarted = true;
            draw();
        }, 3000);
    } else {
        // 通关后显示最终结果
        const finalDiv = document.createElement('div');
        finalDiv.className = 'level-complete';
        finalDiv.innerHTML = `
            <h2>恭喜通关！</h2>
            <p>你已完成所有回合</p>
            <p>最终得分：${player.score}</p>
        `;
        document.querySelector('.game-container').appendChild(finalDiv);
        
        setTimeout(() => {
            finalDiv.remove();
            handleGameOver();
        }, 5000);
    }
}

function getGhostPosition() {
    const ghost = {
        pos: {
            x: player.pos.x,
            y: player.pos.y
        },
        matrix: player.matrix
    };

    while (!collide(arena, ghost)) {
        ghost.pos.y++;
    }
    ghost.pos.y--;

    return ghost;
}

// 修改游戏手柄相关变量的初始化
let gamepadConnected = false;
let gamepadIndex = null;
let lastButtonStates = Array(16).fill(false);
let lastAxesStates = {x: 0, y: 0};
let selectedButton = 0;
const menuButtons = ['start-game', 'new-user', 'show-instructions'];

// 修改手柄连接事件处理
window.addEventListener("gamepadconnected", (e) => {
    console.log("游戏手柄已连接", e.gamepad);
    gamepadConnected = true;
    gamepadIndex = e.gamepad.index;
    lastButtonStates = Array(16).fill(false);
    selectedButton = 0;
    updateMenuSelection();
});

window.addEventListener("gamepaddisconnected", (e) => {
    console.log("游戏手柄已断开");
    gamepadConnected = false;
    gamepadIndex = null;
});

// 修改菜单选择更新函数
function updateMenuSelection() {
    console.log('Updating menu selection:', selectedButton);  // 调试日志
    menuButtons.forEach((buttonId, index) => {
        const button = document.getElementById(buttonId);
        if (button) {
            if (index === selectedButton) {
                button.classList.add('selected');
                console.log('Selected:', buttonId);  // 调试日志
            } else {
                button.classList.remove('selected');
            }
        }
    });
}

// 在游戏说明中添加手柄控制说明
const gamepadInstructions = `
    <li>手柄方向键/摇杆：移动方块</li>
    <li>A按钮：顺时针旋转</li>
    <li>B按钮：逆时针旋转</li>
    <li>X按钮：储存方块</li>
    <li>Y按钮：瞬间落下</li>
`;

// 获取弹窗元素
const modal = document.getElementById('instructions-modal');
const showInstructionsBtn = document.getElementById('show-instructions');
const closeBtn = document.querySelector('.close-btn');

// 显示弹窗
showInstructionsBtn.addEventListener('click', () => {
    modal.classList.remove('hidden');
});

// 关闭弹窗
closeBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
});

// 点击弹窗外部关闭弹窗
window.addEventListener('click', (event) => {
    if (event.target === modal) {
        modal.classList.add('hidden');
    }
});

// 添加游戏结束按钮事件监听
document.getElementById('restart-game').addEventListener('click', () => {
    document.getElementById('game-over').style.display = 'none';
    resetGame();
});

document.getElementById('back-to-menu').addEventListener('click', () => {
    document.getElementById('game-over').style.display = 'none';
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
    resetGame();
    updateHighScores();  // 更新排行榜显示
});

document.getElementById('view-scores').addEventListener('click', () => {
    // 临时隐藏游戏结束界面，显示排行榜
    document.getElementById('game-over').style.display = 'none';
    const leaderboard = document.createElement('div');
    leaderboard.className = 'modal';
    leaderboard.innerHTML = `
        <div class="modal-content">
            <span class="close-btn">&times;</span>
            <h2>排行榜</h2>
            <div id="scores-list" class="high-scores"></div>
        </div>
    `;
    document.body.appendChild(leaderboard);
    
    // 显示排行榜数据
    const scoresList = leaderboard.querySelector('#scores-list');
    const scores = JSON.parse(localStorage.getItem('tetrisScores') || '[]');
    scoresList.innerHTML = scores.map((score, index) => {
        const minutes = Math.floor(score.time / 60);
        const seconds = score.time % 60;
        const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        return `
            <div class="score-entry">
                <span class="rank">${index + 1}</span>
                <span class="name">${score.name || '未知玩家'}</span>
                <span class="score">${score.score}</span>
                <span class="time">${timeStr}</span>
                <span class="date">${score.date}</span>
            </div>
        `;
    }).join('');
    
    // 添加关闭按钮事件
    const closeBtn = leaderboard.querySelector('.close-btn');
    closeBtn.addEventListener('click', () => {
        leaderboard.remove();
        document.getElementById('game-over').style.display = 'block';
    });
});

// 添加暂停菜单按钮事件
document.getElementById('resume-game').addEventListener('click', () => {
    togglePause();
});

document.getElementById('restart-from-pause').addEventListener('click', () => {
    togglePause();
    resetGame();
});

document.getElementById('quit-to-menu').addEventListener('click', () => {
    togglePause();
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
    resetGame();
    updateHighScores();
});

// 添加旋转函数
function rotate(matrix, dir) {
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < y; ++x) {
            [
                matrix[x][y],
                matrix[y][x],
            ] = [
                matrix[y][x],
                matrix[x][y],
            ];
        }
    }

    if (dir > 0) {
        matrix.forEach(row => row.reverse());
    } else {
        matrix.reverse();
    }
    audioManager.playSound('rotate');
}

// 添加移动函数
function playerMove(dir) {
    player.pos.x += dir;
    if (collide(arena, player)) {
        player.pos.x -= dir;
        return false;
    }
    audioManager.playSound('move');
    return true;
}

// 修改 playerDrop 函数，处理手动落地时的冰冻效果
function playerDrop() {
    player.pos.y++;
    if (collide(arena, player)) {
        player.pos.y--;
        merge(arena, player);
        
        // 播放落地音效
        audioManager.playSound('drop');
        
        // 如果是手动落地，取消冰冻倒计时
        if (freezeTimer) {
            clearInterval(freezeTimer);
            freezeTimer = null;
        }
        
        playerReset();
        arenaSweep();
        updateScore();
        checkRoundComplete();
    }
    dropCounter = 0;
}

// 添加移动延迟相关变量
let moveDelayCounter = 0;
const initialMoveDelay = 180;    // 初始延迟
const minMoveDelay = 120;        // 最小延迟
const accelerationRate = 30;      // 加速度
let currentMoveDelay = initialMoveDelay;
let lastMoveDirection = 0;
let dropDelayCounter = 0;
let currentDropDelay = initialMoveDelay;

// 添加冰冻倒计时显示函数
function showFreezeCountdown() {
    const existing = document.querySelector('.freeze-countdown');
    if (existing) {
        existing.remove();
    }
    
    if (freezeCountdown > 0) {
        const countdown = document.createElement('div');
        countdown.className = 'freeze-countdown';
        countdown.textContent = freezeCountdown;
        document.querySelector('.play-area').appendChild(countdown);
    }
}

// 添加音量控制事件处理
document.getElementById('bgm-volume').addEventListener('input', (e) => {
    audioManager.bgmVolume = e.target.value / 100;
    audioManager.updateVolumes();
});

document.getElementById('sfx-volume').addEventListener('input', (e) => {
    audioManager.sfxVolume = e.target.value / 100;
    audioManager.updateVolumes();
});

document.getElementById('mute-toggle').addEventListener('click', () => {
    audioManager.toggleMute();
    document.querySelector('.muted').classList.toggle('hidden');
    document.querySelector('.unmuted').classList.toggle('hidden');
}); 