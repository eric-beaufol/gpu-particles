import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as dat from 'lil-gui'
import vertexShader from './shaders/particle/vertex.glsl'
import fragmentShader from './shaders/particle/fragment.glsl'
import fragmentSimulation1 from './shaders/particle/fragmentSimulation1.glsl'
import fragmentSimulation2 from './shaders/particle/fragmentSimulation2.glsl'
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer'
import glslify from 'glslify'
import Stats from 'stats.js'

/**
 * Base
 */

// Debug
const gui = new dat.GUI()
const stats = new Stats()
stats.showPanel(0)
document.body.appendChild(stats.dom)

// Canvas
const canvas = document.querySelector('canvas.webgl')

// Scene
const scene = new THREE.Scene()

const helper = new THREE.GridHelper()
// scene.add(helper)

/**
 * Particles
 */
const WIDTH = 2
const SEGMENTS = 32
const TOTAL_PARTICLES = SEGMENTS * SEGMENTS * SEGMENTS

console.log('[PARTICLES] total particles : ' + TOTAL_PARTICLES)

const material = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  blending: THREE.NormalBlending,
  uniforms: {
    uTime: { value: 0 },
    positionTexture1: { value: null },
    positionTexture2: { value: null },
    uStrength: { value: 0.378 },
    uSpeed: { value: 0.373 },
    uSize: { value: 1 },
    uSlider: { value: 1 }
  },
  vertexShader,
  fragmentShader
})

gui.add(material.uniforms.uStrength, 'value').min(0).max(2).step(.001).name('Noise strength')
gui.add(material.uniforms.uSpeed, 'value').min(0).max(1).step(.001).name('Noise speed')
gui.add(material.uniforms.uSize, 'value').min(1).max(50).step(.001).name('Particle size')
gui.add(material.uniforms.uSlider, 'value').min(0).max(1).step(0.01).name('slider')

const geometry = new THREE.BufferGeometry()

let positions = new Float32Array(TOTAL_PARTICLES * 3)
let reference = new Float32Array(TOTAL_PARTICLES * 2)

// Reference array corresponds to the coords of each pixels in the data texture
for (let i = 0; i < TOTAL_PARTICLES; i++) {

  let x = (i % SEGMENTS) / SEGMENTS
  let y = Math.floor(i / SEGMENTS) / (SEGMENTS * SEGMENTS)

  reference.set([x, y], i * 2)
}

geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
geometry.setAttribute('reference', new THREE.BufferAttribute(reference, 2))

const mesh = new THREE.Points(geometry, material)
scene.add(mesh)

/**
 * Lights
 */
// const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
// scene.add(ambientLight)

// const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6)
// directionalLight.castShadow = true
// directionalLight.shadow.mapSize.set(1024, 1024)
// directionalLight.shadow.camera.far = 15
// directionalLight.shadow.camera.left = - 7
// directionalLight.shadow.camera.top = 7
// directionalLight.shadow.camera.right = 7
// directionalLight.shadow.camera.bottom = - 7
// directionalLight.position.set(5, 5, 5)
// scene.add(directionalLight)

/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight
}

