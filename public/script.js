"use strict";

// COLOQUE_SUA_SEED_AQUI
const DEFAULT_SEED = 1924581720546285046n;

const TILE_BLOCKS = 1024;
const TILE_CELLS = 256;
const BIOME_SCALE = 4;
const MIN_ZOOM = 1 / 128;
const MAX_ZOOM = 4;

const STRUCTURE_TYPES = {
  desert: 1,
  jungle: 2,
  witch: 3,
  village: 5,
  monument: 8
};

const STRUCTURE_META = {
  village: { name: "Vila", icon: "icons/village.svg" },
  desert: { name: "Templo do deserto", icon: "icons/desert-temple.svg" },
  jungle: { name: "Templo da selva", icon: "icons/jungle-temple.svg" },
  witch: { name: "Cabana de bruxa", icon: "icons/witch-hut.svg" },
  monument: { name: "Monumento oceânico", icon: "icons/monument.svg" },
  stronghold: { name: "Stronghold", icon: "icons/stronghold.svg" }
};

const BIOMES = {
  0:["Oceano","#355e9c"],1:["Planície","#8db360"],2:["Deserto","#d9c06c"],
  3:["Colinas extremas","#687868"],4:["Floresta","#397f3b"],5:["Taiga","#596d61"],
  6:["Pântano","#617b4e"],7:["Rio","#3e72d8"],8:["Inferno","#bf3b3b"],
  9:["The End","#8080ff"],10:["Oceano congelado","#7070d6"],11:["Rio congelado","#9bcad8"],
  12:["Planície de gelo","#d9f0f0"],13:["Montanhas de gelo","#a0a0a0"],
  14:["Ilha de cogumelos","#985c98"],15:["Costa de cogumelos","#a878a8"],
  16:["Praia","#e7d68a"],17:["Colinas do deserto","#d4bd6a"],
  18:["Colinas da floresta","#22551c"],19:["Colinas da taiga","#163933"],
  20:["Borda de colinas","#72789a"],21:["Selva","#2f8b25"],22:["Colinas da selva","#2c6f20"],
  23:["Borda da selva","#628b17"],24:["Oceano profundo","#173b72"],
  25:["Praia de pedra","#a2a284"],26:["Praia fria","#faf0c0"],
  27:["Floresta de bétulas","#71a94f"],28:["Colinas de bétulas","#5c8a3e"],
  29:["Floresta escura","#315a2b"],30:["Taiga fria","#779b91"],
  31:["Colinas da taiga fria","#5f7f78"],32:["Mega taiga","#596651"],
  33:["Colinas da mega taiga","#454f3e"],34:["Colinas extremas+","#507050"],
  35:["Savana","#bdb25f"],36:["Planalto da savana","#a79d64"],
  37:["Mesa","#b35d3b"],38:["Planalto de mesa F","#955638"],39:["Planalto de mesa","#d0784d"],
  129:["Planície de girassóis","#b5db88"],130:["Deserto M","#ffbc40"],
  131:["Colinas extremas M","#888888"],132:["Floresta florida","#2d8e49"],
  133:["Taiga M","#338e81"],134:["Pântano M","#2fffda"],140:["Espinhos de gelo","#b4dcdc"],
  149:["Selva M","#7ba331"],151:["Borda da selva M","#628b17"],
  155:["Floresta de bétulas M","#589c6c"],156:["Colinas de bétulas M","#47875e"],
  157:["Floresta escura M","#687942"],158:["Taiga fria M","#597d72"],
  160:["Mega taiga de abetos","#596651"],161:["Colinas de mega abetos","#454f3e"],
  162:["Colinas extremas+ M","#507050"],163:["Savana M","#e5da87"],
  164:["Planalto da savana M","#cfc58c"],165:["Mesa Bryce","#ff6d3d"],
  166:["Planalto de mesa F M","#a85d42"],167:["Planalto de mesa M","#ca6c42"]
};

const canvas = document.getElementById("mapCanvas");
const context = canvas.getContext("2d", { alpha: false });
const seedInput = document.getElementById("seedInput");
const statusElement = document.getElementById("status");
const loadingElement = document.getElementById("loading");
const cursorElement = document.getElementById("cursor");
const biomeElement = document.getElementById("biome");
const mapArea = document.getElementById("mapArea");

const tooltip = document.createElement("div");
tooltip.className = "marker-tooltip";
mapArea.appendChild(tooltip);

