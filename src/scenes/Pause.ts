import Phaser from 'phaser'

import { DarkColor } from '~/consts/Colors'

import button, { primaryButton } from '~/ui/Buttons'
import SceneKeys from '~/consts/SceneKeys'
import { i18next } from '~/i18n'

export default class Pause extends Phaser.Scene
{
	create()
	{
		const width = this.scale.width
		const height = this.scale.height
		const x = width * 0.5
		const y = height * 0.5

		// add dark transparent overlay
		this.add.rectangle(x, y, width, height, DarkColor, 0.7)

		const fontSize = Math.min(width * 0.15, 225)
		const title = this.add.text(x, height * 0.32, i18next.t('pause.title'), {
			fontFamily: 'Nosifer',
			fontSize,
			color: '#508cdc',
			align: 'center',
			stroke: DarkColor,
			strokeThickness: 8
		})
		.setOrigin(0.5, 0.5)
		.setScale(0, 0)

		const continueBtn = this.add.dom(x, height * 0.5, primaryButton(i18next.t('pause.continue')))
			.setScale(0, 0)
			.addListener('click').on('click', () => {
				this.scene.stop(SceneKeys.Pause)

				this.scene.resume(SceneKeys.Game)

				if (this.scene.isPaused(SceneKeys.GameUI))
				{
					this.scene.resume(SceneKeys.GameUI)
				}
			})

		const backBtn = this.add.dom(x, continueBtn.y + continueBtn.height + 20, button(i18next.t('common.back')))
			.setScale(0, 0)
			.addListener('click').on('click', () => {
				this.scene.stop(SceneKeys.Pause)
				this.scene.stop(SceneKeys.Game)
				this.scene.stop(SceneKeys.GameUI)
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
			targets: continueBtn,
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
