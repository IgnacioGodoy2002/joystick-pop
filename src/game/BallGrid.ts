import Phaser from 'phaser'

import BallLayoutData, {
	Red, Gre, Blu, Yel
} from './BallLayoutData'

import BallColor, { colorIsMatch } from './BallColor'
import { Subject } from 'rxjs'
import BallState from '~/consts/BallState'

interface IGridPosition
{
	row: number
	col: number
}

type IBallOrNone = IBall | undefined

class RowList extends Array<IBallOrNone>
{
	isStaggered = false
}

export default class BallGrid
{
	private scene: Phaser.Scene
	private pool: IStaticBallPool

	private layoutData?: BallLayoutData

	private size: Phaser.Structs.Size

	private grid: IBallOrNone[][] = []
	private ballsCount = 0

	private ballsDestroyedSubject = new Subject<number>()
	private ballWillBeDestroyed = new Subject<IBall>()
	private orphanWillBeDestroyed = new Subject<IBall>()
	private ballsAddedSubject = new Subject<number>()
	private ballAttachedSubject = new Subject<IBall>()

	get totalBalls()
	{
		return this.ballsCount
	}

	get height()
	{
		this.cleanUpEmptyRows()
		return this.grid.length * this.ballInterval
	}

	get ballInterval()
	{
		return this.size.height * 0.8
	}

	get ballWidth()
	{
		return this.size.width
	}

	get bottom()
	{
		if (this.grid.length <= 0)
		{
			return 0
		}

		const idx = this.grid.length - 1
		const ball = this.grid[idx].find(n => n)
		if (!ball)
		{
			return 0
		}

		// homeY y no y: si justo esta bola está en pleno jiggle, `y` está
		// corrida unos píxeles y DescentController la usa como referencia
		// frame a frame para mover TODA la grilla (ver handleBallsDestroyed)
		return ball.homeY + ball.radius
	}

	constructor(scene: Phaser.Scene, pool: IStaticBallPool)
	{
		this.scene = scene
		this.pool = pool

		const sample = this.pool.spawn(0, 0)
		this.size = new Phaser.Structs.Size(sample.displayWidth, sample.displayHeight)
		this.pool.despawn(sample)
	}

	destroy()
	{
		this.ballsDestroyedSubject.complete()
		this.ballWillBeDestroyed.complete()
	}

	setLayoutData(layout: BallLayoutData)
	{
		this.layoutData = layout

		return this
	}

	onBallsDestroyed()
	{
		return this.ballsDestroyedSubject.asObservable()
	}

	onBallWillBeDestroyed()
	{
		return this.ballWillBeDestroyed.asObservable()
	}

	onOrphanWillBeDestroyed()
	{
		return this.orphanWillBeDestroyed.asObservable()
	}

	onBallsAdded()
	{
		return this.ballsAddedSubject.asObservable()
	}

	onBallAttached()
	{
		return this.ballAttachedSubject.asObservable()
	}

