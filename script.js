import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// --- 配置常量 ---
const CONFIG = {
    segRadial: 128,    // 径向分段
    segHeight: 120,    // 高度分段
    baseRadius: 0.72,  // 基础外半径（缩小瓷器）
    height: 2.5,       // 基础高度
    clayThickness: 0.15, // 泥胚厚度
    spinSpeed: 0.02
};

// --- 全局状态 ---
const state = {
    stage: 'LOADING',
    clayData: null,
    currentCategory: 'bottle',
    targetShape: null,
    glazeMix: [],
    atmosphere: 'OXIDATION',
    isDragging: false,
    firingPhase: null
};

const LOCAL_PROGRESS_KEY = 'jdz_local_progress';
const LOCAL_CERAMICS_KEY = 'jdz_local_ceramics';

function getLocalProgress() {
    try {
        const raw = localStorage.getItem(LOCAL_PROGRESS_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || !data.stage) return null;
        return data;
    } catch { return null; }
}

function saveLocalProgress() {
    const stage = state.stage;
    if (!state.clayData) return;
    const payload = {
        clayId: state.clayData.id,
        shapeId: state.targetShape ? state.targetShape.id : null,
        category: state.currentCategory || 'bottle',
        stage,
        glazeMixIds: (state.glazeMix || []).map(m => m.id),
        finalGlazeName: state.finalGlazeName || null,
        atmosphere: state.atmosphere || 'OXIDATION'
    };
    try {
        localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(payload));
        if (document.getElementById('master-text')) {
            const prev = document.getElementById('master-text').innerHTML;
            document.getElementById('master-text').innerHTML = '已保存进度，下次可点「继续上次」。';
            setTimeout(() => { if (document.getElementById('master-text')) document.getElementById('master-text').innerHTML = prev; }, 2000);
        }
    } catch (_) {}
}

function loadLocalProgress() {
    const saved = getLocalProgress();
    if (!saved) return;
    const clay = CLAYS.find(c => c.id === saved.clayId);
    if (!clay) return;
    state.clayData = clay;
    state.currentCategory = saved.category || 'bottle';
    const cat = SHAPE_CATS[state.currentCategory];
    state.targetShape = (cat && saved.shapeId) ? cat.items.find(s => s.id === saved.shapeId) || null : null;
    state.glazeMix = (saved.glazeMixIds || []).map(id => MINERALS.find(m => m.id === id)).filter(Boolean);
    state.finalGlazeName = saved.finalGlazeName || null;
    state.atmosphere = saved.atmosphere || 'OXIDATION';
    state.firingPhase = null;
    if (!clayMesh) createClayMesh(clay); else updateClayMaterial(clay);
    const stage = saved.stage;
    if (stage === 'THROWING' || stage === 'TRIMMING' || stage === 'GLAZING' || stage === 'FIRING' || stage === 'RESULT') {
        if (state.targetShape) morphToTargetSync();
    }
    enterStage(stage);
    if (stage === 'GLAZING' && state.glazeMix.length > 0) {
        let r = 0, g = 0, b = 0;
        state.glazeMix.forEach(m => {
            const c = new THREE.Color(m.color);
            r += c.r; g += c.g; b += c.b;
        });
        const len = state.glazeMix.length;
        const mixColor = new THREE.Color(r / len, g / len, b / len);
        if (clayMesh) {
            clayMesh.material = new THREE.MeshStandardMaterial({
                color: mixColor,
                roughness: 1.0,
                bumpMap: noiseTexture,
                bumpScale: 0.02,
                side: THREE.DoubleSide
            });
        }
    }
    if (stage === 'RESULT' && state.finalGlazeName && clayMesh) {
        const has = t => state.glazeMix.some(m => m.type === t);
        let finalColor = new THREE.Color(0xffffff);
        if (has('CU')) finalColor.setHex(state.atmosphere === 'REDUCTION' ? 0xB71C1C : 0x00695C);
        else if (has('CO')) finalColor.setHex(0x1A237E);
        else if (has('FE')) finalColor.setHex(state.atmosphere === 'REDUCTION' ? 0xA5D6A7 : 0x4E342E);
        else if (has('AU')) finalColor.setHex(0xFFD700);
        clayMesh.material = new THREE.MeshPhysicalMaterial({
            color: finalColor,
            roughness: 0.15,
            metalness: 0.1,
            transmission: 0.1,
            thickness: 1.0,
            clearcoat: 1.0,
            clearcoatRoughness: 0.05,
            side: THREE.DoubleSide,
            emissive: 0x000000
        });
    }
}

function getLocalCeramics() {
    try {
        const raw = localStorage.getItem(LOCAL_CERAMICS_KEY);
        if (!raw) return [];
        const list = JSON.parse(raw);
        return Array.isArray(list) ? list : [];
    } catch { return []; }
}

function addLocalCeramic(record) {
    const list = getLocalCeramics();
    const item = {
        id: 'ceramic_' + Date.now(),
        name: record.name || '未命名作品',
        clayName: record.clayName,
        shapeName: record.shapeName,
        glazeName: record.glazeName,
        shapeId: record.shapeId || '',
        categoryKey: record.categoryKey || 'bottle',
        createdAt: new Date().toISOString()
    };
    list.unshift(item);
    try {
        localStorage.setItem(LOCAL_CERAMICS_KEY, JSON.stringify(list));
        return item;
    } catch { return null; }
}

function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s == null ? '' : s;
    return div.innerHTML;
}

function renderUserArea() {
    let el = document.getElementById('user-area');
    if (!el) {
        el = document.createElement('div');
        el.id = 'user-area';
        el.className = 'user-area';
        document.querySelector('.header-group').appendChild(el);
    }
    el.innerHTML = '<button type="button" class="btn-link" id="btn-history">以往历史</button>';
    el.querySelector('#btn-history').onclick = () => openHistoryModal();
}

