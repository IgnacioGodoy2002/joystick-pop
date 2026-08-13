import Phaser, { Tilemaps, Scene } from 'phaser'

import { DarkColor } from '~/consts/Colors'

import button, { primaryButton } from '~/ui/Buttons'
import SceneKeys from '~/consts/SceneKeys'
import SoundEffectsController from '~/game/SoundEffectsController'
import { Subject } from 'rxjs'
import { i18next } from '~/i18n'

export default class GameOver extends Phaser.Scene
{
	private sfx?: SoundEffectsController
	private uiClickSubject = new Subject<void>()
	private enterSubject = new Subject<void>()

	private score = 0
	private record = 0
	private isNewRecord = false

	init(data?: { score: number; record: number; isNewRecord: boolean })
	{
		this.sfx = new SoundEffectsController(this.sound)
		this.sfx.handleUIClick(this.uiClickSubject.asObservable())
		this.sfx.handleGameOverEnter(this.enterSubject.asObservable())

		this.score = data?.score ?? 0
		this.record = data?.record ?? 0
		this.isNewRecord = data?.isNewRecord ?? false
	}

	create()
	{
		const width = this.scale.width
		const height = this.scale.height
		const x = width * 0.5
		const y = height * 0.5

		// add dark transparent overlay
		this.add.rectangle(x, y, width, height, DarkColor, 0.7)

		const fontSize = Math.min(width * 0.15, 225)
		const title = this.add.text(x, height * 0.32, i18next.t('gameOver.title'), {
			fontFamily: 'Nosifer',
			fontSize,
			color: '#eb4034',
			align: 'center',
			stroke: DarkColor,
			strokeThickness: 8
		})
		.setOrigin(0.5, 0.5)
		.setScale(0, 0)

		const scoreLabel = this.isNewRecord
			? `${i18next.t('gameOver.score', { score: this.score })}\n${i18next.t('gameOver.newRecord')}`
			: `${i18next.t('gameOver.score', { score: this.score })}\n${i18next.t('gameOver.record', { record: this.record })}`

		this.add.text(x, height * 0.48, scoreLabel, {
			fontFamily: 'Righteous',
			fontSize: Math.min(width * 0.06, 42),
			color: this.isNewRecord ? '#f2c14e' : '#ffffff',
			align: 'center'
		}).setOrigin(0.5, 0.5)

		const tryAgainBtn = this.add.dom(x, height * 0.6, primaryButton(i18next.t('gameOver.tryAgain')))
			.setScale(0, 0)
			.addListener('click').on('click', () => {
				this.uiClickSubject.next()

				this.scene.stop(SceneKeys.Game)
				this.scene.start(SceneKeys.TipsInterstitial, {
					target: SceneKeys.Game
				})
			})

		const exitBtn = this.add.dom(x, tryAgainBtn.y + tryAgainBtn.height + 20, button(i18next.t('common.back')))
			.setScale(0, 0)
			.addListener('click').on('click', () => {
				this.uiClickSubject.next()
				this.scene.stop(SceneKeys.Game)
				this.scene.start(SceneKeys.TitleScreen)
			})

		const timeline = this.tweens.timeline()

		timeline.add({
			targets: title,
			scale: 1,
			ease: 'Back.easeOut',
			duration: 300
		})

		timeline.add({
			targets: tryAgainBtn,
			scale: 1,
			ease: 'Back.easeOut',
			duration: 300
		})

		timeline.add({
			targets: exitBtn,
			scale: 1,
			ease: 'Back.easeOut',
			duration: 300
		})

		timeline.play()

		this.enterSubject.next()

		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			this.sfx?.destroy()
		})
	}
}