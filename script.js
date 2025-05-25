const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const mainMenu = document.getElementById('mainMenu');
const gameUI = document.getElementById('gameUI');
const shop = document.getElementById('shop');
const pauseMenu = document.getElementById('pauseMenu');
const moneyDisplay = document.getElementById('moneyDisplay');
const openShopBtn = document.getElementById('openShop');
const closeShopBtn = document.getElementById('closeShop');
const saveGameBtn = document.getElementById('saveGame');
const continueGameBtn = document.getElementById('continueGame');
const saveGamePausedBtn = document.getElementById('saveGamePaused');
const returnToMenuBtn = document.getElementById('returnToMenu');

// Pause state
let isPaused = false;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const initialPlayerRadiusGameUnits = 20;
const initialPlayerSizeNm = 100;
const nmPerGameRadiusUnit = initialPlayerSizeNm / initialPlayerRadiusGameUnits;

// Chunk System for Infinite World
const chunkSize = 2000; // Size of each chunk
const renderDistance = 2; // Number of chunks to render in each direction
const entityLimit = {
    food: 300, // Maximum food entities to maintain
    enemies: 15 // Maximum enemy entities to maintain
};

// Game configuration
let baseMaxLevel = 10;

function updateMaxLevels(score) {
    const newMaxLevel = baseMaxLevel + (Math.floor(score / 500) * 5);
    upgradeConfigs.speed.maxLevel = newMaxLevel;
    upgradeConfigs.moneyBonus.maxLevel = newMaxLevel;
    upgradeConfigs.absorption.maxLevel = newMaxLevel;
    upgradeConfigs.stamina.maxLevel = newMaxLevel;
}

const upgradeConfigs = {
    speed: {
        basePrice: 100,
        priceMultiplier: 1.5,
        effect: 0.2,
        maxLevel: baseMaxLevel
    },
    moneyBonus: {
        basePrice: 150,
        priceMultiplier: 1.8,
        effect: 0.25,
        maxLevel: baseMaxLevel
    },
    absorption: {
        basePrice: 200,
        priceMultiplier: 2,
        effect: 0.15,
        maxLevel: baseMaxLevel
    },
    stamina: {
        basePrice: 175,
        priceMultiplier: 1.7,
        effect: 0.2,
        maxLevel: baseMaxLevel
    }
};

let gameState = "menu";
let currentSlot = null;

let player = {
    x: 0,
    y: 0,
    radius: initialPlayerRadiusGameUnits,
    color: 'blue',
    speed: 5,
    name: "Player",
    score: 0,
    money: 0,
    energy: 100,
    maxEnergy: 100,
    energyRegen: 0.5,
    boost: false,
    upgrades: {
        speed: 1,
        moneyBonus: 1,
        absorption: 1,
        stamina: 1
    }
};

let camera = {
    x: player.x,
    y: player.y,
    zoom: 1
};

const food = new Map();
const enemies = new Map();

const sizeUnits = [
    { name: 'nm', factor: 1 },
    { name: 'µm', factor: 1e3 },
    { name: 'mm', factor: 1e6 },
    { name: 'cm', factor: 1e7 },
    { name: 'm', factor: 1e9 },
    { name: 'km', factor: 1e12 },
    { name: 'Mm', factor: 1e15 },
    { name: 'Gm', factor: 1e18 },
    { name: 'AU', factor: 1.496e20 },
    { name: 'pc', factor: 3.086e25 },
    { name: 'kpc', factor: 3.086e28 },
    { name: 'Mpc', factor: 3.086e31 },
    { name: 'Gpc', factor: 3.086e34 }
];

// Save/Load System
function saveGame(slot) {
    const saveData = {
        player: player,
        timestamp: Date.now()
    };
    localStorage.setItem(`cell_eater_save_${slot}`, JSON.stringify(saveData));
    updateSlotInfo();
}

function loadGame(slot) {
    const saveData = localStorage.getItem(`cell_eater_save_${slot}`);
    if (saveData) {
        const data = JSON.parse(saveData);
        player = data.player;
        currentSlot = slot;
        startGame();
    }
}

function updateSlotInfo() {
    document.querySelectorAll('.slot').forEach(slot => {
        const slotNum = slot.dataset.slot;
        const saveData = localStorage.getItem(`cell_eater_save_${slotNum}`);
        const infoDiv = slot.querySelector('.slot-info');
        
        if (saveData) {
            const data = JSON.parse(saveData);
            const date = new Date(data.timestamp);
            infoDiv.textContent = `Money: $${Math.floor(data.player.money)} - ${date.toLocaleDateString()}`;
        } else {
            infoDiv.textContent = 'Empty';
        }
    });
}