function openHistoryModal() {
    const list = getLocalCeramics();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-box modal-history">
            <div class="modal-header">
                <strong>以往历史</strong>
                <button type="button" class="modal-close">×</button>
            </div>
            <div class="modal-body">
                ${list.length === 0
                    ? '<p class="no-works">暂无保存的作品。烧制完成后点击「保存作品」并命名即可加入历史。</p>'
                    : '<ul class="works-list history-list">' + list.map(w => `
                        <li class="history-item">
                            <span class="work-name">${escapeHtml(w.name)}</span>
                            <span class="work-meta">${escapeHtml(w.shapeName)} · ${escapeHtml(w.clayName)} · ${escapeHtml(w.glazeName)}</span>
                            <small class="work-date">${escapeHtml((w.createdAt || '').slice(0, 16).replace('T', ' '))}</small>
                        </li>`
                    ).join('') + '</ul>'}
            </div>
        </div>
    `;
    modal.querySelector('.modal-close').onclick = () => modal.remove();
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
}

// --- 数据库：高保真器型与材质 ---
const CLAYS = [
    { id: 'gaoling', name: '高岭土', color: 0xFFFFFF, rough: 0.9, grain: 0.5, desc: '洁白细腻，可塑性极佳' },
    { id: 'zisha', name: '紫泥', color: 0x5D4037, rough: 1.0, grain: 1.2, desc: '含铁量高，质感粗犷' },
    { id: 'cishi', name: '瓷石', color: 0xFFECB3, rough: 0.85, grain: 0.3, desc: '微黄温润，半透明度好' }
];

const SHAPE_CATS = {
    bottle: {
        name: '瓶 · 尊',
        items: [
            { id: 'meiping', name: '梅瓶', scaleY: 1.0, scaleR: 1.0, func: y => {
                if (y >= 0.86) return 0.38;
                if (y >= 0.72) return 0.38 + (0.52 - 0.38) * (1 - (y - 0.72) / 0.14);
                return 0.42 + Math.sin(y * Math.PI) * 0.48 + (y > 0.58 ? -Math.pow((y - 0.58) / 0.28, 1.6) * 0.38 : 0);
            }},
            { id: 'yuhuchun', name: '玉壶春', scaleY: 1.0, scaleR: 0.9, func: y => 0.4 + Math.pow(y, 1.5)*0.8 - Math.sin(y*Math.PI*2)*0.15 },
            { id: 'hulu', name: '葫芦瓶', scaleY: 1.0, scaleR: 1.0, func: y => 0.3 + (y<0.45 ? Math.sin(y/0.45*Math.PI)*0.5 : Math.sin((y-0.45)/0.55*Math.PI)*0.4) },
            { id: 'suantou', name: '蒜头瓶', scaleY: 1.0, scaleR: 0.9, func: y => y>0.85 ? 0.3+Math.sin((y-0.85)*20)*0.1 : 0.4 + Math.sin(y*Math.PI)*0.5 },
            { id: 'guanyin', name: '观音尊', scaleY: 1.0, scaleR: 1.0, func: y => 0.5 + Math.sin(y*Math.PI*0.8)*0.5 + y*0.2 }
        ]
    },
    cup: {
        name: '杯 · 盏',
        items: [
            { id: 'yajishou', name: '压手杯', scaleY: 0.4, scaleR: 1.1, func: y => 0.3 + y*0.8 },
            { id: 'jigang', name: '鸡缸杯', scaleY: 0.3, scaleR: 1.2, func: y => 0.4 + Math.pow(y, 0.5)*0.8 },
            { id: 'gaozu', name: '高足杯', scaleY: 0.5, scaleR: 1.0, func: y => y<0.4 ? 0.15 : 0.2 + (y-0.4)*1.5 },
            { id: 'liulian', name: '六方杯', scaleY: 0.4, scaleR: 1.0, func: y => 0.3 + y*0.6 }
        ]
    },
    plate: {
        name: '盘 · 洗',
        items: [
            { id: 'zheyan', name: '折沿洗', scaleY: 0.25, scaleR: 1.8, func: y => y>0.8 ? 1.0+(y-0.8)*2 : 0.5+y*0.5 },
            { id: 'kuikou', name: '葵口盘', scaleY: 0.15, scaleR: 2.0, func: y => 0.3 + Math.pow(y, 0.3)*1.5 },
            { id: 'bixi', name: '笔洗', scaleY: 0.2, scaleR: 1.5, func: y => 0.8 + Math.sin(y*Math.PI)*0.2 }
        ]
    }
};

const MINERALS = [
    { id: 'co', name: '苏麻离青', color: '#102A83', type: 'CO' },
    { id: 'cu', name: '孔雀石', color: '#00C853', type: 'CU' },
    { id: 'fe', name: '赤铁矿', color: '#5D4037', type: 'FE' },
    { id: 'mn', name: '玛瑙末', color: '#B2EBF2', type: 'MN' },
    { id: 'gold', name: '金粉', color: '#FFD700', type: 'AU' }
];

// 器型知识：历史、技法、发展、特点（烧制后展示）
const SHAPE_KNOWLEDGE = {
    bottle: {
        name: '瓶 · 尊',
        intro: '瓶尊类器型多用于陈设与储酒，造型挺拔，线条讲究。',
        items: {
            meiping: {
                name: '梅瓶',
                history: '梅瓶创烧于唐代，称“经瓶”，宋代定窑、耀州窑多见，明清以景德镇为最。因口小仅容梅枝而得名，后多作陈设与储酒。',
                technique: '小口、短颈、丰肩、敛腹，拉坯时肩部需饱满有力，口沿修成短直口如酒瓮，利坯讲究肩与腹的弧线过渡。',
                development: '宋时多刻划花、磁州窑白地黑花；元明青花梅瓶成为经典；清代有仿古与创新，釉色丰富。',
                features: '造型端庄稳重，线条流畅；口小易封存，适合储酒；陈设时挺拔有气势，常与瓶架搭配。'
            },
            yuhuchun: {
                name: '玉壶春',
                history: '玉壶春瓶源于宋代，其名取自“玉壶先春”诗句，原为酒器，后为经典陈设器型。',
                technique: '撇口、细颈、垂腹、圈足，重心偏下。拉坯时颈要细而挺，腹要饱满下垂，口沿外撇。',
                development: '宋元多为单色釉或刻花；明清青花、粉彩玉壶春极为常见，成为景德镇代表器型之一。',
                features: '曲线柔美，亭亭玉立；口撇便于斟酒；历代沿用不衰，是辨识度极高的传统器型。'
            },
            hulu: {
                name: '葫芦瓶',
                history: '葫芦瓶取形于天然葫芦，谐音“福禄”，宋代已有，明清景德镇大量烧造，多作陈设与赏赐。',
                technique: '上下两球体，中间束腰。拉坯分两段或一体拉出，利坯时束腰要收得利落，上下弧线对称。',
                development: '明嘉靖、万历流行；清康雍乾多有仿制与变体，如三节葫芦、绶带葫芦等。',
                features: '寓意吉祥福禄；造型饱满对称；束腰便于持握，陈设时稳重有趣。'
            },
            suantou: {
                name: '蒜头瓶',
                history: '蒜头瓶口部呈蒜头形，源于秦汉陶器与铜器，明清景德镇仿古并创新，多为陈设器。',
                technique: '口部圆鼓如蒜头，细颈、圆腹。口部需单独修整出鼓棱，颈与腹拉坯时注意比例。',
                development: '明代仿古蒜头瓶多见；清代有青花、粉彩、单色釉等多种装饰。',
                features: '口部造型独特，富有雕塑感；整体端庄，适合插花或纯陈设。'
            },
            guanyin: {
                name: '观音尊',
                history: '观音尊因形似观音持瓶而得名，清代康熙创烧，为康熙朝典型器型之一。',
                technique: '撇口、长颈、丰肩、腹下收、撇足。颈长而略弧，肩部饱满，整体修长。',
                development: '康熙青花、五彩观音尊最为著名；后世有仿制与变体。',
                features: '器型修长挺拔，线条流畅；口足外撇对称，稳重大气。'
            }
        }
    },
    cup: {
        name: '杯 · 盏',
        intro: '杯盏类器型用于饮茶、饮酒，讲究手感与口沿触感。',
        items: {
            yajishou: {
                name: '压手杯',
                history: '压手杯为明代永乐名品，因“杯体沉稳、压于手心恰宜”得名，仅见青花。',
                technique: '口沿外撇、腹壁微弧、圈足，重心在腹下部。口沿需薄而圆润，持握时贴合手心。',
                development: '永乐器为绝唱；后世仿品众多，尺寸与胎釉各有差异。',
                features: '握感沉稳舒适；口沿触感细腻；专为品茶设计，为茶器经典。'
            },
            jigang: {
                name: '鸡缸杯',
                history: '鸡缸杯为成化斗彩名品，绘子母鸡，因成对使用、小器大价而闻名。',
                technique: '敞口、浅腹、卧足，器小胎薄。拉坯需薄而匀，斗彩勾线填彩精细。',
                development: '成化后历代仿制不绝；清康雍乾官窑仿品价值亦高。',
                features: '器小精致，胎薄釉润；纹样生动，成对陈设或使用。'
            },
            gaozu: {
                name: '高足杯',
                history: '高足杯又称把杯、马上杯，元代流行，用于骑马饮酒，明清沿用为陈设或祭器。',
                technique: '杯身与高足可一体拉坯或拼接，足中空，足身需挺直，杯身可撇口或直口。',
                development: '元青花、釉里红高足杯著名；明清有斗彩、单色釉等。',
                features: '持握方便，适合持行使用；高足造型挺拔，有仪式感。'
            },
            liulian: {
                name: '六方杯',
                history: '六方杯为方器茶盏，明清多见，取“六合”之意，造型规整。',
                technique: '截面呈六棱，由泥片镶接或拉坯后利成六方，棱线需挺直，口沿平整。',
                development: '明清景德镇方器茶具常见；现代茶器仍多沿用。',
                features: '棱角分明，线条利落；持握有棱可防滑；茶席上别具一格。'
            }
        }
    },
    plate: {
        name: '盘 · 洗',
        intro: '盘洗类器型用于盛放、承水、笔洗等，形制多样。',
        items: {
            zheyan: {
                name: '折沿洗',
                history: '折沿洗口沿外折、浅腹，宋代已有，用于盥洗或陈设，明清延续。',
                technique: '折沿需利坯时做出清晰棱线，腹浅而平，底足与口沿呼应。',
                development: '宋定窑、耀州窑多见；明清景德镇有青花、单色釉等。',
                features: '口沿折线明确，造型简洁；容量适中，实用与陈设兼得。'
            },
            kuikou: {
                name: '葵口盘',
                history: '葵口盘口沿呈花瓣状，仿生葵花，唐代已有，宋元明清历代烧造。',
                technique: '口沿压出等分花口，或利坯修出瓣形，需对称均匀，腹随口形。',
                development: '越窑、定窑、景德镇均有名品；青瓷、白瓷、青花等釉色丰富。',
                features: '口沿如花，生动雅致；适合盛放果品或作陈设。'
            },
            bixi: {
                name: '笔洗',
                history: '笔洗为文房用具，用于涮笔，宋代已流行，形制多样，有圆形、桃形、叶形等。',
                technique: '浅腹、宽口便于涮笔，底平或带足，有的带小巧流口。拉坯讲究口大底稳。',
                development: '明清文房瓷洗大量生产；景德镇、宜兴等均有名品。',
                features: '实用与赏玩结合；造型小巧，适合书案；常与笔筒、水盂配套。'
            }
        }
    }
};

// --- Three.js 核心 ---
let scene, camera, renderer, controls;
let clayMesh, wheelMesh, pmremGenerator;
let noiseTexture;
let raycaster = new THREE.Raycaster();
let pointer = new THREE.Vector2();
// 中国传统风格动态背景
let backgroundSphere, backgroundCanvas, backgroundCtx;
let floatingParticles = [];
let backgroundTime = 0;

// --- 初始化 ---
function init() {
    const container = document.getElementById('canvas-container');

    // 1. 场景
    scene = new THREE.Scene();

    // 1.5 中国传统风格动态背景（水墨感天空球 + 随视角变化）
    createChineseBackground();
    createFloatingInkParticles();

    // 2. 渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0a0a0a, 1); // 与水墨背景衔接
    container.appendChild(renderer.domElement);

    // 3. 环境与光照
    pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

    const spotLight = new THREE.SpotLight(0xffffff, 10);
    spotLight.position.set(5, 8, 5);
    spotLight.angle = Math.PI / 4;
    spotLight.penumbra = 0.5;
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.bias = -0.0001;
    scene.add(spotLight);
    
    const fillLight = new THREE.PointLight(0xffaa00, 2);
    fillLight.position.set(-5, 2, -5);
    scene.add(fillLight);

    // 4. 相机
    camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 300);
    camera.position.set(0, 2.2, 6.5);
    camera.lookAt(0, 0.2, 0);

    // 5. 纹理
    noiseTexture = createProceduralNoise();

    // 6. 转盘 + 3D 树林（树底低于转盘、树尖高于转盘）
    createWheel();
    createSceneGround();
    createSceneTrees();
    createSceneStones();
    createSceneFence();

    // 7. 轨道控制器：必须绑定到渲染器 dom 元素，目标点与相机 lookAt 一致
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.2, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 12;
    controls.maxPolarAngle = Math.PI / 2 - 0.1;
    controls.enabled = true;

    // 8. 事件监听
    window.addEventListener('resize', onResize);
    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);

    document.getElementById('loading-screen').style.display = 'none';
    renderUserArea();

    const bottomPanel = document.getElementById('bottom-panel');
    const panelHandle = document.getElementById('panel-handle');
    const handleText = panelHandle && panelHandle.querySelector('.panel-handle-text');
    if (panelHandle && bottomPanel) {
        panelHandle.addEventListener('click', () => {
            bottomPanel.classList.toggle('collapsed');
            if (handleText) handleText.textContent = bottomPanel.classList.contains('collapsed') ? '展开' : '收起';
        });
    }

    enterStage('INTRO');
    animate();
}

function createProceduralNoise() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#808080';
    ctx.fillRect(0,0,size,size);
    
    const imgData = ctx.getImageData(0,0,size,size);
    const data = imgData.data;
    for(let i=0; i < data.length; i+=4) {
        const noise = (Math.random() - 0.5) * 40;
        data[i] += noise; data[i+1] += noise; data[i+2] += noise;
    }
    ctx.putImageData(imgData, 0, 0);
    
    ctx.globalCompositeOperation = 'overlay';
    for(let i=0; i<20; i++) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(0,0,0,${Math.random()*0.1})`;
        ctx.lineWidth = 1 + Math.random()*2;
        const y = Math.random() * size;
        ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 2);
    return texture;
}

