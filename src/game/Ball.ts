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

		// posición CANÓNICA de la bola dentro de la grilla, independiente de
		// cualquier animación de rebote/jiggle que esté corriendo encima.
		// Toda la geometría (vecinos, altura de fila, bottom de la grilla)
		// tiene que leer esto y NO x/y -- ver nota en setVisualOffset.
		readonly homeX: number
		readonly homeY: number

		setRandomColor(): IBall
		setColor(color: BallColor): IBall
		useCircleCollider(): IBall
		launch(direction: Phaser.Math.Vector2): void

		// `true` mientras la bola ya salió de la grilla pero sigue en
		// pantalla terminando su animación de destrucción (combo o caída de
		// huérfana). La barrida de BallGrid.reconcile() las respeta: sin
		// esta marca no podría distinguir una bola muriéndose legítimamente
		// de un sprite que quedó colgado por un bug.
		retiring: boolean

		setHome(x: number, y: number): IBall
		moveHomeBy(dx: number, dy: number): IBall
		setVisualOffset(dx: number, dy: number): IBall
		setAnimationTween(tween: Phaser.Tweens.Tween): IBall
		stopAnimation(): IBall
	}
}

export default class Ball extends Phaser.Physics.Arcade.Sprite implements IBall
{
	private _color = BallColor.Red

	retiring = false

	private _homeX = 0
	private _homeY = 0
	private _offsetX = 0
	private _offsetY = 0
	private _anim?: Phaser.Tweens.Tween

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

	get homeX()
	{
		return this._homeX
	}

	get homeY()
	{
		return this._homeY
	}

	/**
	 * Fija la posición canónica (y resetea cualquier desplazamiento visual
	 * de animación que estuviera activo).
	 */
	setHome(x: number, y: number)
	{
		// fijar el home es una reubicación definitiva: cualquier animación
		// en curso quedó obsoleta y hay que matarla, o va a seguir
		// escribiendo offsets viejos sobre la posición nueva
		this.stopAnimation()

		this._homeX = x
		this._homeY = y
		this._offsetX = 0
		this._offsetY = 0

		return this.applyHome()
	}

	/**
	 * Registra el tween de animación activo (y cancela el anterior). Las
	 * bolas se reciclan por pool: sin esto, una bola despawneada en pleno
	 * rebote y respawneada enseguida en otro lado heredaba el tween de su
	 * vida anterior, que le seguía escribiendo el offset de la posición
	 * vieja. Se veía como una bola corrida respecto de su celda.
	 */
	setAnimationTween(tween: Phaser.Tweens.Tween)
	{
		if (this._anim !== tween)
		{
			this.stopAnimation()
		}

		this._anim = tween

		return this
	}

	stopAnimation()
	{
		if (this._anim)
		{
			this._anim.stop()
			this._anim = undefined
		}

		return this
	}

	/**
	 * Desplaza la posición canónica PRESERVANDO el offset de animación. Esto
	 * es lo que permite que una bola en pleno jiggle/rebote siga bajando con
	 * el resto de la grilla: antes las animaciones tweeneaban `y` a valores
	 * absolutos capturados al disparar y le pisaban la `y` a la bola en cada
	 * frame, así que durante los ~200ms que duraban se perdían todo el
	 * descenso que ocurría mientras tanto. Esos pocos píxeles por tiro se
	 * acumulaban y terminaban desalineando filas enteras -- las bolas
	 * superpuestas de los reportes.
	 */
	moveHomeBy(dx: number, dy: number)
	{
		this._homeX += dx
		this._homeY += dy

		return this.applyHome()
	}

	/**
	 * Desplazamiento puramente visual respecto de `home`. Las animaciones de
	 * la grilla escriben ACÁ, nunca en x/y directamente.
	 */
	setVisualOffset(dx: number, dy: number)
	{
		this._offsetX = dx
		this._offsetY = dy

		return this.applyHome()
	}

	private applyHome()
	{
		this.setPosition(this._homeX + this._offsetX, this._homeY + this._offsetY)

		// el body estático no sigue al GameObject por su cuenta
		const body = this.body as Phaser.Physics.Arcade.StaticBody
		if (body && typeof body.updateFromGameObject === 'function')
		{
			body.updateFromGameObject()
		}

		return this
	}

	constructor(scene: Phaser.Scene, x: number, y: number, texture: string, frame: string = '')
	{
		super(scene, x, y, texture, frame)

		this._homeX = x
		this._homeY = y

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