// Shop System
function calculateUpgradeCost(type) {
    const config = upgradeConfigs[type];
    const currentLevel = player.upgrades[type];
    if (currentLevel >= config.maxLevel) return Infinity;
    return Math.floor(config.basePrice * Math.pow(config.priceMultiplier, currentLevel - 1));
}

function updateShopUI() {
    moneyDisplay.textContent = `Money: $${Math.floor(player.money)}`;
    
    document.querySelectorAll('.upgrade').forEach(upgradeElem => {
        const type = upgradeElem.dataset.upgrade;
        const currentLevel = player.upgrades[type];
        const cost = calculateUpgradeCost(type);
        
        upgradeElem.querySelector('.upgrade-level').textContent = `Level: ${currentLevel}`;
        upgradeElem.querySelector('.upgrade-cost').textContent = 
            currentLevel >= upgradeConfigs[type].maxLevel ? 'MAXED' : `Cost: $${cost}`;
        
        const buyBtn = upgradeElem.querySelector('.buy-btn');
        buyBtn.disabled = player.money < cost || currentLevel >= upgradeConfigs[type].maxLevel;
    });
}

function purchaseUpgrade(type) {
    const cost = calculateUpgradeCost(type);
    if (player.money >= cost && player.upgrades[type] < upgradeConfigs[type].maxLevel) {
        player.money -= cost;
        player.upgrades[type]++;
        updateShopUI();
    }
}

// Helper function to generate random enemy size based on player size
function getRandomEnemyRadius() {
    const minRadius = 15;
    const maxRadius = player.radius * 1.5;
    return minRadius + Math.random() * (maxRadius - minRadius);
}

// Chunk Management
function getChunkKey(x, y) {
    const chunkX = Math.floor(x / chunkSize);
    const chunkY = Math.floor(y / chunkSize);
    return `${chunkX},${chunkY}`;
}

function getChunkBounds(chunkKey) {
    const [chunkX, chunkY] = chunkKey.split(',').map(Number);
    return {
        minX: chunkX * chunkSize,
        maxX: (chunkX + 1) * chunkSize,
        minY: chunkY * chunkSize,
        maxY: (chunkY + 1) * chunkSize
    };
}

function getVisibleChunks() {
    const centerChunkX = Math.floor(player.x / chunkSize);
    const centerChunkY = Math.floor(player.y / chunkSize);
    const chunks = new Set();

    for (let dx = -renderDistance; dx <= renderDistance; dx++) {
        for (let dy = -renderDistance; dy <= renderDistance; dy++) {
            chunks.add(`${centerChunkX + dx},${centerChunkY + dy}`);
        }
    }
    return chunks;
}

function generateEntitiesForChunk(chunkKey) {
    if (!food.has(chunkKey)) {
        food.set(chunkKey, []);
    }
    if (!enemies.has(chunkKey)) {
        enemies.set(chunkKey, []);
    }

    const bounds = getChunkBounds(chunkKey);
    const chunkFood = food.get(chunkKey);
    const chunkEnemies = enemies.get(chunkKey);

    // Generate food
    const foodToGenerate = Math.max(0, Math.floor(entityLimit.food / Math.pow((2 * renderDistance + 1), 2)) - chunkFood.length);
    for (let i = 0; i < foodToGenerate; i++) {
        chunkFood.push({
            x: bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
            y: bounds.minY + Math.random() * (bounds.maxY - bounds.minY),
            radius: 7,
            color: `hsl(${Math.random() * 360}, 100%, 50%)`
        });
    }

    // Generate enemies
    const enemiesToGenerate = Math.max(0, Math.ceil(entityLimit.enemies / Math.pow((2 * renderDistance + 1), 2)) - chunkEnemies.length);
    for (let i = 0; i < enemiesToGenerate; i++) {
        const radius = getRandomEnemyRadius();
        chunkEnemies.push({
            x: bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
            y: bounds.minY + Math.random() * (bounds.maxY - bounds.minY),
            radius: radius,
            color: `hsl(${Math.random() * 360}, 60%, 50%)`,
            speed: 2.5 * (15 / radius) * (0.8 + Math.random() * 0.4),
            targetX: bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
            targetY: bounds.minY + Math.random() * (bounds.maxY - bounds.minY),
            name: "Bot",
            id: Math.random().toString(36).substr(2, 9),
            behavior: 'wandering'
        });
    }
}

function cleanupChunks() {
    const visibleChunks = getVisibleChunks();
    for (const chunkKey of food.keys()) {
        if (!visibleChunks.has(chunkKey)) {
            food.delete(chunkKey);
            enemies.delete(chunkKey);
        }
    }
}

