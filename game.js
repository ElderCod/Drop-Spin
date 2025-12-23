/*
IMPORTANT GAME RULES:

- The Plinko board is the primary game.
- Reels DO NOT spin every turn.
- Reels only spin when awarded by Plinko pockets.
- One Plinko drop = one turn.
- Player cannot drop a ball while reels are spinning.
- Keep the logic simple and readable.
- Do not add extra features unless explicitly requested.
*/

// ============================================
// GAME STATE
// ============================================

const gameState = {
    balance: 100.00,
    currentBet: 0.20,
    isDropping: false,
    isSpinning: false,
    spinsRemaining: 0,
    inBonus: false,
    modifiers: {
        leftWall: false,
        rightWall: false,
        extraBalls: 0 // 0 = normal, 1 = 2 balls, 2 = 3 balls
    }
};

// ============================================
// SYMBOLS & PAYTABLE
// ============================================

const SYMBOLS = {
    LOW_A: '🍒',
    LOW_B: '🍋',
    LOW_C: '🍊',
    MID_A: '💎',
    MID_B: '⭐',
    HIGH: '👑',
    WILD: '🎰'
};

// Symbol weights for reel generation (higher = more common)
const SYMBOL_WEIGHTS = {
    [SYMBOLS.LOW_A]: 30,
    [SYMBOLS.LOW_B]: 30,
    [SYMBOLS.LOW_C]: 30,
    [SYMBOLS.MID_A]: 20,
    [SYMBOLS.MID_B]: 20,
    [SYMBOLS.HIGH]: 10,
    [SYMBOLS.WILD]: 5
};

// Payouts (multiplier of bet for 3, 4, 5 matches)
const PAYTABLE = {
    [SYMBOLS.LOW_A]: [1, 2, 5],
    [SYMBOLS.LOW_B]: [1, 2, 5],
    [SYMBOLS.LOW_C]: [1, 2, 5],
    [SYMBOLS.MID_A]: [2, 5, 10],
    [SYMBOLS.MID_B]: [2, 5, 10],
    [SYMBOLS.HIGH]: [5, 10, 25],
    [SYMBOLS.WILD]: [10, 25, 100]
};

// 10 Paylines for 5x3 grid (format: [row positions for reels 0-4])
const PAYLINES = [
    [1, 1, 1, 1, 1], // Middle line
    [0, 0, 0, 0, 0], // Top line
    [2, 2, 2, 2, 2], // Bottom line
    [0, 1, 2, 1, 0], // V shape
    [2, 1, 0, 1, 2], // Inverted V
    [0, 0, 1, 2, 2], // Diagonal down
    [2, 2, 1, 0, 0], // Diagonal up
    [1, 0, 1, 2, 1], // W shape
    [1, 2, 1, 0, 1], // M shape
    [0, 1, 1, 1, 0]  // Wave
];

// ============================================
// PLINKO CONFIGURATION
// ============================================

const PLINKO_CONFIG = {
    rows: 8,
    pockets: [
        { type: 'BONUS', award: 'bonus', label: 'BONUS' },      // 0 - Far left
        { type: 'SPINS', award: 5, label: '5 SPINS' },          // 1
        { type: 'SPINS', award: 3, label: '3 SPINS' },          // 2
        { type: 'SPINS', award: 2, label: '2 SPINS' },          // 3
        { type: 'SPINS', award: 1, label: '1 SPIN' },           // 4 - Center
        { type: 'SPINS', award: 2, label: '2 SPINS' },          // 5
        { type: 'SPINS', award: 3, label: '3 SPINS' },          // 6
        { type: 'SPINS', award: 5, label: '5 SPINS' },          // 7
        { type: 'BONUS', award: 'bonus', label: 'BONUS' }       // 8 - Far right
    ]
};

// ============================================
// CANVAS & PLINKO PHYSICS
// ============================================

let canvas, ctx;
let canvasWidth, canvasHeight;
let pegs = [];
let balls = [];
let pocketZones = [];

