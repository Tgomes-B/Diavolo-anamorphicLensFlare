import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Fn, texture, uv, vec2, float, vec3, step, grayscale, cubeTexture, screenUV, uniform } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRCubeTextureLoader } from 'three/addons/loaders/HDRCubeTextureLoader.js';

const uThreshold = uniform(0.9);
const uScale = uniform(0.6);
const uSpread = uniform(0.004);
const uIntensity = uniform(1.0);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 8);

const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(10, 10, 10);
scene.add(light);
light.target.position.set(7.0, 5.0, -5.0);
scene.add(light.target);


// Objetos da cena e background HDR
// Comentario: Eu puxei esse background do efeito que eu escolhi isso tava la no projeto original
const hdrUrls = [ 'px.hdr', 'nx.hdr', 'py.hdr', 'ny.hdr', 'pz.hdr', 'nz.hdr' ];
  const hdrTexture = await new HDRCubeTextureLoader()
    .setPath('assest/pisaHDR/')
    .loadAsync(hdrUrls);
  scene.environment = hdrTexture;
  scene.backgroundNode = grayscale(
    cubeTexture(hdrTexture).mul(
      screenUV.distance(.5).oneMinus().remapClamp(.1, 4)
    )
  );
  hdrTexture.rotation = Math.PI; 
  hdrTexture.flipY = true; 

// Carregamento do modelo GLTF
// Comentario: Modelo do Diavolo por que sim
const gltfLoader = new GLTFLoader();
gltfLoader.load(
  'assest/Diavolo/scene.gltf',
  (gltf) => {
    // Corrige orientação 
    gltf.scene.rotation.z = -Math.PI ;
    gltf.scene.position.x = 7.0;
    gltf.scene.position.y = 5.0;
    gltf.scene.position.z = -5.0;
    gltf.scene.scale.set(5.0, 5.0, 5.0);
    scene.add(gltf.scene);
    

  },
  undefined,
  (error) => {
    console.error('Erro ao carregar GLTF:', error);
  }
);

const renderTarget = new THREE.RenderTarget(window.innerWidth, window.innerHeight);
renderTarget.texture.minFilter = THREE.LinearFilter;
renderTarget.texture.magFilter = THREE.LinearFilter;

const postScene = new THREE.Scene();
const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// Função que recebe a textura da cena e aplica o efeito
const anamorphicShader = Fn(() => {
    const t = texture(renderTarget.texture);
    
    //Cor do pixel
    const color = t.rgb;
    
    // Flare pra acumular o efeito
    const flare = vec3(0.0).toVar();

    // Loop de amostragem horizontal
    for (let i = -8; i <= 8; i++) {
        if (i !== 0) {
            // offset  é calculado o deslocamento horizontal com o indice e uSpread
            const offset = float(i).mul(uSpread);

            // SampleColor pega a cor de um pixel a esquerda ou direita  baseado no offset causando efeito de flare
            // flare é um efeito de luz que se espalha numa camera (eu n sabia)
            const sampleColor = t.sample(uv().add(vec2(offset, 0.0))).rgb;

            // Brightness pega o valor do canal mais brilhande do pixel pra aplicar o efeito
            const brightness = sampleColor.r.max(sampleColor.g).max(sampleColor.b);

            // Step compara o uniform uThreshold com o brilho
            const weight = step(uThreshold, brightness);

            // Decay faz com que quanto mais longe do centro do pixel mais fraco é o efeito
            const decay = float(1.0).div(float(Math.abs(i)).mul(1.5).max(1.0));
            
            // Acumula o efeito de flare 
            flare.addAssign(
                sampleColor
                    .mul(weight)
                    .mul(decay)
                    .mul(uScale)    
                    .mul(uIntensity) 
                    .mul(vec3(0.5, 0.5, 1.0)) 
            );
        }
    }

    // Retorna a cor original mais o efeito de flare
    return color.add(flare);
});

// Criamos um quadrado que ocupa a tela toda
const postMaterial = new THREE.MeshBasicNodeMaterial();
postMaterial.colorNode = anamorphicShader();
const fullScreenQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial);
postScene.add(fullScreenQuad);

const gui = new dat.GUI();
gui.add(uThreshold, 'value', 0.0, 2, 0.01).name('Threshold');
gui.add(uScale, 'value', 0, 4, 0.01).name('Scale');
gui.add(uSpread, 'value', 0.001, 0.02, 0.0001).name('Spread');
gui.add(uIntensity, 'value', 0, 4, 0.01).name('Intensity');

// Renderização
renderer.setAnimationLoop((timeMs) => {
    controls.update();

    // Desenha a cena 3D dentro do renderTarget 
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);

    // Desenha o quadrado com o efeito na tela final 
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
    
});

window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
    renderTarget.setSize(width, height); 
});