// Drawing Functions
function drawPlayer() {
    ctx.fillStyle = 'black';
    const fontSize = Math.max(10 / camera.zoom, player.radius / (2 * camera.zoom));
    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(player.name, player.x, player.y - player.radius - (5 / camera.zoom));

    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fillStyle = player.color;
    ctx.fill();
    ctx.closePath();
}

function drawEntities() {
    const visibleChunks = getVisibleChunks();
    
    for (const chunkKey of visibleChunks) {
        if (!food.has(chunkKey) || !enemies.has(chunkKey)) {
            generateEntitiesForChunk(chunkKey);
        }
        
        const chunkFood = food.get(chunkKey);
        chunkFood.forEach(f => {
            const screenX = (f.x - camera.x) * camera.zoom + canvas.width / 2;
            const screenY = (f.y - camera.y) * camera.zoom + canvas.height / 2;
            const screenSize = f.radius * camera.zoom;

            if (screenX + screenSize > 0 && screenX - screenSize < canvas.width &&
                screenY + screenSize > 0 && screenY - screenSize < canvas.height) {
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
                ctx.fillStyle = f.color;
                ctx.fill();
                ctx.closePath();
            }
        });

        const chunkEnemies = enemies.get(chunkKey);
        chunkEnemies.forEach(enemy => {
            const screenX = (enemy.x - camera.x) * camera.zoom + canvas.width / 2;
            const screenY = (enemy.y - camera.y) * camera.zoom + canvas.height / 2;
            if (screenX > -100 && screenX < canvas.width + 100 &&
                screenY > -100 && screenY < canvas.height + 100) {
                
                // Draw behavior indicator text
                const fontSize = Math.max(8 / camera.zoom, enemy.radius / (2.5 * camera.zoom));
                ctx.font = `${fontSize}px Arial`;
                ctx.textAlign = 'center';
                
                // Color-code behavior text
                let behaviorColor = 'darkred';
                let behaviorText = enemy.name;
                if (enemy.behavior) {
                    switch (enemy.behavior) {
                        case 'fleeing':
                            behaviorColor = '#ffaa00'; // Orange for fleeing
                            behaviorText = '⚠️ ' + enemy.name;
                            break;
                        case 'hunting':
                            behaviorColor = '#ff4444'; // Red for hunting
                            behaviorText = '🎯 ' + enemy.name;
                            break;
                        case 'foraging':
                            behaviorColor = '#44ff44'; // Green for foraging
                            behaviorText = '🍃 ' + enemy.name;
                            break;
                        case 'patrolling':
                            behaviorColor = '#4444ff'; // Blue for patrolling
                            behaviorText = '👁️ ' + enemy.name;
                            break;
                        default:
                            behaviorColor = 'darkred';
                            behaviorText = enemy.name;
                    }
                }
                
                ctx.fillStyle = behaviorColor;
                ctx.fillText(behaviorText, enemy.x, enemy.y - enemy.radius - (4 / camera.zoom));
                ctx.fillText(Math.round(enemy.radius), enemy.x, enemy.y + fontSize / 3);

                // Draw main enemy body
                ctx.beginPath();
                ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
                ctx.fillStyle = enemy.color;
                ctx.fill();
                
                // Add behavior-based border
                if (enemy.behavior && enemy.behavior !== 'wandering') {
                    ctx.strokeStyle = behaviorColor;
                    ctx.lineWidth = Math.max(1, enemy.radius / 10);
                    ctx.stroke();
                }
                
                ctx.closePath();
            }
        });
    }
}

function drawScore() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.font = '24px Arial Black';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${player.score}`, 15, 35);
    ctx.fillText(`Money: $${Math.floor(player.money)}`, 15, 65);
    
    // Draw energy bar
    const energyBarWidth = 150;
    const energyBarHeight = 15;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(15, 75, energyBarWidth, energyBarHeight);
    ctx.fillStyle = player.energy > 30 ? 'rgba(0, 255, 0, 0.7)' : 'rgba(255, 0, 0, 0.7)';
    ctx.fillRect(15, 75, (player.energy / player.maxEnergy) * energyBarWidth, energyBarHeight);
    ctx.restore();
}

function drawPlayerSizeInfo() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.font = '18px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Size: ${formatPlayerSize()}`, 15, 95);
    ctx.restore();
}

function drawGameOver() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'white';
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over!', canvas.width / 2, canvas.height / 2 - 60);

    ctx.font = '30px Arial';
    ctx.fillText(`Final Score: ${player.score}`, canvas.width / 2, canvas.height / 2);
    ctx.fillText(`Final Size: ${formatPlayerSize()}`, canvas.width / 2, canvas.height / 2 + 40);
    ctx.fillText(`Money Earned: $${Math.floor(player.money)}`, canvas.width / 2, canvas.height / 2 + 80);

    ctx.font = '22px Arial';
    ctx.fillText('Click to Return to Menu', canvas.width / 2, canvas.height / 2 + 130);
    ctx.restore();
}

