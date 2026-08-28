import Phaser from 'phaser'

import playButton from '~/ui/PlayButton'
import button from '~/ui/Buttons'
import languageChips from '~/ui/LanguageChips'
import { DarkColor } from '~/consts/Colors'
import SceneKeys from '~/consts/SceneKeys'
import SoundEffectsController from '~/game/SoundEffectsController'
import MusicController from '~/game/MusicController'
import { Subject } from 'rxjs'
import TextureKeys from '~/consts/TextureKeys'
import { i18next, USER_LANGUAGE_STORAGE_KEY } from '~/i18n'

export default class HelloWorldScene extends Phaser.Scene
{
	private sfx?: SoundEffectsController
	private uiClickSubject = new Subject<void>()

	private bg?: Phaser.GameObjects.Graphics
	private title1?: Phaser.GameObjects.Text
	private titleSuffix?: Phaser.GameObjects.Text
	private playBtn?: Phaser.GameObjects.DOMElement
	private howToPlayBtn?: Phaser.GameObjects.DOMElement
	private leaderboardBtn?: Phaser.GameObjects.DOMElement
	private languageChipsEl?: Phaser.GameObjects.DOMElement
	private musicIcon?: Phaser.GameObjects.Text

	init()
	{
		this.sfx = new SoundEffectsController(this.sound)
		this.sfx.handleUIClick(this.uiClickSubject.asObservable())
	}

