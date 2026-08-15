import Phaser from 'phaser'

import { DarkColor } from '~/consts/Colors'

import button, { primaryButton } from '~/ui/Buttons'
import SceneKeys from '~/consts/SceneKeys'
import { i18next } from '~/i18n'

export default class Pause extends Phaser.Scene
{
	private overlay?: Phaser.GameObjects.Rectangle
	private title?: Phaser.GameObjects.Text
	private continueBtn?: Phaser.GameObjects.DOMElement
	private backBtn?: Phaser.GameObjects.DOMElement

	create()
	{
		const width = this.scale.width
		const height = this.scale.height
		const x = width * 0.5
		const y = height * 0.5

		// add dark transparent overlay
		this.overlay = this.add.rectangle(x, y, width, height, DarkColor, 0.7)

		const fontSize = Math.min(width * 0.15, 225)
		this.title = this.add.text(x, height * 0.32, i18next.t('pause.title'), {
			fontFamily: 'Nosifer',
			fontSize,
			color: '#508cdc',
			align: 'center',
			stroke: DarkColor,
			strokeThickness: 8
		})
		.setOrigin(0.5, 0.5)
		.setScale(0, 0)

		this.continueBtn = this.add.dom(x, height * 0.5, primaryButton(i18next.t('pause.continue')))
			.setScale(0, 0)
			.addListener('click').on('click', () => {
				this.scene.stop(SceneKeys.Pause)

				this.scene.resume(SceneKeys.Game)

				if (this.scene.isPaused(SceneKeys.GameUI))
				{
					this.scene.resume(SceneKeys.GameUI)
				}
			})

		this.backBtn = this.add.dom(x, this.continueBtn.y + this.continueBtn.height + 20, button(i18next.t('common.back')))
			.setScale(0, 0)
			.addListener('click').on('click', () => {
				this.scene.stop(SceneKeys.Pause)
				this.scene.stop(SceneKeys.Game)
				this.scene.stop(SceneKeys.GameUI)
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
			targets: this.continueBtn,
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

		this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)

		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)
		})
	}

	// el navegador mobile puede colapsar la barra de direcciones después de
	// que esta escena ya se creó — sin esto, el overlay queda corto y el
	// título/botones quedan posicionados con el scale.width/height viejo
	private handleResize()
	{
		const width = this.scale.width
		const height = this.scale.height
		const x = width * 0.5
		const y = height * 0.5

		this.overlay?.setPosition(x, y).setSize(width, height)

		const fontSize = Math.min(width * 0.15, 225)
		this.title?.setPosition(x, height * 0.32).setFontSize(fontSize)

		this.continueBtn?.setPosition(x, height * 0.5)

		if (this.continueBtn && this.backBtn)
		{
			this.backBtn.setPosition(x, this.continueBtn.y + this.continueBtn.height + 20)
		}
	}
}