	/**
	 * 
	 * @param x x position at collision with grid
	 * @param y y position at collision with grid
	 * @param color color ball
	 * @param gridBall ball in grid that was collided with
	 * @param bvx x velocity of ball at collision
	 * @param bvy y velocity of ball at collision
	 */
	async attachBall(x: number, y: number, color: BallColor, gridBall: IBall, bvx: number, bvy: number)
	{
		const { row, col } = this.findRowAndColumns(gridBall)

		if (row < 0 || col < 0)
		{
			// La bola contra la que se chocó ya no está en la grilla (quedó
			// como sprite huérfano de algún encastre fallido anterior). Si
			// se siguiera adelante, el destino se calcularía contra
			// row/col = -1 y terminaría en otro huérfano -- o sea, el bug se
			// realimentaría tiro a tiro. Se la saca de circulación y se
			// descarta el tiro.
			console.warn('BallGrid.attachBall: la bola impactada no está en la grilla, se descarta')
			this.pool.despawn(gridBall)
			return
		}

		const target = this.findFreeCellAround(row, col, gridBall, x, y, bvx, bvy)

		if (!target)
		{
			// Las 6 celdas hexagonales alrededor del impacto están ocupadas o
			// caen fuera del tablero. No hay dónde encastrar: antes se
			// insertaba igual encima de una celda ocupada (insertAt pisaba la
			// entrada) y la bola pisada quedaba como sprite fantasma
			// superpuesto para siempre. Mejor no materializar nada.
			console.warn('BallGrid.attachBall: sin celda libre alrededor del impacto, se descarta el tiro')
			return
		}

		const { row: bRow, col: bCol, x: tx, y: ty } = target

		const newBall = this.pool.spawn(x, y)
			.setColor(color)

		if (!this.insertAt(bRow, bCol, newBall))
		{
			this.pool.despawn(newBall)
			return
		}

		const matches = this.findMatchesAt(bRow, bCol, color)
		// minimum 3 matches required
		if (matches.length < 3)
		{
			this.ballsCount += 1
			this.ballsAddedSubject.next(1)
			this.ballAttachedSubject.next(newBall)
			this.animateAttachBounceAt(bRow, bCol, tx, ty, newBall)

			// Red de seguridad en el camino SIN combo, que es el 80% de los
			// tiros y el que antes no revisaba absolutamente nada. Si por
			// cualquier vía quedó una bola sin sostén o una celda
			// desincronizada, se corrige acá en vez de arrastrarse hasta el
			// final de la partida.
			this.sweepStranded()
			return
		}

		// remove them from grid immediately but not visually...
		// remove visually after animation below
		// we want to remove from grid immediately so that other
		// processes that add new rows can run normally
		// `retire()` las marca como "muriéndose": siguen vivas en pantalla
		// unos milisegundos terminando su animación, y sin esa marca la
		// barrida de reconcile() las tomaría por sprites colgados y las
		// mataría antes de tiempo
		const matchedBalls = this.retire(this.removeFromGrid(matches))

		const orphanPositions = this.findOrphanedBalls()
		const orphans = this.retire(this.removeFromGrid(orphanPositions))
			.map(ball => {
				ball.setActive(false)
				this.scene.physics.world.remove(ball.body)
				return ball
			})

		this.cleanUpEmptyRows()

		// el viaje desde el punto de impacto hasta la celda se anima como
		// offset respecto del home ya definitivo, no tweeneando x/y a
		// absolutos: durante estos 50ms la grilla puede estar descendiendo
		// (o retrocediendo por el combo recién hecho) y un tween absoluto
		// aterrizaría en la posición que la celda tenía al empezar
		const fromX = newBall.x - tx
		const fromY = newBall.y - ty

		newBall.setHome(tx, ty)
		newBall.setVisualOffset(fromX, fromY)

		const travel = this.scene.tweens.addCounter({
			from: 0,
			to: 1,
			duration: 50,
			ease: 'Back.easeOut',
			onUpdate: (tween: Phaser.Tweens.Tween) => {
				const p = tween.getValue()
				newBall.setVisualOffset(fromX * (1 - p), fromY * (1 - p))
			},
			onComplete: () => {
				newBall.setVisualOffset(0, 0)
			}
		})

		newBall.setAnimationTween(travel)

		// La espera va contra el reloj de la escena, NO contra el onComplete
		// del tween: Phaser 3.22 no tiene callback onStop y `Tween.stop()`
		// tampoco dispara onComplete (se limita a marcar PENDING_REMOVE).
		// Si otro encastre simultáneo despawneara esta bola dentro de estos
		// 50ms -- y el despawn ahora corta la animación -- el await nunca
		// resolvería y el shooter se quedaría sin recargar: el juego entero
		// congelado. El delayedCall resuelve igual pase lo que pase.
		await new Promise(resolve => {
			this.scene.time.delayedCall(50, resolve)
		})

		// remove matched balls
		matchedBalls.forEach(ball => {
			this.ballWillBeDestroyed.next(ball)
			this.pool.despawn(ball)
		})

		const destroyedCount = matches.length + orphans.length
		this.ballsDestroyedSubject.next(destroyedCount)
		this.ballsCount -= destroyedCount

		if (orphans.length > 0)
		{
			await this.animateOrphans(orphans)
		}

		// misma red de seguridad que en el camino sin combo: acá recién
		// terminaron de morirse las bolas del combo, así que es el momento
		// en que la estructura y la pantalla tienen que volver a coincidir
		this.reconcile()
	}

	/**
	 * Marca bolas que ya salieron de la grilla y están terminando su
	 * animación de destrucción, para que `reconcile()` no las confunda con
	 * sprites colgados por un bug.
	 */
	private retire(balls: IBall[])
	{
		for (let i = 0; i < balls.length; ++i)
		{
			balls[i].retiring = true
		}
		return balls
	}

