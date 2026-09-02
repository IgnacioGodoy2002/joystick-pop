import 'regenerator-runtime'

// Ver scripts/generate-embedded-fonts.js -- @font-face con los woff2 de
// @fontsource/* inlineados como data URI (el allowlist de extensiones de
// Sura no incluye fuentes, así que no pueden viajar como .woff2 sueltos).
import './styles/embedded-fonts.css'

import Phaser from 'phaser'

import SceneKeys from './consts/SceneKeys'
import registerScenes from './registerScenes'

import config from './config'

import initI18n from './i18n'

initI18n()

const game = new Phaser.Game(config)

registerScenes(game)

game.scene.start(SceneKeys.Bootstrap)