let moduleInstance = null;
let worldSeed = DEFAULT_SEED;
let centerX = 0;
let centerZ = 0;
let pixelsPerBlock = 0.125;
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragCenterX = 0;
let dragCenterZ = 0;
let animationFrame = 0;
let generationToken = 0;

const tileCache = new Map();
const tileQueue = [];
const queuedKeys = new Set();
let processingTile = false;
let visibleMarkers = [];
let worldSpawn = null;
const iconCache = new Map();

function parseSeed(text) {
  const value = text.trim();
  if (/^[+-]?\d+$/.test(value)) return BigInt(value);

  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
  }
  return BigInt(hash);
}

function splitSeed(seed) {
  const unsigned = BigInt.asUintN(64, seed);
  return {
    high: Number((unsigned >> 32n) & 0xffffffffn),
    low: Number(unsigned & 0xffffffffn)
  };
}

function biomeColor(id) {
  return BIOMES[id]?.[1] || "#ff00ff";
}

function biomeName(id) {
  return BIOMES[id]?.[0] || `Bioma ${id}`;
}

function resizeCanvas() {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function screenToWorld(screenX, screenY) {
  return {
    x: centerX + (screenX - canvas.clientWidth / 2) / pixelsPerBlock,
    z: centerZ + (screenY - canvas.clientHeight / 2) / pixelsPerBlock
  };
}

function worldToScreen(worldX, worldZ) {
  return {
    x: canvas.clientWidth / 2 + (worldX - centerX) * pixelsPerBlock,
    y: canvas.clientHeight / 2 + (worldZ - centerZ) * pixelsPerBlock
  };
}

function visibleBounds() {
  return {
    left: centerX - canvas.clientWidth / (2 * pixelsPerBlock),
    right: centerX + canvas.clientWidth / (2 * pixelsPerBlock),
    top: centerZ - canvas.clientHeight / (2 * pixelsPerBlock),
    bottom: centerZ + canvas.clientHeight / (2 * pixelsPerBlock)
  };
}

function floorDiv(value, divisor) {
  return Math.floor(value / divisor);
}

function tileKey(tileX, tileZ) {
  return `${worldSeed}:${tileX}:${tileZ}`;
}

function createBiomeTile(tileX, tileZ) {
  const cells = TILE_CELLS * TILE_CELLS;
  const pointer = moduleInstance._malloc(cells * 4);

  try {
    const cellX = tileX * TILE_CELLS;
    const cellZ = tileZ * TILE_CELLS;

    const ok = moduleInstance._fill_biomes(
      BIOME_SCALE,
      cellX,
      cellZ,
      TILE_CELLS,
      TILE_CELLS,
      pointer
    );

    if (!ok) throw new Error("Cubiomes não conseguiu gerar o tile.");

    const start = pointer >> 2;
    const ids = new Int32Array(cells);
    ids.set(moduleInstance.HEAP32.subarray(start, start + cells));

    const image = new ImageData(TILE_CELLS, TILE_CELLS);
    for (let i = 0; i < cells; i++) {
      const color = biomeColor(ids[i]);
      const offset = i * 4;
      image.data[offset] = Number.parseInt(color.slice(1, 3), 16);
      image.data[offset + 1] = Number.parseInt(color.slice(3, 5), 16);
      image.data[offset + 2] = Number.parseInt(color.slice(5, 7), 16);
      image.data[offset + 3] = 255;
    }

    const offscreen = document.createElement("canvas");
    offscreen.width = TILE_CELLS;
    offscreen.height = TILE_CELLS;
    offscreen.getContext("2d").putImageData(image, 0, 0);

    return { canvas: offscreen, ids };
  } finally {
    moduleInstance._free(pointer);
  }
}

function queueTile(tileX, tileZ) {
  const key = tileKey(tileX, tileZ);
  if (tileCache.has(key) || queuedKeys.has(key)) return;

  queuedKeys.add(key);
  tileQueue.push({ tileX, tileZ, key });
  processTileQueue();
}

async function processTileQueue() {
  if (processingTile || !moduleInstance) return;
  processingTile = true;

  while (tileQueue.length > 0) {
    const item = tileQueue.shift();
    queuedKeys.delete(item.key);

    if (!tileCache.has(item.key)) {
      await new Promise(resolve => setTimeout(resolve, 0));
      try {
        tileCache.set(item.key, createBiomeTile(item.tileX, item.tileZ));
      } catch (error) {
        console.error(error);
      }
      scheduleDraw();
    }
  }

  processingTile = false;
}

function drawMap() {
  resizeCanvas();
  const ratio = canvas.width / canvas.clientWidth;
  const bounds = visibleBounds();

  context.fillStyle = "#07111b";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;

  const minTileX = floorDiv(bounds.left, TILE_BLOCKS) - 1;
  const maxTileX = floorDiv(bounds.right, TILE_BLOCKS) + 1;
  const minTileZ = floorDiv(bounds.top, TILE_BLOCKS) - 1;
  const maxTileZ = floorDiv(bounds.bottom, TILE_BLOCKS) + 1;

  let missingTiles = 0;

  for (let tileZ = minTileZ; tileZ <= maxTileZ; tileZ++) {
    for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
      const key = tileKey(tileX, tileZ);
      const tile = tileCache.get(key);

      if (!tile) {
        missingTiles++;
        queueTile(tileX, tileZ);
        continue;
      }

      const position = worldToScreen(tileX * TILE_BLOCKS, tileZ * TILE_BLOCKS);
      const size = TILE_BLOCKS * pixelsPerBlock;

      context.drawImage(
        tile.canvas,
        position.x * ratio,
        position.y * ratio,
        size * ratio,
        size * ratio
      );
    }
  }

  if (document.getElementById("showGrid").checked) drawChunkGrid(ratio, bounds);
  if (document.getElementById("showStructures").checked) drawStructures(ratio, bounds);
  drawOrigin(ratio);
  drawWorldSpawn(ratio);

  loadingElement.style.display = missingTiles > 0 ? "block" : "none";
  loadingElement.textContent = missingTiles > 0
    ? `Gerando ${missingTiles} área(s)…`
    : "";

  statusElement.textContent =
    `Centro X ${Math.round(centerX)}, Z ${Math.round(centerZ)} • ` +
    (pixelsPerBlock < 1
      ? `1 px/${(1 / pixelsPerBlock).toFixed(1)} blocos`
      : `${pixelsPerBlock.toFixed(2)} px/bloco`);
}