window.addEventListener('resize', () => {
  // Update sizes
  sizes.width = window.innerWidth
  sizes.height = window.innerHeight

  // Update camera
  camera.aspect = sizes.width / sizes.height
  camera.updateProjectionMatrix()

  // Update renderer
  renderer.setSize(sizes.width, sizes.height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100)
camera.position.set(0, 0, 3)
camera.lookAt(new THREE.Vector2(0, 0))
scene.add(camera)

// Controls
const controls = new OrbitControls(camera, canvas)
controls.target.set(0, 0, 0)
controls.enableDamping = true

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({ canvas })
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setClearColor(new THREE.Color(0xffffff))

/**
 * GPURenderer
 */

const gpuCompute = new GPUComputationRenderer(SEGMENTS, SEGMENTS * SEGMENTS, renderer)
const dtCubePosition = gpuCompute.createTexture()
const dtImagePosition = gpuCompute.createTexture()

fillDtCubePosition(dtCubePosition)
fillDtImagePosition(dtImagePosition)

const positionVariable1 = gpuCompute.addVariable('texturePosition1', fragmentSimulation1, dtCubePosition)
positionVariable1.wrapS = positionVariable1.wrapT = THREE.RepeatWrapping

const positionVariable2 = gpuCompute.addVariable('texturePosition2', fragmentSimulation2, dtImagePosition)
positionVariable2.wrapS = positionVariable2.wrapT = THREE.RepeatWrapping

gpuCompute.setVariableDependencies(positionVariable1, [positionVariable1])
gpuCompute.setVariableDependencies(positionVariable2, [positionVariable2])

positionVariable1.material.uniforms['uTime'] = { value: 0 }
positionVariable2.material.uniforms['uTime'] = { value: 0 }

/**
 * Animate
 */
const clock = new THREE.Clock()
let previousTime = 0

const tick = () => {
  stats.begin()
  const elapsedTime = clock.getElapsedTime()
  const deltaTime = elapsedTime - previousTime
  previousTime = elapsedTime

  // Update controls
  controls.update()

  // Uniforms
  gpuCompute.compute()
  material.uniforms.uTime.value = elapsedTime
  material.uniforms.positionTexture1.value = gpuCompute.getCurrentRenderTarget(positionVariable1).texture
  material.uniforms.positionTexture2.value = gpuCompute.getCurrentRenderTarget(positionVariable2).texture
  positionVariable1.material.uniforms.uTime.value = elapsedTime
  // positionVariable2.material.uniforms.uTime.value = elapsedTime

  // Render
  renderer.render(scene, camera)

  // Call tick again on the next frame
  window.requestAnimationFrame(tick)
  stats.end()
}

function start() {

  const error = gpuCompute.init()

  if (error !== null) {
    console.log(error)
  }


  tick()
}

function fillDtCubePosition(dtPosition) {
  let arr = dtPosition.image.data

  // Fill data texture (cube)
  for (let i = 0; i < arr.length; i += 4) {
    const index = i / 4

    const x = ((index % SEGMENTS) / (SEGMENTS - 1)) * WIDTH - WIDTH / 2
    const y = (Math.floor(index / (SEGMENTS * SEGMENTS)) / (SEGMENTS - 1)) * WIDTH - WIDTH / 2
    const z = ((Math.floor(index / SEGMENTS) % SEGMENTS) / (SEGMENTS - 1)) * WIDTH - WIDTH / 2

    arr[i] = x
    arr[i + 1] = y
    arr[i + 2] = z
    arr[i + 3] = 1
  }

  // console.log(arr)
  console.log('[DATA_TEXTURE] cube texture pixels generated: ' + arr.length / 4)
}

function fillDtImagePosition(dtPosition) {
  let arr = dtPosition.image.data

  const img = new Image()
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const size = 750
  canvas.width = size
  canvas.height = size

  img.onload = () => {
    ctx.drawImage(img, 0, 0, size, size)
    const imageData = ctx.getImageData(0, 0, size, size).data
    const blackPixelsArr = []

    for (let i = 0; i < imageData.length; i += 4) {
      const index = i / 4
      const r = imageData[i]

      if (r < 150) {
        const x = (index % size) / size
        const y = Math.floor(index / size) / size
        
        blackPixelsArr.push({ x, y, r })
      }
    }

    // document.body.appendChild(canvas)
    // canvas.style.position = 'absolute'
    // canvas.style.zIndex = 2

    for (let i = 0; i < arr.length; i += 4) {
      const rand = Math.round(Math.random() * (blackPixelsArr.length - 1))
      // const blackPixel = blackPixelsArr.splice(rand, 1)
      const blackPixel = blackPixelsArr[rand]

      const x = blackPixel.x * WIDTH - WIDTH / 2
      const y = 1 - (blackPixel.y * WIDTH)
      const z = (blackPixel.r / 150) * 0.1 * WIDTH - .1
      arr[i] = x
      arr[i + 1] = y
      arr[i + 2] = 0
      arr[i + 3] = 1
    }
    
    // console.log(arr)
    console.log('[DATA_TEXTURE] image texture pixels generated: ' + arr.length / 4)

    start()
  }

  img.src = '/img/portrait-01.jpeg'
}