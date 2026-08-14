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

		return ball.y + ball.radius
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
		const width = this.size.width
		const radius = width * 0.5

		const vel = new Phaser.Math.Vector2(bvx, bvy)
		vel.normalize()

		// the position on the ball in the direction it was heading
		const hx = x + (vel.x * radius)

		const cellX = gridBall.x
		const cellY = gridBall.y

		const dx = hx - cellX

		let tx = dx <= 0 ? cellX - radius : cellX + radius

		// offset by vertical interval
		const interval = this.ballInterval
		const dy = y - cellY
		let ty = dy >= 0 ? cellY + interval : cellY - interval

		// place on same row
		const sameRow = Math.abs(dy) <= radius
		if (sameRow)
		{
			ty = cellY
			// adjust x to be next to
			tx = dx <= 0 ? tx - radius : tx + radius
		}

		const newBall = this.pool.spawn(x, y)
			.setColor(color)

		const { row, col } = this.findRowAndColumns(gridBall)

		let bRow = -1
		if (sameRow)
		{
			bRow = row
		}
		else
		{
			if (ty < cellY)
			{
				bRow = row - 1
			}
			else
			{
				bRow = row + 1
			}
		}

		let bCol = -1

		if (sameRow)
		{
			bCol = tx < cellX ? col - 1 : col + 1
		}
		else
		{
			const isStaggered = this.isRowStaggered(bRow)
			if (isStaggered)
			{
				bCol = tx < cellX ? col : col + 1
			}
			else
			{
				bCol = tx < cellX ? col - 1 : col
			}
		}

		this.insertAt(bRow, bCol, newBall)

		const matches = this.findMatchesAt(bRow, bCol, color)
		// minimum 3 matches required
		if (matches.length < 3)
		{
			this.ballsCount += 1
			this.ballsAddedSubject.next(1)
			this.ballAttachedSubject.next(newBall)
			this.animateAttachBounceAt(bRow, bCol, tx, ty, newBall)
			return
		}

		// remove them from grid immediately but not visually...
		// remove visually after animation below
		// we want to remove from grid immediately so that other
		// processes that add new rows can run normally
		const matchedBalls = this.removeFromGrid(matches)

		const orphanPositions = this.findOrphanedBalls()
		const orphans = this.removeFromGrid(orphanPositions)
			.map(ball => {
				ball.setActive(false)
				this.scene.physics.world.remove(ball.body)
				return ball
			})

		this.cleanUpEmptyRows()

		await new Promise(resolve => {
			this.scene.tweens.add({
				targets: newBall,
				y: ty,
				x: tx,
				duration: 50,
				ease: 'Back.easeOut',
				onComplete: function () {
					resolve()
				}
			})
		})

		const body = newBall.body as Phaser.Physics.Arcade.StaticBody
		body.updateFromGameObject()
		
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
			b.y += dy

			const body = b.body as Phaser.Physics.Arcade.StaticBody
			body.updateFromGameObject()
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
			const anyItem = rowList.find(n => n)
			if (anyItem)
			{
				y = anyItem.y - verticalInterval
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
			const y = orphan.y
			const dy = bottom - y
			const duration = dy * 0.75

			return new Promise(resolve => {
				timeline.add({
					targets: orphan,
					y: y + dy,
					offset: 0,
					duration,
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

	private animateAttachBounceAt(row: number, col: number, tx: number, ty: number, newBall: IBall)
	{
		// https://github.com/photonstorm/phaser/blob/v3.22.0/src/math/easing/EaseMap.js
		const timeline = this.scene.tweens.createTimeline()
		timeline.add({
			targets: newBall,
			y: ty - 5,
			duration: 50
		})

		timeline.add({
			targets: newBall,
			x: tx,
			duration: 100,
			offset: 0
		})

		timeline.add({
			targets: newBall,
			y: ty,
			duration: 50,
			ease: 'Back.easeOut',
			onComplete: () => {
				const body = newBall.body as Phaser.Physics.Arcade.StaticBody
				body.updateFromGameObject()
			}
		})

		timeline.play()

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

	private insertAt(row: number, col: number, ball: IBall)
	{
		if (row < 0 || col < 0)
		{
			console.error(`BallGrid.insertAt: posición inválida row=${row} col=${col}, se ignora la inserción`)
			return
		}

		if (row >= this.grid.length)
		{
			const count = row - (this.grid.length - 1)
			for (let i = 0; i < count; ++i)
			{
				const rowList = new RowList()
				const prevRow = this.grid[row + i - 1] as RowList
				rowList.isStaggered = !prevRow.isStaggered
				this.grid.push(rowList)
			}
		}

		const rowList = this.grid[row]

		if (!rowList)
		{
			console.error(`BallGrid.insertAt: la fila row=${row} no existe, se ignora la inserción`)
			return
		}

		for (let i = 0; i <= col; ++i)
		{
			if (rowList.length <= i)
			{
				rowList[i] = undefined
			}
		}

		rowList[col] = ball
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
		// find all connected balls starting from the top row
		const connected = new Set<IBall>()
		const rootPositions = this.grid[0]
			.map((n, idx) => { 
				if (!n)
				{
					return undefined
				}
				connected.add(n)
				return { row: 0, col: idx }
			})
			.filter(n => n) as IGridPosition[]

		rootPositions.forEach(({ row, col }) => {
			this.findMatchesAt(row, col, BallColor.Any, connected)
		})

		// any balls that are NOT in the connected set are orphaned
		// ignore the root row at index 0; they can never be "orphaned"
		const orphans: IGridPosition[] = []
		const count = this.grid.length
		for (let row = 1; row < count; ++row)
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
				

				const timeline = this.scene.tweens.createTimeline()
				const y = ball.y
				
				timeline.add({
					targets: ball,
					y: y - movement,
					duration: 50
				})

				timeline.add({
					targets: ball,
					y,
					duration: 50,
					ease: 'Back.easeOut'
				})

				timeline.play()
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

	private isRowStaggered(row: number)
	{
		if (row >= this.grid.length - 1)
		{
			// if asking about a row that has not been created yet
			// check row above and invert
			const rowList = this.grid[row - 1] as RowList	
			return !rowList.isStaggered
		}

		const rowList = this.grid[row] as RowList
		return rowList.isStaggered
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

					const distSq = Phaser.Math.Distance.Squared(ball.x, ball.y, neighbor.x, neighbor.y)
					if (distSq <= thresholdSq)
					{
						return neighbor
					}
				}
			}
		}

		return null
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
