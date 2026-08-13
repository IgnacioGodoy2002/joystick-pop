import Phaser from 'phaser'
import SceneKeys from '~/consts/SceneKeys'
import { WhiteColor } from '~/consts/Colors'
import { i18next } from '~/i18n'

export default class TipsInterstitial extends Phaser.Scene
{
	create(data: { target: string } = { target: SceneKeys.TitleScreen })
	{
		const width = this.scale.width
		const height = this.scale.height

		const fontSize = Math.min(width * 0.2, 200)
		const color = `#${WhiteColor.toString(16)}`

		const steps = ['3', '2', '1', i18next.t('countdown.go')]

		const label = this.add.text(width * 0.5, height * 0.5, '', {
			fontFamily: 'Righteous',
			fontSize,
			color,
			align: 'center'
		})
		.setOrigin(0.5)

		const showStep = (index: number) => {
			if (index >= steps.length)
			{
				this.scene.start(data.target)
				return
			}

			label.setText(steps[index])
			label.setScale(0)

			this.tweens.add({
				targets: label,
				scale: 1,
				duration: 600,
				ease: 'Back.easeOut',
				onComplete: () => {
					this.time.delayedCall(600, () => showStep(index + 1))
				}
			})
		}

		showStep(0)
	}
}