// Game Functions
function formatPlayerSize() {
    const currentSizeNm = player.radius * nmPerGameRadiusUnit;
    let displaySize = currentSizeNm;
    let displayUnit = 'nm';

    for (let i = sizeUnits.length - 1; i >= 0; i--) {
        if (currentSizeNm >= sizeUnits[i].factor) {
            displaySize = currentSizeNm / sizeUnits[i].factor;
            displayUnit = sizeUnits[i].name;
            break;
        }
    }
    if (displaySize < 0.01 && displayUnit === 'nm' && currentSizeNm > 0) {
        return `${currentSizeNm.toExponential(1)} nm`;
    }
    return `${displaySize.toFixed(2)} ${displayUnit}`;
}

function updateCamera() {
    camera.x += (player.x - camera.x) * 0.05;
    camera.y += (player.y - camera.y) * 0.05;
    const targetViewableRadii = 15;
    const desiredViewableWorldUnits = player.radius * targetViewableRadii;
    camera.zoom = Math.min(canvas.width, canvas.height) / Math.max(desiredViewableWorldUnits, 200);
    camera.zoom = Math.max(0.05, Math.min(camera.zoom, 1.5));
}

function getMouseWorldCoordinates(mouseX, mouseY) {
    const worldX = (mouseX - canvas.width / 2) / camera.zoom + camera.x;
    const worldY = (mouseY - canvas.height / 2) / camera.zoom + camera.y;
    return { x: worldX, y: worldY };
}

function updatePlayerEnergy() {
    if (!isPaused && gameState === "playing") {
        const energyRegenBonus = 1 + (player.upgrades.stamina - 1) * upgradeConfigs.stamina.effect;
        if (player.boost && player.energy > 0) {
            player.energy = Math.max(0, player.energy - 1);
        } else {
            player.energy = Math.min(player.maxEnergy, player.energy + player.energyRegen * energyRegenBonus);
        }
    }
}

function updatePlayerPosition(mouseX, mouseY) {
    if (isPaused) return;
    
    const worldMouse = getMouseWorldCoordinates(mouseX, mouseY);
    const dx = worldMouse.x - player.x;
    const dy = worldMouse.y - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const baseSpeed = player.speed * (1 + (player.upgrades.speed - 1) * upgradeConfigs.speed.effect);
    const speedReductionFactor = 0.015;
    const boostMultiplier = (player.boost && player.energy > 0) ? 1.5 : 1;
    const currentSpeed = (baseSpeed / (1 + speedReductionFactor * player.radius)) * boostMultiplier;

    if (distance > player.radius / 4) {
        player.x += (dx / distance) * currentSpeed;
        player.y += (dy / distance) * currentSpeed;
    }
}

