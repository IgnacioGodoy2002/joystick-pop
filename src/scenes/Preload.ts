import Phaser from 'phaser'

import TextureKeys from '~/consts/TextureKeys'
import GameEvents from '~/consts/GameEvents'
import AudioKeys from '~/consts/AudioKeys'

// El resto del audio (AttachToGrid, ClearMatches, OrphanCleared, UIClick)
// sigue desactivado: esos .wav originales del template vienen como
// punteros de Git LFS rotos y todavía no se reemplazaron. Ver
// SoundEffectsController.ts. MusicLoop, ShootBall y GameOverFoley sí
// tienen archivos reales (.ogg) desde acá.

export default class Preload extends Phaser.Scene
{
	preload()
	{
		this.load.image(TextureKeys.Background, 'assets/game/background.png')
		this.load.image(TextureKeys.Ball, 'assets/game/ball_base.png')
		this.load.image(TextureKeys.BallRed, 'assets/game/ball_red.png')
		this.load.image(TextureKeys.BallGreen, 'assets/game/ball_green.png')
		this.load.image(TextureKeys.BallBlue, 'assets/game/ball_blue.png')
		this.load.image(TextureKeys.BallYellow, 'assets/game/ball_yellow.png')
		this.load.image(TextureKeys.BallParticles, 'assets/game/light_02.png')
		this.load.image(TextureKeys.Shooter, 'assets/game/shooter.png')
		this.load.image(TextureKeys.FlagEs, 'assets/game/flag-es.png')
		this.load.image(TextureKeys.FlagEn, 'assets/game/flag-en.png')
		this.load.image(TextureKeys.FlagBr, 'assets/game/flag-br.png')

		this.load.audio(AudioKeys.MusicLoop, 'assets/game/music.ogg')
		this.load.audio(AudioKeys.ShootBall, 'assets/game/dispara.ogg')
		this.load.audio(AudioKeys.GameOverFoley, 'assets/game/roto.ogg')
	}

	create()
	{
		this.game.events.emit(GameEvents.PreloadFinished)
	}
}