function drawChunkGrid(ratio, bounds) {
  const chunkSize = 16 * pixelsPerBlock * ratio;
  if (chunkSize < 10) return;

  context.save();
  context.strokeStyle = "rgba(0,0,0,.32)";
  context.lineWidth = 1;

  for (let x = Math.floor(bounds.left / 16) * 16; x <= bounds.right; x += 16) {
    const screenX = Math.round(worldToScreen(x, 0).x * ratio) + 0.5;
    context.beginPath();
    context.moveTo(screenX, 0);
    context.lineTo(screenX, canvas.height);
    context.stroke();
  }

  for (let z = Math.floor(bounds.top / 16) * 16; z <= bounds.bottom; z += 16) {
    const screenY = Math.round(worldToScreen(0, z).y * ratio) + 0.5;
    context.beginPath();
    context.moveTo(0, screenY);
    context.lineTo(canvas.width, screenY);
    context.stroke();
  }

  context.restore();
}

function drawWorldSpawn(ratio) {
  if (!worldSpawn) return;

  const point = worldToScreen(worldSpawn.x, worldSpawn.z);
  const x = point.x * ratio;
  const y = point.y * ratio;
  const radius = 12 * ratio;

  context.save();

  context.fillStyle = "#ffffff";
  context.strokeStyle = "#111111";
  context.lineWidth = 2 * ratio;

  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = "#e53935";
  context.font = `bold ${17 * ratio}px system-ui`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("★", x, y + 0.5 * ratio);

  context.restore();
}

function drawOrigin(ratio) {
  const point = worldToScreen(0, 0);
  const x = point.x * ratio;
  const y = point.y * ratio;

  context.save();
  context.strokeStyle = "#ff3434";
  context.lineWidth = 2 * ratio;
  context.beginPath();
  context.moveTo(x - 8 * ratio, y);
  context.lineTo(x + 8 * ratio, y);
  context.moveTo(x, y - 8 * ratio);
  context.lineTo(x, y + 8 * ratio);
  context.stroke();
  context.restore();
}

function activeStructures() {
  return [...document.querySelectorAll(".structure:checked")]
    .map(element => element.dataset.type);
}

function loadIcon(path) {
  if (iconCache.has(path)) return iconCache.get(path);

  const image = new Image();
  image.src = path;
  image.onload = scheduleDraw;
  iconCache.set(path, image);
  return image;
}