function updateEntities() {
    if (isPaused) return;
    
    const visibleChunks = getVisibleChunks();
    for (const chunkKey of visibleChunks) {
        if (enemies.has(chunkKey)) {
            const chunkEnemies = enemies.get(chunkKey);
            chunkEnemies.forEach(enemy => {
                // Smart AI decision making - retarget occasionally or when reached destination
                if (Math.random() < 0.02 || Math.sqrt(Math.pow(enemy.targetX - enemy.x, 2) + Math.pow(enemy.targetY - enemy.y, 2)) < enemy.radius * 2) {
                    const bounds = getChunkBounds(chunkKey);
                    
                    // Find nearby entities for smart decision making
                    const nearbyEntities = [];
                    const detectionRange = Math.max(500, enemy.radius * 20);
                    
                    // Check player
                    const distToPlayer = Math.sqrt(Math.pow(player.x - enemy.x, 2) + Math.pow(player.y - enemy.y, 2));
                    if (distToPlayer < detectionRange) {
                        nearbyEntities.push({
                            type: 'player',
                            x: player.x,
                            y: player.y,
                            radius: player.radius,
                            distance: distToPlayer,
                            threat: player.radius > enemy.radius * 1.1,
                            prey: enemy.radius > player.radius * 1.1
                        });
                    }
                    
                    // Check other enemies in visible chunks
                    for (const otherChunkKey of visibleChunks) {
                        if (enemies.has(otherChunkKey)) {
                            const otherEnemies = enemies.get(otherChunkKey);
                            otherEnemies.forEach(otherEnemy => {
                                if (otherEnemy.id !== enemy.id) {
                                    const distToOther = Math.sqrt(Math.pow(otherEnemy.x - enemy.x, 2) + Math.pow(otherEnemy.y - enemy.y, 2));
                                    if (distToOther < detectionRange) {
                                        nearbyEntities.push({
                                            type: 'enemy',
                                            x: otherEnemy.x,
                                            y: otherEnemy.y,
                                            radius: otherEnemy.radius,
                                            distance: distToOther,
                                            threat: otherEnemy.radius > enemy.radius * 1.1,
                                            prey: enemy.radius > otherEnemy.radius * 1.1
                                        });
                                    }
                                }
                            });
                        }
                    }
                    
                    // Check food
                    const nearbyFood = [];
                    if (food.has(chunkKey)) {
                        const chunkFood = food.get(chunkKey);
                        chunkFood.forEach(f => {
                            const distToFood = Math.sqrt(Math.pow(f.x - enemy.x, 2) + Math.pow(f.y - enemy.y, 2));
                            if (distToFood < detectionRange) {
                                nearbyFood.push({
                                    x: f.x,
                                    y: f.y,
                                    distance: distToFood
                                });
                            }
                        });
                    }
                    
                    // Smart target selection
                    let targetSelected = false;
                    
                    // Priority 1: Flee from immediate threats
                    const immediateThreats = nearbyEntities.filter(e => e.threat && e.distance < enemy.radius * 8);
                    if (immediateThreats.length > 0) {
                        // Flee from the closest threat
                        const closestThreat = immediateThreats.reduce((closest, current) => 
                            current.distance < closest.distance ? current : closest
                        );
                        
                        // Calculate flee direction (opposite to threat)
                        const fleeAngle = Math.atan2(enemy.y - closestThreat.y, enemy.x - closestThreat.x);
                        const fleeDistance = enemy.radius * 15;
                        enemy.targetX = enemy.x + Math.cos(fleeAngle) * fleeDistance;
                        enemy.targetY = enemy.y + Math.sin(fleeAngle) * fleeDistance;
                        
                        // Keep within chunk bounds
                        enemy.targetX = Math.max(bounds.minX + 100, Math.min(bounds.maxX - 100, enemy.targetX));
                        enemy.targetY = Math.max(bounds.minY + 100, Math.min(bounds.maxY - 100, enemy.targetY));
                        
                        enemy.behavior = 'fleeing';
                        targetSelected = true;
                    }
                    
                    // Priority 2: Hunt viable prey
                    if (!targetSelected) {
                        const viablePrey = nearbyEntities.filter(e => e.prey && e.distance < enemy.radius * 12);
                        if (viablePrey.length > 0) {
                            // Target the closest prey
                            const closestPrey = viablePrey.reduce((closest, current) => 
                                current.distance < closest.distance ? current : closest
                            );
                            
                            enemy.targetX = closestPrey.x;
                            enemy.targetY = closestPrey.y;
                            enemy.behavior = 'hunting';
                            targetSelected = true;
                        }
                    }
                    
                    // Priority 3: Seek food efficiently
                    if (!targetSelected && nearbyFood.length > 0) {
                        // Find closest food that's not too risky
                        const safeFood = nearbyFood.filter(f => {
                            // Check if any threats are closer to this food
                            const threatsNearFood = nearbyEntities.filter(e => e.threat).some(threat => {
                                const threatToFood = Math.sqrt(Math.pow(threat.x - f.x, 2) + Math.pow(threat.y - f.y, 2));
                                return threatToFood < f.distance;
                            });
                            return !threatsNearFood;
                        });
                        
                        if (safeFood.length > 0) {
                            const closestFood = safeFood.reduce((closest, current) => 
                                current.distance < closest.distance ? current : closest
                            );
                            
                            enemy.targetX = closestFood.x;
                            enemy.targetY = closestFood.y;
                            enemy.behavior = 'foraging';
                            targetSelected = true;
                        }
                    }
                    
                    // Priority 4: Patrol territory intelligently
                    if (!targetSelected) {
                        // Move to areas with fewer large threats
                        const safeZones = [];
                        for (let i = 0; i < 8; i++) {
                            const angle = (Math.PI * 2 * i) / 8;
                            const testX = enemy.x + Math.cos(angle) * enemy.radius * 10;
                            const testY = enemy.y + Math.sin(angle) * enemy.radius * 10;
                            
                            if (testX > bounds.minX + 100 && testX < bounds.maxX - 100 &&
                                testY > bounds.minY + 100 && testY < bounds.maxY - 100) {
                                
                                const dangerLevel = nearbyEntities.filter(e => e.threat).reduce((danger, threat) => {
                                    const distToTest = Math.sqrt(Math.pow(threat.x - testX, 2) + Math.pow(threat.y - testY, 2));
                                    return danger + (1000 / Math.max(distToTest, 50));
                                }, 0);
                                
                                safeZones.push({ x: testX, y: testY, danger: dangerLevel });
                            }
                        }
                        
                        if (safeZones.length > 0) {
                            const safestZone = safeZones.reduce((safest, current) => 
                                current.danger < safest.danger ? current : safest
                            );
                            
                            enemy.targetX = safestZone.x;
                            enemy.targetY = safestZone.y;
                            enemy.behavior = 'patrolling';
                        } else {
                            // Fallback to random movement
                            enemy.targetX = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
                            enemy.targetY = bounds.minY + Math.random() * (bounds.maxY - bounds.minY);
                            enemy.behavior = 'wandering';
                        }
                    }
                }

                // Movement with behavior-based speed modification
                const dx = enemy.targetX - enemy.x;
                const dy = enemy.targetY - enemy.y;
                const distanceToTarget = Math.sqrt(dx * dx + dy * dy);
                
                if (distanceToTarget > 1) {
                    let speedMultiplier = 1;
                    
                    // Adjust speed based on behavior
                    switch (enemy.behavior) {
                        case 'fleeing':
                            speedMultiplier = 1.5; // Faster when fleeing
                            break;
                        case 'hunting':
                            speedMultiplier = 1.3; // Faster when hunting
                            break;
                        case 'foraging':
                            speedMultiplier = 1.1; // Slightly faster when seeking food
                            break;
                        case 'patrolling':
                            speedMultiplier = 0.8; // Slower when patrolling
                            break;
                        default:
                            speedMultiplier = 0.7; // Slowest when wandering
                    }
                    
                    const moveSpeed = enemy.speed * speedMultiplier;
                    enemy.x += (dx / distanceToTarget) * moveSpeed;
                    enemy.y += (dy / distanceToTarget) * moveSpeed;
                }

                // Smart food consumption
                if (food.has(chunkKey)) {
                    const chunkFood = food.get(chunkKey);
                    for (let i = chunkFood.length - 1; i >= 0; i--) {
                        const f = chunkFood[i];
                        const distEF = Math.sqrt(Math.pow(enemy.x - f.x, 2) + Math.pow(enemy.y - f.y, 2));
                        
                        if (distEF < enemy.radius + f.radius) {
                            const foodArea = Math.PI * f.radius * f.radius;
                            const enemyArea = Math.PI * enemy.radius * enemy.radius;
                            enemy.radius = Math.sqrt((enemyArea + foodArea) / Math.PI);
                            chunkFood.splice(i, 1);
                            
                            // Spawn replacement food in a random visible chunk
                            const randomChunk = Array.from(visibleChunks)[Math.floor(Math.random() * visibleChunks.size)];
                            const bounds = getChunkBounds(randomChunk);
                            if (food.has(randomChunk)) {
                                food.get(randomChunk).push({
                                    x: bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
                                    y: bounds.minY + Math.random() * (bounds.maxY - bounds.minY),
                                    radius: 7,
                                    color: `hsl(${Math.random() * 360}, 100%, 50%)`
                                });
                            }
                        }
                    }
                }
            });
        }
    }
}