class Ball {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 3; // Initial horizontal velocity
        this.vy = 0.5; // Small initial downward velocity
        this.radius = 8;
        this.gravity = 0.3; // Slightly reduced gravity for more peg interaction
        this.bounce = 0.7; // Increased bounce for better physics
        this.landed = false;
        this.landedPocket = -1;
    }

    update() {
        if (this.landed) return;

        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;

        // Friction
        this.vx *= 0.98;

        // Check collision with pegs
        for (let peg of pegs) {
            const dx = this.x - peg.x;
            const dy = this.y - peg.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.radius + peg.radius) {
                // Bounce off peg
                const angle = Math.atan2(dy, dx);
                const overlap = (this.radius + peg.radius) - dist;
                
                // Push ball out of peg
                this.x = peg.x + Math.cos(angle) * (this.radius + peg.radius + 1);
                this.y = peg.y + Math.sin(angle) * (this.radius + peg.radius + 1);
                
                // Calculate bounce with randomness
                const bounceAngle = angle + (Math.random() - 0.5) * 0.6;
                const speed = Math.max(2, Math.sqrt(this.vx * this.vx + this.vy * this.vy) * this.bounce);
                this.vx = Math.cos(bounceAngle) * speed;
                this.vy = Math.abs(Math.sin(bounceAngle) * speed); // Ensure downward movement
            }
        }

        // Check collision with wall blockers (positioned to guide toward edges)
        if (gameState.modifiers.leftWall) {
            // Left wall blocks center-left, guides toward LEFT BONUS (far left)
            const wallX = canvasWidth * 0.4; // More centered
            if (this.x > wallX - 15 && this.x < wallX + 15 && this.y > 100) {
                this.vx -= 1.5; // Push left toward bonus
            }
        }
        if (gameState.modifiers.rightWall) {
            // Right wall blocks center-right, guides toward RIGHT BONUS (far right)
            const wallX = canvasWidth * 0.6; // More centered
            if (this.x > wallX - 15 && this.x < wallX + 15 && this.y > 100) {
                this.vx += 1.5; // Push right toward bonus
            }
        }

        // Check if landed in pocket
        if (this.y >= canvasHeight - 40) {
            for (let i = 0; i < pocketZones.length; i++) {
                if (this.x >= pocketZones[i].x && this.x <= pocketZones[i].x + pocketZones[i].width) {
                    this.landed = true;
                    this.landedPocket = i;
                    this.y = canvasHeight - 25;
                    this.vx = 0;
                    this.vy = 0;
                    resolvePocket(i);
                    break;
                }
            }
        }

        // Boundaries
        if (this.x < this.radius) {
            this.x = this.radius;
            this.vx *= -0.5;
        }
        if (this.x > canvasWidth - this.radius) {
            this.x = canvasWidth - this.radius;
            this.vx *= -0.5;
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#4ecca3';
        ctx.fill();
        ctx.strokeStyle = '#44c793';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Glow effect
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#4ecca3';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

// ============================================
// INITIALIZATION
// ============================================

function initGame() {
    canvas = document.getElementById('plinkoCanvas');
    ctx = canvas.getContext('2d');
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    setupPegs();
    setupPockets();
    setupControls();
    updateUI();
    
    // Start animation loop
    requestAnimationFrame(animate);
}

function resizeCanvas() {
    const container = canvas.parentElement;
    canvasWidth = container.clientWidth;
    canvasHeight = canvas.offsetHeight;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    setupPegs();
    setupPockets();
}

function setupPegs() {
    pegs = [];
    const rows = PLINKO_CONFIG.rows;
    const spacing = canvasWidth / (rows + 2);
    const verticalSpacing = (canvasHeight - 80) / rows;
    
    for (let row = 0; row < rows; row++) {
        const pegsInRow = row + 3;
        const rowWidth = (pegsInRow - 1) * spacing;
        const startX = (canvasWidth - rowWidth) / 2;
        
        for (let col = 0; col < pegsInRow; col++) {
            pegs.push({
                x: startX + col * spacing,
                y: 60 + row * verticalSpacing,
                radius: 4
            });
        }
    }
}

function setupPockets() {
    pocketZones = [];
    const numPockets = PLINKO_CONFIG.pockets.length;
    const pocketWidth = canvasWidth / numPockets;
    
    for (let i = 0; i < numPockets; i++) {
        pocketZones.push({
            x: i * pocketWidth,
            width: pocketWidth
        });
    }
}

function setupControls() {
    // Drop button
    document.getElementById('dropButton').addEventListener('click', dropBall);
    
    // Bet buttons
    document.querySelectorAll('.bet-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            if (gameState.isDropping || gameState.isSpinning) return;
            
            document.querySelectorAll('.bet-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            gameState.currentBet = parseFloat(this.dataset.bet);
        });
    });
}

// ============================================
// GAME LOOP & RENDERING
// ============================================

function animate() {
    drawPlinko();
    
    // Update and draw balls
    for (let ball of balls) {
        ball.update();
        ball.draw();
    }
    
    // Remove landed balls after delay
    balls = balls.filter(ball => !ball.landed || Date.now() - ball.landTime < 500);
    
    requestAnimationFrame(animate);
}