// --- 中国传统风格动态背景：地平线在画布中部，托盘在“地面”以下；山/树/鸟/云/太阳随视角变化 ---
function createChineseBackground() {
    const w = 2048, h = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    backgroundCanvas = canvas;
    backgroundCtx = ctx;

    const horizon = h * 0.5; // 地平线在画布中部 → 球体赤道，托盘放低后位于“地面”以下

    const clouds = [
        { x: 0.05, y: 0.18, r: 0.1, speed: 0.06, opacity: 0.13 },
        { x: 0.35, y: 0.28, r: 0.14, speed: 0.045, opacity: 0.11 },
        { x: 0.65, y: 0.22, r: 0.12, speed: 0.07, opacity: 0.12 },
        { x: 0.2, y: 0.38, r: 0.16, speed: 0.04, opacity: 0.09 },
        { x: 0.55, y: 0.35, r: 0.11, speed: 0.055, opacity: 0.1 },
        { x: 0.88, y: 0.3, r: 0.09, speed: 0.08, opacity: 0.11 }
    ];
    // 飞鸟：只在天空区域，单向漂移
    const birds = [
        { x: 0.08, y: 0.2, vx: 0.12, wingPhase: 0 },
        { x: 0.3, y: 0.15, vx: 0.1, wingPhase: 1.2 },
        { x: 0.52, y: 0.25, vx: 0.14, wingPhase: 0.5 },
        { x: 0.7, y: 0.18, vx: 0.11, wingPhase: 2 },
        { x: 0.2, y: 0.35, vx: 0.13, wingPhase: 0.8 },
        { x: 0.45, y: 0.32, vx: 0.15, wingPhase: 1.5 }
    ];
    // 侧边往返飞鸟：从 A 飞到 B 再飞回 A，循环；左侧与右侧各若干只
    const sideBirds = [
        { xA: 0.06, xB: 0.24, y: 0.18, speed: 0.04, phase0: 0, wingPhase: 0 },
        { xA: 0.1, xB: 0.28, y: 0.28, speed: 0.035, phase0: 0.8, wingPhase: 1.2 },
        { xA: 0.08, xB: 0.22, y: 0.35, speed: 0.05, phase0: 1.5, wingPhase: 0.6 },
        { xA: 0.72, xB: 0.9, y: 0.2, speed: 0.038, phase0: 0.3, wingPhase: 0.9 },
        { xA: 0.76, xB: 0.92, y: 0.32, speed: 0.045, phase0: 1.2, wingPhase: 0.2 }
    ];

    function drawInkWashFrame(time, firingPhase) {
        const t = time * 0.02;
        const phase = firingPhase != null ? firingPhase : 0;
        const isFiring = phase > 0 && phase < 1;

        // 1. 天空与地面：柔和过渡，无硬分界线（上下统一）
        const band = h * 0.22;
        const gradFull = ctx.createLinearGradient(0, h, 0, 0);
        if (isFiring) {
            if (phase < 0.28) {
                const k = phase / 0.28;
                gradFull.addColorStop(0, '#1a1820');
                gradFull.addColorStop(0.35 - k * 0.1, '#2a2535');
                gradFull.addColorStop(0.5, '#4a3540');
                gradFull.addColorStop(0.55, '#6b4040');
                gradFull.addColorStop(0.65, '#8b5040');
                gradFull.addColorStop(0.85, '#c07050');
                gradFull.addColorStop(1, '#e8a060');
            } else if (phase < 0.55) {
                const k = (phase - 0.28) / 0.27;
                gradFull.addColorStop(0, '#0a0c14');
                gradFull.addColorStop(0.3, '#0f1220');
                gradFull.addColorStop(0.5, '#151c30');
                gradFull.addColorStop(0.7, '#1a2540');
                gradFull.addColorStop(1, '#283550');
            } else if (phase < 0.78) {
                const k = (phase - 0.55) / 0.23;
                gradFull.addColorStop(0, '#0c0e18');
                gradFull.addColorStop(0.4, '#182035');
                gradFull.addColorStop(0.7, '#283a50');
                gradFull.addColorStop(1, '#406080');
            } else {
                const k = (phase - 0.78) / 0.22;
                gradFull.addColorStop(0, '#0e1018');
                gradFull.addColorStop(0.35, '#1a2840');
                gradFull.addColorStop(0.55, '#305070');
                gradFull.addColorStop(0.7 + k * 0.2, '#6090b0');
                gradFull.addColorStop(1, '#a0c8e8');
            }
        } else {
            gradFull.addColorStop(0, '#0d5c0d');
            gradFull.addColorStop(0.12, '#157a15');
            gradFull.addColorStop(0.25, '#1e9220');
            gradFull.addColorStop(0.38, '#28a828');
            gradFull.addColorStop(0.48, '#2eb82e');
            gradFull.addColorStop(0.52, '#2a5a78');
            gradFull.addColorStop(0.58, '#3a7a98');
            gradFull.addColorStop(0.72, '#5a9cb8');
            gradFull.addColorStop(0.88, '#98c8e8');
            gradFull.addColorStop(1, '#c0e0f8');
        }
        ctx.fillStyle = gradFull;
        ctx.fillRect(0, 0, w, h);

        // 2. 太阳 / 月亮：平时明显太阳；烧制时 日落→月→日出
        const sunX = w * 0.5;
        let sunY, sunR, sunColor, drawMoon = false, moonX, moonY, moonR;
        const sunScale = 0.055;
        const moonScale = 0.05;
        if (isFiring) {
            if (phase < 0.28) {
                sunY = h * (0.58 + (1 - phase / 0.28) * 0.15);
                sunR = Math.min(w, h) * sunScale * 1.2;
                sunColor = `rgba(255, ${Math.max(0, 100 - phase * 150)}, ${50}, 0.96)`;
                ctx.fillStyle = sunColor;
                ctx.beginPath();
                ctx.arc(sunX, sunY, sunR * 0.75, 0, Math.PI * 2);
                ctx.fill();
            } else if (phase < 0.78) {
                drawMoon = true;
                moonR = Math.min(w, h) * moonScale;
                moonY = h * (0.38 + (phase - 0.28) * 0.3);
                moonX = w * 0.48;
                ctx.fillStyle = 'rgba(245, 248, 255, 0.95)';
                ctx.beginPath();
                ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(230, 238, 250, 0.35)';
                ctx.beginPath();
                ctx.arc(moonX + moonR * 0.35, moonY - moonR * 0.25, moonR * 0.45, 0, Math.PI * 2);
                ctx.fill();
            } else {
                sunY = h * (0.52 + (phase - 0.78) / 0.22 * 0.1);
                sunR = Math.min(w, h) * sunScale;
                ctx.fillStyle = 'rgba(255, 160, 90, 0.98)';
                ctx.beginPath();
                ctx.arc(sunX, sunY, sunR * 0.75, 0, Math.PI * 2);
                ctx.fill();
                const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 1.8);
                sunGrad.addColorStop(0, 'rgba(255, 180, 100, 0.55)');
                sunGrad.addColorStop(1, 'rgba(220, 120, 60, 0)');
                ctx.fillStyle = sunGrad;
                ctx.beginPath();
                ctx.arc(sunX, sunY, sunR * 1.8, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            sunY = h * (0.48 + Math.sin(t * 0.2) * 0.02);
            sunR = Math.min(w, h) * sunScale;
            ctx.fillStyle = 'rgba(255, 140, 80, 0.99)';
            ctx.beginPath();
            ctx.arc(sunX, sunY, sunR * 0.9, 0, Math.PI * 2);
            ctx.fill();
            const sunGrad = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR * 2.2);
            sunGrad.addColorStop(0, 'rgba(255, 160, 90, 0.65)');
            sunGrad.addColorStop(0.5, 'rgba(255, 120, 60, 0.2)');
            sunGrad.addColorStop(1, 'rgba(220, 90, 40, 0)');
            ctx.fillStyle = sunGrad;
            ctx.beginPath();
            ctx.arc(sunX, sunY, sunR * 2.2, 0, Math.PI * 2);
            ctx.fill();
        }

        // 3. 远山：更平、更雾，偏绿色调；四层低矮连绵，近地平线加雾带
        function drawMountainLayer(pts, r, g, b, alpha, stroke) {
            ctx.beginPath();
            ctx.moveTo(-20, h + 20);
            for (let i = 0; i < pts.length - 1; i++) {
                const p = pts[i], n = pts[i + 1];
                ctx.bezierCurveTo(p.c1x, p.c1y, n.c0x, n.c0y, n.x, n.y);
            }
            ctx.lineTo(w + 80, h + 20);
            ctx.closePath();
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            ctx.fill();
            if (stroke) {
                ctx.strokeStyle = `rgba(${Math.max(0, r - 20)}, ${Math.max(0, g - 25)}, ${Math.max(0, b - 18)}, ${Math.min(1, alpha * 0.8)})`;
                ctx.lineWidth = Math.max(1.2, w * 0.0012);
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                ctx.stroke();
            }
        }
        const hh = horizon;
        const dy = h * 0.008;
        // 更平：所有峰顶尽量贴近地平线，起伏很小；偏绿：g 略大于 r、b
        const layer4 = [
            { x: w * 0.05, y: hh + h * 0.18, c0x: -10, c0y: hh + h * 0.16, c1x: w * 0.02, c1y: hh + h * 0.15 },
            { x: w * 0.2, y: hh + h * 0.1, c0x: w * 0.12, c0y: hh + h * 0.16, c1x: w * 0.16, c1y: hh + h * 0.06 },
            { x: w * 0.38, y: hh + h * 0.14, c0x: w * 0.28, c0y: hh + h * 0.04, c1x: w * 0.34, c1y: hh + h * 0.1 },
            { x: w * 0.55, y: hh + h * 0.06, c0x: w * 0.46, c0y: hh + h * 0.12, c1x: w * 0.5, c1y: hh + h * 0.02 },
            { x: w * 0.72, y: hh + h * 0.12, c0x: w * 0.62, c0y: hh + h * 0.02, c1x: w * 0.68, c1y: hh + h * 0.08 },
            { x: w * 0.9, y: hh + h * 0.08, c0x: w * 0.8, c0y: hh + h * 0.1, c1x: w * 0.86, c1y: hh + h * 0.04 },
            { x: w * 1.12, y: h + 20, c0x: w * 0.98, c0y: hh + h * 0.06, c1x: w * 1.05, c1y: h * 0.68 }
        ];
        const layer3 = [
            { x: w * 0.04, y: hh + h * 0.22, c0x: -15, c0y: hh + h * 0.2, c1x: w * 0.01, c1y: hh + h * 0.18 },
            { x: w * 0.18, y: hh + h * 0.14, c0x: w * 0.1, c0y: hh + h * 0.2, c1x: w * 0.14, c1y: hh + h * 0.1 },
            { x: w * 0.36, y: hh + h * 0.18, c0x: w * 0.26, c0y: hh + h * 0.08, c1x: w * 0.32, c1y: hh + h * 0.14 },
            { x: w * 0.52, y: hh + h * 0.1, c0x: w * 0.44, c0y: hh + h * 0.16, c1x: w * 0.48, c1y: hh + h * 0.06 },
            { x: w * 0.7, y: hh + h * 0.16, c0x: w * 0.6, c0y: hh + h * 0.04, c1x: w * 0.66, c1y: hh + h * 0.12 },
            { x: w * 0.88, y: hh + h * 0.12, c0x: w * 0.78, c0y: hh + h * 0.14, c1x: w * 0.84, c1y: hh + h * 0.08 },
            { x: w * 1.1, y: h + 20, c0x: w * 0.96, c0y: hh + h * 0.1, c1x: w * 1.04, c1y: h * 0.7 }
        ];
        const layer2 = [
            { x: w * 0.08, y: hh + h * 0.26, c0x: -5, c0y: hh + h * 0.24, c1x: w * 0.04, c1y: hh + h * 0.22 },
            { x: w * 0.22, y: hh + h * 0.06, c0x: w * 0.14, c0y: hh + h * 0.22, c1x: w * 0.18, c1y: hh + h * 0.02 },
            { x: w * 0.38, y: hh + h * 0.16, c0x: w * 0.28, c0y: hh + dy, c1x: w * 0.34, c1y: hh + h * 0.1 },
            { x: w * 0.54, y: hh + h * 0.04, c0x: w * 0.46, c0y: hh + h * 0.12, c1x: w * 0.5, c1y: hh + dy },
            { x: w * 0.7, y: hh + h * 0.14, c0x: w * 0.62, c0y: hh + h * 0.02, c1x: w * 0.66, c1y: hh + h * 0.08 },
            { x: w * 0.86, y: hh + h * 0.08, c0x: w * 0.76, c0y: hh + h * 0.16, c1x: w * 0.82, c1y: hh + h * 0.04 },
            { x: w * 1.08, y: h + 20, c0x: w * 0.94, c0y: hh + h * 0.06, c1x: w * 1.02, c1y: h * 0.72 }
        ];
        const layer1 = [
            { x: w * 0.02, y: hh + h * 0.3, c0x: -20, c0y: hh + h * 0.28, c1x: w * 0, c1y: hh + h * 0.26 },
            { x: w * 0.16, y: hh + h * 0.04, c0x: w * 0.08, c0y: hh + h * 0.24, c1x: w * 0.12, c1y: hh + dy },
            { x: w * 0.32, y: hh + h * 0.12, c0x: w * 0.24, c0y: hh - dy, c1x: w * 0.28, c1y: hh + h * 0.06 },
            { x: w * 0.48, y: hh + h * 0.02, c0x: w * 0.4, c0y: hh + h * 0.08, c1x: w * 0.44, c1y: hh - dy },
            { x: w * 0.64, y: hh + h * 0.1, c0x: w * 0.56, c0y: hh + dy, c1x: w * 0.6, c1y: hh + h * 0.06 },
            { x: w * 0.8, y: hh + h * 0.04, c0x: w * 0.7, c0y: hh + h * 0.08, c1x: w * 0.76, c1y: hh + dy },
            { x: w * 0.96, y: hh + h * 0.06, c0x: w * 0.86, c0y: hh - dy, c1x: w * 0.92, c1y: hh + h * 0.02 },
            { x: w * 1.1, y: h + 20, c0x: w * 1.02, c0y: hh + h * 0.04, c1x: w * 1.06, c1y: h * 0.74 }
        ];
        // 偏绿色：r < g，青绿/墨绿感；更雾：alpha 略降
        drawMountainLayer(layer4, 38, 58, 48, 0.58, false);
        drawMountainLayer(layer3, 42, 65, 52, 0.65, false);
        drawMountainLayer(layer2, 48, 72, 58, 0.75, false);
        drawMountainLayer(layer1, 52, 78, 62, 0.82, true);
        // 地平线雾带：一条半透明横条，增强“雾”感
        const mistGrad = ctx.createLinearGradient(0, hh - h * 0.08, 0, hh + h * 0.12);
        mistGrad.addColorStop(0, 'rgba(200, 220, 210, 0)');
        mistGrad.addColorStop(0.35, 'rgba(210, 230, 218, 0.18)');
        mistGrad.addColorStop(0.5, 'rgba(220, 238, 225, 0.22)');
        mistGrad.addColorStop(0.65, 'rgba(210, 230, 218, 0.16)');
        mistGrad.addColorStop(1, 'rgba(200, 220, 210, 0)');
        ctx.fillStyle = mistGrad;
        ctx.fillRect(-20, hh - h * 0.08, w + 100, h * 0.2);

        // 4. 流云
        clouds.forEach(c => {
            const cx = ((c.x + c.speed * t) % 1.15) * w - w * 0.08;
            const cy = c.y * h;
            const r = c.r * Math.min(w, h);
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            g.addColorStop(0, `rgba(255, 255, 255, ${c.opacity})`);
            g.addColorStop(0.5, `rgba(242, 248, 252, ${c.opacity * 0.5})`);
            g.addColorStop(1, 'rgba(200, 210, 220, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(cx, cy, r * 1.15, r * 0.45, 0, 0, Math.PI * 2);
            ctx.fill();
        });

        // 5. 飞鸟：动态飞行，深色粗线（非烧制夜段时绘制）
        if (!isFiring || phase < 0.25 || phase > 0.75) {
            ctx.strokeStyle = 'rgba(20, 22, 30, 0.95)';
            ctx.lineWidth = Math.max(3, w * 0.003);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            birds.forEach(b => {
                const bx = ((b.x + b.vx * t) % 1.2) * w - w * 0.1;
                const by = b.y * h + Math.sin(t * 2 + b.wingPhase) * h * 0.015;
                const wingSpan = w * 0.038;
                const flap = Math.sin(t * 5 + b.wingPhase) * 0.4;
                ctx.beginPath();
                ctx.moveTo(bx - wingSpan, by + wingSpan * 0.4);
                ctx.quadraticCurveTo(bx, by - wingSpan * flap, bx + wingSpan, by + wingSpan * 0.4);
                ctx.stroke();
            });
            // 侧边往返飞鸟：从 A 飞到 B 再飞回 A，循环；左右两侧各若干只
            const wingSpanSide = w * 0.032;
            sideBirds.forEach(b => {
                const cycle = (t * b.speed + b.phase0) % 2;
                const goingRight = cycle <= 1;
                const xNorm = goingRight
                    ? b.xA + (b.xB - b.xA) * cycle
                    : b.xB - (b.xB - b.xA) * (cycle - 1);
                const bx = xNorm * w;
                const by = b.y * h + Math.sin(t * 3 + b.wingPhase) * h * 0.012;
                const flap = Math.sin(t * 6 + b.wingPhase) * 0.35;
                ctx.beginPath();
                if (goingRight) {
                    ctx.moveTo(bx - wingSpanSide, by + wingSpanSide * 0.4);
                    ctx.quadraticCurveTo(bx, by - wingSpanSide * flap, bx + wingSpanSide, by + wingSpanSide * 0.4);
                } else {
                    ctx.moveTo(bx + wingSpanSide, by + wingSpanSide * 0.4);
                    ctx.quadraticCurveTo(bx, by - wingSpanSide * flap, bx - wingSpanSide, by + wingSpanSide * 0.4);
                }
                ctx.stroke();
            });
        }

        // 7. 极轻噪点
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            const n = (Math.random() - 0.5) * 1;
            data[i] += n; data[i + 1] += n; data[i + 2] += n;
        }
        ctx.putImageData(imgData, 0, 0);
    }

    backgroundTime = 0;
    drawInkWashFrame(0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1, 1);

    const geo = new THREE.SphereGeometry(80, 48, 24);
    const mat = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: true
    });
    backgroundSphere = new THREE.Mesh(geo, mat);
    backgroundSphere.renderOrder = -1000;
    backgroundSphere.frustumCulled = false;
    scene.add(backgroundSphere);

    window._updateBackgroundTexture = function(t, firingPhase) {
        backgroundTime = t != null ? t : backgroundTime + 0.4;
        drawInkWashFrame(backgroundTime, firingPhase != null ? firingPhase : state.firingPhase);
        texture.needsUpdate = true;
    };
}

