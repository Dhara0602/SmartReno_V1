/**
 * ARVisualizer — Three.js 3D room scene with pseudo-AR camera overlay.
 * Exposes: ARVisualizer.init(canvasId, furniture[]), ARVisualizer.destroy()
 */
const ARVisualizer = (() => {
  let _scene, _camera, _renderer, _animFrameId;
  let _orbitActive = false, _lastPointer = { x: 0, y: 0 };
  let _yaw = 0.3, _pitch = 0.2;
  let _placedObjects = [];
  let _selectedObj = null;
  let _cameraTexture = null, _cameraPlane = null, _cameraStream = null;
  let _furnitureList = [];
  let _onSelectCallback = null;
  let _onPlaceCallback = null;
  let _canvas = null;

  // ── Color palette for furniture proxies ───────────────────────────────────
  const PROXY_COLORS = [0x00d4ff, 0x7c3aed, 0x10b981, 0xf59e0b, 0xef4444, 0x8b5cf6];

  // ── Three.js Setup ─────────────────────────────────────────────────────────
  function buildScene() {
    _scene = new THREE.Scene();
    _scene.background = new THREE.Color(0x0d1117);
    _scene.fog = new THREE.FogExp2(0x0d1117, 0.04);
  }

  function buildCamera(canvas) {
    _camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
    _camera.position.set(0, 2.5, 7);
  }

  function buildRenderer(canvas) {
    _renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    _renderer.shadowMap.enabled = true;
    _renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  function buildLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    _scene.add(ambient);

    const ceiling = new THREE.PointLight(0xffeedd, 1.2, 20);
    ceiling.position.set(0, 4.5, 0);
    ceiling.castShadow = true;
    ceiling.shadow.mapSize.set(1024, 1024);
    _scene.add(ceiling);

    const fill = new THREE.DirectionalLight(0x99ccff, 0.3);
    fill.position.set(-5, 5, 5);
    _scene.add(fill);
  }

  function buildRoom() {
    const ROOM_W = 10, ROOM_H = 5, ROOM_D = 10;
    const matWall   = new THREE.MeshLambertMaterial({ color: 0x1e2a3a, side: THREE.BackSide });
    const matFloor  = new THREE.MeshLambertMaterial({ color: 0x2a1f14 });
    const matCeiling = new THREE.MeshLambertMaterial({ color: 0x111827, side: THREE.BackSide });

    // Room box
    const boxGeo = new THREE.BoxGeometry(ROOM_W, ROOM_H, ROOM_D);
    const roomMesh = new THREE.Mesh(boxGeo, matWall);
    roomMesh.position.set(0, ROOM_H / 2, 0);
    roomMesh.receiveShadow = true;
    _scene.add(roomMesh);

    // Floor (separate so it can receive shadows from above)
    const floorGeo = new THREE.PlaneGeometry(ROOM_W, ROOM_D);
    const floor = new THREE.Mesh(floorGeo, matFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    _scene.add(floor);

    // Floor grid lines (subtle)
    const grid = new THREE.GridHelper(ROOM_W, 10, 0x1a2a3a, 0x1a2a3a);
    grid.position.y = 0.01;
    _scene.add(grid);

    // Skirting board accent
    const skirtGeo = new THREE.BoxGeometry(ROOM_W, 0.08, 0.06);
    const skirtMat = new THREE.MeshLambertMaterial({ color: 0x00d4ff, emissive: 0x003344 });
    [-ROOM_D / 2 + 0.03, ROOM_D / 2 - 0.03].forEach(z => {
      const s = new THREE.Mesh(skirtGeo, skirtMat);
      s.position.set(0, 0.04, z);
      _scene.add(s);
    });
  }

  // ── Camera AR background ───────────────────────────────────────────────────
  async function tryArBackground() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
    try {
      _cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
        audio: false,
      });

      const video = document.createElement('video');
      video.srcObject = _cameraStream;
      video.setAttribute('playsinline', true);
      video.muted = true;
      await video.play();

      _cameraTexture = new THREE.VideoTexture(video);
      _cameraTexture.minFilter = THREE.LinearFilter;

      const geo = new THREE.PlaneGeometry(20, 12);
      const mat = new THREE.MeshBasicMaterial({ map: _cameraTexture });
      _cameraPlane = new THREE.Mesh(geo, mat);
      _cameraPlane.position.set(0, 3, -9.9);
      _scene.add(_cameraPlane);

      _scene.background = null;
      return true;
    } catch {
      return false;
    }
  }

  function stopArBackground() {
    if (_cameraStream) {
      _cameraStream.getTracks().forEach(t => t.stop());
      _cameraStream = null;
    }
    if (_cameraPlane) {
      _scene.remove(_cameraPlane);
      _cameraPlane.geometry.dispose();
      _cameraPlane.material.dispose();
      _cameraPlane = null;
    }
    if (_cameraTexture) {
      _cameraTexture.dispose();
      _cameraTexture = null;
    }
    _scene.background = new THREE.Color(0x0d1117);
  }

  // ── Furniture proxy placement ──────────────────────────────────────────────
  function placeFurniture(item, index) {
    const color = PROXY_COLORS[index % PROXY_COLORS.length];

    // Dimensions: vary by rough category heuristic
    const name = (item.name || '').toLowerCase();
    let w = 1.2, h = 0.8, d = 0.8;
    if (name.includes('sofa') || name.includes('sectional')) { w = 2.4; h = 0.9; d = 1.0; }
    else if (name.includes('table') && name.includes('dining')) { w = 1.8; h = 0.78; d = 0.9; }
    else if (name.includes('table') || name.includes('desk')) { w = 1.2; h = 0.75; d = 0.6; }
    else if (name.includes('chair')) { w = 0.8; h = 1.0; d = 0.8; }
    else if (name.includes('shelf') || name.includes('shelving') || name.includes('bookcase')) { w = 1.0; h = 1.8; d = 0.35; }
    else if (name.includes('bed')) { w = 1.8; h = 0.6; d = 2.1; }
    else if (name.includes('wardrobe') || name.includes('armoire')) { w = 1.8; h = 2.0; d = 0.6; }
    else if (name.includes('lamp') || name.includes('light') || name.includes('lantern')) { w = 0.3; h = 1.6; d = 0.3; }
    else if (name.includes('rug') || name.includes('carpet')) { w = 2.0; h = 0.05; d = 1.5; }
    else if (name.includes('pouffe') || name.includes('ottoman') || name.includes('stool')) { w = 0.6; h = 0.45; d = 0.6; }
    else if (name.includes('art') || name.includes('print') || name.includes('painting') || name.includes('hanging')) { w = 1.2; h = 0.9; d = 0.05; }

    // Spread items across the room avoiding collision
    const spread = 1.6;
    const cols   = 3;
    const col    = index % cols;
    const row    = Math.floor(index / cols);
    const x      = (col - 1) * spread * 1.5;
    const z      = -1 - row * spread;

    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.88 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { item, originalColor: color, index };
    _scene.add(mesh);

    // Label (canvas texture)
    const label = makeLabel(item.name, item.estimatedCost);
    label.position.set(x, h + 0.25, z);
    _scene.add(label);

    const obj = { mesh, label, item };
    _placedObjects.push(obj);
    return obj;
  }

  function makeLabel(name, cost) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.roundRect(0, 0, 256, 64, 8);
    ctx.fill();
    ctx.fillStyle = '#00d4ff';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(name.substring(0, 22), 128, 24);
    ctx.fillStyle = '#8892a4';
    ctx.font = '14px Inter, sans-serif';
    ctx.fillText(`£${cost}`, 128, 48);

    const tex = new THREE.CanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(1.6, 0.4);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Mesh(geo, mat);
    return sprite;
  }

  function selectObject(obj) {
    if (_selectedObj) {
      _selectedObj.mesh.material.color.setHex(_selectedObj.mesh.userData.originalColor);
      _selectedObj.mesh.material.opacity = 0.88;
    }
    _selectedObj = obj;
    if (obj) {
      obj.mesh.material.color.setHex(0xffffff);
      obj.mesh.material.opacity = 1;
      if (_onSelectCallback) _onSelectCallback(obj.item);
    } else {
      if (_onSelectCallback) _onSelectCallback(null);
    }
  }

  function getSelected() { return _selectedObj; }

  function rotateSelected(degrees) {
    if (!_selectedObj) return;
    _selectedObj.mesh.rotation.y += THREE.MathUtils.degToRad(degrees);
    _selectedObj.label.rotation.y = _selectedObj.mesh.rotation.y;
  }

  function scaleSelected(factor) {
    if (!_selectedObj) return;
    const s = _selectedObj.mesh.scale;
    const next = s.x * factor;
    if (next < 0.3 || next > 3) return;
    _selectedObj.mesh.scale.setScalar(next);
    const h = _selectedObj.mesh.geometry.parameters.height * next;
    _selectedObj.mesh.position.y = h / 2;
    _selectedObj.label.position.y = h + 0.25;
  }

  function deleteSelected() {
    if (!_selectedObj) return;
    _scene.remove(_selectedObj.mesh);
    _scene.remove(_selectedObj.label);
    _selectedObj.mesh.geometry.dispose();
    _selectedObj.mesh.material.dispose();
    _selectedObj.label.material.dispose();
    _placedObjects = _placedObjects.filter(o => o !== _selectedObj);
    _selectedObj = null;
    if (_onSelectCallback) _onSelectCallback(null);
  }

  function clearAll() {
    [..._placedObjects].forEach(o => {
      _scene.remove(o.mesh); _scene.remove(o.label);
      o.mesh.geometry.dispose(); o.mesh.material.dispose(); o.label.material.dispose();
    });
    _placedObjects = [];
    _selectedObj = null;
    if (_onSelectCallback) _onSelectCallback(null);
  }

  // ── Orbit Controls (manual) ────────────────────────────────────────────────
  function updateCameraOrbit() {
    const r = 7;
    _camera.position.x = r * Math.sin(_yaw) * Math.cos(_pitch);
    _camera.position.y = r * Math.sin(_pitch) + 2.5;
    _camera.position.z = r * Math.cos(_yaw) * Math.cos(_pitch);
    _camera.lookAt(0, 1, 0);
  }

  function onPointerDown(e) {
    _orbitActive = true;
    const p = e.touches ? e.touches[0] : e;
    _lastPointer = { x: p.clientX, y: p.clientY };
  }

  function onPointerMove(e) {
    if (!_orbitActive) return;
    const p = e.touches ? e.touches[0] : e;
    const dx = p.clientX - _lastPointer.x;
    const dy = p.clientY - _lastPointer.y;
    _lastPointer = { x: p.clientX, y: p.clientY };
    _yaw   -= dx * 0.006;
    _pitch  = Math.max(-0.4, Math.min(1.2, _pitch - dy * 0.005));
    updateCameraOrbit();
  }

  function onPointerUp() { _orbitActive = false; }

  // ── Click to select ────────────────────────────────────────────────────────
  function onCanvasClick(e) {
    if (!_canvas || !_renderer || !_scene || !_camera) return;
    const rect = _canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, _camera);
    const hits = raycaster.intersectObjects(_placedObjects.map(o => o.mesh));
    if (hits.length > 0) {
      const hitMesh = hits[0].object;
      const obj = _placedObjects.find(o => o.mesh === hitMesh);
      selectObject(obj || null);
    } else {
      selectObject(null);
    }
  }

  // ── Keyboard controls ──────────────────────────────────────────────────────
  function onKeyDown(e) {
    switch (e.key) {
      case 'r': case 'R': rotateSelected(15); break;
      case '+': case '=': scaleSelected(1.1); break;
      case '-': case '_': scaleSelected(0.9); break;
      case 'd': case 'D': deleteSelected(); break;
    }
  }

  // ── Animation Loop ─────────────────────────────────────────────────────────
  function animate() {
    _animFrameId = requestAnimationFrame(animate);
    if (_cameraTexture) _cameraTexture.needsUpdate = true;
    // Gently rotate labels to face camera
    _placedObjects.forEach(o => {
      o.label.lookAt(_camera.position);
    });
    _renderer.render(_scene, _camera);
  }

  // ── Resize ─────────────────────────────────────────────────────────────────
  function onResize() {
    if (!_canvas || !_renderer || !_camera) return;
    const w = _canvas.clientWidth;
    const h = _canvas.clientHeight;
    _renderer.setSize(w, h, false);
    _camera.aspect = w / h;
    _camera.updateProjectionMatrix();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  async function init(canvasId, furniture, { onSelect, onPlace } = {}) {
    _canvas    = document.getElementById(canvasId);
    _furnitureList = furniture || [];
    _onSelectCallback = onSelect || null;
    _onPlaceCallback  = onPlace  || null;

    buildScene();
    buildCamera(_canvas);
    buildRenderer(_canvas);
    buildLighting();
    buildRoom();

    updateCameraOrbit();

    // Attempt AR camera background on mobile
    const arSuccess = await tryArBackground();
    const badge = document.querySelector('.ar-badge');
    if (badge) badge.textContent = arSuccess ? '● AR Live' : '● 3D Room';

    // Events
    _canvas.addEventListener('mousedown',  onPointerDown);
    _canvas.addEventListener('mousemove',  onPointerMove);
    _canvas.addEventListener('mouseup',    onPointerUp);
    _canvas.addEventListener('mouseleave', onPointerUp);
    _canvas.addEventListener('touchstart', onPointerDown, { passive: true });
    _canvas.addEventListener('touchmove',  onPointerMove, { passive: true });
    _canvas.addEventListener('touchend',   onPointerUp);
    _canvas.addEventListener('click',      onCanvasClick);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize',  onResize);

    animate();
    return { arActive: arSuccess };
  }

  function addFurnitureItem(item, index) {
    return placeFurniture(item, index);
  }

  function destroy() {
    if (_animFrameId) cancelAnimationFrame(_animFrameId);
    stopArBackground();
    clearAll();
    if (_renderer) { _renderer.dispose(); _renderer = null; }
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize',  onResize);
    _scene = _camera = _canvas = null;
  }

  return {
    init,
    addFurnitureItem,
    rotateSelected,
    scaleSelected,
    deleteSelected,
    getSelected,
    clearAll,
    destroy,
    get placedCount() { return _placedObjects.length; },
  };
})();

window.ARVisualizer = ARVisualizer;
