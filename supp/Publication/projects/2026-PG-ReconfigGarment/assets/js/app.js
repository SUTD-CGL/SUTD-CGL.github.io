const cases = window.RESULT_CASES || [];
const orientationOverrides = [
  { match: "lululemon", rotation: [-90, 0, 0] },
  { match: "lulu", rotation: [-90, 0, 0] },
  { match: "lskirt", rotation: [-90, 0, 0] },
  { match: "longskirt", rotation: [-90, 0, 0] },
  { match: "longpants", rotation: [-90, 0, 0] },
  { match: "suitdress", rotation: [-90, 0, 0] },
  { match: "shorts", rotation: [-90, 0, 0] },
  { match: "shirts", rotation: [-90, 0, 0] },
  { match: "jacket", rotation: [-90, 0, 0] },
  { match: "vast", rotation: [-90, 0, 0] }
];
const scaleOverrides = [
  { match: "shirts", scale: 1.28 },
  { match: "longpants", scale: 1.28 },
  { match: "suitdress", scale: 1.28 },
];

let activeCase = cases[0];
let autoRotate = false;

const caseList = document.querySelector("#case-list");
const resultGrid = document.querySelector("#result-grid");
const caseIndex = document.querySelector("#case-index");
const caseTitle = document.querySelector("#case-title");
const rotateButton = document.querySelector("#toggle-rotate");
const resetButton = document.querySelector("#reset-view");

function assetName(path) {
  return path ? path.split("/").pop() : "pending asset";
}

function imageMarkup(src, alt) {
  if (!src) {
    return `
      <div class="viewer-placeholder">
        <div class="mesh-token"></div>
        <div class="viewer-caption">
          <span>Asset slot</span>
          <span>pending</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="image-frame">
      <img src="${src}" alt="${alt}">
    </div>
  `;
}

function viewerMarkup(kind, garment) {
  const modelPath = kind === "final" ? garment.finalModel : garment.model;

  return `
    <div class="mesh-viewer" data-model="${modelPath}" data-kind="${kind}">
      <canvas aria-label="${garment.name} ${kind} mesh viewer"></canvas>
      <div class="mesh-status">${assetName(modelPath)}</div>
    </div>
  `;
}

function panel(title, description, badge, body, wide = false) {
  return `
    <article class="result-panel${wide ? " is-wide" : ""}">
      <div class="panel-head">
        <div>
          <h3>${title}</h3>
          ${description ? `<p>${description}</p>` : ""}
        </div>
        <span class="asset-pill">${badge}</span>
      </div>
      ${body}
    </article>
  `;
}

function garmentTitle(label) {
  return `
    <span class="garment-title">
      <span class="garment-title-label">${label}</span>
    </span>
  `;
}

function inputPanels() {
  return activeCase.garments.map((garment) => panel(
    garmentTitle(garment.label),
    "",
    "01 OBJ",
    viewerMarkup("input", garment)
  )).join("");
}

function overviewPanel(title, badge, body) {
  return `
    <article class="result-panel overview-panel">
      <div class="panel-head">
        <div>
          <h3>${title}</h3>
        </div>
        <span class="asset-pill">${badge}</span>
      </div>
      ${body}
    </article>
  `;
}

function overviewModelPanels() {
  const inputItems = activeCase.garments.map((garment) => overviewPanel(
    garmentTitle(garment.label),
    "01 OBJ",
    viewerMarkup("input", garment)
  )).join("");

  const resultItems = activeCase.garments.map((garment) => overviewPanel(
    garmentTitle("Reconfigurable Garment"),
    "03 OBJ",
    viewerMarkup("final", garment)
  )).join("");

  return inputItems + resultItems;
}

function panelsPanel() {
  const body = `
    <div class="panels-strip">
      ${imageMarkup(activeCase.sharedPanels, `${activeCase.title} shared 2D panels`)}
    </div>
  `;

  return panel(
    "Shared 2D Panels",
    "",
    "04 PNG",
    body,
    true
  );
}

function finalPanels() {
  return activeCase.garments.map((garment) => panel(
    garmentTitle("Reconfigurable Garment"),
    "",
    "03 OBJ",
    viewerMarkup("final", garment)
  )).join("");
}

function renderCaseList() {
  caseList.innerHTML = cases.map((item) => `
    <button type="button" class="case-card${item.id === activeCase.id ? " is-active" : ""}" data-case="${item.id}">
      <strong>${item.index}: ${item.title}</strong>
      <span>${item.pairLabel}</span>
    </button>
  `).join("");

  Array.from(caseList.querySelectorAll(".case-card")).forEach((button) => {
    button.addEventListener("click", () => {
      activeCase = cases.find((item) => item.id === button.dataset.case);
      render();
    });
  });
}

function renderGrid() {
  resultGrid.innerHTML = `
    <div class="overview-layout">
      <div class="overview-models">
        ${overviewModelPanels()}
      </div>
      <div class="overview-panels">
        ${panelsPanel()}
      </div>
    </div>
  `;
}

function render() {
  caseIndex.textContent = activeCase.index;
  caseTitle.textContent = activeCase.title;
  rotateButton.setAttribute("aria-pressed", String(autoRotate));
  renderCaseList();
  renderGrid();
  initMeshViewers();
}

rotateButton.addEventListener("click", () => {
  autoRotate = !autoRotate;
  render();
});

resetButton.addEventListener("click", () => {
  autoRotate = false;
  render();
});

const viewerCache = new Map();

async function loadText(path) {
  if (window.EMBEDDED_MODEL_TEXT && window.EMBEDDED_MODEL_TEXT[path]) {
    return { text: window.EMBEDDED_MODEL_TEXT[path], source: "embedded" };
  }
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return { text: await response.text(), source: "file" };
}

function parseMtl(text) {
  const materials = {};
  let current = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    if (parts[0] === "newmtl") {
      current = parts.slice(1).join(" ");
      materials[current] = [0.72, 0.72, 0.72];
    } else if (parts[0] === "Kd" && current) {
      materials[current] = parts.slice(1, 4).map(Number);
    }
  }
  return materials;
}