function checkCollisions() {
    if (isPaused) return;
    
    const visibleChunks = getVisibleChunks();
    
    for (const chunkKey of visibleChunks) {
        if (food.has(chunkKey)) {
            const chunkFood = food.get(chunkKey);
            for (let i = chunkFood.length - 1; i >= 0; i--) {
                const f = chunkFood[i];
                const dx = player.x - f.x;
                const dy = player.y - f.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < player.radius + f.radius) {
                    const absorptionBonus = 1 + (player.upgrades.absorption - 1) * upgradeConfigs.absorption.effect;
                    const foodArea = Math.PI * f.radius * f.radius * absorptionBonus;
                    const playerArea = Math.PI * player.radius * player.radius;
                    player.radius = Math.sqrt((playerArea + foodArea) / Math.PI);
                    const scoreGain = Math.round(f.radius * 2);
                    player.score += scoreGain;
                    updateMaxLevels(player.score);
                    chunkFood.splice(i, 1);
                    
                    const randomChunk = Array.from(visibleChunks)[Math.floor(Math.random() * visibleChunks.size)];
                    const bounds = getChunkBounds(randomChunk);
                    if (food.has(randomChunk)) {
                        food.get(randomChunk).push({
                            x: bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
                            y: bounds.minY + Math.random() * (bounds.maxY - bounds.minY),
                            radius: 7,
                            color: `hsl(${Math.random() * 360}, 100%, 50%)`
                        });
                    }
                }
            }
        }

        if (enemies.has(chunkKey)) {
            const chunkEnemies = enemies.get(chunkKey);
            
            // Bot vs Bot collisions
            for (let i = chunkEnemies.length - 1; i >= 0; i--) {
                for (let j = i - 1; j >= 0; j--) {
                    const bot1 = chunkEnemies[i];
                    const bot2 = chunkEnemies[j];
                    if (!bot1 || !bot2) continue;

                    const dx = bot1.x - bot2.x;
                    const dy = bot1.y - bot2.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < bot1.radius + bot2.radius) {
                        if (bot1.radius > bot2.radius * 1.1) {
                            const smallerArea = Math.PI * bot2.radius * bot2.radius;
                            const largerArea = Math.PI * bot1.radius * bot1.radius;
                            bot1.radius = Math.sqrt((largerArea + smallerArea) / Math.PI);
                            chunkEnemies.splice(j, 1);
                        } else if (bot2.radius > bot1.radius * 1.1) {
                            const smallerArea = Math.PI * bot1.radius * bot1.radius;
                            const largerArea = Math.PI * bot2.radius * bot2.radius;
                            bot2.radius = Math.sqrt((largerArea + smallerArea) / Math.PI);
                            chunkEnemies.splice(i, 1);
                            break;
                        }
                    }
                }
            }

            // Player vs Bot collisions
            for (let i = chunkEnemies.length - 1; i >= 0; i--) {
                const enemy = chunkEnemies[i];
                if (!enemy) continue;
                
                const dx = player.x - enemy.x;
                const dy = player.y - enemy.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < player.radius + enemy.radius) {
                    if (player.radius > enemy.radius * 1.1) {
                        const enemyArea = Math.PI * enemy.radius * enemy.radius;
                        const playerArea = Math.PI * player.radius * player.radius;
                        player.radius = Math.sqrt((playerArea + enemyArea) / Math.PI);
                        
                        const baseMoneyReward = 100 + Math.floor(enemy.radius * 10);
                        const moneyBonus = 1 + (player.upgrades.moneyBonus - 1) * upgradeConfigs.moneyBonus.effect;
                        player.money += baseMoneyReward * moneyBonus;
                        
                        const scoreGain = Math.round(enemy.radius * 10);
                        player.score += scoreGain;
                        updateMaxLevels(player.score);
                        chunkEnemies.splice(i, 1);
                        
                        const randomChunk = Array.from(visibleChunks)[Math.floor(Math.random() * visibleChunks.size)];
                        const bounds = getChunkBounds(randomChunk);
                        if (enemies.has(randomChunk)) {
                            const radius = getRandomEnemyRadius();
                            enemies.get(randomChunk).push({
                                x: bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
                                y: bounds.minY + Math.random() * (bounds.maxY - bounds.minY),
                                radius: radius,
                                color: `hsl(${Math.random() * 360}, 60%, 50%)`,
                                speed: 2.5 * (15 / radius) * (0.8 + Math.random() * 0.4),
                                targetX: bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
                                targetY: bounds.minY + Math.random() * (bounds.maxY - bounds.minY),
                                name: "Bot",
                                id: Math.random().toString(36).substr(2, 9),
                                behavior: 'wandering'
                            });
                        }
                    } else if (enemy.radius > player.radius * 1.1) {
                        if (currentSlot !== null) {
                            saveGame(currentSlot);
                        }
                        gameState = "gameOver";
                    }
                }
            }
        }
    }
}

