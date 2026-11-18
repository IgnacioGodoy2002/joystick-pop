import Phaser from 'phaser'

import { DarkColor } from '~/consts/Colors'

import button from '~/ui/Buttons'
import leaderboardPanel from '~/ui/LeaderboardPanel'
import fetchLeaderboard from '~/services/LeaderboardService'
import SceneKeys from '~/consts/SceneKeys'
import getSuraConfig from '~/integration/sura/SuraRuntimeConfig'
import SuraIntegrationService from '~/integration/sura/SuraIntegrationService'
import { i18next } from '~/i18n'

export default class Leaderboard extends Phaser.Scene
{
	private bg?: Phaser.GameObjects.Graphics
	private overlay?: Phaser.GameObjects.Rectangle
	private title?: Phaser.GameObjects.Text
	private loadingText?: Phaser.GameObjects.Text
	private errorText?: Phaser.GameObjects.Text
	private panel?: Phaser.GameObjects.DOMElement
	private backBtn?: Phaser.GameObjects.DOMElement

	private shutdown = false

	create()
	{
		this.shutdown = false

		const width = this.scale.width
		const height = this.scale.height
		const x = width * 0.5
		const y = height * 0.5

		// mismo degradé que TitleScreen.ts/Game.ts/HowToPlay.ts
		this.bg = this.add.graphics()
			.fillGradientStyle(0x1a2a4d, 0x1a2a4d, 0x2d5a8a, 0x4fb3d9, 1)
			.fillRect(0, 0, width, height)
			.setDepth(0)

		this.overlay = this.add.rectangle(x, y, width, height, DarkColor, 0.25)

		const fontSize = Math.min(width * 0.13, 180)
		this.title = this.add.text(x, height * 0.14, i18next.t('leaderboard.title'), {
			fontFamily: 'Nosifer',
			fontSize,
			color: '#508cdc',
			align: 'center',
			stroke: DarkColor,
			strokeThickness: 8
		})
		.setOrigin(0.5, 0.5)
		.setScale(0, 0)

		const maxTitleWidth = width * 0.9
		if (this.title.width > maxTitleWidth)
		{
			this.title.setFontSize(fontSize * (maxTitleWidth / this.title.width))
		}

		this.loadingText = this.add.text(x, height * 0.5, i18next.t('leaderboard.loading'), {
			fontFamily: 'Righteous',
			fontSize: Math.min(width * 0.05, 32),
			color: '#ffffff',
			align: 'center'
		})
		.setOrigin(0.5, 0.5)

		this.backBtn = this.add.dom(x, height * 0.92, button(i18next.t('common.back')))
			.setScale(0, 0)
			.addListener('click').on('click', () => {
				this.scene.start(SceneKeys.TitleScreen)
			})

		const timeline = this.tweens.timeline()

		timeline.add({
			targets: this.title,
			scale: 1,
			ease: 'Back.easeOut',
			duration: 300
		})

		timeline.add({
			targets: this.backBtn,
			scale: 1,
			ease: 'Back.easeOut',
			duration: 300
		})

		timeline.play()

		const suraService = this.registry.get('suraService') as SuraIntegrationService | undefined

		// Embebido el fetch no puede salir hasta que el handshake haya
		// traído gameId/apiBaseUrl. En mobile esa respuesta puede llegar
		// después de que esta pantalla ya esté abierta -- antes se pedía el
		// ranking igual, sin esos datos, y se caía al listado de relleno:
		// el jugador veía nombres inventados como si fueran el ranking real.
		// onSessionReady además corre en el acto si el handshake ya terminó.
		let unsubscribe: (() => void) | undefined

		if (suraService)
		{
			unsubscribe = suraService.onSessionReady(() => {
				// `embedded` se decide recién acá, no al crear la escena: en
				// el WebView nativo el bridge del host aparece después de la
				// carga, así que preguntarlo antes daría standalone por error
				// y mostraría el listado de relleno.
				this.loadLeaderboard(suraService, getSuraConfig().isEmbedded)
			})
		}
		else
		{
			this.loadLeaderboard(undefined, getSuraConfig().isEmbedded)
		}

		this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)

		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			this.shutdown = true
			unsubscribe?.()
			this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)
		})
	}

	private loadLeaderboard(suraService: SuraIntegrationService | undefined, embedded: boolean)
	{
		fetchLeaderboard({
			gameId: suraService?.getGameId(),
			apiBaseUrl: suraService?.getApiBaseUrl(),
			embedded
		}).then(entries => {
			if (this.shutdown)
			{
				// la escena ya se destruyó antes de que resolviera el fetch
				return
			}

			this.loadingText?.destroy()
			this.loadingText = undefined

			if (!entries || entries.length === 0)
			{
				this.showError()
				return
			}

			this.panel = this.add.dom(this.scale.width * 0.5, this.scale.height * 0.52, leaderboardPanel(entries))
				.setScale(0, 0)

			this.tweens.add({
				targets: this.panel,
				scale: 1,
				ease: 'Back.easeOut',
				duration: 300
			})
		})
	}

	// Un ranking que no se pudo traer se dice, no se disimula con datos de
	// relleno (ver LeaderboardService).
	private showError()
	{
		this.errorText = this.add.text(this.scale.width * 0.5, this.scale.height * 0.5, i18next.t('leaderboard.error'), {
			fontFamily: 'Righteous',
			fontSize: Math.min(this.scale.width * 0.05, 32),
			color: '#ffffff',
			align: 'center',
			wordWrap: { width: this.scale.width * 0.8 }
		})
		.setOrigin(0.5, 0.5)
	}

	// el navegador mobile puede colapsar la barra de direcciones después de
	// que esta escena ya se creó — sin esto, todo queda calculado contra el
	// scale.width/height viejo
	private handleResize()
	{
		const width = this.scale.width
		const height = this.scale.height
		const x = width * 0.5
		const y = height * 0.5

		this.bg?.clear()
			.fillGradientStyle(0x1a2a4d, 0x1a2a4d, 0x2d5a8a, 0x4fb3d9, 1)
			.fillRect(0, 0, width, height)

		this.overlay?.setPosition(x, y).setSize(width, height)

		const fontSize = Math.min(width * 0.13, 180)
		this.title?.setPosition(x, height * 0.14).setFontSize(fontSize)

		const maxTitleWidth = width * 0.9
		if (this.title && this.title.width > maxTitleWidth)
		{
			this.title.setFontSize(fontSize * (maxTitleWidth / this.title.width))
		}

		this.loadingText?.setPosition(x, height * 0.5)
		this.errorText?.setPosition(x, height * 0.5)
		this.panel?.setPosition(x, height * 0.52)

		this.backBtn?.setPosition(x, height * 0.92)
	}
}