function resolvePath(basePath, relativePath) {
  const parts = basePath.split("/");
  parts.pop();
  return parts.concat(relativePath.replace("./", "")).join("/");
}

function orientationForPath(path) {
  const fileName = path.split("/").pop().toLowerCase();
  const override = orientationOverrides.find((item) => fileName.includes(item.match));
  return override ? override.rotation.map((degree) => degree * Math.PI / 180) : [0, 0, 0];
}

function scaleForPath(path) {
  const fileName = path.split("/").pop().toLowerCase();
  const override = scaleOverrides.find((item) => fileName.includes(item.match));
  return override ? override.scale : 1;
}

function rotatePoint(point, rotation) {
  let [x, y, z] = point;
  const [rx, ry, rz] = rotation;
  if (rx) {
    const s = Math.sin(rx);
    const c = Math.cos(rx);
    [y, z] = [y * c - z * s, y * s + z * c];
  }
  if (ry) {
    const s = Math.sin(ry);
    const c = Math.cos(ry);
    [x, z] = [x * c + z * s, -x * s + z * c];
  }
  if (rz) {
    const s = Math.sin(rz);
    const c = Math.cos(rz);
    [x, y] = [x * c - y * s, x * s + y * c];
  }
  return [x, y, z];
}

async function loadObjMesh(path) {
  if (viewerCache.has(path)) return viewerCache.get(path);

  const loadedObj = await loadText(path);
  const objText = loadedObj.text;
  let source = loadedObj.source;
  const positions = [];
  const orientation = orientationForPath(path);
  const faces = [];
  let materialName = "default";
  let materialFile = "";

  for (const rawLine of objText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    if (parts[0] === "mtllib") {
      materialFile = parts.slice(1).join(" ");
    } else if (parts[0] === "v") {
      positions.push(rotatePoint(parts.slice(1, 4).map(Number), orientation));
    } else if (parts[0] === "usemtl") {
      materialName = parts.slice(1).join(" ");
    } else if (parts[0] === "f") {
      const ids = parts.slice(1).map((token) => {
        const value = Number(token.split("/")[0]);
        return value < 0 ? positions.length + value : value - 1;
      });
      for (let i = 1; i < ids.length - 1; i += 1) {
        faces.push([ids[0], ids[i], ids[i + 1], materialName]);
      }
    }
  }

  let materials = { default: [0.72, 0.72, 0.72] };
  if (materialFile) {
    try {
      const loadedMtl = await loadText(resolvePath(path, materialFile));
      source = source === "embedded" && loadedMtl.source === "embedded" ? "embedded" : "file";
      materials = { ...materials, ...parseMtl(loadedMtl.text) };
    } catch {
      materials = { default: [0.72, 0.72, 0.72] };
    }
  }

  const vertices = [];
  const normals = [];
  const colors = [];
  const boundsMin = [Infinity, Infinity, Infinity];
  const boundsMax = [-Infinity, -Infinity, -Infinity];

  for (const [a, b, c, mat] of faces) {
    const pa = positions[a];
    const pb = positions[b];
    const pc = positions[c];
    const ux = pb[0] - pa[0];
    const uy = pb[1] - pa[1];
    const uz = pb[2] - pa[2];
    const vx = pc[0] - pa[0];
    const vy = pc[1] - pa[1];
    const vz = pc[2] - pa[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    const color = materials[mat] || materials.default;

    for (const point of [pa, pb, pc]) {
      vertices.push(point[0], point[1], point[2]);
      normals.push(nx, ny, nz);
      colors.push(color[0], color[1], color[2]);
      for (let i = 0; i < 3; i += 1) {
        boundsMin[i] = Math.min(boundsMin[i], point[i]);
        boundsMax[i] = Math.max(boundsMax[i], point[i]);
      }
    }
  }

  const center = boundsMin.map((min, i) => (min + boundsMax[i]) / 2);
  const radius = Math.max(...boundsMin.map((min, i) => boundsMax[i] - min)) || 1;
  const displayScale = scaleForPath(path);
  const normalizeVertexArray = (values) => new Float32Array(values.map((value, i) => ((value - center[i % 3]) / radius) * displayScale));
  const mesh = {
    vertices: normalizeVertexArray(vertices),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    triangleCount: faces.length,
    source
  };
  viewerCache.set(path, mesh);
  return mesh;
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function createProgram(gl) {
  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec3 aColor;
    uniform mat4 uMatrix;
    uniform mat3 uNormalMatrix;
    varying vec3 vNormal;
    varying vec3 vColor;
    void main() {
      gl_Position = uMatrix * vec4(aPosition, 1.0);
      vNormal = normalize(uNormalMatrix * aNormal);
      vColor = aColor;
    }
  `;
  const fragmentSource = `
    precision mediump float;
    varying vec3 vNormal;
    varying vec3 vColor;
    void main() {
      vec3 light = normalize(vec3(0.4, 0.65, 0.8));
      float shade = max(dot(normalize(vNormal), light), 0.0) * 0.65 + 0.35;
      gl_FragColor = vec4(vColor * shade, 1.0);
    }
  `;
  const program = gl.createProgram();
  gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  return program;
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);
}

function modelMatrix(rx, ry, zoom) {
  const sx = Math.sin(rx);
  const cx = Math.cos(rx);
  const sy = Math.sin(ry);
  const cy = Math.cos(ry);
  return new Float32Array([
    cy, sx * sy, -cx * sy, 0,
    0, cx, sx, 0,
    sy, -sx * cy, cx * cy, 0,
    0, 0, -zoom, 1
  ]);
}

function normalMatrix(rx, ry) {
  const sx = Math.sin(rx);
  const cx = Math.cos(rx);
  const sy = Math.sin(ry);
  const cy = Math.cos(ry);
  return new Float32Array([
    cy, sx * sy, -cx * sy,
    0, cx, sx,
    sy, -sx * cy, cx * cy
  ]);
}

async function setupViewer(container) {
  const canvas = container.querySelector("canvas");
  const status = container.querySelector(".mesh-status");
  const path = container.dataset.model;
  const gl = canvas.getContext("webgl", { antialias: true });
  if (!gl || !path) {
    status.textContent = "viewer unavailable";
    return;
  }

  const started = performance.now();
  const mesh = await loadObjMesh(path);
  status.textContent = `${assetName(path)} · ${mesh.triangleCount.toLocaleString()} triangles · ${mesh.source} · ${(performance.now() - started).toFixed(0)} ms`;

  const program = createProgram(gl);
  const locations = {
    position: gl.getAttribLocation(program, "aPosition"),
    normal: gl.getAttribLocation(program, "aNormal"),
    color: gl.getAttribLocation(program, "aColor"),
    matrix: gl.getUniformLocation(program, "uMatrix"),
    normalMatrix: gl.getUniformLocation(program, "uNormalMatrix")
  };

  function createBuffer(data) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buffer;
  }

  function bindAttribute(buffer, location) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
  }

  gl.useProgram(program);
  const buffers = {
    vertices: createBuffer(mesh.vertices),
    normals: createBuffer(mesh.normals),
    colors: createBuffer(mesh.colors)
  };
  gl.enable(gl.DEPTH_TEST);

  const state = { rx: -0.35, ry: 0.55, zoom: 1.7, dragging: false, x: 0, y: 0 };
  canvas.addEventListener("pointerdown", (event) => {
    state.dragging = true;
    state.x = event.clientX;
    state.y = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    state.ry += (event.clientX - state.x) * 0.01;
    state.rx += (event.clientY - state.y) * 0.01;
    state.x = event.clientX;
    state.y = event.clientY;
    draw();
  });
  canvas.addEventListener("pointerup", () => {
    state.dragging = false;
  });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    state.zoom = Math.min(5, Math.max(1.05, state.zoom + event.deltaY * 0.002));
    draw();
  }, { passive: false });

  let frameId = 0;
  function draw() {
    if (autoRotate && !state.dragging) {
      state.ry += 0.008;
    }
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(locations.matrix, false, multiply(perspective(Math.PI / 4, width / height, 0.1, 20), modelMatrix(state.rx, state.ry, state.zoom)));
    gl.uniformMatrix3fv(locations.normalMatrix, false, normalMatrix(state.rx, state.ry));
    bindAttribute(buffers.vertices, locations.position);
    bindAttribute(buffers.normals, locations.normal);
    bindAttribute(buffers.colors, locations.color);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.vertices.length / 3);
    if (autoRotate) {
      frameId = requestAnimationFrame(draw);
    }
  }

  draw();
  new ResizeObserver(() => {
    cancelAnimationFrame(frameId);
    draw();
  }).observe(canvas);
}

function initMeshViewers() {
  document.querySelectorAll(".mesh-viewer").forEach((viewer) => {
    if (viewer.dataset.initialized) return;
    viewer.dataset.initialized = "true";
    setupViewer(viewer).catch((error) => {
      const status = viewer.querySelector(".mesh-status");
      status.textContent = `could not load model: ${error.message}`;
    });
  });
}

render();