// 漂浮墨点/尘埃：中国传统意境，随视角有视差
function createFloatingInkParticles() {
    const count = 80;
    const positions = new Float32Array(count * 3);
    const velocities = [];
    const radius = 45;

    for (let i = 0; i < count; i++) {
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1) * 0.6 + Math.PI * 0.2;
        const r = 15 + Math.random() * radius;
        positions[i * 3] = r * Math.sin(ph) * Math.cos(th);
        positions[i * 3 + 1] = r * Math.cos(ph) * 0.5 + 2;
        positions[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
        velocities.push({
            x: (Math.random() - 0.5) * 0.002,
            y: (Math.random() - 0.5) * 0.001,
            z: (Math.random() - 0.5) * 0.002
        });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
        color: 0x4a5560,
        size: 0.12,
        transparent: true,
        opacity: 0.35,
        sizeAttenuation: true,
        depthWrite: false
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.userData.velocities = velocities;
    floatingParticles.push(points);
    scene.add(points);
}

// 转盘（悬空）：石砖固定不转，只有盘面+口沿+底座旋转
function createWheel() {
    const baseH = 0.12;
    const rimR = 1.2;
    const baseR = 1.15;
    const wheelY = -0.85;

    const stoneMat = function (color, bump) {
        return new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.88,
            metalness: 0.03,
            bumpMap: noiseTexture,
            bumpScale: bump != null ? bump : 0.05
        });
    };

    // 石砖垫高：单独加入场景，不参与旋转；顶部加薄过渡层与转盘底座衔接，无分界线
    const brickH = 0.1;
    const brick = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, brickH, 2.2),
        stoneMat(0x5a5a5a, 0.08)
    );
    brick.position.set(0, wheelY - baseH - brickH * 0.5, 0);
    brick.receiveShadow = true;
    brick.castShadow = true;
    scene.add(brick);
    const transitionRing = new THREE.Mesh(
        new THREE.CylinderGeometry(baseR * 0.55, baseR * 0.58, 0.04, 24),
        stoneMat(0x545454, 0.06)
    );
    transitionRing.position.set(0, wheelY - baseH - 0.02, 0);
    transitionRing.receiveShadow = true;
    scene.add(transitionRing);

    // 以下为转盘本体（盘面、口沿、底座），统一旋转
    const disk = new THREE.Mesh(
        new THREE.CylinderGeometry(rimR, baseR, baseH, 48),
        stoneMat(0x686868)
    );
    disk.position.y = baseH * 0.5;
    disk.receiveShadow = true;
    disk.castShadow = true;
    disk.renderOrder = 0;

    const rim = new THREE.Mesh(
        new THREE.TorusGeometry(rimR + 0.05, 0.05, 6, 48),
        new THREE.MeshStandardMaterial({ color: 0x565656, roughness: 0.9, metalness: 0.02 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = baseH * 0.5;
    rim.receiveShadow = true;
    rim.renderOrder = 0;

    const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(baseR * 0.35, baseR * 0.5, 0.2, 24),
        stoneMat(0x505050)
    );
    stem.position.y = -baseH * 0.5 - 0.1;
    stem.receiveShadow = true;
    stem.renderOrder = 0;

    wheelMesh = new THREE.Group();
    wheelMesh.add(disk);
    wheelMesh.add(rim);
    wheelMesh.add(stem);
    wheelMesh.position.y = wheelY;
    wheelMesh.renderOrder = 0;
    scene.add(wheelMesh);
}

// 3D 树：松树、竹子、樟树、梅花，有树枝，高度不一
function createSceneTrees() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.9, metalness: 0.05 });
    const branchMat = new THREE.MeshStandardMaterial({ color: 0x3d2a18, roughness: 0.88, metalness: 0.03 });
    const wheelY = -0.85;
    const baseY = wheelY - 0.12;

    const greenPalette = [0x0d2818, 0x1a3d1e, 0x2d5a2a, 0x3d6b38, 0x4a8048, 0x5a9a52];
    function addPine(x, z, scale, leafColor) {
        const c = leafColor != null ? leafColor : 0x1e3d1a;
        const group = new THREE.Group();
        const trunkH = 0.9 * scale;
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1 * scale, 0.16 * scale, trunkH, 8),
            trunkMat
        );
        trunk.position.y = baseY + trunkH * 0.5;
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        group.add(trunk);
        const coneH = 0.5 * scale;
        for (let i = 0; i < 3; i++) {
            const cone = new THREE.Mesh(
                new THREE.ConeGeometry(0.4 * scale - i * 0.08, coneH, 8),
                new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })
            );
            cone.position.y = baseY + trunkH + coneH * 0.5 + i * coneH * 0.85;
            cone.castShadow = true;
            cone.receiveShadow = true;
            group.add(cone);
        }
        const branch = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03 * scale, 0.05 * scale, 0.25 * scale, 6),
            branchMat
        );
        branch.rotation.z = 0.4;
        branch.position.set(0.2 * scale, baseY + trunkH * 0.6, 0.15 * scale);
        branch.castShadow = true;
        group.add(branch);
        const branchLeaf = new THREE.Mesh(new THREE.ConeGeometry(0.15 * scale, 0.2 * scale, 6), new THREE.MeshStandardMaterial({ color: c }));
        branchLeaf.rotation.z = 0.4;
        branchLeaf.position.set(0.32 * scale, baseY + trunkH * 0.72, 0.22 * scale);
        branchLeaf.castShadow = true;
        group.add(branchLeaf);
        group.position.set(x, 0, z);
        scene.add(group);
    }

    function addBamboo(x, z, scale, leafColor) {
        const c = leafColor != null ? leafColor : 0x3d5a38;
        const R = (c >> 16) & 0xff, G = (c >> 8) & 0xff, B = c & 0xff;
        const darkHex = (Math.round(R * 0.85) << 16) | (Math.round(G * 0.85) << 8) | Math.round(B * 0.85);
        const group = new THREE.Group();
        const segH = 0.35 * scale;
        const segs = 4;
        for (let i = 0; i < segs; i++) {
            const seg = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04 * scale, 0.045 * scale, segH, 8),
                new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? c : darkHex, roughness: 0.8 })
            );
            seg.position.y = baseY + segH * 0.5 + i * segH;
            seg.castShadow = true;
            seg.receiveShadow = true;
            group.add(seg);
        }
        const top = new THREE.Mesh(
            new THREE.ConeGeometry(0.2 * scale, 0.3 * scale, 6),
            new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })
        );
        top.position.y = baseY + segs * segH + 0.15 * scale;
        top.castShadow = true;
        group.add(top);
        group.position.set(x, 0, z);
        scene.add(group);
    }

    function addCamphor(x, z, scale, leafColor) {
        const c = leafColor != null ? leafColor : 0x1a3822;
        const group = new THREE.Group();
        const trunkH = 0.85 * scale;
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12 * scale, 0.2 * scale, trunkH, 8),
            trunkMat
        );
        trunk.position.y = baseY + trunkH * 0.5;
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        group.add(trunk);
        const leafMat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
        const cap1 = new THREE.Mesh(new THREE.SphereGeometry(0.45 * scale, 8, 6), leafMat);
        cap1.position.y = baseY + trunkH + 0.2 * scale;
        cap1.castShadow = true;
        cap1.receiveShadow = true;
        group.add(cap1);
        const cap2 = new THREE.Mesh(new THREE.SphereGeometry(0.35 * scale, 8, 6), leafMat);
        cap2.position.set(0.2 * scale, baseY + trunkH + 0.5 * scale, 0.15 * scale);
        cap2.castShadow = true;
        group.add(cap2);
        const br = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04 * scale, 0.06 * scale, 0.35 * scale, 6),
            branchMat
        );
        br.rotation.z = 0.5;
        br.position.set(0.25 * scale, baseY + trunkH * 0.7, 0);
        br.castShadow = true;
        group.add(br);
        const brLeaf = new THREE.Mesh(new THREE.SphereGeometry(0.18 * scale, 6, 5), leafMat);
        brLeaf.position.set(0.45 * scale, baseY + trunkH * 0.85, 0.05 * scale);
        brLeaf.castShadow = true;
        group.add(brLeaf);
        group.position.set(x, 0, z);
        scene.add(group);
    }

    function addPlum(x, z, scale, leafColor) {
        const c = leafColor != null ? leafColor : 0x2a4030;
        const group = new THREE.Group();
        const trunkH = 0.7 * scale;
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07 * scale, 0.12 * scale, trunkH, 6),
            trunkMat
        );
        trunk.position.y = baseY + trunkH * 0.5;
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        group.add(trunk);
        const branch1 = new THREE.Mesh(
            new THREE.CylinderGeometry(0.035 * scale, 0.05 * scale, 0.4 * scale, 5),
            branchMat
        );
        branch1.rotation.z = 0.6;
        branch1.position.set(0.12 * scale, baseY + trunkH * 0.7, 0.08 * scale);
        branch1.castShadow = true;
        group.add(branch1);
        const branch2 = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03 * scale, 0.04 * scale, 0.3 * scale, 5),
            branchMat
        );
        branch2.rotation.z = -0.4;
        branch2.position.set(-0.08 * scale, baseY + trunkH * 0.85, 0.1 * scale);
        branch2.castShadow = true;
        group.add(branch2);
        const leafMat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
        const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.25 * scale, 6, 5), leafMat);
        foliage.position.y = baseY + trunkH + 0.15 * scale;
        foliage.castShadow = true;
        foliage.receiveShadow = true;
        group.add(foliage);
        const flowerMat = new THREE.MeshBasicMaterial({ color: 0xffe4ec });
        for (let i = 0; i < 5; i++) {
            const f = new THREE.Mesh(new THREE.SphereGeometry(0.04 * scale, 6, 4), flowerMat);
            f.position.set((i - 2) * 0.08 * scale, baseY + trunkH + 0.1 * scale + (i % 2) * 0.06 * scale, (i % 3 - 1) * 0.06 * scale);
            group.add(f);
        }
        group.position.set(x, 0, z);
        scene.add(group);
    }

    const addTree = { pine: addPine, bamboo: addBamboo, camphor: addCamphor, plum: addPlum };
    const types = ['pine', 'bamboo', 'camphor', 'plum'];
    const seed = 12345;
    const rnd = (i) => ((Math.sin(i * 7 + seed) * 0.5 + 0.5) * 0.4 + 0.8);
    const positions = [];
    const radii = [4.2, 4.9, 4.0, 5.3, 5.0, 4.5, 5.7, 4.4, 5.1, 5.2, 4.3, 5.5, 4.7];
    const angles = [0.1, 0.55, 1.0, 1.35, 1.9, 2.25, 2.7, 3.15, 3.6, 4.0, 4.5, 5.1, 5.6];
    radii.forEach((R, i) => {
        const a = angles[i] * Math.PI;
        const jitter = (rnd(i) - 0.8) * 0.4;
        positions.push([
            (R + jitter) * Math.cos(a) + (rnd(i + 10) - 0.5) * 0.25,
            (R + jitter) * Math.sin(a) + (rnd(i + 20) - 0.5) * 0.25
        ]);
    });
    const scales = [0.72, 1.18, 0.88, 1.02, 0.8, 1.12, 0.92, 0.98, 1.22, 0.76, 1.05, 0.86, 0.95];
    positions.forEach((p, i) => {
        const type = types[i % types.length];
        const leafColor = greenPalette[i % greenPalette.length];
        addTree[type](p[0], p[1], scales[i % scales.length], leafColor);
    });
}