	/**
	 * Reconcilia la estructura de la grilla con lo que realmente hay vivo en
	 * pantalla. Corrige las DOS formas en que pueden desincronizarse, que
	 * son las que producen el síntoma de "bolas flotando en el aire":
	 *
	 *  - ZOMBI: la grilla referencia una bola cuyo sprite ya está muerto u
	 *    oculto. La celda cuenta como ocupada y como sostén para el cálculo
	 *    de huérfanas, pero en pantalla no hay nada -- así que todo lo que
	 *    cuelga de ella se ve flotando, y además esa celda bloquea encastres.
	 *
	 *  - FANTASMA: un sprite vivo que la grilla no conoce. No se puede
	 *    emparejar ni destruir, nunca cae aunque se quede sin sostén, y sigue
	 *    siendo colisionable, así que desvía tiros contra la nada.
	 *
	 * Es deliberadamente una red de seguridad y no un reemplazo de la lógica
	 * correcta: cada desincronización que arregla es un bug en otro lado. Si
	 * alguna vez devuelve > 0 de forma sostenida, hay que ir a buscar la
	 * causa, no dejarlo tapando. Se puso porque el síntoma estaba reportado
	 * en producción por usuarios reales y no se pudo reproducir en
	 * laboratorio: con esto, aunque alguna ruta no prevista desincronice el
	 * tablero, se repara solo en el tiro siguiente en vez de quedar roto el
	 * resto de la partida.
	 */
	reconcile()
	{
		let healed = 0

		// --- zombis ---
		for (let r = 0; r < this.grid.length; ++r)
		{
			const list = this.grid[r]
			for (let c = 0; c < list.length; ++c)
			{
				const ball = list[c]
				if (ball && (!ball.active || !ball.visible))
				{
					list[c] = undefined
					healed += 1
				}
			}
		}

		// --- fantasmas ---
		const known = new Set<IBall>()
		this.grid.forEach(list => list.forEach(b => { if (b) { known.add(b) } }))

		const children = this.pool.getChildren()
		for (let i = 0; i < children.length; ++i)
		{
			const ball = children[i] as IBall

			if (!ball.active || !ball.visible)
			{
				continue
			}

			if (known.has(ball) || ball.retiring)
			{
				continue
			}

			this.pool.despawn(ball)
			healed += 1
		}

		if (healed > 0)
		{
			console.warn(`BallGrid.reconcile: ${healed} celda(s) desincronizada(s) reparada(s)`)
			this.pruneEmptyTopRows()
			this.cleanUpEmptyRows()
		}

		return healed
	}

	/**
	 * Red de seguridad que corre después de CADA encastre, no sólo cuando
	 * hubo combo. Antes el cálculo de huérfanas sólo se disparaba al explotar
	 * 3+ bolas; si alguna bola quedaba descolgada por cualquier otra vía, se
	 * quedaba flotando en el aire hasta el final de la partida. Ahora se
	 * reconcilia la estructura y se tira todo lo que no esté colgando del
	 * techo, tiro a tiro. Si no hay nada que corregir no hace nada: el costo
	 * es un recorrido del tablero (~100-200 bolas), despreciable.
	 */
	private sweepStranded()
	{
		this.reconcile()

		const positions = this.findOrphanedBalls()

		if (positions.length <= 0)
		{
			return
		}

		console.warn(`BallGrid.sweepStranded: ${positions.length} bola(s) sin sostén, se las tira`)

		const orphans = this.retire(this.removeFromGrid(positions))
			.map(ball => {
				ball.setActive(false)
				this.scene.physics.world.remove(ball.body)
				return ball
			})

		this.cleanUpEmptyRows()

		this.ballsDestroyedSubject.next(orphans.length)
		this.ballsCount -= orphans.length

		// sin await a propósito: esto es una corrección de fondo, no tiene
		// que bloquear la recarga del shooter. El catch es obligatorio
		// justamente por eso: una promesa suelta que rechace sería un
		// unhandled rejection, y acá no hay a quién propagarle el error.
		this.animateOrphans(orphans).catch(err => {
			console.error('BallGrid.sweepStranded: falló la caída de huérfanas', err)
		})
	}

	/**
	 * Planta todas las bolas en su posición canónica, cortando cualquier
	 * animación en curso. Se llama justo antes de pausar la escena por game
	 * over: al pausarla su TweenManager deja de correr, así que un rebote o
	 * un jiggle que estuviera arrancando queda congelado a mitad de camino
	 * -- hasta ~20px fuera de su celda -- y el tablero de fondo de la
	 * pantalla de Game Over se ve con bolas corridas/encimadas.
	 */
	settleAll()
	{
		const balls = this.pool.getChildren()
		for (let i = 0; i < balls.length; ++i)
		{
			const b = balls[i] as IBall
			b.stopAnimation()
			b.setVisualOffset(0, 0)
		}

		return this
	}

	generate(rows = 6)
	{
		if (!this.layoutData)
		{
			return this
		}

		for (let i = 0; i < rows; ++i)
		{
			this.spawnRow()
		}

		return this
	}

	moveBy(dy: number)
	{
		if (this.pool.countActive() === 0)
		{
			return this
		}

		const balls = this.pool.getChildren()
		const count = balls.length
		for (let i = 0; i < count; ++i)
		{
			const b = balls[i] as IBall

			// mueve el home preservando el offset de animación, así una bola
			// en pleno rebote/jiggle acompaña el descenso en vez de quedarse
			// clavada donde estaba cuando arrancó el tween
			b.moveHomeBy(0, dy)
		}

		return this
	}

	spawnRow()
	{
		if (!this.layoutData)
		{
			return -1
		}

		const row = this.layoutData.getNextRow()
		const count = row.length

		if (count <= 0)
		{
			return 0
		}

		this.addRowToFront(row)

		this.ballsCount += count
		this.ballsAddedSubject.next(count)

		return row.length
	}

