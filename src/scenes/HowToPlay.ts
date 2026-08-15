import Phaser from 'phaser'

import { DarkColor } from '~/consts/Colors'

import button from '~/ui/Buttons'
import SceneKeys from '~/consts/SceneKeys'
import { i18next } from '~/i18n'

const DPR = window.devicePixelRatio

// fixed gap between the wrapped body text and the Back button, instead of
// assuming the text always fits within a fixed fraction of the screen
const BACK_BUTTON_MARGIN = 40 * DPR

export default class HowToPlay extends Phaser.Scene
{
	private overlay?: Phaser.GameObjects.Rectangle
	private title?: Phaser.GameObjects.Text
	private body?: Phaser.GameObjects.Text
	private backBtn?: Phaser.GameObjects.DOMElement

	create()
	{
		const width = this.scale.width
		const height = this.scale.height
		const x = width * 0.5
		const y = height * 0.5

		// add dark transparent overlay
		this.overlay = this.add.rectangle(x, y, width, height, DarkColor, 0.7)

		const fontSize = Math.min(width * 0.13, 180)
		this.title = this.add.text(x, height * 0.3, i18next.t('howToPlay.title'), {
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

		this.body = this.add.text(x, height * 0.48, i18next.t('howToPlay.body'), {
			fontFamily: 'Righteous',
			fontSize: Math.min(width * 0.05, 32),
			color: '#ffffff',
			align: 'center',
			wordWrap: {
				width: width * 0.8
			}
		})
		.setOrigin(0.5, 0.5)

		const backBtnY = this.body.y + (this.body.height * 0.5) + BACK_BUTTON_MARGIN

		this.backBtn = this.add.dom(x, backBtnY, button(i18next.t('common.back')))
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

		this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)

		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)
		})
	}

	// el navegador mobile puede colapsar la barra de direcciones después de
	// que esta escena ya se creó — sin esto, el overlay y el texto (con su
	// wordWrap) quedan calculados contra el scale.width/height viejo
	private handleResize()
	{
		const width = this.scale.width
		const height = this.scale.height
		const x = width * 0.5
		const y = height * 0.5

		this.overlay?.setPosition(x, y).setSize(width, height)

		const fontSize = Math.min(width * 0.13, 180)
		this.title?.setPosition(x, height * 0.3).setFontSize(fontSize)

		const maxTitleWidth = width * 0.9
		if (this.title && this.title.width > maxTitleWidth)
		{
			this.title.setFontSize(fontSize * (maxTitleWidth / this.title.width))
		}

		this.body?.setPosition(x, height * 0.48)
			.setFontSize(Math.min(width * 0.05, 32))
			.setWordWrapWidth(width * 0.8)

		if (this.body && this.backBtn)
		{
			const backBtnY = this.body.y + (this.body.height * 0.5) + BACK_BUTTON_MARGIN
			this.backBtn.setPosition(x, backBtnY)
		}
	}
}