function startGame() {
    gameState = "playing";
    mainMenu.classList.add('hidden');
    gameUI.classList.remove('hidden');
    shop.classList.add('hidden');

    food.clear();
    enemies.clear();

    const visibleChunks = getVisibleChunks();
    for (const chunk of visibleChunks) {
        generateEntitiesForChunk(chunk);
    }

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    gameLoop();
}

let mouseScreenX = canvas.width / 2;
let mouseScreenY = canvas.height / 2;
let animationFrameId;

// Event Listeners
window.addEventListener('mousemove', (event) => {
    if (gameState === "playing" && !isPaused) {
        mouseScreenX = event.clientX;
        mouseScreenY = event.clientY;
    }
});

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && gameState === "playing") {
        if (!isPaused) {
            isPaused = true;
            pauseMenu.classList.remove('hidden');
        } else {
            isPaused = false;
            pauseMenu.classList.add('hidden');
        }
    } else if (event.key.toLowerCase() === 'b') {
        player.boost = true;
    }
});

window.addEventListener('keyup', (event) => {
    if (event.key.toLowerCase() === 'b') {
        player.boost = false;
    }
});

window.addEventListener('click', (event) => {
    if (gameState === "gameOver") {
        gameState = "menu";
        mainMenu.classList.remove('hidden');
        gameUI.classList.add('hidden');
        updateSlotInfo();
    }
});

// Pause Menu Button Listeners
continueGameBtn.addEventListener('click', () => {
    isPaused = false;
    pauseMenu.classList.add('hidden');
});

saveGamePausedBtn.addEventListener('click', () => {
    if (currentSlot !== null) {
        saveGame(currentSlot);
    }
});

