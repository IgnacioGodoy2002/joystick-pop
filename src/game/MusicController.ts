import AudioKeys from '~/consts/AudioKeys'

const STORAGE_KEY = 'bubbleBlastSuraMusicMuted'
const MUSIC_VOLUME = 0.4

type MusicSound = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound

/**
 * Owns the single MusicLoop instance for the whole app. Static/module-level
 * (not a per-scene class) on purpose: this.sound is the SoundManager global
 * to the whole Phaser.Game, not per-scene, and the music itself is started
 * once from Bootstrap and has to keep playing (or stay silenced) across
 * every scene transition (TitleScreen -> Game -> GameOver -> etc.) without
 * restarting.
 *
 * Muting here only ever touches this one Sound's own volume -- it does NOT
 * use SoundManager.setMute()/setVolume(), which would silence every sound
 * (ShootBall, GameOverFoley included). That's the whole point: mute music
 * only, never SFX.
 */
export default class MusicController
{
	private static sound: MusicSound | null = null

	static isMuted(): boolean
	{
		return localStorage.getItem(STORAGE_KEY) === '1'
	}

	/** Called once, from Bootstrap, right after Preload finishes. */
	static start(soundManager: Phaser.Sound.BaseSoundManager)
	{
		if (this.sound)
		{
			return
		}

		this.sound = soundManager.add(AudioKeys.MusicLoop, {
			loop: true,
			volume: this.isMuted() ? 0 : MUSIC_VOLUME
		}) as MusicSound

		this.sound.play()
	}

	/** Flips the mute state, applies it to the live sound (if it exists yet), and persists it. */
	static toggleMute(): boolean
	{
		const nextMuted = !this.isMuted()
		localStorage.setItem(STORAGE_KEY, nextMuted ? '1' : '0')

		this.sound?.setVolume(nextMuted ? 0 : MUSIC_VOLUME)

		return nextMuted
	}
}