	private addRowToFront(row: string[])
	{
		const middle = this.scene.scale.width * 0.5
		const width = this.size.width
		const radius = width * 0.5
		const verticalInterval = this.ballInterval

		const count = row.length

		// Una fila que se vació entera (match que se llevó todas sus bolas)
		// quedaba igual en la estructura: cleanUpEmptyRows sólo poda desde
		// abajo. Si esa fila fantasma quedaba arriba de todo, la fila nueva
		// se anclaba contra ella, no encontraba ninguna bola de referencia y
		// se dibujaba en y = 0, encimada sobre la grilla real. Podarlas
		// también desde arriba además devuelve a la fila 0 su rol de raíz
		// para el cálculo de huérfanas.
		this.pruneEmptyTopRows()

		const gridRow = new RowList()
		this.grid.unshift(gridRow)

		const halfCount = count * 0.5
		let x = middle - (halfCount * width) + (radius * 0.5)
		let y = 0

		if (this.grid.length <= 1)
		{
			gridRow.isStaggered = true
		}
		else
		{
			const rowList = this.grid[1] as RowList
			gridRow.isStaggered = !rowList.isStaggered

			// Se busca la primera fila con bolas y se descuenta un intervalo
			// por cada fila intermedia, en vez de asumir que la de arriba de
			// todo siempre tiene alguna.
			for (let i = 1; i < this.grid.length; ++i)
			{
				const anyItem = this.grid[i].find(n => n)
				if (anyItem)
				{
					// homeY: si la bola de referencia está animándose, su `y`
					// está corrida y la fila nueva entera nacería desalineada
					y = anyItem.homeY - (i * verticalInterval)
					break
				}
			}
		}
		
		if (gridRow.isStaggered)
		{
			x += radius
			// to handle the offset
			gridRow.push(undefined)
		}

		row.forEach(colorCode => {
			const b = this.pool.spawn(x, y)
			gridRow.push(b)

			switch (colorCode)
			{
				default:
				case undefined:
					break

				case Red:
					b!.setColor(BallColor.Red)
					break

				case Blu:
					b!.setColor(BallColor.Blue)
					break

				case Gre:
					b!.setColor(BallColor.Green)
					break

				case Yel:
					b!.setColor(BallColor.Yellow)
					break
			}

			x += width
		})

		if (!gridRow.isStaggered)
		{
			// pad end with space for offset
			gridRow.push(undefined)
		}
	}

	private removeFromGrid(matches: IGridPosition[])
	{
		const balls: IBall[] = []
		const size = matches.length
		for (let i = 0; i < size; ++i)
		{
			const { row, col } = matches[i]
			const ball = this.getAt(row, col)

			if (!ball)
			{
				// should never be the case..
				console.warn(`detroyMatches: match not found...`)
				continue
			}

			this.grid[row][col] = undefined
			balls.push(ball)
		}

		return balls
	}

	private async animateOrphans(orphans: IBall[])
	{
		// move down and fade out
		const timeline = this.scene.tweens.timeline()
		const bottom = this.scene.scale.height * 0.9

		const tasks = orphans.map(orphan => {
			const dy = bottom - orphan.homeY
			const duration = dy * 0.75

			return new Promise(resolve => {
				timeline.add({
					// la caída también como offset: estas bolas siguen en el
					// pool y por lo tanto `moveBy` les sigue tocando el home
					// mientras caen (la grilla está retrocediendo justo en
					// ese momento, por el combo que las dejó huérfanas)
					targets: { value: 0 },
					value: dy,
					offset: 0,
					duration,
					onUpdate: function (tween: Phaser.Tweens.Tween, target: { value: number }) {
						orphan.setVisualOffset(0, target.value)
					},
					onComplete: function () {
						// @ts-ignore
						this.ballWillBeDestroyed.next(orphan)
						// @ts-ignore
						this.orphanWillBeDestroyed.next(orphan)
						// @ts-ignore
						this.pool.despawn(orphan)

						resolve()
					},
					onCompleteScope: this
				})
			})
		})

		timeline.play()

		await Promise.all(tasks)
	}

	/**
	 * Rebote de encastre. El home se fija de entrada en la celda destino y
	 * todo el movimiento se anima como OFFSET respecto de él (ver
	 * Ball.setVisualOffset): así la bola acompaña el descenso de la grilla
	 * mientras rebota, en vez de aterrizar en las coordenadas que la celda
	 * tenía 200ms antes.
	 */
	private animateAttachBounceAt(row: number, col: number, tx: number, ty: number, newBall: IBall)
	{
		const fromX = newBall.x - tx
		const fromY = newBall.y - ty

		newBall.setHome(tx, ty)
		newBall.setVisualOffset(fromX, fromY)

		// https://github.com/photonstorm/phaser/blob/v3.22.0/src/math/easing/EaseMap.js
		const overshoot = -5

		const bounce = this.scene.tweens.addCounter({
			from: 0,
			to: 1,
			duration: 100,
			onUpdate: (tween: Phaser.Tweens.Tween) => {
				const p = tween.getValue()

				// x avanza linealmente durante los 100ms completos
				const ox = fromX * (1 - p)

				// y va primero al overshoot (0 -> 0.5) y después vuelve a 0
				// con Back.easeOut (0.5 -> 1), igual que la timeline original
				const oy = p < 0.5
					? Phaser.Math.Linear(fromY, overshoot, p / 0.5)
					: Phaser.Math.Linear(overshoot, 0, Phaser.Math.Easing.Back.Out((p - 0.5) / 0.5))

				newBall.setVisualOffset(ox, oy)
			},
			onComplete: () => {
				newBall.setVisualOffset(0, 0)
			}
		})

		newBall.setAnimationTween(bounce)

		this.jiggleNeighbors(row, col)
	}