function findStructures(bounds) {
  const markers = [];
  const output = moduleInstance._malloc(8);

  try {
    for (const typeName of activeStructures()) {
      if (typeName === "stronghold") {
        const maximum = 3;
        const strongholdPointer = moduleInstance._malloc(maximum * 2 * 4);

        try {
          const count = moduleInstance._fill_strongholds(maximum, strongholdPointer);
          const start = strongholdPointer >> 2;

          for (let index = 0; index < count; index++) {
            const x = moduleInstance.HEAP32[start + index * 2];
            const z = moduleInstance.HEAP32[start + index * 2 + 1];

            if (x >= bounds.left && x <= bounds.right &&
                z >= bounds.top && z <= bounds.bottom) {
              markers.push({ x, z, type: "stronghold" });
            }
          }
        } finally {
          moduleInstance._free(strongholdPointer);
        }
        continue;
      }

      const structureType = STRUCTURE_TYPES[typeName];
      const regionChunks =
        moduleInstance._get_structure_region_size(structureType);

      if (regionChunks <= 0) continue;

      const regionBlocks = regionChunks * 16;
      const minRegionX = floorDiv(bounds.left, regionBlocks) - 1;
      const maxRegionX = floorDiv(bounds.right, regionBlocks) + 1;
      const minRegionZ = floorDiv(bounds.top, regionBlocks) - 1;
      const maxRegionZ = floorDiv(bounds.bottom, regionBlocks) + 1;

      for (let regionZ = minRegionZ; regionZ <= maxRegionZ; regionZ++) {
        for (let regionX = minRegionX; regionX <= maxRegionX; regionX++) {
          const exists = moduleInstance._get_structure(
            structureType,
            regionX,
            regionZ,
            output
          );

          if (!exists) continue;

          const start = output >> 2;
          const x = moduleInstance.HEAP32[start];
          const z = moduleInstance.HEAP32[start + 1];

          if (x >= bounds.left && x <= bounds.right &&
              z >= bounds.top && z <= bounds.bottom) {
            markers.push({ x, z, type: typeName });
          }
        }
      }
    }
  } finally {
    moduleInstance._free(output);
  }

  return markers;
}

function drawStructures(ratio, bounds) {
  visibleMarkers = findStructures(bounds);

  for (const marker of visibleMarkers) {
    const meta = STRUCTURE_META[marker.type];
    const image = loadIcon(meta.icon);
    if (!image.complete) continue;

    const screen = worldToScreen(marker.x, marker.z);
    const size = Math.max(22, Math.min(34, 24 * ratio));

    context.save();
    context.shadowColor = "rgba(0,0,0,.75)";
    context.shadowBlur = 5 * ratio;
    context.drawImage(
      image,
      screen.x * ratio - size / 2,
      screen.y * ratio - size / 2,
      size,
      size
    );
    context.restore();
  }
}

function biomeAt(blockX, blockZ) {
  if (!moduleInstance) return -1;
  return moduleInstance._biome_at(1, blockX, blockZ);
}

function markerAt(screenX, screenY) {
  let closest = null;
  let distance = 18;

  if (worldSpawn) {
    const spawnScreen = worldToScreen(worldSpawn.x, worldSpawn.z);
    const spawnDistance = Math.hypot(
      spawnScreen.x - screenX,
      spawnScreen.y - screenY
    );

    if (spawnDistance < distance) {
      closest = {
        x: worldSpawn.x,
        z: worldSpawn.z,
        type: "spawn"
      };
      distance = spawnDistance;
    }
  }

  for (const marker of visibleMarkers) {
    const screen = worldToScreen(marker.x, marker.z);
    const current = Math.hypot(screen.x - screenX, screen.y - screenY);

    if (current < distance) {
      closest = marker;
      distance = current;
    }
  }

  return closest;
}

function setZoom(value, screenX = canvas.clientWidth / 2,
                 screenY = canvas.clientHeight / 2) {
  const before = screenToWorld(screenX, screenY);
  pixelsPerBlock = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
  const after = screenToWorld(screenX, screenY);

  centerX += before.x - after.x;
  centerZ += before.z - after.z;
  scheduleDraw();
}

function scheduleDraw() {
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(drawMap);
}