// 石头陪衬：散落在树底与转盘周围
function createSceneStones() {
    const wheelY = -0.85;
    const baseY = wheelY - 0.12;
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5c5346, roughness: 0.95, metalness: 0.02 });
    const stoneMat2 = new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 0.9, metalness: 0.03 });
    const positions = [
        [-1.8, 3.2], [3.0, 3.0], [3.2, -2.2], [-2.8, -2.5], [0.8, -3.5], [-3.2, 1.0],
        [1.5, 3.6], [-2.0, -3.8], [3.8, 0.5], [-0.8, 4.0]
    ];
    const sizes = [0.08, 0.12, 0.1, 0.14, 0.07, 0.11, 0.09, 0.13, 0.06, 0.1];
    positions.forEach((p, i) => {
        const sx = sizes[i % sizes.length] * (0.9 + (i % 3) * 0.15);
        const sy = sizes[i % sizes.length] * 0.6 * (0.85 + (i % 2) * 0.2);
        const sz = sizes[i % sizes.length] * (1.1 + (i % 4) * 0.1);
        const geo = new THREE.DodecahedronGeometry(1, 0);
        const stone = new THREE.Mesh(geo, i % 2 === 0 ? stoneMat : stoneMat2);
        stone.scale.set(sx, sy, sz);
        stone.position.set(p[0], baseY + sy * 0.5, p[1]);
        stone.rotation.set((i % 5) * 0.2, (i % 7) * 0.3, (i % 4) * 0.15);
        stone.castShadow = true;
        stone.receiveShadow = true;
        scene.add(stone);
    });
}