	private findRowAndColumns(ball: IBall)
	{
		// search from the bottom
		const size = this.grid.length
		for (let i = size - 1; i >= 0; --i)
		{
			const row = this.grid[i]
			const colIdx = row.findIndex(b => b === ball)
			if (colIdx < 0)
			{
				continue
			}

			return {
				row: i,
				col: colIdx
			}
		}

		return {
			row: -1,
			col: -1
		}
	}

	/**
	 * Devuelve `true` sólo si la bola quedó efectivamente en la grilla. Antes
	 * no devolvía nada y, peor, escribía `rowList[col] = ball` sin mirar si
	 * la celda ya estaba ocupada: la bola anterior desaparecía de la
	 * estructura de datos pero seguía existiendo como sprite activo en el
	 * pool, superpuesta a la nueva y ya sin forma de volver a emparejarse ni
	 * de destruirse. Ésa era la causa de las bolas superpuestas. Ahora el
	 * que llama tiene que hacerse cargo del `false` (ver attachBall).
	 */
	private insertAt(row: number, col: number, ball: IBall)
	{
		if (row < 0 || col < 0)
		{
			console.error(`BallGrid.insertAt: posición inválida row=${row} col=${col}, se ignora la inserción`)
			return false
		}

		if (row >= this.grid.length)
		{
			const count = row - (this.grid.length - 1)
			for (let i = 0; i < count; ++i)
			{
				const rowList = new RowList()
				// siempre contra la última fila REAL del momento -- tomar
				// `grid[row + i - 1]` daba undefined apenas había que crear
				// más de una fila de golpe
				const prevRow = this.grid[this.grid.length - 1] as RowList
				rowList.isStaggered = prevRow ? !prevRow.isStaggered : true
				this.grid.push(rowList)
			}
		}

		const rowList = this.grid[row]

		if (!rowList)
		{
			console.error(`BallGrid.insertAt: la fila row=${row} no existe, se ignora la inserción`)
			return false
		}

		for (let i = 0; i <= col; ++i)
		{
			if (rowList.length <= i)
			{
				rowList[i] = undefined
			}
		}

		if (rowList[col])
		{
			console.error(`BallGrid.insertAt: la celda row=${row} col=${col} ya está ocupada, se ignora la inserción`)
			return false
		}

		rowList[col] = ball

		return true
	}

	/**
	 * Elige en cuál de las 6 celdas hexagonales que rodean a `gridBall` entra
	 * la bola recién disparada: la LIBRE más cercana al punto de impacto,
	 * proyectado un radio hacia adelante en la dirección en la que venía.
	 *
	 * Antes el destino se deducía sólo de la geometría del impacto (de qué
	 * lado y a qué altura pegó), sin mirar si esa celda estaba libre. Cuando
	 * no lo estaba -- caso facilísimo de provocar: rozar el costado de una
	 * bola en el medio de una fila llena cae en la rama `sameRow` y apunta a
	 * una celda que casi seguro tiene dueño -- la bola nueva se dibujaba
	 * encima de la vieja. De ahí las bolas superpuestas de los reportes.
	 *
	 * Las posiciones en pantalla se derivan de `gridBall`, no se recalculan
	 * desde cero, así que la celda elegida y las coordenadas devueltas no
	 * pueden quedar desfasadas entre sí.
	 */
	private findFreeCellAround(row: number, col: number, gridBall: IBall, x: number, y: number, bvx: number, bvy: number)
	{
		const width = this.size.width
		const radius = width * 0.5
		const interval = this.ballInterval

		// posición CANÓNICA de la bola impactada, no la visual: si está en
		// pleno jiggle (cosa muy común -- cada encastre sacude a sus vecinas
		// durante 100ms), su `y` está corrida y el destino que se derive de
		// ella hereda esa corrida como error PERMANENTE. Tiro a tiro eso se
		// acumula y termina encimando filas.
		const cellX = gridBall.homeX
		const cellY = gridBall.homeY

		const vel = new Phaser.Math.Vector2(bvx, bvy)
		if (vel.lengthSq() > 0)
		{
			vel.normalize()
		}

		const hx = x + (vel.x * radius)
		const hy = y + (vel.y * radius)

		const hex = this.getHexNeighborPositions(row, col)

		const candidates = [
			{ row: hex.left.row, col: hex.left.col, x: cellX - width, y: cellY },
			{ row: hex.right.row, col: hex.right.col, x: cellX + width, y: cellY },
			{ row: hex.topLeft.row, col: hex.topLeft.col, x: cellX - radius, y: cellY - interval },
			{ row: hex.topRight.row, col: hex.topRight.col, x: cellX + radius, y: cellY - interval },
			{ row: hex.bottomLeft.row, col: hex.bottomLeft.col, x: cellX - radius, y: cellY + interval },
			{ row: hex.bottomRight.row, col: hex.bottomRight.col, x: cellX + radius, y: cellY + interval }
		]

		const sceneWidth = this.scene.scale.width

		let best: typeof candidates[0] | null = null
		let bestDistance = Number.MAX_VALUE

		for (let i = 0; i < candidates.length; ++i)
		{
			const candidate = candidates[i]

			// row < 0 sería una fila arriba de la primera, que no existe y no
			// se puede crear (la grilla crece hacia abajo desde su tope)
			if (candidate.row < 0 || candidate.col < 0)
			{
				continue
			}

			// Una celda que no entra ENTERA en el tablero no es una celda:
			// son los huecos de relleno que cada fila deja en una punta para
			// alinear el hexágono (ver addRowToFront). Están libres en la
			// estructura, pero poner una bola ahí la deja medio afuera de la
			// pantalla Y encimada con la fila de al lado. Un tiro sin destino
			// válido se descarta; es preferible a materializar una
			// superposición.
			//
			// El margen es el RADIO, no 0: con el criterio viejo (centro
			// dentro de la pantalla) el hueco de relleno de una punta pasaba
			// el filtro por poco y la bola quedaba medio cortada contra el
			// borde -- justo lo que se ve en las capturas del reporte. El
			// epsilon de 1px absorbe el redondeo de la aritmética flotante
			// del centrado, que deja la primera/última celda legítima
			// exactamente sobre el límite.
			if (candidate.x < radius - 1 || candidate.x > sceneWidth - radius + 1)
			{
				continue
			}

			if (this.getAt(candidate.row, candidate.col))
			{
				continue
			}

			const distance = Phaser.Math.Distance.Squared(hx, hy, candidate.x, candidate.y)

			if (distance < bestDistance)
			{
				bestDistance = distance
				best = candidate
			}
		}

		return best
	}