returnToMenuBtn.addEventListener('click', () => {
    isPaused = false;
    gameState = "menu";
    mainMenu.classList.remove('hidden');
    gameUI.classList.add('hidden');
    pauseMenu.classList.add('hidden');
    shop.classList.add('hidden');
    updateSlotInfo();
});

openShopBtn.addEventListener('click', () => {
    if (gameState === "playing") {
        gameState = "shop";
        shop.classList.remove('hidden');
        updateShopUI();
    }
});

closeShopBtn.addEventListener('click', () => {
    if (gameState === "shop") {
        gameState = "playing";
        shop.classList.add('hidden');
    }
});

saveGameBtn.addEventListener('click', () => {
    if (currentSlot !== null) {
        saveGame(currentSlot);
    }
});

document.querySelectorAll('.upgrade .buy-btn').forEach(button => {
    button.addEventListener('click', () => {
        const upgradeType = button.closest('.upgrade').dataset.upgrade;
        purchaseUpgrade(upgradeType);
    });
});

// Slot Management
function addSlot() {
    const slotsList = document.getElementById('slotsList');
    const currentSlots = slotsList.querySelectorAll('.slot').length;
    
    if (currentSlots < 5) {
        const newSlotNum = currentSlots + 1;
        const newSlot = document.createElement('div');
        newSlot.className = 'slot';
        newSlot.dataset.slot = newSlotNum;
        newSlot.innerHTML = `
            <div class="slot-content">
                <span class="slot-name">Slot ${newSlotNum}</span>
                <div class="slot-info">Empty</div>
            </div>
            <button class="remove-slot-btn">×</button>
        `;
        slotsList.appendChild(newSlot);
        setupSlotListeners(newSlot);
    }

    document.getElementById('addSlot').disabled = currentSlots >= 4;
}

function removeSlot(slot) {
    if (document.querySelectorAll('.slot').length > 1) {
        const slotNum = slot.dataset.slot;
        localStorage.removeItem(`cell_eater_save_${slotNum}`);
        slot.remove();
        document.getElementById('addSlot').disabled = false;
        renumberSlots();
    }
}

function renumberSlots() {
    document.querySelectorAll('.slot').forEach((slot, index) => {
        const newSlotNum = index + 1;
        slot.dataset.slot = newSlotNum;
        slot.querySelector('.slot-name').textContent = `Slot ${newSlotNum}`;
        
        // Transfer save data if exists
        const oldSaveData = localStorage.getItem(`cell_eater_save_${slot.dataset.slot}`);
        if (oldSaveData) {
            localStorage.setItem(`cell_eater_save_${newSlotNum}`, oldSaveData);
            if (newSlotNum !== parseInt(slot.dataset.slot)) {
                localStorage.removeItem(`cell_eater_save_${slot.dataset.slot}`);
            }
        }
    });
}

function setupSlotListeners(slot) {
    const slotContent = slot.querySelector('.slot-content');
    const removeBtn = slot.querySelector('.remove-slot-btn');

    slotContent.addEventListener('click', () => {
        const slotNum = slot.dataset.slot;
        const saveData = localStorage.getItem(`cell_eater_save_${slotNum}`);
        if (saveData) {
            loadGame(slotNum);
        } else {
            currentSlot = slotNum;
            player = {
                x: 0,
                y: 0,
                radius: initialPlayerRadiusGameUnits,
                color: 'blue',
                speed: 5,
                name: "Player",
                score: 0,
                money: 0,
                energy: 100,
                maxEnergy: 100,
                energyRegen: 0.5,
                boost: false,
                upgrades: {
                    speed: 1,
                    moneyBonus: 1,
                    absorption: 1,
                    stamina: 1
                }
            };
            startGame();
        }
    });

    removeBtn.addEventListener('click', () => {
        removeSlot(slot);
    });
}

function gameLoop() {
    animationFrameId = requestAnimationFrame(gameLoop);

    if (gameState === "playing" || gameState === "shop") {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (gameState === "playing") {
            updatePlayerEnergy();
            updatePlayerPosition(mouseScreenX, mouseScreenY);
        }
        
        updateEntities();
        updateCamera();
        cleanupChunks();

        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);

        drawEntities();
        drawPlayer();

        ctx.restore();

        if (gameState === "playing") {
            checkCollisions();
        }
        
        drawScore();
        drawPlayerSizeInfo();
        
    } else if (gameState === "gameOver") {
        drawGameOver();
    }
}

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (gameState === "playing") {
        updateCamera();
    }
});

// Initialize
updateSlotInfo();

// Setup slot management
document.getElementById('addSlot').addEventListener('click', addSlot);
document.querySelectorAll('.slot').forEach(setupSlotListeners);