// 木头围栏：4 段，远离转盘
function createSceneFence() {
    const wheelY = -0.85;
    const baseY = wheelY - 0.12;
    const radius = 5.2;
    const numPosts = 4;
    const postHeight = 0.35;
    const postRadius = 0.04;
    const railHeight = 0.06;
    const railDepth = 0.04;
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.92, metalness: 0.02 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x5a3820, roughness: 0.9, metalness: 0.03 });
    for (let i = 0; i < numPosts; i++) {
        const angle = (i / numPosts) * Math.PI * 2;
        const x = radius * Math.cos(angle);
        const z = radius * Math.sin(angle);
        const post = new THREE.Mesh(
            new THREE.CylinderGeometry(postRadius, postRadius * 1.15, postHeight, 6),
            woodDark
        );
        post.position.set(x, baseY + postHeight * 0.5, z);
        post.rotation.z = (i % 2) * 0.02;
        post.castShadow = true;
        post.receiveShadow = true;
        scene.add(post);
    }
    const railSegments = 3;
    for (let r = 0; r < railSegments; r++) {
        const yOff = baseY + postHeight * 0.25 + r * (postHeight * 0.35);
        for (let i = 0; i < numPosts; i++) {
            const angle1 = (i / numPosts) * Math.PI * 2;
            const angle2 = ((i + 1) / numPosts) * Math.PI * 2;
            const x1 = radius * Math.cos(angle1), z1 = radius * Math.sin(angle1);
            const x2 = radius * Math.cos(angle2), z2 = radius * Math.sin(angle2);
            const dx = x2 - x1, dz = z2 - z1;
            const len = Math.sqrt(dx * dx + dz * dz);
            const rail = new THREE.Mesh(
                new THREE.BoxGeometry(len, railHeight, railDepth),
                woodMat
            );
            rail.position.set((x1 + x2) * 0.5, yOff, (z1 + z2) * 0.5);
            rail.rotation.y = -Math.atan2(dx, dz);
            rail.castShadow = true;
            rail.receiveShadow = true;
            scene.add(rail);
        }
    }
}

// 实体化草地：3D 地面圆盘，与树底同高
function createSceneGround() {
    const wheelY = -0.85;
    const baseY = wheelY - 0.12;
    const radius = 7;
    const segments = 64;
    const geo = new THREE.CircleGeometry(radius, segments);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x287028,
        roughness: 0.95,
        metalness: 0.02,
        side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.position.y = baseY - 0.005;
    ground.receiveShadow = true;
    ground.renderOrder = -10;
    scene.add(ground);
}

// --- 阶段逻辑 ---
function enterStage(stage) {
    state.stage = stage;
    renderUI(stage);
}

function renderUI(stage) {
    const panel = document.getElementById('control-content');
    const master = document.getElementById('master-text');
    const badge = document.getElementById('stage-name');
    
    panel.innerHTML = '';
    
    if (stage === 'INTRO') {
        badge.innerText = '序章';
        master.innerText = "欢迎来到景德镇云工坊。老朽将带你体验从选土到烧窑的全过程。";
        createBtn(panel, "开始制瓷", () => enterStage('CLAY'));
        if (getLocalProgress()) {
            createBtn(panel, "继续上次", () => loadLocalProgress(), 'btn-continue');
        }
    }
    else if (stage === 'CLAY') {
        badge.innerText = '一、选泥';
        master.innerText = "不同的泥料决定了瓷器的骨肉。高岭土白皙，紫泥厚重，瓷石通透。";
        if(!clayMesh) createClayMesh(CLAYS[0]);
        
        const grid = document.createElement('div');
        grid.className = 'clay-grid';
        CLAYS.forEach(clay => {
            const el = document.createElement('div');
            el.className = 'clay-item';
            if(state.clayData && state.clayData.id === clay.id) el.classList.add('selected');
            el.innerHTML = `<div class="clay-ball" style="background-color:#${clay.color.toString(16).padStart(6, '0')}"></div><div>${clay.name}</div>`;
            el.onclick = () => {
                updateClayMaterial(clay);
                document.querySelectorAll('.clay-item').forEach(i=>i.classList.remove('selected'));
                el.classList.add('selected');
                if(!panel.querySelector('.btn-next')) {
                    createBtn(panel, "确认用泥", () => enterStage('SHAPE'), 'btn-next');
                }
            };
            grid.appendChild(el);
        });
        panel.appendChild(grid);
        createBtn(panel, "保存进度", () => saveLocalProgress(), 'btn-save-progress');
    }
    else if (stage === 'SHAPE') {
        badge.innerText = '二、定型';
        master.innerText = "器以载道。请选择你要制作的器型类别。";
        
        const tabContainer = document.createElement('div');
        tabContainer.className = 'category-tabs';
        
        ['bottle', 'cup', 'plate'].forEach(catKey => {
            const btn = document.createElement('div');
            btn.className = `tab-btn ${state.currentCategory === catKey ? 'active' : ''}`;
            btn.innerText = SHAPE_CATS[catKey].name;
            btn.onclick = () => {
                state.currentCategory = catKey;
                renderShapeList(listContainer);
                document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
                btn.classList.add('active');
            };
            tabContainer.appendChild(btn);
        });
        panel.appendChild(tabContainer);
        
        const scroller = document.createElement('div');
        scroller.className = 'shape-scroller';
        const listContainer = document.createElement('div');
        listContainer.className = 'shape-list';
        scroller.appendChild(listContainer);
        panel.appendChild(scroller);
        renderShapeList(listContainer);
        createBtn(panel, "保存进度", () => saveLocalProgress(), 'btn-save-progress');
    }
    else if (stage === 'THROWING') {
        badge.innerText = '三、拉坯';
        master.innerHTML = `目标：<b>${state.targetShape.name}</b>。<br>手指在模型上滑动，赋予泥土灵魂。点击下方按钮自动精修。`;
        createBtn(panel, "自动塑形", () => morphToTarget());
        createBtn(panel, "保存进度", () => saveLocalProgress(), 'btn-save-progress');
    }
    else if (stage === 'TRIMMING') {
        badge.innerText = '四、利坯';
        master.innerText = "修去多余泥料，使器壁厚薄均匀。手指划过之处，泥屑飞溅。";
        state.isDragging = false;
        createBtn(panel, "修整完毕", () => enterStage('GLAZING'));
        createBtn(panel, "保存进度", () => saveLocalProgress(), 'btn-save-progress');
    }
    else if (stage === 'GLAZING') {
        badge.innerText = '五、施釉';
        master.innerText = "釉料是瓷器的衣裳。不同矿物在不同火焰下会呈现截然不同的颜色。";
        
        const rack = document.createElement('div');
        rack.className = 'mineral-rack';
        MINERALS.forEach(m => {
            const div = document.createElement('div');
            div.className = 'mineral';
            div.innerHTML = `<div class="rock-icon" style="background:${m.color}"></div><div style="font-size:10px;margin-top:5px">${m.name}</div>`;
            div.onclick = () => addGlaze(m);
            rack.appendChild(div);
        });
        panel.appendChild(rack);
        createBtn(panel, "去烧窑", () => enterStage('FIRING'));
        createBtn(panel, "保存进度", () => saveLocalProgress(), 'btn-save-progress');
    }
    else if (stage === 'FIRING') {
        badge.innerText = '六、烧制';
        master.innerText = "最后一步。氧化焰清丽，还原焰深沉。";
        document.getElementById('center-feedback').classList.remove('hidden');
        
        const box = document.createElement('div');
        box.className = 'fire-controls';
        
        const btnOx = document.createElement('div');
        btnOx.className = 'fire-btn';
        btnOx.innerHTML = '<b>氧化焰</b><br><small>氧气充足</small>';
        btnOx.onclick = () => { state.atmosphere = 'OXIDATION'; startFiring(); };
        
        const btnRe = document.createElement('div');
        btnRe.className = 'fire-btn';
        btnRe.innerHTML = '<b>还原焰</b><br><small>缺氧环境</small>';
        btnRe.onclick = () => { state.atmosphere = 'REDUCTION'; startFiring(); };
        
        box.appendChild(btnOx);
        box.appendChild(btnRe);
        panel.appendChild(box);
        createBtn(panel, "保存进度", () => saveLocalProgress(), 'btn-save-progress');
    }
    else if (stage === 'RESULT') {
        badge.innerText = '大成';
        document.getElementById('center-feedback').classList.add('hidden');
        const shape = state.targetShape;
        const clay = state.clayData;
        const glazeName = state.finalGlazeName || '白瓷';
        const cat = state.currentCategory || 'bottle';
        const catInfo = SHAPE_CATS[cat];
        const shapeName = shape ? shape.name : '瓷器';
        const clayName = clay ? clay.name : '泥料';
        const summary = `器成！您以${clayName}制${shapeName}，釉呈${glazeName}。`;
        master.innerHTML = summary;
        const evalDiv = document.createElement('div');
        evalDiv.className = 'result-block';
        const evalText = getResultEvaluation(shapeName, clayName, glazeName);
        evalDiv.innerHTML = `<div class="result-eval"><strong>窑评</strong><p>${evalText}</p></div>`;
        panel.appendChild(evalDiv);
        const knowledge = getShapeKnowledge(shape ? shape.id : null, cat);
        if (knowledge) {
            const knowDiv = document.createElement('div');
            knowDiv.className = 'result-knowledge';
            knowDiv.innerHTML = `
                <strong>器型知识 · ${knowledge.name}</strong>
                <p><b>历史</b> ${knowledge.history}</p>
                <p><b>技法</b> ${knowledge.technique}</p>
                <p><b>发展</b> ${knowledge.development}</p>
                <p><b>特点</b> ${knowledge.features}</p>
            `;
            panel.appendChild(knowDiv);
        }
        const saveAndName = () => {
            const defaultName = '作品 ' + new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            const name = prompt('为这件作品起个名字（留空则使用默认名）', defaultName);
            const finalName = (name && name.trim()) ? name.trim() : defaultName;
            addLocalCeramic({ name: finalName, clayName, shapeName, glazeName, shapeId: shape ? shape.id : '', categoryKey: cat });
            if (document.getElementById('master-text')) {
                document.getElementById('master-text').innerHTML = '已保存到「以往历史」，可点击顶部「以往历史」查看。';
            }
        };
        createBtn(panel, "保存作品", saveAndName);
        createBtn(panel, "再制一件", () => location.reload());
    }
}

