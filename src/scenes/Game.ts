import Phaser from 'phaser'

import TextureKeys from '~/consts/TextureKeys'

import '~/game/Shooter'
import '~/game/BallPool'
import '~/game/StaticBallPool'
import BallGrid from '~/game/BallGrid'
import BallLayoutData from '~/game/BallLayoutData'
import BallGrowthModel from '~/game/BallGrowthModel'
import DescentController from '~/game/DescentController'
import SceneKeys from '~/consts/SceneKeys'
import ShotGuide from '~/game/guides/ShotGuide'
import SoundEffectsController from '~/game/SoundEffectsController'
import SuraIntegrationService from '~/integration/sura/SuraIntegrationService'

const DPR = window.devicePixelRatio

enum GameState
{
	Playing,
	GameOver,
	GameWin
}

export default class Game extends Phaser.Scene
{
	private shooter?: IShooter
	private grid?: BallGrid

	private growthModel!: IGrowthModel
	private descentController?: DescentController
	private sfx?: SoundEffectsController

	private state = GameState.Playing

	init()
	{
		this.state = GameState.Playing
		this.growthModel = new BallGrowthModel(100)

		this.sfx = new SoundEffectsController(this.sound)
	}

	create()
	{
		const width = this.scale.width
		const height = this.scale.height

		this.add.graphics()
			.fillGradientStyle(0x24163e, 0x24163e, 0x6b2c53, 0x87402c, 1)
			.fillRect(0, 0, width, height)
			.setDepth(0)

		this.physics.world.setBounds(0, 0, width, height)
		this.physics.world.setBoundsCollision(true, true, false, false)
		this.physics.world.setFPS(180)

		this.shooter = this.add.shooter(width * 0.5, height - (70 * DPR), '')
		this.shooter.setGuide(new ShotGuide(this))

		const ballPool = this.add.ballPool(TextureKeys.Ball)
		this.shooter.setBallPool(ballPool)
		this.shooter.attachBall()

		const staticBallPool = this.add.staticBallPool(TextureKeys.Ball)

		this.grid = new BallGrid(this, staticBallPool)
		this.grid.setLayoutData(new BallLayoutData(this.growthModel))
			.generate()

		this.physics.add.collider(ballPool, staticBallPool, this.handleBallHitGrid, this.processBallHitGrid, this)

		this.descentController = new DescentController(this, this.grid, this.growthModel)
		this.descentController.setStartingDescent(300)

		this.sfx?.handleShootBall(this.shooter.onShoot())
		this.sfx?.handleBallAttached(this.grid.onBallAttached())
		this.sfx?.handleClearMatches(this.grid.onBallsDestroyed())
		this.sfx?.handleClearOrphan(this.grid.onOrphanWillBeDestroyed())

		const ballSub = this.grid.onBallWillBeDestroyed().subscribe(ball => {
			this.handleBallWillBeDestroyed(ball)
		})

		this.scene.run(SceneKeys.GameUI, {
			ballsDestroyed: this.grid.onBallsDestroyed(),
			ballsAdded: this.grid.onBallsAdded(),
			infectionsChanged: this.growthModel.onPopulationChanged()
		})
		this.scene.bringToTop(SceneKeys.GameUI)

		const suraService = this.registry.get('suraService') as SuraIntegrationService | undefined
		suraService?.notifyStarted()

		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			ballSub.unsubscribe()

			this.handleShutdown()	
		})
	}

	private handleGameOver()
	{
		const score: number = this.registry.get('score') || 0
		const STORAGE_KEY_RECORD = 'bubbleBlastSuraRecord'
		const record = Number(localStorage.getItem(STORAGE_KEY_RECORD) || 0)
		const isNewRecord = score > record

		if (isNewRecord)
		{
			localStorage.setItem(STORAGE_KEY_RECORD, String(score))
		}

		const suraService = this.registry.get('suraService') as SuraIntegrationService | undefined
		suraService?.notifyCompleted(score, { isNewRecord })

		this.scene.stop(SceneKeys.Pause)

		this.scene.pause(SceneKeys.Game)
		this.scene.run(SceneKeys.GameOver, {
			score,
			record: isNewRecord ? score : record,
			isNewRecord
		})
	}

	private handleBallWillBeDestroyed(ball: IBall)
	{
		const x = ball.x
		const y = ball.y

		// explosion then go to gameover
		const particles = this.add.particles(TextureKeys.BallParticles)
		particles.setDepth(2000)
		particles.createEmitter({
			speed: { min: -200, max: 200 },
			angle: { min: 0, max: 360 },
			scale: { start: 0.3, end: 0 },
			blendMode: Phaser.BlendModes.ADD,
			tint: ball.color,
			lifespan: 300
		})
		.explode(50, x, y)
	}

	private handleShutdown()
	{
		this.scene.stop(SceneKeys.GameUI)

		this.grid?.destroy()
		this.descentController?.destroy()
		this.sfx?.destroy()
	}

	private processBallHitGrid(ball: Phaser.GameObjects.GameObject, gridBall: Phaser.GameObjects.GameObject)
	{
		// only accept collision if distance is close enough
		// gives a better feel for tight shots
		const b = ball as IBall
		const gb = gridBall as IBall

		const active = b.active && gb.active

		if (!active)
		{
			return false
		}

		const distanceSq = Phaser.Math.Distance.Squared(b.x, b.y, gb.x, gb.y)
		const minDistance = b.width * 0.9
		const mdSq = minDistance * minDistance

		return distanceSq <= mdSq
	}

	private async handleBallHitGrid(ball: Phaser.GameObjects.GameObject, gridBall: Phaser.GameObjects.GameObject)
	{
		const b = ball as IBall
		const bx = b.x
		const by = b.y
		const color = b.color

		const vx = b.body.deltaX()
		const vy = b.body.deltaY()

		const gb = gridBall as IBall
		const gx = gb.x
		const gy = gb.y

		// determine direction from ball to grid
		// then negate it to have opposite direction
		const directionToGrid = new Phaser.Math.Vector2(gx - bx, gy - by)
			.normalize()
			.negate()

		// get where the ball would be at contact with grid
		const x = gx + (directionToGrid.x * gb.width)
		const y = gy + (directionToGrid.y * gb.width)

		this.shooter?.returnBall(b)

		this.descentController?.hold()

		await this.grid?.attachBall(x, y, color, gb, vx, vy)

		await this.descentController?.reversing()

		this.shooter?.attachBall()

		this.descentController?.descend()
	}

	update(t, dt)
	{
		if (this.state === GameState.GameOver || this.state === GameState.GameWin)
		{
			return
		}

		if (!this.descentController || !this.shooter)
		{
			return
		}

		this.growthModel.update(dt)
		this.shooter.update(dt)
		this.descentController.update(dt)

		const dcy = this.descentController.yPosition
		if (dcy > this.shooter.y - this.shooter.radius)
		{
			// game over
			this.state = GameState.GameOver
			this.handleGameOver()
		}

	}
}