function calculateWorldSpawn() {
  const pointer = moduleInstance._malloc(8);

  try {
    const success = moduleInstance._get_world_spawn(pointer);

    if (!success) {
      worldSpawn = null;
      return;
    }

    const start = pointer >> 2;

    worldSpawn = {
      x: moduleInstance.HEAP32[start],
      z: moduleInstance.HEAP32[start + 1]
    };
  } finally {
    moduleInstance._free(pointer);
  }
}

function applySeed() {
  worldSeed = parseSeed(seedInput.value);
  const parts = splitSeed(worldSeed);

  if (!moduleInstance._set_seed(parts.high, parts.low)) {
    alert("Não foi possível inicializar a seed.");
    return;
  }

  calculateWorldSpawn();

  generationToken++;
  tileCache.clear();
  tileQueue.length = 0;
  queuedKeys.clear();
  centerX = 0;
  centerZ = 0;
  scheduleDraw();
}

canvas.addEventListener("pointerdown", event => {
  dragging = true;
  canvas.classList.add("dragging");
  canvas.setPointerCapture(event.pointerId);
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragCenterX = centerX;
  dragCenterZ = centerZ;
});

canvas.addEventListener("pointermove", event => {
  const rectangle = canvas.getBoundingClientRect();
  const screenX = event.clientX - rectangle.left;
  const screenY = event.clientY - rectangle.top;
  const world = screenToWorld(screenX, screenY);
  const x = Math.floor(world.x);
  const z = Math.floor(world.z);
  const id = biomeAt(x, z);

  cursorElement.textContent = `X ${x}, Z ${z}`;
  biomeElement.textContent = `Bioma: ${id >= 0 ? biomeName(id) : "—"}`;

  const marker = markerAt(screenX, screenY);
  if (marker) {
    const name = marker.type === "spawn"
      ? "Spawn do mundo"
      : STRUCTURE_META[marker.type].name;

    tooltip.style.display = "block";
    tooltip.style.left = `${screenX + 14}px`;
    tooltip.style.top = `${screenY + 14}px`;
    tooltip.textContent = `${name} — X ${marker.x}, Z ${marker.z}`;
  } else {
    tooltip.style.display = "none";
  }

  if (!dragging) return;

  centerX = dragCenterX - (event.clientX - dragStartX) / pixelsPerBlock;
  centerZ = dragCenterZ - (event.clientY - dragStartY) / pixelsPerBlock;
  scheduleDraw();
});

canvas.addEventListener("pointerup", event => {
  dragging = false;
  canvas.classList.remove("dragging");
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
});

canvas.addEventListener("pointercancel", () => {
  dragging = false;
  canvas.classList.remove("dragging");
});

canvas.addEventListener("wheel", event => {
  event.preventDefault();
  const rectangle = canvas.getBoundingClientRect();

  setZoom(
    pixelsPerBlock * (event.deltaY < 0 ? 1.35 : 1 / 1.35),
    event.clientX - rectangle.left,
    event.clientY - rectangle.top
  );
}, { passive: false });

document.getElementById("zoomIn").onclick = () =>
  setZoom(pixelsPerBlock * 1.5);

document.getElementById("zoomOut").onclick = () =>
  setZoom(pixelsPerBlock / 1.5);

document.getElementById("home").onclick = () => {
  centerX = 0;
  centerZ = 0;
  scheduleDraw();
};

document.getElementById("applySeed").onclick = applySeed;
seedInput.addEventListener("keydown", event => {
  if (event.key === "Enter") applySeed();
});

for (const checkbox of document.querySelectorAll("input[type=checkbox]")) {
  checkbox.addEventListener("change", scheduleDraw);
}

window.addEventListener("resize", scheduleDraw);

function buildLegend() {
  const legend = document.getElementById("legend");
  const shown = [0,1,2,3,4,5,6,7,11,12,14,16,21,24,27,29,30,35,37];

  for (const id of shown) {
    const row = document.createElement("div");
    row.className = "legend-row";
    row.innerHTML =
      `<span class="swatch" style="background:${biomeColor(id)}"></span>` +
      `<span>${biomeName(id)}</span>`;
    legend.appendChild(row);
  }
}

async function start() {
  buildLegend();
  seedInput.value = DEFAULT_SEED.toString();

  try {
    moduleInstance = await createCubiomesModule({
      locateFile: path => path
    });

    applySeed();
    statusElement.textContent = "Cubiomes carregado.";
  } catch (error) {
    console.error(error);
    loadingElement.textContent = "Erro ao carregar Cubiomes.";
    statusElement.textContent = "Confira a aba Actions do GitHub.";
  }
}

start();
