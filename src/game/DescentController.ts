import BallGrid from './BallGrid'
import { SubscriptionLike, Subject, Observable } from 'rxjs'

enum DescentState
{
	Descending,
	Reversing,
	Holding
}

export default class DescentController
{
	private scene: Phaser.Scene
	private ballGrid: BallGrid

	// Constante durante toda la partida a pedido -- antes escalaba con
	// BallGrowthModel.population (que crece sola con el tiempo, sin
	// importar si el jugador destruye bolas o no), así que el descenso se
	// iba acelerando a medida que pasaba el tiempo. Ver handleBallsDestroyed
	// más abajo para el único momento en que sí cambia el estado (reversing).
	private readonly speed: number

	private state = DescentState.Descending

	private subscriptions: SubscriptionLike[] = []

	private reversingSubject = new Subject<void>()

	get yPosition()
	{
		return this.ballGrid.bottom
	}

	constructor(scene: Phaser.Scene, grid: BallGrid, growthModel: IGrowthModel, speed = 0.22)
	{
		this.scene = scene
		this.ballGrid = grid

		this.speed = speed

		const bds = this.ballGrid.onBallsDestroyed().subscribe(count => {
			this.handleBallsDestroyed(count)
		})

		this.subscriptions = [
			bds
		]
	}

	destroy()
	{
		this.subscriptions.forEach(sub => sub.unsubscribe())
		this.subscriptions.length = 0
	}

	setStartingDescent(dy: number)
	{
		this.ballGrid.moveBy(dy)
	}

	hold()
	{
		this.state = DescentState.Holding
	}

	descend()
	{
		this.state = DescentState.Descending
	}

	reversing()
	{
		if (this.state !== DescentState.Reversing)
		{
			return new Promise(resolve => {
				resolve()
			})
		}

		return new Promise(resolve => {
			this.reversingSubject.asObservable().subscribe(resolve)
		})
	}

	update(dt: number)
	{
		switch (this.state)
		{
			case DescentState.Descending:
			{
				this.ballGrid.moveBy(this.speed)

				const dy = this.ballGrid.height - this.ballGrid.bottom
				if (dy < this.ballGrid.ballInterval * 5)
				{
					this.ballGrid.spawnRow()
				}
				break
			}

			case DescentState.Reversing:
				break

			case DescentState.Holding:
				break
		}
	}

	private handleBallsDestroyed(count: number)
	{
		this.state = DescentState.Reversing

		let dy = count
		if (count > 10)
		{
			dy *= Math.min(count / 10, 3)
		}

		const grid = this.ballGrid
		const bottom = grid.bottom

		this.scene.tweens.addCounter({
			from: bottom,
			to: bottom - dy,
			duration: 300,
			ease: 'Back.easeOut',
			onUpdate: function (tween: Phaser.Tweens.Tween) {
				const v = tween.getValue()
				const diff = v - grid.bottom
				grid.moveBy(diff)
			},
			onUpdateScope: this,
			onComplete: function () {
				// if state is no longer Reversing then don't change
				// @ts-ignore
				if (this.state === DescentState.Reversing)
				{
					// @ts-ignore
					this.state = DescentState.Descending
				}

				// @ts-ignore
				this.reversingSubject.next()
			},
			onCompleteScope: this
		})
	}
}
