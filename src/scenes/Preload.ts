import Phaser from 'phaser'

import TextureKeys from '~/consts/TextureKeys'
import GameEvents from '~/consts/GameEvents'

// Audio desactivado: los .wav originales del template venían como punteros
// de Git LFS rotos. En vez de reemplazarlos por audios falsos, se sacó por
// completo la carga/reproducción de sonido (ver SoundEffectsController.ts).
// Para reactivarlo: agregar los .wav reales en public/assets/game/{music,sfx}/
// y volver a descomentar este bloque + los this.sound.play() comentados allá.

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
	}

	create()
	{
		this.game.events.emit(GameEvents.PreloadFinished)
	}
}
