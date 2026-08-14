import Phaser from 'phaser'

import IShotGuide from '~/types/IShotGuide'
import { Subject, Observable } from 'rxjs'
import TextureKeys from '~/consts/TextureKeys'

// sin *DPR: scaleFactor (ver constructor) ya viene calculado a partir de
// ballSize/REFERENCE_BALL_SIZE en Game.ts, y ballSize ya está en el mismo
// espacio "game" multiplicado por DPR que this.scale.width — multiplicar
// también acá duplicaba el DPR en mobile y alejaba la bola en espera del
// shooter muy por encima de lo esperado
const BASE_RADIUS = 100
const BASE_GAP = -15
const BASE_WIDTH = 130
const BASE_HEIGHT = 161

const HALF_PI = Math.PI * 0.5

declare global
{
	interface IShooter extends Phaser.GameObjects.Container
	{
		readonly radius: number

		onShoot(): Observable<IBall>

		setBallPool(pool: IBallPool)
		setGuide(guide: IShotGuide)

		attachBall(ball?: IBall)
		returnBall(ball: IBall)
		update(dt: number)
	}
}

export default class Shooter extends Phaser.GameObjects.Container implements IShooter
{
	private ball?: IBall
	private ballPool?: IBallPool
	private shotGuide?: IShotGuide

	private scaleFactor: number

	private shootSubject = new Subject<IBall>()

	get radius()
	{
		return BASE_RADIUS * this.scaleFactor
	}

	private get gap()
	{
		return BASE_GAP * this.scaleFactor
	}

	constructor(scene: Phaser.Scene, x: number, y: number, texture: string, scaleFactor = 1)
	{
		super(scene, x, y)

		this.scaleFactor = scaleFactor

		const base = scene.add.image(0, 0, TextureKeys.Shooter)
		base.setDisplaySize(BASE_WIDTH * scaleFactor, BASE_HEIGHT * scaleFactor)

		this.add(base)

		scene.input.addListener(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this)
		scene.input.addListener(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this)
	}

	preDestroy()
	{
		this.scene.input.removeListener(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this)
		this.scene.input.removeListener(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this)

		super.preDestroy()
	}

	onShoot()
	{
		return this.shootSubject.asObservable()
	}

	setBallPool(pool: IBallPool)
	{
		this.ballPool = pool
	}

	setGuide(guide: IShotGuide)
	{
		this.shotGuide = guide
	}

	attachBall(ball?: IBall)
	{
		if (!this.ballPool)
		{
			return
		}

		if (!ball && this.ball)
		{
			return
		}

		if (!ball)
		{
			ball = this.ballPool.spawn(0, 0)
		}

		this.ball = ball
		this.ball.disableBody()

		const vec = new Phaser.Math.Vector2(0, 0)
		vec.setToPolar(this.rotation + HALF_PI)

		const ballRadius = this.ball.radius

		this.ball.x = this.x - (vec.x * (this.radius + ballRadius + this.gap))
		this.ball.y = this.y - (vec.y * (this.radius + ballRadius + this.gap))

		// setDisplaySize() en el pool ya dejó la escala correcta para la
		// plataforma actual (nativa en desktop, agrandada en mobile) — hay
		// que animar hacia ESA escala, no a 1, o la bola vuelve al tamaño nativo
		const targetScale = this.ball.scale

		this.ball.scale = 0

		this.scene.add.tween({
			targets: this.ball,
			scale: targetScale,
			ease: 'Bounce.easeOut',
			duration: 300
		})
	}

	returnBall(ball: IBall)
	{
		this.ballPool?.despawn(ball)
	}

	update(dt: number)
	{
		if (!this.ball)
		{
			return
		}

		const pointer = this.scene.input.activePointer

		if (!pointer.leftButtonDown())
		{
			return
		}

		const dx = pointer.x - this.x
		const dy = pointer.y - this.y

		const vec = new Phaser.Math.Vector2(dx, dy)
		vec.normalize()

		const rotation = vec.angle()
		this.rotation = rotation + HALF_PI

		const ballRadius = this.ball.radius
		const physicsRadius = this.ball.physicsRadius

		this.ball.x = this.x + (vec.x * (this.radius + ballRadius + this.gap))
		this.ball.y = this.y + (vec.y * (this.radius + ballRadius + this.gap))

		this.shotGuide?.showFrom(this.ball.x, this.ball.y, vec, physicsRadius, this.ball.color)
	}

	private handlePointerDown()
	{
	}

	private handlePointerUp()
	{
		if (!this.ball)
		{
			return
		}

		const pointer = this.scene.input.activePointer
		const dx = pointer.x - this.x
		const dy = pointer.y - this.y

		const vec = new Phaser.Math.Vector2(dx, dy)
		vec.normalize()

		this.ball.launch(vec)

		this.shootSubject.next(this.ball)

		this.ball = undefined

		this.shotGuide?.hide()
	}
}

Phaser.GameObjects.GameObjectFactory.register('shooter', function (x: number, y: number, key: string, scaleFactor: number = 1) {
	// @ts-ignore
	return this.displayList.add(new Shooter(this.scene, x, y, key, scaleFactor))
})
