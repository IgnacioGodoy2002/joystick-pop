export const Red = 'r'
export const Blu = 'b'
export const Gre = 'g'
export const Yel = 'y'

const AllColors = [
	Red, Blu, Gre, Yel
]

export default class BallLayoutData
{
	private growthModel: IGrowthModel
	private columns: number

	constructor(growthModel: IGrowthModel, columns = 8)
	{
		this.growthModel = growthModel
		this.columns = columns
	}

	getNextRow()
	{
		const count = this.growthModel.getNext(this.columns)

		// TODO: potentially randomize positions when less than 6 available

		const ret: string[] = []
		for (let i = 0; i < count; ++i)
		{
			ret.push(this.getRandomColor())
		}
		return ret
	}

	private getRandomColor()
	{
		const size = AllColors.length
		const r = Math.floor(Math.random() * size)
		return AllColors[r]
	}
}