	private getAt(row: number, col: number)
	{
		if (row < 0)
		{
			return null
		}

		if (row > this.grid.length - 1)
		{
			return null
		}

		const rowList = this.grid[row]
		return rowList[col]
	}

	private findOrphanedBalls()
	{
		// La raíz es la primera fila CON bolas, no la fila 0 a secas: si un
		// match vació la fila de arriba, tomar el índice 0 a ciegas dejaba
		// cero raíces y hacía caer el tablero entero como huérfano.
		const rootRow = this.grid.findIndex(list => list.some(n => n))

		if (rootRow < 0)
		{
			return []
		}

		// find all connected balls starting from the top row
		const connected = new Set<IBall>()
		const rootPositions = this.grid[rootRow]
			.map((n, idx) => { 
				if (!n)
				{
					return undefined
				}
				connected.add(n)
				return { row: rootRow, col: idx }
			})
			.filter(n => n) as IGridPosition[]

		rootPositions.forEach(({ row, col }) => {
			this.findMatchesAt(row, col, BallColor.Any, connected)
		})

		// any balls that are NOT in the connected set are orphaned
		// ignore the root row; they can never be "orphaned"
		const orphans: IGridPosition[] = []
		const count = this.grid.length
		for (let row = rootRow + 1; row < count; ++row)
		{
			const list = this.grid[row]
			for (let col = 0; col < list.length; ++col)
			{
				const ball = list[col]
				if (!ball)
				{
					continue
				}

				if (connected.has(ball))
				{
					continue
				}

				orphans.push({
					row, col
				})
			}
		}

		return orphans
	}