function drawPlinko() {
    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw pegs
    for (let peg of pegs) {
        ctx.beginPath();
        ctx.arc(peg.x, peg.y, peg.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#533483';
        ctx.fill();
        ctx.strokeStyle = '#7e22ce';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    
    // Draw pocket dividers
    ctx.strokeStyle = '#e94560';
    ctx.lineWidth = 2;
    for (let i = 1; i < pocketZones.length; i++) {
        ctx.beginPath();
        ctx.moveTo(pocketZones[i].x, canvasHeight - 40);
        ctx.lineTo(pocketZones[i].x, canvasHeight);
        ctx.stroke();
    }
    
    // Draw pocket highlights for bonus
    for (let i = 0; i < pocketZones.length; i++) {
        if (PLINKO_CONFIG.pockets[i].type === 'BONUS') {
            ctx.fillStyle = 'rgba(233, 69, 96, 0.2)';
            ctx.fillRect(pocketZones[i].x, canvasHeight - 40, pocketZones[i].width, 40);
        }
    }

    // Draw wall blockers (angled to guide toward edges)
    if (gameState.modifiers.leftWall) {
        const wallX = canvasWidth * 0.4;
        ctx.strokeStyle = '#4ecca3';
        ctx.lineWidth = 8;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#4ecca3';
        ctx.beginPath();
        ctx.moveTo(wallX + 10, 100);
        ctx.lineTo(wallX - 50, canvasHeight - 60);
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // Arrow indicators pointing left
        ctx.fillStyle = '#4ecca3';
        ctx.font = 'bold 28px Arial';
        ctx.fillText('◄', wallX - 60, canvasHeight / 2 - 20);
        ctx.fillText('◄', wallX - 45, canvasHeight / 2 + 20);
    }
    if (gameState.modifiers.rightWall) {
        const wallX = canvasWidth * 0.6;
        ctx.strokeStyle = '#4ecca3';
        ctx.lineWidth = 8;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#4ecca3';
        ctx.beginPath();
        ctx.moveTo(wallX - 10, 100);
        ctx.lineTo(wallX + 50, canvasHeight - 60);
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // Arrow indicators pointing right
        ctx.fillStyle = '#4ecca3';
        ctx.font = 'bold 28px Arial';
        ctx.fillText('►', wallX + 30, canvasHeight / 2 - 20);
        ctx.fillText('►', wallX + 45, canvasHeight / 2 + 20);
    }
}

// ============================================
// PLINKO LOGIC
// ============================================

function dropBall() {
    if (gameState.isDropping || gameState.isSpinning) return;
    if (gameState.balance < gameState.currentBet) {
        updateStatus('Insufficient balance!');
        return;
    }
    
    // Deduct bet
    gameState.balance -= gameState.currentBet;
    updateUI();
    
    gameState.isDropping = true;
    
    // Determine number of balls
    const numBalls = gameState.modifiers.extraBalls + 1;
    if (numBalls > 1) {
        updateStatus(`Dropping ${numBalls} BALLS! 🎱`);
    } else {
        updateStatus('Ball dropping...');
    }
    
    // Create balls at top center with spacing
    for (let i = 0; i < numBalls; i++) {
        const startX = canvasWidth / 2 + (i - (numBalls - 1) / 2) * 40;
        const ball = new Ball(startX, 20 + i * 20);
        balls.push(ball);
    }
    
    // Reset multi-ball modifier after use
    gameState.modifiers.extraBalls = 0;
    
    // Disable drop button
    document.getElementById('dropButton').disabled = true;
}

function resolvePocket(pocketIndex) {
    const pocket = PLINKO_CONFIG.pockets[pocketIndex];
    
    // Clear walls after ball lands (they were used this turn)
    gameState.modifiers.leftWall = false;
    gameState.modifiers.rightWall = false;
    
    setTimeout(() => {
        if (pocket.type === 'BONUS') {
            updateStatus(`🎰 BONUS TRIGGERED! 🎰`);
            gameState.inBonus = true;
            gameState.spinsRemaining = 5; // Give 5 bonus spins
            document.getElementById('bonusBanner').style.display = 'block';
        } else if (pocket.award > 0) {
            updateStatus(`Awarded ${pocket.award} spin${pocket.award > 1 ? 's' : ''}!`);
            gameState.spinsRemaining = pocket.award;
        } else {
            updateStatus('No award this time.');
        }
        
        gameState.isDropping = false;
        
        // Show spins remaining
        if (gameState.spinsRemaining > 0) {
            document.getElementById('spinsRemaining').style.display = 'block';
            document.getElementById('spinsCount').textContent = gameState.spinsRemaining;
            
            // Start spinning reels
            setTimeout(() => {
                triggerReels();
            }, 1000);
        } else {
            // No spins awarded, allow next drop
            setTimeout(() => {
                updateStatus('Press DROP BALL to continue!');
                document.getElementById('dropButton').disabled = false;
            }, 2000);
        }
    }, 500);
}

// ============================================
// REELS LOGIC
// ============================================

function triggerReels() {
    if (gameState.spinsRemaining <= 0) {
        endReelSession();
        return;
    }
    
    gameState.isSpinning = true;
    updateStatus('Spinning reels...');
    
    spinReels();
}

function spinReels() {
    const reelElements = document.querySelectorAll('.reel');
    const spinDuration = 2000;
    const symbolArray = Object.values(SYMBOLS);
    
    // Add spinning class
    reelElements.forEach((reel, reelIndex) => {
        const symbols = reel.querySelectorAll('.symbol');
        symbols.forEach(symbol => {
            symbol.classList.add('spinning');
            
            // Rapid symbol changes during spin
            const interval = setInterval(() => {
                symbol.textContent = symbolArray[Math.floor(Math.random() * symbolArray.length)];
            }, 100);
            
            setTimeout(() => {
                clearInterval(interval);
                symbol.classList.remove('spinning');
            }, spinDuration);
        });
    });
    
    // Stop and evaluate
    setTimeout(() => {
        stopReels();
    }, spinDuration);
}

function stopReels() {
    // Generate final reel positions
    const reelResults = [];
    for (let reel = 0; reel < 5; reel++) {
        const reelStrip = generateWeightedReelStrip();
        reelResults.push([reelStrip[0], reelStrip[1], reelStrip[2]]);
    }
    
    // Display results
    const reelElements = document.querySelectorAll('.reel');
    reelElements.forEach((reel, reelIndex) => {
        const symbols = reel.querySelectorAll('.symbol');
        symbols.forEach((symbol, rowIndex) => {
            symbol.textContent = reelResults[reelIndex][rowIndex];
        });
    });
    
    // Evaluate paylines
    setTimeout(() => {
        evaluatePaylines(reelResults);
    }, 500);
}

function generateWeightedReelStrip() {
    const strip = [];
    const symbolArray = [];
    
    // Build weighted array
    for (let symbol in SYMBOL_WEIGHTS) {
        for (let i = 0; i < SYMBOL_WEIGHTS[symbol]; i++) {
            symbolArray.push(symbol);
        }
    }
    
    // Pick random symbols
    for (let i = 0; i < 3; i++) {
        strip.push(symbolArray[Math.floor(Math.random() * symbolArray.length)]);
    }
    
    return strip;
}

function evaluatePaylines(reelResults) {
    let totalWin = 0;
    const winningPositions = new Set();
    
    for (let payline of PAYLINES) {
        const symbols = payline.map((row, reel) => reelResults[reel][row]);
        const win = checkPayline(symbols);
        
        if (win.amount > 0) {
            totalWin += win.amount;
            // Mark winning positions
            for (let i = 0; i < win.count; i++) {
                winningPositions.add(`${i}-${payline[i]}`);
            }
        }
    }
    
    // Apply bonus multiplier
    if (gameState.inBonus) {
        totalWin *= 2;
    }
    
    // Check for Plinko modifiers from reel results
    checkForModifiers(reelResults);
    
    // Show win
    if (totalWin > 0) {
        const winAmount = totalWin * gameState.currentBet;
        gameState.balance += winAmount;
        
        // Highlight winning symbols
        highlightWinningSymbols(winningPositions);
        
        updateStatus(`WIN! £${winAmount.toFixed(2)}`);
        document.getElementById('winDisplay').style.display = 'block';
        document.getElementById('winAmount').textContent = winAmount.toFixed(2);
        
        setTimeout(() => {
            document.getElementById('winDisplay').style.display = 'none';
            continueReelSession();
        }, 2000);
    } else {
        updateStatus('No win. Next spin...');
        setTimeout(() => {
            continueReelSession();
        }, 1500);
    }
    
    updateUI();
}

function checkPayline(symbols) {
    // Replace wildcards
    const firstNonWild = symbols.find(s => s !== SYMBOLS.WILD);
    if (!firstNonWild) {
        // All wilds
        return { amount: PAYTABLE[SYMBOLS.WILD][2], count: 5 };
    }
    
    let count = 0;
    for (let symbol of symbols) {
        if (symbol === firstNonWild || symbol === SYMBOLS.WILD) {
            count++;
        } else {
            break;
        }
    }
    
    if (count >= 3) {
        const payIndex = count - 3; // 3=0, 4=1, 5=2
        const payout = PAYTABLE[firstNonWild][payIndex];
        return { amount: payout, count };
    }
    
    return { amount: 0, count: 0 };
}

function highlightWinningSymbols(positions) {
    // Clear previous highlights
    document.querySelectorAll('.symbol').forEach(s => s.classList.remove('winning'));
    
    // Add winning class
    positions.forEach(pos => {
        const [reel, row] = pos.split('-').map(Number);
        const reelElement = document.querySelector(`.reel[data-reel="${reel}"]`);
        const symbolElement = reelElement.querySelector(`.symbol[data-row="${row}"]`);
        symbolElement.classList.add('winning');
    });
}

function checkForModifiers(reelResults) {
    // Check middle row for special combinations
    const middleRow = reelResults.map(reel => reel[1]);
    
    // 💎💎💎 = Left wall blocker
    if (middleRow.filter(s => s === SYMBOLS.MID_A).length >= 3) {
        gameState.modifiers.leftWall = true;
        showModifierAlert('💎 LEFT WALL ACTIVE! Guides toward LEFT BONUS!');
    }
    
    // ⭐⭐⭐ = Right wall blocker
    if (middleRow.filter(s => s === SYMBOLS.MID_B).length >= 3) {
        gameState.modifiers.rightWall = true;
        showModifierAlert('⭐ RIGHT WALL ACTIVE! Guides toward RIGHT BONUS!');
    }
    
    // 🎰🎰🎰 = 3 balls next drop
    if (middleRow.filter(s => s === SYMBOLS.WILD).length >= 3) {
        gameState.modifiers.extraBalls = 2;
        showModifierAlert('🎰 TRIPLE BALL DROP UNLOCKED! 3 balls next turn!');
    }
    
    // 👑👑👑 = 2 balls next drop
    if (middleRow.filter(s => s === SYMBOLS.HIGH).length >= 3) {
        gameState.modifiers.extraBalls = Math.max(gameState.modifiers.extraBalls, 1);
        showModifierAlert('👑 DOUBLE BALL DROP UNLOCKED! 2 balls next turn!');
    }
}

function showModifierAlert(message) {
    const alert = document.createElement('div');
    alert.className = 'modifier-alert';
    alert.textContent = message;
    document.body.appendChild(alert);
    
    setTimeout(() => {
        alert.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        alert.classList.remove('show');
        setTimeout(() => alert.remove(), 300);
    }, 3000);
}

function continueReelSession() {
    gameState.spinsRemaining--;
    document.getElementById('spinsCount').textContent = gameState.spinsRemaining;
    
    if (gameState.spinsRemaining > 0) {
        setTimeout(() => {
            triggerReels();
        }, 1000);
    } else {
        endReelSession();
    }
}

function endReelSession() {
    gameState.isSpinning = false;
    gameState.inBonus = false;
    
    // Hide bonus banner and spins display
    document.getElementById('bonusBanner').style.display = 'none';
    document.getElementById('spinsRemaining').style.display = 'none';
    
    // Clear winning highlights
    document.querySelectorAll('.symbol').forEach(s => s.classList.remove('winning'));
    
    updateStatus('Press DROP BALL to continue!');
    document.getElementById('dropButton').disabled = false;
}

// ============================================
// UI UPDATES
// ============================================

function updateUI() {
    document.getElementById('balance').textContent = gameState.balance.toFixed(2);
    updateModifierDisplay();
}

function updateModifierDisplay() {
    const container = document.getElementById('modifierDisplay');
    container.innerHTML = '';
    
    if (gameState.modifiers.leftWall) {
        const badge = document.createElement('div');
        badge.className = 'modifier-badge';
        badge.innerHTML = '💎 LEFT WALL';
        container.appendChild(badge);
    }
    
    if (gameState.modifiers.rightWall) {
        const badge = document.createElement('div');
        badge.className = 'modifier-badge';
        badge.innerHTML = '⭐ RIGHT WALL';
        container.appendChild(badge);
    }
    
    if (gameState.modifiers.extraBalls > 0) {
        const badge = document.createElement('div');
        badge.className = 'modifier-badge extra-balls';
        const balls = gameState.modifiers.extraBalls === 1 ? '2 BALLS' : '3 BALLS';
        badge.innerHTML = `🎱 ${balls}`;
        container.appendChild(badge);
    }
}

function updateStatus(message) {
    document.getElementById('statusMessage').textContent = message;
}

// ============================================
// START GAME
// ============================================

window.addEventListener('DOMContentLoaded', initGame);
