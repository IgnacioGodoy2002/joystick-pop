import Phaser from 'phaser'
import BallColor from './BallColor'
import TextureKeys from '~/consts/TextureKeys'

const ALL_COLORS = [
	BallColor.Red,
	BallColor.Blue,
	BallColor.Green,
	BallColor.Yellow
]

declare global
{
	interface IBall extends Phaser.Physics.Arcade.Sprite
	{
		readonly color: BallColor
		readonly radius: number
		readonly physicsRadius: number

		setRandomColor(): IBall
		setColor(color: BallColor): IBall
		useCircleCollider(): IBall
		launch(direction: Phaser.Math.Vector2): void
	}
}

export default class Ball extends Phaser.Physics.Arcade.Sprite implements IBall
{
	private _color = BallColor.Red

	get color()
	{
		return this._color
	}

	get radius()
	{
		return this.displayWidth * 0.5
	}

	get physicsRadius()
	{
		return this.radius * 0.6
	}

	constructor(scene: Phaser.Scene, x: number, y: number, texture: string, frame: string = '')
	{
		super(scene, x, y, texture, frame)

		this.setRandomColor()
	}

	setRandomColor()
	{
		const r = Phaser.Math.Between(0, ALL_COLORS.length - 1)
		return this.setColor(ALL_COLORS[r])
	}

	setColor(color: BallColor)
	{
		this._color = color
		switch (color)
		{
			case BallColor.Red:
				this.setTexture(TextureKeys.BallRed)
				break

			case BallColor.Green:
				this.setTexture(TextureKeys.BallGreen)
				break

			case BallColor.Blue:
				this.setTexture(TextureKeys.BallBlue)
				break

			case BallColor.Yellow:
				this.setTexture(TextureKeys.BallYellow)
				break
		}

		return this
	}

	useCircleCollider()
	{
		const radius = this.radius
		const usedRadius = this.physicsRadius
		const diff = radius - usedRadius

		// Phaser.setCircle() toma radio/offset en el espacio NATIVO del frame
		// (sin escalar) y los multiplica por scaleX/scaleY internamente para
		// calcular el tamaño final del body — como radius/physicsRadius ya
		// están en píxeles escalados (displayWidth), hay que dividir por la
		// escala acá o el body queda escalado dos veces y termina mucho más
		// chico de lo esperado en cualquier plataforma donde scaleX != 1
		const scale = this.scaleX || 1
		this.setCircle(usedRadius / scale, diff / scale, diff / scale)

		return this
	}

	launch(direction: Phaser.Math.Vector2, speed = 1600)
	{
		this.setCollideWorldBounds(true, 1, 1)

		this.body.x = this.x
		this.body.y = this.y

		this.body.enable = true

		this.setVelocity(direction.x * speed, direction.y * speed)
	}
}

Phaser.GameObjects.GameObjectFactory.register('ball', function (x: number, y: number, texture: string, frame: string = '') {
	// @ts-ignore
	var ball = new Ball(this.scene, x, y, texture, frame);

	// @ts-ignore
	this.displayList.add(ball);
	// @ts-ignore
	this.updateList.add(ball);
	// @ts-ignore
	this.scene.physics.world.enableBody(ball, Phaser.Physics.Arcade.DYNAMIC_BODY)

	ball.setCircle(ball.width * 0.5)

    return ball;
})
