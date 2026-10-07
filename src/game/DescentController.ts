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

	// Velocidad de piso -- la que se usa pegado a la línea de peligro, y la
	// única que existía antes de esto. Antes escalaba con
	// BallGrowthModel.population (que crece sola con el tiempo, sin
	// importar si el jugador destruye bolas o no), así que el descenso se
	// iba acelerando a medida que pasaba el tiempo sin importar cómo jugara
	// el jugador -- eso se sacó a pedido. Ver handleBallsDestroyed más abajo
	// para el otro momento en que el estado cambia (reversing).
	private readonly baseSpeed: number

	// Cuántas filas de espacio libre (entre el fondo de la grilla y la línea
	// de peligro del shooter) hacen falta para llegar a la velocidad máxima.
	// Pasado ese punto no acelera más -- no tiene sentido premiar con más
	// velocidad un tablero que ya está vacío del todo.
	private static readonly FULL_SPEED_FREE_ROWS = 8

	// A pantalla completamente libre, el descenso va a esta cantidad de
	// veces la velocidad de piso. Puramente de feel: lo suficiente para que
	// limpiar la parte de abajo se sienta recompensado en vez de forzar a
	// esperar un rato muerto, sin que se sienta injusto cuando el peligro
	// vuelve a estar cerca (ahí el multiplicador ya volvió a 1).
	private static readonly MAX_SPEED_MULTIPLIER = 2.5

	private state = DescentState.Descending

	private subscriptions: SubscriptionLike[] = []

	private reversingSubject = new Subject<void>()

	get yPosition()
	{
		return this.ballGrid.bottom
	}

	constructor(scene: Phaser.Scene, grid: BallGrid, growthModel: IGrowthModel, speed = 0.14)
	{
		this.scene = scene
		this.ballGrid = grid

		this.baseSpeed = speed

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

	/**
	 * `dangerY` es la línea de game over (shooter.y - shooter.radius en
	 * Game.ts). Cuanto más lejos esté el fondo de la grilla de esa línea,
	 * más rápido desciende -- así una pantalla recién limpiada no se siente
	 * muerta mientras la grilla "alcanza" al jugador. Sin este parámetro
	 * (nadie lo pasa) cae siempre a la velocidad de piso, igual que antes.
	 */
	update(dt: number, dangerY?: number)
	{
		switch (this.state)
		{
			case DescentState.Descending:
			{
				const freeSpace = dangerY === undefined ? 0 : Math.max(0, dangerY - this.ballGrid.bottom)
				const rampRange = this.ballGrid.ballInterval * DescentController.FULL_SPEED_FREE_ROWS
				const rampProgress = rampRange > 0 ? Math.min(freeSpace / rampRange, 1) : 0
				const speed = this.baseSpeed * (1 + rampProgress * (DescentController.MAX_SPEED_MULTIPLIER - 1))

				// Referencia de 60 FPS: misma velocidad en pantallas de 30, 60 o 120 Hz.
				// Limitar pausas largas evita saltos al volver a la pestaña.
				const frameScale = Math.max(0, Math.min(dt, 50)) / (1000 / 60)
				this.ballGrid.moveBy(speed * frameScale)

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