function getResultEvaluation(shapeName, clayName, glazeName) {
    const parts = [];
    if (clayName === '高岭土') parts.push('胎骨洁白细腻');
    else if (clayName === '紫泥') parts.push('胎质厚重沉稳');
    else if (clayName === '瓷石') parts.push('胎体通透温润');
    if (glazeName === '白瓷') parts.push('釉面素雅');
    else if (glazeName === '郎窑红' || glazeName === '孔雀绿' || glazeName === '霁蓝釉') parts.push('釉色纯正');
    else if (glazeName === '影青釉' || glazeName === '酱色釉') parts.push('釉色古雅');
    else if (glazeName === '金彩') parts.push('装饰华贵');
    const mid = parts.length ? parts.join('，') + '；' : '';
    return `您所作${shapeName}，${mid}器型端庄、成型规整。烧成到位，可称一件合格的景德镇风格作品。继续尝试不同泥料与釉色，体会土与火的变化。`;
}

function getShapeKnowledge(shapeId, categoryKey) {
    if (!shapeId || !categoryKey || !SHAPE_KNOWLEDGE[categoryKey]) return null;
    const cat = SHAPE_KNOWLEDGE[categoryKey];
    const item = cat.items[shapeId];
    if (!item) return null;
    return { name: item.name, history: item.history, technique: item.technique, development: item.development, features: item.features };
}

function renderShapeList(container) {
    container.innerHTML = '';
    const shapes = SHAPE_CATS[state.currentCategory].items;
    
    shapes.forEach(shape => {
        const card = document.createElement('div');
        card.className = 'shape-card';
        const pathData = generateSVGPath(shape.func, shape.scaleY, shape.scaleR);
        
        card.innerHTML = `
            <div class="shape-preview"><svg viewBox="0 0 100 100"><path d="${pathData}" /></svg></div>
            <div class="shape-name">${shape.name}</div>
        `;
        
        card.onclick = () => {
            document.querySelectorAll('.shape-card').forEach(c=>c.classList.remove('active'));
            card.classList.add('active');
            state.targetShape = shape;
            if(!container.parentNode.parentNode.querySelector('.btn-start')) {
                createBtn(container.parentNode.parentNode, "开始拉坯", () => enterStage('THROWING'), 'btn-start');
            }
        };
        container.appendChild(card);
    });
}

// --- 核心 3D 算法重构 ---

function createClayMesh(clayData) {
    if(clayMesh) scene.remove(clayMesh);

    // 定义旋转剖面 (Profile)
    const points = [];
    const thick = CONFIG.clayThickness;
    const r = CONFIG.baseRadius;
    const h = CONFIG.height;

    // --- A. 内底 (从中心到角落) ---
    const floorSteps = 5;
    for(let i=0; i<=floorSteps; i++) {
        points.push(new THREE.Vector2((r - thick) * (i/floorSteps), thick));
    }
    
    // --- B. 内壁 (向上) ---
    const wallSteps = CONFIG.segHeight;
    for(let i=0; i<=wallSteps; i++) {
        const t = i/wallSteps;
        points.push(new THREE.Vector2(r - thick, thick + (h - thick) * t));
    }
    
    // --- C. 口沿：与器身同量级厚度，单弧圆润光滑、有瓷器口缘感 ---
    const rimRadius = thick * 0.78;
    const rimCenterX = r - thick * 0.5;
    const rimCenterY = h + Math.sqrt(Math.max(0, rimRadius * rimRadius - thick * thick * 0.25));
    const angleStart = Math.atan2((h - rimCenterY), (r - thick - rimCenterX));
    const angleEnd = Math.atan2((h - rimCenterY), (r - rimCenterX));
    const rimArcSteps = 22;
    for (let i = 1; i <= rimArcSteps; i++) {
        const angle = angleStart + (i / rimArcSteps) * (angleEnd - angleStart);
        const px = rimCenterX + Math.cos(angle) * rimRadius;
        const py = rimCenterY + Math.sin(angle) * rimRadius;
        points.push(new THREE.Vector2(px, py));
    }

    // --- D. 外壁 (向下) ---
    for(let i=wallSteps; i>=0; i--) {
        const t = i/wallSteps;
        points.push(new THREE.Vector2(r, thick + (h - thick) * t));
    }
    
    // --- E. 外底 (向中心) ---
    for(let i=floorSteps; i>=0; i--) {
        points.push(new THREE.Vector2(r * (i/floorSteps), 0));
    }

    // 生成旋转体几何体
    const geo = new THREE.LatheGeometry(points, CONFIG.segRadial);
    
    // 计算 wallType 并处理 UV 修复算法
    const count = geo.attributes.position.count;
    const wallType = new Float32Array(count);
    const pointsCount = points.length;
    
    const rimPointCount = 22;
    const idxInnerStart = floorSteps + 1;
    const idxInnerEnd = floorSteps + 1 + wallSteps;
    const idxOuterStart = idxInnerEnd + rimPointCount + 1;
    const idxOuterEnd = idxOuterStart + wallSteps;
    
    // 获取 Position 和 UV 引用
    const posAttribute = geo.attributes.position;
    const uvAttribute = geo.attributes.uv;

    for(let i=0; i<count; i++) {
        const pIndex = i % pointsCount;
        
        // 标记 WallType
        if (pIndex >= idxInnerStart && pIndex <= idxInnerEnd) {
            wallType[i] = -1.0; // 内壁
        } else if (pIndex >= idxOuterStart && pIndex <= idxOuterEnd) {
            wallType[i] = 1.0;  // 外壁
        } else {
            wallType[i] = 0.0;  // 底部或口沿
        }

        // --- 核心修复算法：底部 UV 平面重映射 ---
        const y = posAttribute.getY(i);
        const x = posAttribute.getX(i);
        const z = posAttribute.getZ(i);
        
        const isOuterBottom = (y < 0.01);
        const isInnerBottom = (y > thick - 0.01 && y < thick + 0.01 && Math.sqrt(x*x+z*z) < r - thick + 0.01);

        if (isOuterBottom || isInnerBottom) {
            const scale = 2.5 * CONFIG.baseRadius;
            const u = 0.5 + x / scale;
            const v = 0.5 + z / scale;
            uvAttribute.setXY(i, u, v);
        }
    }
    
    geo.setAttribute('wallType', new THREE.BufferAttribute(wallType, 1));
    geo.computeVertexNormals();
    uvAttribute.needsUpdate = true;

    const mat = new THREE.MeshStandardMaterial({
        color: clayData.color,
        roughness: clayData.rough,
        bumpMap: noiseTexture,
        bumpScale: 0.05,
        side: THREE.DoubleSide
    });
    
    clayMesh = new THREE.Mesh(geo, mat);
    clayMesh.castShadow = true;
    clayMesh.receiveShadow = true;
    clayMesh.renderOrder = 0;

    clayMesh.userData.originalRadius = r;
    clayMesh.userData.thickness = thick;
    clayMesh.userData.height = h;

    clayMesh.position.y = -0.79; // 悬空转盘顶面约 -0.79，泥胚底落在盘面上
    scene.add(clayMesh);
    state.clayData = clayData;
}

function updateClayMaterial(data) {
    if(clayMesh) {
        clayMesh.material.color.setHex(data.color);
        clayMesh.material.roughness = data.rough;
        state.clayData = data;
    }
}

function deformMesh(intersectPoint, isTrimming = false) {
    const localPoint = clayMesh.worldToLocal(intersectPoint.clone());
    const positions = clayMesh.geometry.attributes.position;
    const wallTypes = clayMesh.geometry.attributes.wallType;
    const count = positions.count;
    const thickness = CONFIG.clayThickness;

    const mouseRadius = Math.sqrt(localPoint.x**2 + localPoint.z**2);
    const brushRadius = 0.6;
    const strength = 0.15;

    for(let i=0; i<count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        const currentR = Math.sqrt(x*x + z*z);

        if (currentR < 0.01) {
            continue; 
        }

        const y = positions.getY(i);
        const type = wallTypes.getX(i);
        
        const distY = Math.abs(y - localPoint.y);
        
        if(distY < brushRadius) {
            const factor = Math.exp( -Math.pow(distY, 2) / (2 * 0.05) );
            const angle = Math.atan2(z, x);
            let targetRForVertex = currentR;
            
            if (!isTrimming) {
                if (type === 1.0) { 
                    targetRForVertex = THREE.MathUtils.lerp(currentR, mouseRadius, factor * strength);
                } else if (type === -1.0) { 
                    const innerTarget = Math.max(0.1, mouseRadius - thickness);
                    targetRForVertex = THREE.MathUtils.lerp(currentR, innerTarget, factor * strength);
                } else {
                    if (y > CONFIG.height * 0.9) {
                        targetRForVertex = THREE.MathUtils.lerp(currentR, mouseRadius - (thickness/2), factor * strength);
                    }
                }
            } else {
                targetRForVertex = currentR - (0.02 * factor);
            }
            
            targetRForVertex = Math.max(0.1, Math.min(4.0, targetRForVertex));
            
            positions.setX(i, Math.cos(angle) * targetRForVertex);
            positions.setZ(i, Math.sin(angle) * targetRForVertex);
        }
    }
    
    positions.needsUpdate = true;
    clayMesh.geometry.computeVertexNormals();
}

