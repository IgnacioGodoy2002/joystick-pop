import { LeaderboardEntry } from '~/services/LeaderboardService'

const rankAccentClass = (rank: number) => {
	if (rank === 1) return 'leaderboard-rank-gold'
	if (rank === 2) return 'leaderboard-rank-silver'
	if (rank === 3) return 'leaderboard-rank-bronze'
	return ''
}

const leaderboardRow = (entry: LeaderboardEntry) => {
	return (
		<div class="leaderboard-row">
			<span class={`leaderboard-rank ${rankAccentClass(entry.rank)}`}>{ entry.rank }</span>
			<span class="leaderboard-alias">{ entry.alias }</span>
			<span class="leaderboard-score">{ entry.score.toLocaleString() }</span>
		</div>
	)
}

const leaderboardPanel = (entries: LeaderboardEntry[]) => {
	return (
		<div class="leaderboard-panel">
			{ entries.map(entry => leaderboardRow(entry)) }
		</div>
	)
}

export default leaderboardPanel
