/* ===================================================
   FORGE OF ARTIFACTS - Game Logic
Babylon.js 3D Hub + Server API Generation
    =================================================== */

// ==================== STATE ====================
let playerName = 'Adventurer';
let selectedType = 'offense';
let inventory = [];
let currentForgedItem = null;
let scene = null;
let engine = null;

// ==================== SCREEN MANAGEMENT ====================
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// ==================== TYPE SELECTION ====================
function selectType(btn) {
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedType = btn.dataset.type;
}

// ==================== ERROR HANDLING ====================
function showError(elId, msg) {
    const el = document.getElementById(elId);
    if (el) el.textContent = msg;
}
function clearError(elId) {
    const el = document.getElementById(elId);
    if (el) el.textContent = '';
}

// ==================== CHAR COUNTER ====================
document.getElementById('item-desc-input').addEventListener('input', function () {
    document.getElementById('char-count').textContent = this.value.length;
});

// ==================== FORGE ITEM ====================
async function forgeItem() {
    if (inventory.length >= 1) {
        showError('create-error', 'You have already forged your artifact! One item per adventurer.');
        return;
    }

    const usernameInput = document.getElementById('username-input');
    const descInput = document.getElementById('item-desc-input');
    const username = usernameInput.value.trim();
    const description = descInput.value.trim();

    if (!username) { showError('create-error', 'Enter your adventurer name!'); return; }
    if (!description) { showError('create-error', 'Describe the item you want to forge!'); return; }

    clearError('create-error');
    playerName = username;

    const forgeBtn = document.getElementById('forge-btn');
    forgeBtn.classList.add('loading');
    forgeBtn.disabled = true;

    try {
        // We now call our local backend server instead of directly calling OpenRouter
        const response = await fetch('/api/forge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                description: description,
                itemType: selectedType
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Server error: ${response.status}`);
        }

        const data = await response.json();

        currentForgedItem = {
            imageUrl: data.image_url, // Adjusted to match DB output
            name: data.name,
            stars: data.stars,
            category: data.category,
            type: data.item_type,
            description: data.ability,
            userDescription: data.description,
            // These will be calculated when fetching inventory, but we can set them as newest here
            rarityLabel: 'Checking...',
            pickRate: '...'
        };

        displayResult(currentForgedItem);
        showScreen('result-screen');

    } catch (e) {
        showError('create-error', e.message);
        console.error(e);
    } finally {
        forgeBtn.classList.remove('loading');
        forgeBtn.disabled = false;
    }
}

// ==================== DISPLAY RESULT ====================
function displayResult(item) {
    document.getElementById('result-image').src = item.imageUrl;
    document.getElementById('result-name').textContent = item.name;

    // Stars
    const starsEl = document.getElementById('result-stars');
    starsEl.textContent = '★'.repeat(item.stars) + '☆'.repeat(5 - item.stars);
    starsEl.style.color = 'var(--star-gold)';

    // Category
    document.getElementById('result-category').textContent = item.category;

    // Rarity
    const rarityEl = document.getElementById('result-rarity');
    if (item.rarityLabel) {
        rarityEl.textContent = item.rarityLabel;
        rarityEl.className = 'item-rarity ' + item.rarityLabel.toLowerCase();
    } else {
        rarityEl.textContent = '';
    }

    // Type badge
    const badgeEl = document.getElementById('result-type-badge');
    badgeEl.textContent = item.type.toUpperCase();
    badgeEl.className = 'item-type-badge ' + item.type;

    // Description
    document.getElementById('result-description').textContent = item.description;
}

// ==================== INVENTORY ====================
function addToInventoryAndContinue() {
    if (currentForgedItem) {
        inventory.push({ ...currentForgedItem, id: Date.now() });
        currentForgedItem = null;
    }
    updateHud();
    showScreen('hub-screen');
    if (!scene) {
        initBabylonScene();
    }
}

function goBackToForge() {
    if (inventory.length >= 1) {
        alert("You have already forged your one artifact!");
        return;
    }
    closeAllOverlays();
    showScreen('create-screen');
}

function openInventory() {
    fetchInventoryAndRender();
    document.getElementById('inventory-overlay').classList.add('active');
}

async function fetchInventoryAndRender() {
    try {
        const res = await fetch('/api/inventory');
        if (res.ok) {
            inventory = await res.json();
        }
    } catch (e) {
        console.error("Failed to fetch inventory", e);
    }
    renderInventoryGrid();
}

function closeInventory() {
    document.getElementById('inventory-overlay').classList.remove('active');
}

function openMarket() {
    document.getElementById('market-overlay').classList.add('active');
}
function closeMarket() {
    document.getElementById('market-overlay').classList.remove('active');
}

function openArena() {
    document.getElementById('arena-overlay').classList.add('active');
}
function closeArena() {
    document.getElementById('arena-overlay').classList.remove('active');
}

function closeAllOverlays() {
    document.querySelectorAll('.overlay').forEach(o => o.classList.remove('active'));
}

function renderInventoryGrid() {
    const grid = document.getElementById('inventory-grid');
    const emptyMsg = document.getElementById('inventory-empty');

    // Clear previous items (keep empty msg)
    grid.querySelectorAll('.inv-item').forEach(el => el.remove());

    if (inventory.length === 0) {
        emptyMsg.style.display = 'block';
        return;
    }

    emptyMsg.style.display = 'none';

    inventory.forEach(item => {
        const card = document.createElement('div');
        card.className = 'inv-item';
        card.innerHTML = `
            <div class="inv-item-img"><img src="${item.imageUrl}" alt="${item.name}" /></div>
            <div class="inv-item-name">${item.name}</div>
            <div class="inv-item-stars" style="color: var(--star-gold);">${'★'.repeat(item.stars)}${'☆'.repeat(5 - item.stars)}</div>
            <div class="inv-item-rarity ${item.rarityLabel ? item.rarityLabel.toLowerCase() : ''}">${item.rarityLabel || ''}</div>
            <div class="inv-item-pickrate">${item.pickRate ? item.pickRate + '%' : ''}</div>
        `;
        card.title = `${item.name}\n${item.category} (${item.itemType || item.type})\n${item.description}`;
        grid.appendChild(card);
    });
}

function updateHud() {
    document.getElementById('hud-username').textContent = playerName;
    document.getElementById('hud-item-count').textContent = inventory.length;

    // Hide the forge button on HUD if they already forged their item
    if (inventory.length >= 1) {
        const hudForgeBtn = document.querySelector('.hud-bottom button:nth-child(2)');
        if (hudForgeBtn) hudForgeBtn.style.display = 'none';
    }
}

// ==================== BABYLON.JS 3D HUB SCENE ====================
function initBabylonScene() {
    const canvas = document.getElementById('renderCanvas');
    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

    scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.02, 0.02, 0.06, 1);
    scene.ambientColor = new BABYLON.Color3(0.1, 0.1, 0.15);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.015;
    scene.fogColor = new BABYLON.Color3(0.02, 0.03, 0.06);

    // ---- Camera (Fixed) ----
    const camera = new BABYLON.ArcRotateCamera('cam', -Math.PI / 2, Math.PI / 3.2, 30, new BABYLON.Vector3(0, 0, 0), scene);
    camera.lowerRadiusLimit = 30;
    camera.upperRadiusLimit = 30;
    camera.lowerAlphaLimit = camera.alpha;
    camera.upperAlphaLimit = camera.alpha;
    camera.lowerBetaLimit = camera.beta;
    camera.upperBetaLimit = camera.beta;
    camera.attachControl(canvas, false);

    // ---- Lighting ----
    // Moonlight
    const moonLight = new BABYLON.DirectionalLight('moon', new BABYLON.Vector3(-0.5, -1, 0.3), scene);
    moonLight.intensity = 0.3;
    moonLight.diffuse = new BABYLON.Color3(0.4, 0.45, 0.7);

    // Ambient hemisphere
    const hemiLight = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);
    hemiLight.intensity = 0.2;
    hemiLight.diffuse = new BABYLON.Color3(0.2, 0.2, 0.4);
    hemiLight.groundColor = new BABYLON.Color3(0.05, 0.05, 0.1);

    // Campfire light
    const fireLight = new BABYLON.PointLight('fire', new BABYLON.Vector3(0, 1.5, 2), scene);
    fireLight.intensity = 3;
    fireLight.diffuse = new BABYLON.Color3(1, 0.6, 0.2);
    fireLight.range = 18;

    // Flicker animation
    let flickerTime = 0;
    scene.registerBeforeRender(() => {
        flickerTime += 0.05;
        fireLight.intensity = 2.5 + Math.sin(flickerTime * 3) * 0.5 + Math.sin(flickerTime * 7) * 0.3;
    });

    // ---- Ground ----
    const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 60, height: 60, subdivisions: 4 }, scene);
    const groundMat = new BABYLON.StandardMaterial('groundMat', scene);
    groundMat.diffuseColor = new BABYLON.Color3(0.15, 0.2, 0.08);
    groundMat.specularColor = new BABYLON.Color3(0, 0, 0);
    ground.material = groundMat;

    // ---- Campfire ----
    createCampfire(scene);

    // ---- Trees ----
    createForest(scene);

    // ---- Buildings ----
    const mysteryBuilding = createMysteryBuilding(scene);
    const arenaBuilding = createArena(scene);
    const marketBuilding = createMarket(scene);

    // ---- Stars / Particles ----
    createStarfield(scene);

    // ---- Building Interaction ----
    const tooltip = document.getElementById('building-tooltip');
    const tooltipText = document.getElementById('tooltip-text');

    scene.onPointerMove = function (evt) {
        const pick = scene.pick(evt.offsetX, evt.offsetY);
        if (pick.hit && pick.pickedMesh) {
            const name = pick.pickedMesh.metadata?.buildingName;
            if (name) {
                tooltip.style.left = (evt.clientX + 15) + 'px';
                tooltip.style.top = (evt.clientY - 10) + 'px';
                tooltipText.textContent = name;
                tooltip.classList.add('visible');
                canvas.style.cursor = 'pointer';
                return;
            }
        }
        tooltip.classList.remove('visible');
        canvas.style.cursor = 'default';
    };

    scene.onPointerDown = function (evt) {
        const pick = scene.pick(evt.offsetX, evt.offsetY);
        if (pick.hit && pick.pickedMesh) {
            const action = pick.pickedMesh.metadata?.buildingAction;
            if (action) action();
        }
    };

    // ---- Render Loop ----
    engine.runRenderLoop(() => scene.render());
    window.addEventListener('resize', () => engine.resize());
}

// -------- CAMPFIRE --------
function createCampfire(scene) {
    // Logs
    for (let i = 0; i < 4; i++) {
        const log = BABYLON.MeshBuilder.CreateCylinder('log' + i, { height: 2, diameter: 0.25 }, scene);
        const logMat = new BABYLON.StandardMaterial('logMat' + i, scene);
        logMat.diffuseColor = new BABYLON.Color3(0.35, 0.2, 0.1);
        logMat.specularColor = BABYLON.Color3.Black();
        log.material = logMat;
        log.rotation.z = Math.PI / 2;
        log.rotation.y = (Math.PI / 4) * i;
        log.position = new BABYLON.Vector3(0, 0.15, 2);
    }

    // Fire stones circle
    for (let i = 0; i < 8; i++) {
        const stone = BABYLON.MeshBuilder.CreateBox('stone' + i, { size: 0.35 }, scene);
        const stoneMat = new BABYLON.StandardMaterial('stoneMat' + i, scene);
        stoneMat.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.3);
        stoneMat.specularColor = BABYLON.Color3.Black();
        stone.material = stoneMat;
        const angle = (Math.PI * 2 / 8) * i;
        stone.position.x = Math.cos(angle) * 1.2;
        stone.position.z = 2 + Math.sin(angle) * 1.2;
        stone.position.y = 0.15;
        stone.rotation.y = angle;
    }

    // Fire glow sphere
    const fireGlow = BABYLON.MeshBuilder.CreateSphere('fireGlow', { diameter: 1.5 }, scene);
    const fireMat = new BABYLON.StandardMaterial('fireMat', scene);
    fireMat.diffuseColor = new BABYLON.Color3(1, 0.5, 0.1);
    fireMat.emissiveColor = new BABYLON.Color3(1, 0.4, 0.05);
    fireMat.alpha = 0.6;
    fireMat.specularColor = BABYLON.Color3.Black();
    fireGlow.material = fireMat;
    fireGlow.position = new BABYLON.Vector3(0, 0.8, 2);

    // Animate fire glow
    scene.registerBeforeRender(() => {
        fireGlow.scaling.y = 1 + Math.sin(Date.now() * 0.005) * 0.2;
        fireGlow.scaling.x = 1 + Math.cos(Date.now() * 0.003) * 0.1;
    });
}

// -------- TREES --------
function createForest(scene) {
    const treePositions = [
        // Background trees
        [-12, -10], [-8, -12], [-4, -14], [0, -13], [4, -15], [8, -11], [12, -12],
        [-15, -8], [15, -9], [-14, -14], [14, -14],
        // Side trees
        [-10, -5], [10, -4], [-13, -2], [13, -3],
        [-11, 5], [11, 6], [-14, 8], [14, 7],
        // Far back ring
        [-16, -6], [16, -5], [-17, 0], [17, 1], [-16, 6], [16, 5],
        // Some near trees
        [-8, 6], [8, 7], [-6, 9], [6, 10],
    ];

    treePositions.forEach((pos, i) => {
        const height = 3 + Math.random() * 4;
        const trunkR = 0.15 + Math.random() * 0.1;

        // Trunk
        const trunk = BABYLON.MeshBuilder.CreateCylinder('trunk' + i, { height: height, diameterTop: trunkR * 0.6, diameterBottom: trunkR, tessellation: 6 }, scene);
        const trunkMat = new BABYLON.StandardMaterial('trunkMat' + i, scene);
        trunkMat.diffuseColor = new BABYLON.Color3(0.3, 0.2, 0.1);
        trunkMat.specularColor = BABYLON.Color3.Black();
        trunk.material = trunkMat;
        trunk.position = new BABYLON.Vector3(pos[0], height / 2, pos[1]);

        // Canopy
        const canopySize = 1.5 + Math.random() * 2;
        const canopy = BABYLON.MeshBuilder.CreateSphere('canopy' + i, { diameter: canopySize, segments: 6 }, scene);
        const canopyMat = new BABYLON.StandardMaterial('canopyMat' + i, scene);
        const g = 0.15 + Math.random() * 0.2;
        canopyMat.diffuseColor = new BABYLON.Color3(0.05, g, 0.05);
        canopyMat.specularColor = BABYLON.Color3.Black();
        canopy.material = canopyMat;
        canopy.position = new BABYLON.Vector3(pos[0], height + canopySize * 0.3, pos[1]);
        canopy.scaling.y = 0.7;
    });
}

// -------- MYSTERY BUILDING (Left) --------
function createMysteryBuilding(scene) {
    const group = new BABYLON.TransformNode('mysteryGroup', scene);
    group.position = new BABYLON.Vector3(-9, 0, -3);

    // Base
    const base = BABYLON.MeshBuilder.CreateBox('mysteryBase', { width: 4, height: 4, depth: 4 }, scene);
    const mat = new BABYLON.StandardMaterial('mysteryMat', scene);
    mat.diffuseColor = new BABYLON.Color3(0.35, 0.35, 0.4);
    mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    base.material = mat;
    base.position.y = 2;
    base.parent = group;
    base.metadata = { buildingName: '??? Unknown ???', buildingAction: () => { } };

    // Roof
    const roof = BABYLON.MeshBuilder.CreateCylinder('mysteryRoof', { height: 2.5, diameterTop: 0, diameterBottom: 6.5, tessellation: 4 }, scene);
    const roofMat = new BABYLON.StandardMaterial('mysteryRoofMat', scene);
    roofMat.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.35);
    roofMat.specularColor = BABYLON.Color3.Black();
    roof.material = roofMat;
    roof.position.y = 5.2;
    roof.rotation.y = Math.PI / 4;
    roof.parent = group;
    roof.metadata = { buildingName: '??? Unknown ???', buildingAction: () => { } };

    // Question mark sign
    const sign = BABYLON.MeshBuilder.CreatePlane('mysterySign', { width: 1, height: 1.5 }, scene);
    const signMat = new BABYLON.StandardMaterial('signMat', scene);
    signMat.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.55);
    signMat.emissiveColor = new BABYLON.Color3(0.15, 0.15, 0.2);
    signMat.specularColor = BABYLON.Color3.Black();
    sign.material = signMat;
    sign.position = new BABYLON.Vector3(0, 2.5, 2.05);
    sign.parent = group;
    sign.metadata = { buildingName: '??? Unknown ???', buildingAction: () => { } };

    return group;
}

// -------- ARENA (Center) --------
function createArena(scene) {
    const group = new BABYLON.TransformNode('arenaGroup', scene);
    group.position = new BABYLON.Vector3(0, 0, -6);

    // Round base platform
    const platform = BABYLON.MeshBuilder.CreateCylinder('arenaPlatform', { height: 0.5, diameter: 8, tessellation: 24 }, scene);
    const platMat = new BABYLON.StandardMaterial('arenaPlatMat', scene);
    platMat.diffuseColor = new BABYLON.Color3(0.4, 0.25, 0.15);
    platMat.specularColor = BABYLON.Color3.Black();
    platform.material = platMat;
    platform.position.y = 0.25;
    platform.parent = group;
    platform.metadata = { buildingName: '⚔️ Arena', buildingAction: openArena };

    // Colosseum walls (ring of pillars)
    for (let i = 0; i < 10; i++) {
        const angle = (Math.PI * 2 / 10) * i;
        const pillar = BABYLON.MeshBuilder.CreateCylinder('pillar' + i, { height: 4, diameter: 0.5, tessellation: 8 }, scene);
        const pillarMat = new BABYLON.StandardMaterial('pillarMat' + i, scene);
        pillarMat.diffuseColor = new BABYLON.Color3(0.5, 0.35, 0.2);
        pillarMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        pillar.material = pillarMat;
        pillar.position.x = Math.cos(angle) * 3.5;
        pillar.position.z = Math.sin(angle) * 3.5;
        pillar.position.y = 2;
        pillar.parent = group;
        pillar.metadata = { buildingName: '⚔️ Arena', buildingAction: openArena };

        // Pillar tops
        const top = BABYLON.MeshBuilder.CreateBox('ptop' + i, { size: 0.8, height: 0.3 }, scene);
        top.material = pillarMat;
        top.position = pillar.position.clone();
        top.position.y = 4.15;
        top.parent = group;
        top.metadata = { buildingName: '⚔️ Arena', buildingAction: openArena };
    }

    // Arena glow
    const arenaGlow = new BABYLON.PointLight('arenaGlow', new BABYLON.Vector3(0, 2, -6), scene);
    arenaGlow.intensity = 1;
    arenaGlow.diffuse = new BABYLON.Color3(1, 0.3, 0.2);
    arenaGlow.range = 10;

    return group;
}

// -------- MARKET (Right) --------
function createMarket(scene) {
    const group = new BABYLON.TransformNode('marketGroup', scene);
    group.position = new BABYLON.Vector3(9, 0, -3);

    // Base stall
    const stall = BABYLON.MeshBuilder.CreateBox('marketStall', { width: 5, height: 3, depth: 3.5 }, scene);
    const stallMat = new BABYLON.StandardMaterial('marketStallMat', scene);
    stallMat.diffuseColor = new BABYLON.Color3(0.45, 0.3, 0.15);
    stallMat.specularColor = BABYLON.Color3.Black();
    stall.material = stallMat;
    stall.position.y = 1.5;
    stall.parent = group;
    stall.metadata = { buildingName: '🏪 Market', buildingAction: openMarket };

    // Roof (angled awning)
    const roof = BABYLON.MeshBuilder.CreateBox('marketRoof', { width: 6, height: 0.2, depth: 4.5 }, scene);
    const roofMat = new BABYLON.StandardMaterial('marketRoofMat', scene);
    roofMat.diffuseColor = new BABYLON.Color3(0.6, 0.2, 0.15);
    roofMat.specularColor = BABYLON.Color3.Black();
    roof.material = roofMat;
    roof.position.y = 3.5;
    roof.rotation.x = 0.15;
    roof.parent = group;
    roof.metadata = { buildingName: '🏪 Market', buildingAction: openMarket };

    // Front counter
    const counter = BABYLON.MeshBuilder.CreateBox('counter', { width: 4, height: 1, depth: 0.5 }, scene);
    const counterMat = new BABYLON.StandardMaterial('counterMat', scene);
    counterMat.diffuseColor = new BABYLON.Color3(0.5, 0.35, 0.18);
    counterMat.specularColor = BABYLON.Color3.Black();
    counter.material = counterMat;
    counter.position = new BABYLON.Vector3(0, 0.5, 1.8);
    counter.parent = group;
    counter.metadata = { buildingName: '🏪 Market', buildingAction: openMarket };

    // Market lantern
    const lantern = new BABYLON.PointLight('marketLantern', new BABYLON.Vector3(9, 3, -1), scene);
    lantern.intensity = 1.5;
    lantern.diffuse = new BABYLON.Color3(1, 0.8, 0.4);
    lantern.range = 8;

    return group;
}

// -------- STARFIELD --------
function createStarfield(scene) {
    const starCount = 200;
    const positions = [];
    const colors = [];

    for (let i = 0; i < starCount; i++) {
        const x = (Math.random() - 0.5) * 100;
        const y = 15 + Math.random() * 30;
        const z = (Math.random() - 0.5) * 100;
        positions.push(x, y, z);

        const brightness = 0.5 + Math.random() * 0.5;
        colors.push(brightness, brightness, brightness * 0.9, 1);
    }

    const starMesh = new BABYLON.Mesh('stars', scene);
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = positions;
    vertexData.colors = colors;

    // Create indices for point cloud
    const indices = [];
    for (let i = 0; i < starCount; i++) indices.push(i);
    vertexData.indices = indices;
    vertexData.applyToMesh(starMesh);

    const starMat = new BABYLON.StandardMaterial('starMat', scene);
    starMat.emissiveColor = new BABYLON.Color3(1, 1, 0.9);
    starMat.disableLighting = true;
    starMat.pointsCloud = true;
    starMat.pointSize = 3;
    starMesh.material = starMat;
}

// ==================== INIT ====================
// Scene is initialized via UI interactions.

async function checkSessionStatus() {
    try {
        const res = await fetch('/api/me');
        if (res.ok) {
            const data = await res.json();
            if (data.hasForged) {
                // Pre-populate so they can't forge again locally either
                inventory = [{ dummy: true }];
                updateHud();
            }
        }
    } catch (e) {
        console.error(e);
    }
}
checkSessionStatus();