function morphToTarget() {
    state.isDragging = false;
    const shape = state.targetShape;
    if(!shape) return;
    
    const positions = clayMesh.geometry.attributes.position;
    const wallTypes = clayMesh.geometry.attributes.wallType;
    const startPos = positions.array.slice();
    const targetPos = new Float32Array(positions.count * 3);
    const thickness = CONFIG.clayThickness;
    
    for(let i=0; i<positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        const y = positions.getY(i);
        const currentR = Math.sqrt(x*x + z*z);
        
        if (currentR < 0.01) {
            targetPos[i*3] = x;
            targetPos[i*3+1] = y;
            targetPos[i*3+2] = z;
            continue;
        }

        const type = wallTypes.getX(i);
        let normY = Math.max(0, Math.min(1, y / CONFIG.height));
        let baseR = shape.func(normY) * shape.scaleR * CONFIG.baseRadius;
        const thicknessFactor = normY <= 0.22 ? 1 : (1 - 0.6 * (normY - 0.22) / 0.78);
        const effThickness = thickness * Math.max(0.4, thicknessFactor);
        if (normY > 0.92) baseR *= 1 + 0.008 * (normY - 0.92) / 0.08;
        let r = baseR;
        const rimTopTaper = (normY > 0.93) ? (0.72 + 0.28 * (1 - normY) / 0.07) : 1;
        if (type === -1.0) {
             r = Math.max(0.05, baseR - effThickness);
        } else if (type === 1.0) {
             r = baseR;
        } else {
             r = Math.max(0.05, baseR - effThickness * 0.5 * rimTopTaper);
             if (y < 0.1) r = baseR * (currentR / CONFIG.baseRadius);
        }
        
        const angle = Math.atan2(z, x);
        targetPos[i*3] = Math.cos(angle) * r;
        targetPos[i*3+1] = y * shape.scaleY;
        targetPos[i*3+2] = Math.sin(angle) * r;
    }
    
    let t = 0;
    const interval = setInterval(() => {
        t += 0.02;
        if(t >= 1) {
            clearInterval(interval);
            enterStage('TRIMMING');
            return;
        }
        const ease = 1 - (1-t)*(1-t);
        for(let i=0; i<positions.count; i++) {
            const i3 = i*3;
            positions.setX(i, THREE.MathUtils.lerp(startPos[i3], targetPos[i3], ease));
            positions.setY(i, THREE.MathUtils.lerp(startPos[i3+1], targetPos[i3+1], ease));
            positions.setZ(i, THREE.MathUtils.lerp(startPos[i3+2], targetPos[i3+2], ease));
        }
        positions.needsUpdate = true;
        clayMesh.geometry.computeVertexNormals();
    }, 16);
}

// 仅把泥胚变形为目标器型，不切换阶段（用于恢复进度）
function morphToTargetSync() {
    const shape = state.targetShape;
    if (!shape || !clayMesh) return;
    const positions = clayMesh.geometry.attributes.position;
    const wallTypes = clayMesh.geometry.attributes.wallType;
    const thickness = CONFIG.clayThickness;
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), z = positions.getZ(i), y = positions.getY(i);
        const currentR = Math.sqrt(x * x + z * z);
        if (currentR < 0.01) continue;
        const type = wallTypes.getX(i);
        const normY = Math.max(0, Math.min(1, y / CONFIG.height));
        let baseR = shape.func(normY) * shape.scaleR * CONFIG.baseRadius;
        const thicknessFactor = normY <= 0.22 ? 1 : (1 - 0.6 * (normY - 0.22) / 0.78);
        const effThickness = thickness * Math.max(0.4, thicknessFactor);
        if (normY > 0.92) baseR *= 1 + 0.008 * (normY - 0.92) / 0.08;
        const rimTopTaper = (normY > 0.93) ? (0.72 + 0.28 * (1 - normY) / 0.07) : 1;
        let r = baseR;
        if (type === -1.0) r = Math.max(0.05, baseR - effThickness);
        else if (type === 1.0) r = baseR;
        else { r = Math.max(0.05, baseR - effThickness * 0.5 * rimTopTaper); if (y < 0.1) r = baseR * (currentR / CONFIG.baseRadius); }
        const angle = Math.atan2(z, x);
        positions.setX(i, Math.cos(angle) * r);
        positions.setY(i, y * shape.scaleY);
        positions.setZ(i, Math.sin(angle) * r);
    }
    positions.needsUpdate = true;
    clayMesh.geometry.computeVertexNormals();
}

function addGlaze(mineral) {
    if(state.glazeMix.length >= 3) state.glazeMix.shift();
    state.glazeMix.push(mineral);
    
    let r=0, g=0, b=0;
    state.glazeMix.forEach(m => {
        const c = new THREE.Color(m.color);
        r+=c.r; g+=c.g; b+=c.b;
    });
    const len = state.glazeMix.length;
    const mixColor = new THREE.Color(r/len, g/len, b/len);
    
    clayMesh.material = new THREE.MeshStandardMaterial({
        color: mixColor,
        roughness: 1.0,
        bumpMap: noiseTexture,
        bumpScale: 0.02,
        side: THREE.DoubleSide
    });
}

function startFiring() {
    document.querySelector('.fire-controls').style.display = 'none';
    let temp = 20;
    const feedback = document.getElementById('feedback-text');
    
    let finalColor = new THREE.Color(0xffffff);
    let finalName = "白瓷";
    const has = t => state.glazeMix.some(m => m.type === t);
    
    if(has('CU')) {
        finalColor.setHex(state.atmosphere==='REDUCTION' ? 0xB71C1C : 0x00695C);
        finalName = state.atmosphere==='REDUCTION' ? "郎窑红" : "孔雀绿";
    } else if(has('CO')) {
        finalColor.setHex(0x1A237E);
        finalName = "霁蓝釉";
    } else if(has('FE')) {
        finalColor.setHex(state.atmosphere==='REDUCTION' ? 0xA5D6A7 : 0x4E342E);
        finalName = state.atmosphere==='REDUCTION' ? "影青釉" : "酱色釉";
    } else if(has('AU')) {
        finalColor.setHex(0xFFD700);
        finalName = "金彩";
    }
    
    const tempStart = 20, tempEnd = 1300;
    const timer = setInterval(() => {
        temp += 20;
        feedback.innerText = `${temp}°C`;
        state.firingPhase = Math.min(1, (temp - tempStart) / (tempEnd - tempStart));
        
        if(temp > 800) {
            clayMesh.material.emissive = new THREE.Color(0xff3300);
            clayMesh.material.emissiveIntensity = (temp-800)/1000;
        }
        
        if(temp >= 1300) {
            clearInterval(timer);
            state.firingPhase = 1;
            setTimeout(() => {
                clayMesh.material = new THREE.MeshPhysicalMaterial({
                    color: finalColor,
                    roughness: 0.15,
                    metalness: 0.1,
                    transmission: 0.1,
                    thickness: 1.0,
                    clearcoat: 1.0,
                    clearcoatRoughness: 0.05,
                    side: THREE.DoubleSide,
                    emissive: 0x000000
                });
                document.getElementById('master-text').innerHTML = `窑变生成：<b>${finalName}</b>`;
                state.firingPhase = null;
                state.finalGlazeName = finalName;
                enterStage('RESULT');
            }, 1000);
        }
    }, 30);
}

function generateSVGPath(func, scaleY, scaleR) {
    let path = `M 50 100 `;
    const steps = 20;
    
    for(let i=0; i<=steps; i++) {
        const t = i/steps;
        const y = 100 - (t * 100 * scaleY);
        const r = func(t) * 30 * scaleR;
        path += `L ${50+r} ${y} `;
    }
    for(let i=steps; i>=0; i--) {
        const t = i/steps;
        const y = 100 - (t * 100 * scaleY);
        const r = func(t) * 30 * scaleR;
        path += `L ${50-r} ${y} `;
    }
    path += "Z";
    return path;
}

function createBtn(parent, text, cb, className) {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (className || '');
    btn.innerText = text;
    btn.onclick = cb;
    parent.appendChild(btn);
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onPointerDown(e) {
    state.isDragging = true;
    updatePointer(e);
}

function onPointerUp() {
    state.isDragging = false;
}

function onPointerMove(e) {
    updatePointer(e);
    if(state.isDragging && clayMesh) {
        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObject(clayMesh);
        if(intersects.length > 0) {
            if(state.stage === 'THROWING') deformMesh(intersects[0].point, false);
            if(state.stage === 'TRIMMING') deformMesh(intersects[0].point, true);
        }
    }
}

function updatePointer(e) {
    const x = e.clientX || (e.touches && e.touches[0].clientX);
    const y = e.clientY || (e.touches && e.touches[0].clientY);
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((x - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((y - rect.top) / rect.height) * 2 + 1;
}

let _frameCount = 0;
function animate() {
    requestAnimationFrame(animate);
    _frameCount++;

    // 背景球缓慢旋转 → 飞鸟/流云/太阳/树木随视角变换而改变
    if (backgroundSphere) {
        backgroundSphere.rotation.y += 0.00012;
        backgroundSphere.rotation.x = Math.sin(_frameCount * 0.0015) * 0.015;
    }
    if (window._updateBackgroundTexture) {
        window._updateBackgroundTexture(undefined, state.firingPhase);
    }

    // 漂浮墨点缓慢位移（动态 + 随视角自然视差）
    floatingParticles.forEach(points => {
        const pos = points.geometry.attributes.position;
        const vel = points.userData.velocities;
        for (let i = 0; i < pos.count; i++) {
            pos.array[i * 3] += vel[i].x;
            pos.array[i * 3 + 1] += vel[i].y;
            pos.array[i * 3 + 2] += vel[i].z;
            // 简单边界回绕，保持墨点在视野附近
            if (Math.abs(pos.array[i * 3]) > 50) vel[i].x *= -1;
            if (pos.array[i * 3 + 1] > 12 || pos.array[i * 3 + 1] < -5) vel[i].y *= -1;
            if (Math.abs(pos.array[i * 3 + 2]) > 50) vel[i].z *= -1;
        }
        pos.needsUpdate = true;
    });

    if(wheelMesh) wheelMesh.rotation.y -= CONFIG.spinSpeed;
    if(clayMesh) {
        const spd = (state.stage === 'THROWING' || state.stage === 'TRIMMING') ? 0.1 : 0.005;
        clayMesh.rotation.y -= spd;
    }
    
    controls.update();
    renderer.render(scene, camera);
}

init();