	private findMatchesAt(row: number, col: number, color: BallColor, found: Set<IBall> = new Set())
	{
		// breadth-first search method
		const isStaggered = this.isRowStaggered(row)
		const adjacentMatches: IGridPosition[] = []

		// top left
		if (isStaggered)
		{
			const tl = this.getAt(row - 1, col - 1)
			if (tl && colorIsMatch(tl.color, color) && !found.has(tl))
			{
				adjacentMatches.push({
					row: row - 1,
					col: col - 1
				})
				found.add(tl)
			}
		}

		// top
		const t = this.getAt(row - 1, col)
		if (t && colorIsMatch(t.color, color) && !found.has(t))
		{
			adjacentMatches.push({
				row: row - 1,
				col
			})
			found.add(t)
		}

		// top right
		if (!isStaggered)
		{
			const tr = this.getAt(row - 1, col + 1)
			if (tr && colorIsMatch(tr.color, color) && !found.has(tr))
			{
				adjacentMatches.push({
					row: row - 1,
					col: col + 1
				})
				found.add(tr)
			}
		}

		// right
		const r = this.getAt(row, col + 1)
		if (r && colorIsMatch(r.color, color) && !found.has(r))
		{
			adjacentMatches.push({
				row,
				col: col + 1
			})
			found.add(r)
		}

		// bottom right
		if (!isStaggered)
		{
			const br = this.getAt(row + 1, col + 1)
			if (br && colorIsMatch(br.color, color) && !found.has(br))
			{
				adjacentMatches.push({
					row: row + 1,
					col: col + 1
				})
				found.add(br)
			}
		}

		// bottom
		const b = this.getAt(row + 1, col)
		if (b && colorIsMatch(b.color, color) && !found.has(b))
		{
			adjacentMatches.push({
				row: row + 1,
				col
			})
			found.add(b)
		}

		// bottom left
		if (isStaggered)
		{
			const bl = this.getAt(row + 1, col - 1)
			if (bl && colorIsMatch(bl.color, color) && !found.has(bl))
			{
				adjacentMatches.push({
					row: row + 1,
					col: col - 1
				})
				found.add(bl)
			}
		}

		// left
		const l = this.getAt(row, col - 1)
		if (l && colorIsMatch(l.color, color) && !found.has(l))
		{
			adjacentMatches.push({
				row,
				col: col - 1
			})
			found.add(l)
		}

		adjacentMatches.forEach(pos => {
			this.findMatchesAt(pos.row, pos.col, color, found)
				.forEach(obj => adjacentMatches.push(obj))
		})

		const missing = adjacentMatches.find(({ row, col }) => {
			return !this.getAt(row, col)
		})

		if (missing)
		{
			console.dir(missing)
		}

		return adjacentMatches
	}

	private jiggleNeighbors(sourceRow: number, sourceCol: number)
	{
		const sourceBall = this.getAt(sourceRow, sourceCol)
		const firstNeightbors = this.getNeighbors(sourceRow, sourceCol)

		const secondTop = sourceRow - 1

		const secondNeighbors = firstNeightbors.find(({ row }) => row === secondTop)
			? this.getNeighbors(secondTop, sourceCol)
			: []

		const degrees = [
			firstNeightbors,
			secondNeighbors
		]

		const size = degrees.length
		for (let i = 0; i < size; ++i)
		{
			const deg = degrees[i]
			for (let j = 0; j < deg.length; ++j)
			{
				const { row, col } = deg[j]
				const ball = this.getAt(row, col)
				if (!ball || ball === sourceBall)
				{
					continue
				}

				const factor = (size - i) / size
				const movement = 10 * factor

				// La sacudida va como OFFSET visual, nunca tweeneando `y`.
				// Con el tween absoluto que había acá, los 100ms de jiggle
				// le pisaban la `y` a la bola en cada frame con el valor
				// capturado al empezar -- o sea, descartaban todo el
				// descenso (o el retroceso por combo, de hasta 30px) que
				// ocurriera durante la animación. La bola volvía a "su"
				// posición vieja y quedaba desfasada del resto de su fila
				// para siempre. Cada encastre sacude hasta ~8 vecinas, así
				// que el error se repartía por todo el tablero y crecía tiro
				// a tiro: ésa es la superposición que se seguía viendo.
				const jiggle = this.scene.tweens.addCounter({
					from: 0,
					to: 1,
					duration: 100,
					onUpdate: (tween: Phaser.Tweens.Tween) => {
						const p = tween.getValue()
						const oy = p < 0.5
							? Phaser.Math.Linear(0, -movement, p / 0.5)
							: Phaser.Math.Linear(-movement, 0, Phaser.Math.Easing.Back.Out((p - 0.5) / 0.5))

						ball.setVisualOffset(0, oy)
					},
					onComplete: () => {
						ball.setVisualOffset(0, 0)
					}
				})

				ball.setAnimationTween(jiggle)
			}
		}
	}

	private getNeighbors(row: number, col: number, includeBottom = false)
	{
		const positions = this.getNeighborPositions(row, col, 1, includeBottom)
		const neighbors = positions.map(({ row, col }) => {
			const n = this.getAt(row, col)
			if (!n)
			{
				return undefined
			}
			return { row, col }
		})
		.filter(n => n)

		return neighbors as { row: number, col: number }[]
	}

	private getNeighborPositions(row: number, col: number, degrees = 1, includeBottom = false)
	{
		const positions = [
			{ row: row, col: col - degrees },			// left
			{ row: row, col: col + degrees },			// right
			{ row: row - degrees, col: col }, 			// top
			{ row: row - degrees, col: col - degrees },	// top left
			{ row: row - degrees, col: col + degrees},	// top right
		]

		if (includeBottom)
		{
			positions.push({ row: row + degrees, col: col }) 			// bottom
			positions.push({ row: row + degrees, col: col - degrees })	// bottom left
			positions.push({ row: row + degrees, col: col + degrees })	// bottom right
		}

		return positions
	}

