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
	private bg?: Phaser.GameObjects.Graphics
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

		// mismo degradé que TitleScreen.ts/Game.ts, para que esta pantalla
		// (llegada vía scene.start, sin nada detrás) sea consistente con el
		// resto de la app en vez de quedar negra
		this.bg = this.add.graphics()
			.fillGradientStyle(0x1a2a4d, 0x1a2a4d, 0x2d5a8a, 0x4fb3d9, 1)
			.fillRect(0, 0, width, height)
			.setDepth(0)

		// oscurece un poco para contraste del texto, sin tapar el degradé
		this.overlay = this.add.rectangle(x, y, width, height, DarkColor, 0.25)

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

		// el body va anclado al borde inferior del título (origin.y = 0, en vez
		// de un height*0.48 fijo) porque wordWrap puede partir el texto en más
		// líneas de las esperadas según el ancho real de la pantalla — con una
		// posición fija independiente de la del título, esas líneas de más
		// terminaban superpuestas con el título en vez de simplemente empujar
		// el resto del layout hacia abajo
		const bodyGap = 24 * DPR
		const bodyY = this.title.y + (this.title.height * 0.5) + bodyGap
		this.body = this.add.text(x, bodyY, i18next.t('howToPlay.body'), {
			fontFamily: 'Righteous',
			fontSize: Math.min(width * 0.05, 32),
			color: '#ffffff',
			align: 'center',
			wordWrap: {
				width: width * 0.8
			}
		})
		.setOrigin(0.5, 0)

		const backBtnY = this.body.y + this.body.height + BACK_BUTTON_MARGIN

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

		this.bg?.clear()
			.fillGradientStyle(0x1a2a4d, 0x1a2a4d, 0x2d5a8a, 0x4fb3d9, 1)
			.fillRect(0, 0, width, height)

		this.overlay?.setPosition(x, y).setSize(width, height)

		const fontSize = Math.min(width * 0.13, 180)
		this.title?.setPosition(x, height * 0.3).setFontSize(fontSize)

		const maxTitleWidth = width * 0.9
		if (this.title && this.title.width > maxTitleWidth)
		{
			this.title.setFontSize(fontSize * (maxTitleWidth / this.title.width))
		}

		if (this.title)
		{
			const bodyGap = 24 * DPR
			const bodyY = this.title.y + (this.title.height * 0.5) + bodyGap

			this.body?.setPosition(x, bodyY)
				.setFontSize(Math.min(width * 0.05, 32))
				.setWordWrapWidth(width * 0.8)
		}

		if (this.body && this.backBtn)
		{
			const backBtnY = this.body.y + this.body.height + BACK_BUTTON_MARGIN
			this.backBtn.setPosition(x, backBtnY)
		}
	}
}
