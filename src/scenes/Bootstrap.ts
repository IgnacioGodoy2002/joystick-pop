import Phaser, { Scene } from 'phaser'

import SceneKeys from '~/consts/SceneKeys'
import GameEvents from '~/consts/GameEvents'
import ElementKeys from '~/consts/ElementKeys'

import WebFontFile from '~/ui/WebFontFile'
import MusicController from '~/game/MusicController'

import getSuraConfig from '~/integration/sura/SuraRuntimeConfig'
import SuraIntegrationService from '~/integration/sura/SuraIntegrationService'

const DPR = window.devicePixelRatio

export default class Bootstrap extends Phaser.Scene
{
	preload()
	{
		const fonts = new WebFontFile(this.load, [
			'Nosifer',
			'Lemon',
			'Righteous'
		])

		this.load.addFile(fonts)

		this.game.events.once(GameEvents.PreloadFinished, this.handlePreloadFinished, this)
	}

	create()
	{
		this.resize()
		this.initSuraIntegration()

		// el navegador mobile puede colapsar la barra de direcciones después
		// de la carga inicial, agrandando el contenedor real sin que Phaser
		// se entere — sin este listener, escenas creadas más tarde (Pause,
		// GameOver) miden un scale.height viejo y quedan cortas respecto a
		// la pantalla real ya crecida
		window.addEventListener('resize', () => this.resize())

		this.scene.run(SceneKeys.Preload)

		const x = this.scale.width * 0.5
		const y = this.scale.height * 0.5

		this.add.text(x, y, 'Loading...', {
			fontFamily: 'Nosifer',
			fontSize: 24 * DPR
		})
			.setOrigin(0.5, 0.5)
	}

	private handlePreloadFinished()
	{
		this.scene.stop(SceneKeys.Preload)
		console.log('preload finished')

		// Arranca acá (una sola vez por carga de página, no por escena) porque
		// this.sound es el SoundManager global del juego, no uno por escena — un
		// sonido que empieza en Bootstrap sigue sonando sin cortes al pasar a
		// TitleScreen, Game, etc. handlePreloadFinished está enganchado con
		// `.once(...)` (ver preload()), así que esto corre una sola vez por
		// carga de página real. MusicController arranca ya respetando el
		// mute guardado en localStorage (ver MusicController.ts) -- si el
		// jugador la había muteado la sesión anterior, arranca en volumen 0.
		MusicController.start(this.sound)
		this.scene.start(SceneKeys.TitleScreen)
	}

	private initSuraIntegration()
	{
		const suraConfig = getSuraConfig()

		if (!suraConfig.isEmbedded)
		{
			return
		}

		const suraService = new SuraIntegrationService({
			gameSlug: suraConfig.gameSlug,
			version: suraConfig.version
		})
		suraService.start()

		this.registry.set('suraService', suraService)
	}

	private resize()
    {
		const container = document.getElementById(ElementKeys.ContainerId)!
        const w = container.clientWidth * window.devicePixelRatio
        const h = container.clientHeight * window.devicePixelRatio

		// scale.resize() por sí solo no alcanza: Phaser fija la relación de
		// aspecto de displaySize una sola vez, al iniciar el juego, y no la
		// vuelve a tocar (comentario explícito en su propio código fuente:
		// "this is what sets the aspect ratio (which doesn't then change)").
		// Sin actualizar esa relación de aspecto a mano, el modo FIT sigue
		// letterboxeando contra el tamaño viejo — el canvas nunca crece para
		// ocupar el contenedor nuevo, aunque éste ya haya cambiado de tamaño
		this.scale.setGameSize(w, h)
		this.scale.displaySize.setAspectRatio(w / h)
		this.scale.refresh()
    }
}
