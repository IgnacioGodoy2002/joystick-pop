import Phaser from 'phaser'

import { DarkColor } from '~/consts/Colors'
import SceneKeys from '~/consts/SceneKeys'
import { Observable, SubscriptionLike } from 'rxjs'
import SuraIntegrationService from '~/integration/sura/SuraIntegrationService'
import { i18next } from '~/i18n'

const DPR = window.devicePixelRatio

// calibrated so a 900px-tall canvas (the desktop baseline) keeps the
// original 100px-tall header — taller screens get a proportional header
// instead of a DPR-only one, so it doesn't swallow the first grid row
const HEADER_HEIGHT_RATIO = 100 / 900

declare global
{
	interface GameUiInitData
	{
		ballsDestroyed?: Observable<number>,
		ballsAdded?: Observable<number>,
		infectionsChanged: Observable<number>
	}
}

export default class GameUI extends Phaser.Scene
{
	private score = 0
	private scoreText?: Phaser.GameObjects.Text
	private headerRect?: Phaser.GameObjects.Rectangle
	private pauseIcon?: Phaser.GameObjects.Text

	private subscriptions: SubscriptionLike[] = []

	init()
	{
		this.score = 0
	}

	create(data?: GameUiInitData)
	{
		const width = this.scale.width
		const height = this.scale.height
		const headerHeight = height * HEADER_HEIGHT_RATIO

		this.headerRect = this.add.rectangle(width * 0.5, 0, width, headerHeight, DarkColor, 0.7)

		const offsetX = 10 * DPR
		const offsetY = 10 * DPR

		const startingText = this.createScoreText(this.score)
		this.scoreText = this.add.text(offsetX, offsetY, startingText, {
			fontSize: 22 * DPR,
			fontFamily: 'Righteous'
		})

		const rx = width - offsetX
		this.pauseIcon = this.add.text(rx, offsetY, '❚❚', {
			fontSize: 22 * DPR,
			fontFamily: 'Righteous'
		})
		.setOrigin(1, 0)
		.setPadding(10 * DPR, 10 * DPR, 10 * DPR, 10 * DPR)
		.setInteractive({ useHandCursor: true })
		.on(Phaser.Input.Events.POINTER_DOWN, () => {
			this.pauseGame()
		})

		this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)

		const suraService = this.registry.get('suraService') as SuraIntegrationService | undefined

		if (suraService)
		{
			const unsubPause = suraService.onPause(() => this.pauseGame())
			const unsubResume = suraService.onResume(() => this.resumeGame())

			this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
				unsubPause()
				unsubResume()
			})
		}

		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)

			this.subscriptions.forEach(sub => sub.unsubscribe())
			this.subscriptions.length = 0
		})

		this.initWithData(data)
	}

	// el navegador mobile puede colapsar la barra de direcciones después de
	// que esta escena ya se creó — sin esto, el header y el ícono de pausa
	// quedan posicionados con el scale.width/height viejo
	private handleResize()
	{
		const width = this.scale.width
		const height = this.scale.height
		const headerHeight = height * HEADER_HEIGHT_RATIO

		this.headerRect?.setPosition(width * 0.5, 0).setSize(width, headerHeight)

		const offsetX = 10 * DPR
		this.pauseIcon?.setX(width - offsetX)
	}

	private pauseGame()
	{
		if (this.scene.isActive(SceneKeys.GameOver))
		{
			return
		}

		this.scene.pause(SceneKeys.Game)
		this.scene.pause(SceneKeys.GameUI)
		this.scene.launch(SceneKeys.Pause)
	}

	private resumeGame()
	{
		this.scene.stop(SceneKeys.Pause)
		this.scene.resume(SceneKeys.Game)
		this.scene.resume(SceneKeys.GameUI)
	}

	private initWithData(data?: GameUiInitData)
	{
		if (!data)
		{
			return
		}

		const destroyedSub = data.ballsDestroyed?.subscribe(count => {
			const multiplier = Math.max(1, count / 10)
			this.addToScore(Math.floor(count * multiplier))
		})

		const subs = [destroyedSub]
		subs.filter(sub => sub)
			.forEach(sub => this.subscriptions.push(sub!))
	}

	private createScoreText(score: number)
	{
		return i18next.t('gameUI.score', { score: score.toLocaleString() })
	}

	private addToScore(points: number)
	{
		this.score += points
		this.updateScore(this.score)
		// se guarda en el registry global para que Game.ts lo lea al terminar la partida
		this.registry.set('score', this.score)
	}

	private updateScore(score: number)
	{
		if (!this.scoreText)
		{
			return
		}
		this.scoreText.text = this.createScoreText(this.score)
	}
}