	// Las filas alternan parity por construcción (ver addRowToFront e
	// insertAt), así que para una fila que todavía no existe alcanza con
	// invertir la de al lado. La versión anterior entraba a esa rama también
	// para la ÚLTIMA fila real y leía `grid[row - 1]` -- con una grilla de
	// una sola fila eso era `grid[-1]`, undefined, y tiraba excepción.
	private isRowStaggered(row: number)
	{
		const rowList = this.grid[row] as RowList
		if (rowList)
		{
			return rowList.isStaggered
		}

		const above = this.grid[row - 1] as RowList
		if (above)
		{
			return !above.isStaggered
		}

		const below = this.grid[row + 1] as RowList
		if (below)
		{
			return !below.isStaggered
		}

		// grilla vacía: mismo default que usa addRowToFront para la primera fila
		return true
	}

	private getHexNeighborPositions(row: number, col: number)
	{
		const isStaggered = this.isRowStaggered(row)

		const topLeft = isStaggered ? { row: row - 1, col: col - 1 } : { row: row - 1, col }
		const topRight = isStaggered ? { row: row - 1, col } : { row: row - 1, col: col + 1 }
		const bottomLeft = isStaggered ? { row: row + 1, col: col - 1 } : { row: row + 1, col }
		const bottomRight = isStaggered ? { row: row + 1, col } : { row: row + 1, col: col + 1 }

		return {
			topLeft,
			topRight,
			right: { row, col: col + 1 },
			bottomRight,
			bottomLeft,
			left: { row, col: col - 1 }
		}
	}

	// every staggered/unstaggered row has one structural padding slot at
	// one end used purely for hex alignment (see addRowToFront) — that slot
	// is never a real gap in the playfield, just an artifact of the layout
	private isPaddingSlot(row: number, col: number)
	{
		const list = this.grid[row]
		if (this.isRowStaggered(row))
		{
			return col === 0
		}
		return col === list.length - 1
	}

	// any other empty cell within the populated grid is a real gap a shot
	// could otherwise sail through — a single missing ball, or an interior
	// cell of a bigger multi-ball void left behind by a match-clear
	private isInternalHole(row: number, col: number)
	{
		if (this.getAt(row, col))
		{
			return false
		}

		return !this.isPaddingSlot(row, col)
	}

	/**
	 * The shot ball's collision circle is intentionally smaller than its
	 * visual size (see Ball.physicsRadius) to keep tight shots feeling
	 * good — but that also means a fast shot can slip through an internal
	 * hole without ever overlapping a neighbor's collider. This checks the
	 * ball's current position against a proximity threshold; if it's within
	 * that distance of any neighbor of an internal hole, that neighbor is
	 * returned so the caller can force an attach there instead of letting
	 * the ball keep flying through the gap.
	 *
	 * Threshold: a hole's DIAGONAL neighbors (the ones directly bordering
	 * its narrowest point) sit at distance width*sqrt(0.25 + 0.8^2) ≈
	 * 0.943 * displayWidth from the hole's center — noticeably more than
	 * the 0.9 * displayWidth Game.processBallHitGrid uses for direct
	 * ball-vs-ball hits. A ball passing dead-center through the hole would
	 * never come within 0.9x of anything, so reusing that threshold here
	 * would never fire. displayWidth * 1.0 (full visual "touching"
	 * distance between two equal balls) comfortably covers that ~0.943x
	 * worst case with margin to spare.
	 */
	checkHoleGuard(ball: IBall)
	{
		const threshold = ball.displayWidth * 1.0
		const thresholdSq = threshold * threshold

		const rows = this.grid.length
		for (let row = 1; row < rows; ++row)
		{
			const list = this.grid[row]
			for (let col = 0; col < list.length; ++col)
			{
				if (!this.isInternalHole(row, col))
				{
					continue
				}

				const neighbors = this.getHexNeighborPositions(row, col)
				const candidates = [
					neighbors.topLeft, neighbors.topRight,
					neighbors.right,
					neighbors.bottomRight, neighbors.bottomLeft,
					neighbors.left
				]

				for (let i = 0; i < candidates.length; ++i)
				{
					const pos = candidates[i]
					const neighbor = this.getAt(pos.row, pos.col)
					if (!neighbor)
					{
						continue
					}

					// la bola en vuelo sí va por x/y (es su posición real),
					// pero la de la grilla por home: un vecino en pleno
					// jiggle no debe mover el umbral de este chequeo
					const distSq = Phaser.Math.Distance.Squared(ball.x, ball.y, neighbor.homeX, neighbor.homeY)
					if (distSq <= thresholdSq)
					{
						return neighbor
					}
				}
			}
		}

		return null
	}

	// Contraparte de cleanUpEmptyRows (que poda desde abajo): saca las filas
	// que quedaron sin ninguna bola desde arriba. No mueve nada en pantalla
	// -- esas filas ya no tienen sprites -- sólo deja de contarlas como
	// filas de la grilla.
	private pruneEmptyTopRows()
	{
		while (this.grid.length > 0 && !this.grid[0].find(n => n))
		{
			this.grid.shift()
		}
	}

	private cleanUpEmptyRows()
	{
		const size = this.grid.length
		for (let i = size - 1; i >= 0; --i)
		{
			const row = this.grid[i]
			if (row.find(n => n))
			{
				return
			}

			this.grid.pop()
		}
	}
}
