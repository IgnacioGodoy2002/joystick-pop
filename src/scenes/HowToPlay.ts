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
	create()
	{
		const width = this.scale.width
		const height = this.scale.height
		const x = width * 0.5
		const y = height * 0.5

		// add dark transparent overlay
		this.add.rectangle(x, y, width, height, DarkColor, 0.7)

		const fontSize = Math.min(width * 0.13, 180)
		const title = this.add.text(x, height * 0.3, i18next.t('howToPlay.title'), {
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
		if (title.width > maxTitleWidth)
		{
			title.setFontSize(fontSize * (maxTitleWidth / title.width))
		}

		const body = this.add.text(x, height * 0.48, i18next.t('howToPlay.body'), {
			fontFamily: 'Righteous',
			fontSize: Math.min(width * 0.05, 32),
			color: '#ffffff',
			align: 'center',
			wordWrap: {
				width: width * 0.8
			}
		})
		.setOrigin(0.5, 0.5)

		const backBtnY = body.y + (body.height * 0.5) + BACK_BUTTON_MARGIN

		const backBtn = this.add.dom(x, backBtnY, button(i18next.t('common.back')))
			.setScale(0, 0)
			.addListener('click').on('click', () => {
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
			targets: backBtn,
			scale: 1,
			ease: 'Back.easeOut',
			duration: 300
		})

		timeline.play()
	}
}