    create()
    {
		const width = this.scale.width
		const height = this.scale.height

		const x = width * 0.5
		const y = height * 0.2

		this.bg = this.add.graphics()
			.fillGradientStyle(0x1a2a4d, 0x1a2a4d, 0x2d5a8a, 0x4fb3d9, 1)
			.fillRect(0, 0, width, height)
			.setDepth(0)

		this.createBackgroundParticles(width, height)
		this.createLanguageSwitcher()

		const fontSize = Math.min(width * 0.095, 225)
        this.title1 = this.add.text(x, y, i18next.t('titleScreen.title'), {
			fontFamily: 'Nosifer',
			fontSize,
			color: '#508cdc',
			align: 'center',
			stroke: DarkColor,
			strokeThickness: 8
		})
		.setOrigin(0.5, 0.5)

		const maxTitleWidth = width * 0.92
		if (this.title1.width > maxTitleWidth)
		{
			this.title1.setFontSize(fontSize * (maxTitleWidth / this.title1.width))
		}

		this.titleSuffix = this.add.text(x, this.title1.y + this.title1.height, i18next.t('titleScreen.titleSuffix'), {
			fontFamily: 'Lemon',
			fontSize: fontSize * 1.5,
			color: '#FEC81A',
			stroke: DarkColor,
			strokeThickness: 4
		})
		.setOrigin(0.5, 0.5)

		this.playBtn = this.add.dom(x, height * 0.6, playButton(i18next.t('titleScreen.play')))
			.addListener('click').on('click', () => {
				this.uiClickSubject.next()

				// this.scene.start(SceneKeys.Game)
				this.scene.start(SceneKeys.TipsInterstitial, {
					target: SceneKeys.Game
				})
			})

		this.howToPlayBtn = this.add.dom(x, this.playBtn.y + this.playBtn.height + 20, button(i18next.t('titleScreen.howToPlay')))
			.addListener('click').on('click', () => {
				this.uiClickSubject.next()
				this.scene.start(SceneKeys.HowToPlay)
			})

		this.leaderboardBtn = this.add.dom(x, this.howToPlayBtn.y + this.howToPlayBtn.height + 20, button(i18next.t('titleScreen.leaderboard')))
			.addListener('click').on('click', () => {
				this.uiClickSubject.next()
				this.scene.start(SceneKeys.Leaderboard)
			})

		// Esquina superior derecha. Muteá/activa solo la música
		// (MusicController) -- los efectos de sonido (disparo, game over)
		// quedan siempre audibles, no se tocan acá.
		const dpr = window.devicePixelRatio
		this.musicIcon = this.add.text(width - 10 * dpr, 10 * dpr, this.musicIconText(), {
			fontFamily: 'Righteous',
			fontSize: 22 * dpr
		})
		.setOrigin(1, 0)
		.setPadding(10 * dpr, 10 * dpr, 10 * dpr, 10 * dpr)
		.setInteractive({ useHandCursor: true })
		.on(Phaser.Input.Events.POINTER_DOWN, () => {
			MusicController.toggleMute()
			this.musicIcon?.setText(this.musicIconText())
		})

		this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)

		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)
			this.sfx?.destroy()
		})
    }

	// el navegador mobile puede colapsar la barra de direcciones después de
	// que esta escena ya se creó — sin esto, el fondo, el título y los
	// botones quedan calculados contra el scale.width/height viejo
	private handleResize()
	{
		const width = this.scale.width
		const height = this.scale.height
		const x = width * 0.5
		const y = height * 0.2

		this.bg?.clear()
			.fillGradientStyle(0x1a2a4d, 0x1a2a4d, 0x2d5a8a, 0x4fb3d9, 1)
			.fillRect(0, 0, width, height)

		const fontSize = Math.min(width * 0.095, 225)
		this.title1?.setPosition(x, y).setFontSize(fontSize)

		const maxTitleWidth = width * 0.92
		if (this.title1 && this.title1.width > maxTitleWidth)
		{
			this.title1.setFontSize(fontSize * (maxTitleWidth / this.title1.width))
		}

		if (this.title1 && this.titleSuffix)
		{
			this.titleSuffix.setPosition(x, this.title1.y + this.title1.height)
				.setFontSize(fontSize * 1.5)
		}

		this.playBtn?.setPosition(x, height * 0.6)

		if (this.playBtn && this.howToPlayBtn)
		{
			this.howToPlayBtn.setPosition(x, this.playBtn.y + this.playBtn.height + 20)
		}

		if (this.howToPlayBtn && this.leaderboardBtn)
		{
			this.leaderboardBtn.setPosition(x, this.howToPlayBtn.y + this.howToPlayBtn.height + 20)
		}

		this.languageChipsEl?.setPosition(x, height * 0.94)

		this.musicIcon?.setPosition(width - 10 * window.devicePixelRatio, 10 * window.devicePixelRatio)
	}

	private musicIconText()
	{
		return MusicController.isMuted() ? '♪ OFF' : '♪ ON'
	}

	private createLanguageSwitcher()
	{
		const width = this.scale.width
		const height = this.scale.height

		const currentLanguage = i18next.language.slice(0, 2).toLowerCase()

		this.languageChipsEl = this.add.dom(width * 0.5, height * 0.94, languageChips(currentLanguage))
			.addListener('click')
			.on('click', (event: MouseEvent) => {
				const target = event.target as HTMLElement
				const chip = target.closest('[data-lang]') as HTMLElement | null
				const lang = chip?.dataset.lang

				if (!lang || lang === currentLanguage)
				{
					return
				}

				// misma lógica de siempre: localStorage tiene prioridad sobre
				// la detección automática (ver i18n/index.ts), sin cambios acá
				i18next.changeLanguage(lang).then(() => {
					localStorage.setItem(USER_LANGUAGE_STORAGE_KEY, lang)
					this.scene.restart()
				})
			})
	}

	private createBackgroundParticles(width: number, height: number)
	{
		const textures = [
			TextureKeys.BallRed,
			TextureKeys.BallGreen,
			TextureKeys.BallBlue,
			TextureKeys.BallYellow
		]

		const count = Phaser.Math.Between(18, 22)

		for (let i = 0; i < count; i++)
		{
			const texture = textures[Phaser.Math.Between(0, textures.length - 1)]

			const particle = this.add.image(0, 0, texture)
				.setDepth(1)
				.setScale(Phaser.Math.FloatBetween(0.2, 0.3))
				.setAlpha(Phaser.Math.FloatBetween(0.15, 0.25))

			this.animateBackgroundParticle(particle, width, height)
		}
	}

	private animateBackgroundParticle(particle: Phaser.GameObjects.Image, width: number, height: number)
	{
		particle.setPosition(Phaser.Math.Between(0, width), height + 50)
		particle.setAngle(0)

		this.tweens.add({
			targets: particle,
			y: -50,
			angle: 360,
			duration: Phaser.Math.Between(8000, 14000),
			ease: 'Linear',
			onComplete: () => {
				this.animateBackgroundParticle(particle, width, height)
			}
		})
	}
}
